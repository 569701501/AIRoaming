import { BadGatewayException, Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import type { AIRuntimeModelItem, AIRuntimeModelSelection } from "@airoaming/shared";
import { SettingsService } from "../settings/settings.service.js";

interface OpenCodeSession {
  id: string;
}

interface OpenCodeTextPart {
  type: string;
  text?: string;
}

interface OpenCodeMessageResponse {
  parts?: OpenCodeTextPart[];
}

interface OpenCodeEventPayload {
  type?: string;
  payload?: OpenCodeEventPayload;
  properties?: {
    sessionID?: string;
    messageID?: string;
    partID?: string;
    field?: string;
    delta?: string;
  };
}

interface OpenCodeProviderConfig {
  id?: string;
  name?: string;
  models?: Record<string, {
    id?: string;
    name?: string;
  }>;
}

interface OpenCodeConfigResponse {
  provider?: Record<string, OpenCodeProviderConfig>;
}

@Injectable()
export class OpenCodeRuntimeService implements OnModuleDestroy {
  private readonly host = process.env.OPENCODE_HOST ?? "127.0.0.1";
  private readonly port = Number(process.env.OPENCODE_PORT ?? 4396);
  private readonly baseUrl = process.env.OPENCODE_BASE_URL ?? `http://${this.host}:${this.port}`;
  private readonly autoStart = process.env.OPENCODE_AUTO_START !== "false";
  private readonly messageTimeoutMs = Number(process.env.OPENCODE_MESSAGE_TIMEOUT_MS ?? 300000);
  private readonly defaultModel: AIRuntimeModelSelection = {
    providerId: process.env.OPENCODE_PROVIDER_ID ?? "self",
    modelId: process.env.OPENCODE_MODEL_ID ?? "gpt-5.5",
  };

  private child: ChildProcess | null = null;
  private readyPromise: Promise<void> | null = null;
  private syncedAuthSignature: string | null = null;

  constructor(@Inject(SettingsService) private readonly settingsService: SettingsService) {}

  async onModuleDestroy(): Promise<void> {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }

  getDefaultModel(): AIRuntimeModelSelection {
    const settingsModel = this.settingsService.getRuntimeAIKeySettings();
    return {
      providerId: settingsModel.providerId || this.defaultModel.providerId,
      modelId: settingsModel.modelId || this.defaultModel.modelId,
    };
  }

  async listModels(): Promise<AIRuntimeModelItem[]> {
    try {
      const config = await this.withReadyRetry(async () => {
        await this.syncConfiguredAuth();
        return this.requestJson<OpenCodeConfigResponse>("/config", {
          method: "GET",
        });
      });
      const defaultModel = this.getDefaultModel();
      const providers = config.provider ?? {};
      const items = Object.entries(providers).flatMap(([providerId, provider]) => {
        const providerName = provider.name ?? provider.id ?? providerId;
        return Object.entries(provider.models ?? {}).map(([modelId, model]) => ({
          providerId,
          modelId,
          providerName,
          displayName: model.name ?? model.id ?? modelId,
          default: providerId === defaultModel.providerId && modelId === defaultModel.modelId,
        }));
      });

      const hasDefaultModel = items.some((item) => item.providerId === defaultModel.providerId && item.modelId === defaultModel.modelId);
      const normalizedItems = hasDefaultModel ? items : [this.fallbackModel(), ...items];
      return normalizedItems.length > 0 ? normalizedItems : [this.fallbackModel()];
    } catch {
      return [this.fallbackModel()];
    }
  }

  async createSession(title: string, signal?: AbortSignal): Promise<string> {
    const session = await this.withReadyRetry(() => {
      return this.requestJson<OpenCodeSession>("/session", {
        method: "POST",
        body: JSON.stringify({ title }),
        signal,
      });
    });
    if (!session.id) {
      throw new BadGatewayException("OPENCODE_SESSION_ID_MISSING");
    }
    return session.id;
  }

  async sendMessage(input: {
    sessionId: string;
    content: string;
    model?: AIRuntimeModelSelection;
    signal?: AbortSignal;
  }): Promise<{
    content: string;
    model: AIRuntimeModelSelection;
  }> {
    const model = input.model ?? this.getDefaultModel();
    const response = await this.withReadyRetry(async () => {
      await this.syncConfiguredAuth();
      return this.postMessage(input.sessionId, input.content, model, input.signal);
    });

    const content = this.extractText(response);
    if (!content) {
      throw new BadGatewayException("OPENCODE_EMPTY_RESPONSE");
    }

    return {
      content,
      model,
    };
  }

  async streamMessage(
    input: {
      sessionId: string;
      content: string;
      model?: AIRuntimeModelSelection;
      signal?: AbortSignal;
    },
    handlers: {
      onDelta: (delta: string, content: string) => void | Promise<void>;
    },
  ): Promise<{
    content: string;
    model: AIRuntimeModelSelection;
  }> {
    const model = input.model ?? this.getDefaultModel();
    await this.ensureReady();
    await this.syncConfiguredAuth();

    try {
      return await this.streamMessageOnce(input.sessionId, input.content, model, handlers, input.signal);
    } catch (error) {
      this.readyPromise = null;
      if (error instanceof BadGatewayException) {
        throw error;
      }
      throw new BadGatewayException({
        code: "OPENCODE_STREAM_FAILED",
        message: error instanceof Error ? error.message : "OpenCode stream failed",
      });
    }
  }

  private async ensureReady(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = this.waitUntilReady().catch(async (error) => {
      if (!this.autoStart) {
        this.readyPromise = null;
        throw error;
      }

      this.startServer();
      await this.waitUntilReady();
    });

    return this.readyPromise;
  }

  private async withReadyRetry<T>(operation: () => Promise<T>): Promise<T> {
    await this.ensureReady();

    try {
      return await operation();
    } catch (error) {
      if (!this.shouldRetryReadyOperation(error)) {
        throw error;
      }

      this.readyPromise = null;
      if (!this.autoStart) {
        throw error;
      }

      await this.ensureReady();
      return operation();
    }
  }

  private async streamMessageOnce(
    sessionId: string,
    content: string,
    model: AIRuntimeModelSelection,
    handlers: {
      onDelta: (delta: string, content: string) => void | Promise<void>;
    },
    signal?: AbortSignal,
  ): Promise<{
    content: string;
    model: AIRuntimeModelSelection;
  }> {
    let streamedContent = "";
    const listener = this.listenToEvents({
      sessionId,
      signal,
      onDelta: async (delta) => {
        streamedContent += delta;
        await handlers.onDelta(delta, streamedContent);
      },
    });

    await listener.ready;

    try {
      const response = await this.postMessage(sessionId, content, model, signal);
      const finalContent = this.extractText(response);
      if (!finalContent) {
        throw new BadGatewayException("OPENCODE_EMPTY_RESPONSE");
      }

      return {
        content: finalContent,
        model,
      };
    } finally {
      listener.abort();
      await listener.done.catch(() => undefined);
    }
  }

  private listenToEvents(input: {
    sessionId: string;
    signal?: AbortSignal;
    onDelta: (delta: string) => void | Promise<void>;
  }): {
    ready: Promise<void>;
    done: Promise<void>;
    abort: () => void;
  } {
    const controller = new AbortController();
    const cleanupAbort = this.forwardAbort(input.signal, controller);
    let resolveReady!: () => void;
    let rejectReady!: (error: unknown) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    const done = (async () => {
      let buffer = "";
      try {
        const response = await fetch(`${this.baseUrl}/event`, {
          headers: {
            Accept: "text/event-stream",
          },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new BadGatewayException({
            code: "OPENCODE_EVENT_STREAM_FAILED",
            status: response.status,
            message: response.statusText,
          });
        }

        resolveReady();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done: readDone, value } = await reader.read();
          if (readDone) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const blocks = this.takeSseBlocks(buffer);
          buffer = blocks.remaining;

          for (const block of blocks.items) {
            const event = this.parseSseBlock(block);
            const delta = this.extractTextDelta(event, input.sessionId);
            if (delta) {
              await input.onDelta(delta);
            }
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          resolveReady();
          return;
        }
        rejectReady(error);
        throw error;
      } finally {
        cleanupAbort();
      }
    })();

    return {
      ready,
      done,
      abort: () => controller.abort(),
    };
  }

  private postMessage(
    sessionId: string,
    content: string,
    model: AIRuntimeModelSelection,
    signal?: AbortSignal,
  ): Promise<OpenCodeMessageResponse> {
    return this.requestJson<OpenCodeMessageResponse>(`/session/${encodeURIComponent(sessionId)}/message`, {
      method: "POST",
      body: JSON.stringify({
        model: {
          providerID: model.providerId,
          modelID: model.modelId,
        },
        parts: [
          {
            type: "text",
            text: content,
          },
        ],
      }),
      timeoutMs: this.messageTimeoutMs,
      signal,
    });
  }

  private startServer(): void {
    if (this.child) {
      return;
    }

    // 注入工具回调环境变量:让 OpenCode 插件工具能回调 AIRoaming 后端
    // 注意:这里用 server 的端口(process.env.PORT),不是 OpenCode 的端口(this.port)
    const serverPort = process.env.PORT ?? "4310";
    const toolCallbackBase = process.env.AIROAMING_TOOL_CALLBACK_BASE_URL ?? `http://127.0.0.1:${serverPort}/api`;
    const toolCallbackToken = process.env.AIROAMING_TOOL_CALLBACK_TOKEN ?? "";

    this.child = spawn("opencode", ["serve", "--port", String(this.port), "--hostname", this.host], {
      stdio: "ignore",
      detached: false,
      env: {
        ...process.env,
        AIROAMING_TOOL_CALLBACK_BASE_URL: toolCallbackBase,
        AIROAMING_TOOL_CALLBACK_TOKEN: toolCallbackToken,
      },
    });
    this.child.once("exit", () => {
      this.child = null;
      this.readyPromise = null;
    });
  }

  private async waitUntilReady(): Promise<void> {
    const startedAt = Date.now();
    const timeoutMs = Number(process.env.OPENCODE_READY_TIMEOUT_MS ?? 12000);

    while (Date.now() - startedAt < timeoutMs) {
      try {
        await this.requestJson<unknown>("/session", {
          method: "GET",
          timeoutMs: 1200,
        });
        return;
      } catch {
        await this.delay(350);
      }
    }

    throw new BadGatewayException("OPENCODE_NOT_READY");
  }

  private async requestJson<T>(path: string, init: RequestInit & { timeoutMs?: number }): Promise<T> {
    const { timeoutMs = 12000, signal, ...requestInit } = init;
    const controller = new AbortController();
    const cleanupAbort = this.forwardAbort(signal ?? undefined, controller);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...requestInit,
        headers: {
          "Content-Type": "application/json",
          ...(requestInit.headers ?? {}),
        },
        signal: controller.signal,
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;

      if (!response.ok) {
        throw new BadGatewayException({
          code: "OPENCODE_REQUEST_FAILED",
          status: response.status,
          message: this.extractErrorMessage(payload) ?? response.statusText,
        });
      }

      return payload as T;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      if (timedOut) {
        throw new BadGatewayException({
          code: "OPENCODE_REQUEST_TIMEOUT",
          timeoutMs,
          message: `OpenCode 请求超过 ${Math.round(timeoutMs / 1000)} 秒未完成，请稍后重试或换用更快的模型。`,
        });
      }
      if (signal?.aborted) {
        throw new BadGatewayException({
          code: "OPENCODE_REQUEST_ABORTED",
          message: "请求已取消：页面刷新、离开当前步骤或连接断开时会中止本次生成。",
        });
      }
      throw new BadGatewayException({
        code: "OPENCODE_REQUEST_FAILED",
        message: error instanceof Error ? error.message : "OpenCode request failed",
      });
    } finally {
      cleanupAbort();
      clearTimeout(timeout);
    }
  }

  private forwardAbort(signal: AbortSignal | undefined, controller: AbortController): () => void {
    if (!signal) {
      return () => undefined;
    }

    if (signal.aborted) {
      controller.abort();
      return () => undefined;
    }

    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    return () => signal.removeEventListener("abort", abort);
  }

  private shouldRetryReadyOperation(error: unknown): boolean {
    if (!(error instanceof BadGatewayException)) {
      return true;
    }

    const code = this.getExceptionCode(error);
    return code !== "OPENCODE_REQUEST_TIMEOUT" && code !== "OPENCODE_REQUEST_ABORTED";
  }

  private getExceptionCode(error: BadGatewayException): string | null {
    const response = error.getResponse();
    if (typeof response === "object" && response !== null && "code" in response) {
      const code = (response as { code?: unknown }).code;
      return typeof code === "string" ? code : null;
    }

    return null;
  }

  private extractText(response: OpenCodeMessageResponse): string {
    return (response.parts ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text?.trim())
      .filter((text): text is string => Boolean(text))
      .join("\n\n")
      .trim();
  }

  private takeSseBlocks(buffer: string): {
    items: string[];
    remaining: string;
  } {
    const items: string[] = [];
    let remaining = buffer;
    let boundary = remaining.indexOf("\n\n");

    while (boundary >= 0) {
      items.push(remaining.slice(0, boundary));
      remaining = remaining.slice(boundary + 2);
      boundary = remaining.indexOf("\n\n");
    }

    return {
      items,
      remaining,
    };
  }

  private parseSseBlock(block: string): OpenCodeEventPayload | null {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => line.slice(6))
      .join("\n");

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data) as OpenCodeEventPayload;
    } catch {
      return null;
    }
  }

  private extractTextDelta(event: OpenCodeEventPayload | null, sessionId: string): string | null {
    const payload = event?.payload ?? event;
    if (payload?.type !== "message.part.delta") {
      return null;
    }

    const properties = payload.properties;
    if (
      properties?.sessionID !== sessionId ||
      properties.field !== "text" ||
      typeof properties.delta !== "string"
    ) {
      return null;
    }

    return properties.delta;
  }

  private extractErrorMessage(payload: unknown): string | null {
    if (typeof payload === "object" && payload !== null && "message" in payload) {
      const message = (payload as { message?: unknown }).message;
      return typeof message === "string" ? message : null;
    }
    return null;
  }

  private fallbackModel(): AIRuntimeModelItem {
    const defaultModel = this.getDefaultModel();
    return {
      ...defaultModel,
      providerName: defaultModel.providerId,
      displayName: defaultModel.modelId,
      default: true,
    };
  }

  private async syncConfiguredAuth(): Promise<void> {
    const credential = this.settingsService.getRuntimeAIKeySettings();
    if (!credential.apiKey) {
      this.syncedAuthSignature = null;
      return;
    }

    const signature = createHash("sha256")
      .update([credential.providerId, credential.baseUrl ?? "", credential.apiKey].join("\0"))
      .digest("hex");
    if (this.syncedAuthSignature === signature) {
      return;
    }

    await this.requestJson<boolean>(`/auth/${encodeURIComponent(credential.providerId)}`, {
      method: "PUT",
      body: JSON.stringify({
        type: "api",
        key: credential.apiKey,
        metadata: credential.baseUrl
          ? {
              baseURL: credential.baseUrl,
            }
          : undefined,
      }),
      timeoutMs: Number(process.env.OPENCODE_AUTH_TIMEOUT_MS ?? 5000),
    });
    this.syncedAuthSignature = signature;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
