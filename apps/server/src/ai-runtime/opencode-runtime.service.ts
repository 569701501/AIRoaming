import { BadGatewayException, Injectable, OnModuleDestroy } from "@nestjs/common";
import { spawn, type ChildProcess } from "node:child_process";
import type { AIRuntimeModelItem, AIRuntimeModelSelection } from "@airoaming/shared";

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
  private readonly defaultModel: AIRuntimeModelSelection = {
    providerId: process.env.OPENCODE_PROVIDER_ID ?? "aurora",
    modelId: process.env.OPENCODE_MODEL_ID ?? "gpt-5.4",
  };

  private child: ChildProcess | null = null;
  private readyPromise: Promise<void> | null = null;

  async onModuleDestroy(): Promise<void> {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }

  getDefaultModel(): AIRuntimeModelSelection {
    return { ...this.defaultModel };
  }

  async listModels(): Promise<AIRuntimeModelItem[]> {
    try {
      const config = await this.withReadyRetry(() => {
        return this.requestJson<OpenCodeConfigResponse>("/config", {
          method: "GET",
        });
      });
      const providers = config.provider ?? {};
      const items = Object.entries(providers).flatMap(([providerId, provider]) => {
        const providerName = provider.name ?? provider.id ?? providerId;
        return Object.entries(provider.models ?? {}).map(([modelId, model]) => ({
          providerId,
          modelId,
          providerName,
          displayName: model.name ?? model.id ?? modelId,
          default: providerId === this.defaultModel.providerId && modelId === this.defaultModel.modelId,
        }));
      });

      return items.length > 0 ? items : [this.fallbackModel()];
    } catch {
      return [this.fallbackModel()];
    }
  }

  async createSession(title: string): Promise<string> {
    const session = await this.withReadyRetry(() => {
      return this.requestJson<OpenCodeSession>("/session", {
        method: "POST",
        body: JSON.stringify({ title }),
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
  }): Promise<{
    content: string;
    model: AIRuntimeModelSelection;
  }> {
    const model = input.model ?? this.defaultModel;
    const response = await this.withReadyRetry(() => this.postMessage(input.sessionId, input.content, model));

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
    },
    handlers: {
      onDelta: (delta: string, content: string) => void | Promise<void>;
    },
  ): Promise<{
    content: string;
    model: AIRuntimeModelSelection;
  }> {
    const model = input.model ?? this.defaultModel;
    await this.ensureReady();

    try {
      return await this.streamMessageOnce(input.sessionId, input.content, model, handlers);
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
  ): Promise<{
    content: string;
    model: AIRuntimeModelSelection;
  }> {
    let streamedContent = "";
    const listener = this.listenToEvents({
      sessionId,
      onDelta: async (delta) => {
        streamedContent += delta;
        await handlers.onDelta(delta, streamedContent);
      },
    });

    await listener.ready;

    try {
      const response = await this.postMessage(sessionId, content, model);
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
    onDelta: (delta: string) => void | Promise<void>;
  }): {
    ready: Promise<void>;
    done: Promise<void>;
    abort: () => void;
  } {
    const controller = new AbortController();
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
      timeoutMs: Number(process.env.OPENCODE_MESSAGE_TIMEOUT_MS ?? 120000),
    });
  }

  private startServer(): void {
    if (this.child) {
      return;
    }

    this.child = spawn("opencode", ["serve", "--port", String(this.port), "--hostname", this.host], {
      stdio: "ignore",
      detached: false,
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
    const timeoutMs = init.timeoutMs ?? 12000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
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
      throw new BadGatewayException({
        code: "OPENCODE_REQUEST_FAILED",
        message: error instanceof Error ? error.message : "OpenCode request failed",
      });
    } finally {
      clearTimeout(timeout);
    }
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
    return {
      ...this.defaultModel,
      providerName: this.defaultModel.providerId,
      displayName: this.defaultModel.modelId,
      default: true,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
