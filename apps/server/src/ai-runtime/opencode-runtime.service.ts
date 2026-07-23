import { BadGatewayException, Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import type { AIRuntimeModelItem, AIRuntimeModelSelection } from "@airoaming/shared";
import { SettingsService } from "../settings/settings.service.js";

interface OpenCodeSession {
  id: string;
}

interface OpenCodeTextPart {
  type: string;
  text?: string;
}

export type OpenCodeStructuredImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface OpenCodeStructuredImageInput {
  mimeType: OpenCodeStructuredImageMimeType;
  fileName: string;
  dataUrl: string;
}

interface OpenCodeMessageInputPart {
  type: "text" | "file";
  text?: string;
  mime?: string;
  filename?: string;
  url?: string;
}

interface OpenCodeMessageResponse {
  info?: {
    structured?: unknown;
    error?: {
      name?: string;
      data?: {
        message?: string;
        retries?: number;
      };
    };
  };
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
  npm?: string;
  options?: {
    baseURL?: string;
  };
  models?: Record<string, {
    id?: string;
    name?: string;
  }>;
}

interface OpenCodeConfigResponse {
  provider?: Record<string, OpenCodeProviderConfig>;
}

interface OpenCodeRuntimeProviderBinding {
  logicalProviderId: string;
  runtimeProviderId: string;
  modelId: string;
  managedProvider: OpenCodeProviderConfig | null;
  signature: string;
}

const TEXT_GENERATION_SESSION_PERMISSIONS = [
  {
    permission: "*",
    pattern: "*",
    action: "deny",
  },
] as const;

const TEXT_GENERATION_MESSAGE_TOOLS = {
  "*": false,
} as const;

// OpenCode 的 JSON Schema 输出本身通过内置 StructuredOutput 工具回传。
// 其他工具全部关闭，但不能把这个内置工具一起关掉。
const STRUCTURED_GENERATION_MESSAGE_TOOLS = {
  "*": false,
  StructuredOutput: true,
} as const;

const OPENCODE_GO_PROVIDER_ID = "opencode-go";
const OPENCODE_GO_BASE_URL = new URL("https://opencode.ai/zen/go/v1");

function isOpenCodeGoBaseUrl(baseUrl: string): boolean {
  try {
    const candidate = new URL(baseUrl);
    return candidate.origin === OPENCODE_GO_BASE_URL.origin
      && candidate.pathname.replace(/\/+$/, "") === OPENCODE_GO_BASE_URL.pathname
      && candidate.search === ""
      && candidate.hash === "";
  } catch {
    return false;
  }
}

@Injectable()
export class OpenCodeRuntimeService implements OnModuleDestroy {
  private readonly host = process.env.OPENCODE_HOST ?? "127.0.0.1";
  private readonly port = Number(process.env.OPENCODE_PORT ?? 4396);
  private readonly baseUrl = process.env.OPENCODE_BASE_URL ?? `http://${this.host}:${this.port}`;
  private readonly externalBaseUrl = Boolean(process.env.OPENCODE_BASE_URL);
  private readonly autoStart = process.env.OPENCODE_AUTO_START !== "false";
  private readonly messageTimeoutMs = Number(process.env.OPENCODE_MESSAGE_TIMEOUT_MS ?? 300000);
  private readonly defaultModel: AIRuntimeModelSelection = {
    providerId: process.env.OPENCODE_PROVIDER_ID ?? "self",
    modelId: process.env.OPENCODE_MODEL_ID ?? "gpt-5.5",
  };

  private child: ChildProcess | null = null;
  private readyPromise: Promise<void> | null = null;
  private syncedAuthSignature: string | null = null;
  private managedProviderSignature: string | null = null;

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
        const binding = await this.ensureConfiguredProvider();
        await this.syncConfiguredAuth(binding);
        return this.requestJson<OpenCodeConfigResponse>("/config", {
          method: "GET",
        });
      });
      const defaultModel = this.getDefaultModel();
      const defaultBinding = this.getRuntimeProviderBinding(defaultModel);
      const providers = config.provider ?? {};
      const items = Object.entries(providers).flatMap(([providerId, provider]) => {
        const providerName = provider.name ?? provider.id ?? providerId;
        const logicalProviderId = providerId === defaultBinding.runtimeProviderId
          ? defaultBinding.logicalProviderId
          : providerId;
        return Object.entries(provider.models ?? {}).map(([modelId, model]) => ({
          providerId: logicalProviderId,
          modelId,
          providerName,
          displayName: model.name ?? model.id ?? modelId,
          default: logicalProviderId === defaultModel.providerId && modelId === defaultModel.modelId,
        }));
      });

      return [...new Map(items.map((item) => [`${item.providerId}\0${item.modelId}`, item])).values()];
    } catch {
      return [];
    }
  }

  async createSession(title: string, signal?: AbortSignal): Promise<string> {
    const session = await this.withReadyRetry(async () => {
      await this.ensureConfiguredProvider();
      return this.requestJson<OpenCodeSession>("/session", {
        method: "POST",
        body: JSON.stringify({
          title,
          permission: TEXT_GENERATION_SESSION_PERMISSIONS,
        }),
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
      const binding = await this.ensureConfiguredProvider(model);
      await this.syncConfiguredAuth(binding);
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

  async generateStructured(input: {
    title: string;
    content: string;
    schema: Record<string, unknown>;
    images?: readonly OpenCodeStructuredImageInput[];
    model?: AIRuntimeModelSelection;
    signal?: AbortSignal;
  }): Promise<{
    value: unknown;
    content: string;
    model: AIRuntimeModelSelection;
  }> {
    const model = input.model ?? this.getDefaultModel();
    const directory = path.resolve(
      process.env.OPENCODE_STRUCTURED_DIRECTORY?.trim()
        || path.join(
          process.env.AIROAMING_DATA_ROOT?.trim() || path.join(homedir(), ".airoaming", "data"),
          "opencode-structured",
        ),
    );
    await mkdir(directory, { recursive: true });
    const query = `?directory=${encodeURIComponent(directory)}`;
    const response = await this.withReadyRetry(async () => {
      const binding = await this.ensureConfiguredProvider(model);
      await this.syncConfiguredAuth(binding);
      const session = await this.requestJson<OpenCodeSession>(`/session${query}`, {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
        }),
        signal: input.signal,
      });
      if (!session.id) {
        throw new BadGatewayException("OPENCODE_SESSION_ID_MISSING");
      }
      const imageParts = this.structuredImageParts(input.images ?? []);
      return this.postMessage(session.id, input.content, model, input.signal, {
        directoryQuery: query,
        system: "只通过固定结构输出能力完成用户要求。不要读取项目文件、规则文件或代码，不要调用其他工具，也不要返回结构之外的说明。",
        tools: STRUCTURED_GENERATION_MESSAGE_TOOLS,
        parts: [
          { type: "text", text: input.content },
          ...imageParts,
        ],
        format: {
          type: "json_schema",
          schema: input.schema,
          retryCount: 0,
        },
      });
    });

    if (response.info?.error) {
      throw new BadGatewayException({
        code: "OPENCODE_STRUCTURED_OUTPUT_FAILED",
        message: response.info.error.data?.message
          ?? response.info.error.name
          ?? "OpenCode 未能生成符合固定结构的结果",
      });
    }
    if (response.info?.structured === undefined) {
      throw new BadGatewayException({
        code: "OPENCODE_STRUCTURED_OUTPUT_FAILED",
        message: "OpenCode 没有返回固定结构结果",
      });
    }

    return {
      value: response.info.structured,
      content: this.extractText(response),
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
    const binding = await this.ensureConfiguredProvider(model);
    await this.syncConfiguredAuth(binding);

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

    if (!this.externalBaseUrl && this.autoStart) {
      this.startServer();
      this.readyPromise = this.waitUntilReady();
    } else {
      this.readyPromise = this.waitUntilReady();
    }

    this.readyPromise = this.readyPromise.catch((error) => {
      this.readyPromise = null;
      throw error;
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
    options: {
      directoryQuery?: string;
      system?: string;
      format?: {
        type: "json_schema";
        schema: Record<string, unknown>;
        retryCount: number;
      };
      tools?: Readonly<Record<string, boolean>>;
      parts?: readonly OpenCodeMessageInputPart[];
    } = {},
  ): Promise<OpenCodeMessageResponse> {
    const runtimeModel = this.getRuntimeProviderBinding(model);
    return this.requestJson<OpenCodeMessageResponse>(`/session/${encodeURIComponent(sessionId)}/message${options.directoryQuery ?? ""}`, {
      method: "POST",
      body: JSON.stringify({
        model: {
          providerID: runtimeModel.runtimeProviderId,
          modelID: model.modelId,
        },
        // OpenCode 1.17.x 会把消息级 tools 规则写回会话权限。
        // 这里同时保护升级前已存在、仍会被复用的文本生成会话。
        tools: options.tools ?? TEXT_GENERATION_MESSAGE_TOOLS,
        ...(options.system ? { system: options.system } : {}),
        ...(options.format ? { format: options.format } : {}),
        parts: options.parts ?? [{ type: "text", text: content }],
      }),
      timeoutMs: this.messageTimeoutMs,
      signal,
    });
  }

  private structuredImageParts(
    images: readonly OpenCodeStructuredImageInput[],
  ): OpenCodeMessageInputPart[] {
    if (images.length > 8) {
      throw new BadGatewayException("OPENCODE_STRUCTURED_IMAGE_LIMIT_EXCEEDED");
    }
    return images.map((image, index) => {
      const fileName = image.fileName.trim();
      if (
        fileName === ""
        || fileName.length > 200
        || fileName.includes("/")
        || fileName.includes("\\")
        || fileName.includes("\0")
        || fileName.includes("\n")
        || fileName.includes("\r")
      ) {
        throw new BadGatewayException(`OPENCODE_STRUCTURED_IMAGE_FILENAME_INVALID:${index}`);
      }
      const prefix = `data:${image.mimeType};base64,`;
      if (
        !image.dataUrl.startsWith(prefix)
        || image.dataUrl.length > 36_000_000
        || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.dataUrl.slice(prefix.length))
      ) {
        throw new BadGatewayException(`OPENCODE_STRUCTURED_IMAGE_DATA_INVALID:${index}`);
      }
      return {
        type: "file",
        mime: image.mimeType,
        filename: fileName,
        url: image.dataUrl,
      };
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
    const binding = this.getRuntimeProviderBinding();
    const managedConfigContent = this.buildManagedConfigContent(binding);
    this.managedProviderSignature = binding.managedProvider ? binding.signature : null;

    const child = spawn("opencode", ["serve", "--port", String(this.port), "--hostname", this.host], {
      stdio: "ignore",
      detached: false,
      env: {
        ...process.env,
        AIROAMING_TOOL_CALLBACK_BASE_URL: toolCallbackBase,
        AIROAMING_TOOL_CALLBACK_TOKEN: toolCallbackToken,
        OPENCODE_CONFIG_CONTENT: managedConfigContent,
      },
    });
    this.child = child;
    child.once("exit", () => {
      if (this.child === child) {
        this.child = null;
        this.readyPromise = null;
        this.managedProviderSignature = null;
      }
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

  private getRuntimeProviderBinding(model: AIRuntimeModelSelection = this.getDefaultModel()): OpenCodeRuntimeProviderBinding {
    const credential = this.settingsService.getRuntimeAIKeySettings();
    const baseUrl = model.providerId === credential.providerId ? credential.baseUrl?.trim() : null;
    const runtimeProviderId = baseUrl
      ? isOpenCodeGoBaseUrl(baseUrl)
        ? OPENCODE_GO_PROVIDER_ID
        : `airoaming_${model.providerId}`
      : model.providerId;
    const managedProvider: OpenCodeProviderConfig | null = baseUrl
      ? {
          name: model.providerId,
          npm: "@ai-sdk/openai-compatible",
          options: {
            baseURL: baseUrl,
          },
          models: {
            [model.modelId]: {
              name: model.modelId,
            },
          },
        }
      : null;
    const signature = createHash("sha256")
      .update([model.providerId, runtimeProviderId, model.modelId, baseUrl ?? ""].join("\0"))
      .digest("hex");
    return {
      logicalProviderId: model.providerId,
      runtimeProviderId,
      modelId: model.modelId,
      managedProvider,
      signature,
    };
  }

  private buildManagedConfigContent(binding: OpenCodeRuntimeProviderBinding): string {
    const configuredContent = process.env.OPENCODE_CONFIG_CONTENT?.trim();
    let config: Record<string, unknown> = {};
    if (configuredContent) {
      try {
        const parsed = JSON.parse(configuredContent) as unknown;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error("OPENCODE_CONFIG_CONTENT must be an object");
        }
        config = parsed as Record<string, unknown>;
      } catch (error) {
        throw new BadGatewayException({
          code: "OPENCODE_CONFIG_CONTENT_INVALID",
          message: error instanceof Error ? error.message : "OpenCode 配置不是有效 JSON",
        });
      }
    }

    if (!binding.managedProvider) {
      return JSON.stringify(config);
    }

    const currentProviders = typeof config.provider === "object" && config.provider !== null && !Array.isArray(config.provider)
      ? config.provider as Record<string, unknown>
      : {};
    return JSON.stringify({
      ...config,
      provider: {
        ...currentProviders,
        [binding.runtimeProviderId]: binding.managedProvider,
      },
    });
  }

  private async ensureConfiguredProvider(
    model: AIRuntimeModelSelection = this.getDefaultModel(),
  ): Promise<OpenCodeRuntimeProviderBinding> {
    const binding = this.getRuntimeProviderBinding(model);
    if (!binding.managedProvider) {
      return binding;
    }

    if (this.child && this.managedProviderSignature !== binding.signature) {
      await this.restartManagedServer();
    }

    let config = await this.requestJson<OpenCodeConfigResponse>("/config", { method: "GET" });
    if (!this.isManagedProviderRegistered(config, binding) && this.child) {
      await this.restartManagedServer();
      config = await this.requestJson<OpenCodeConfigResponse>("/config", { method: "GET" });
    }

    if (!this.isManagedProviderRegistered(config, binding)) {
      throw new BadGatewayException({
        code: "OPENCODE_PROVIDER_NOT_REGISTERED",
        providerId: binding.logicalProviderId,
        modelId: binding.modelId,
        message: `OpenCode 尚未注册 ${binding.logicalProviderId}/${binding.modelId}`,
      });
    }

    return binding;
  }

  private isManagedProviderRegistered(
    config: OpenCodeConfigResponse,
    binding: OpenCodeRuntimeProviderBinding,
  ): boolean {
    const provider = config.provider?.[binding.runtimeProviderId];
    return provider?.npm === "@ai-sdk/openai-compatible"
      && provider.options?.baseURL === binding.managedProvider?.options?.baseURL
      && Boolean(provider.models?.[binding.modelId]);
  }

  private async restartManagedServer(): Promise<void> {
    const child = this.child;
    if (!child) {
      return;
    }

    this.child = null;
    this.readyPromise = null;
    this.syncedAuthSignature = null;
    this.managedProviderSignature = null;
    child.kill();
    await Promise.race([
      new Promise<void>((resolve) => child.once("exit", () => resolve())),
      this.delay(3000),
    ]);
    this.startServer();
    await this.waitUntilReady();
  }

  private async syncConfiguredAuth(binding: OpenCodeRuntimeProviderBinding): Promise<void> {
    const credential = this.settingsService.getRuntimeAIKeySettings();
    if (!credential.apiKey) {
      this.syncedAuthSignature = null;
      return;
    }

    const signature = createHash("sha256")
      .update([binding.runtimeProviderId, credential.baseUrl ?? "", credential.apiKey].join("\0"))
      .digest("hex");
    if (this.syncedAuthSignature === signature) {
      return;
    }

    await this.requestJson<boolean>(`/auth/${encodeURIComponent(binding.runtimeProviderId)}`, {
      method: "PUT",
      body: JSON.stringify({
        type: "api",
        key: credential.apiKey,
      }),
      timeoutMs: Number(process.env.OPENCODE_AUTH_TIMEOUT_MS ?? 5000),
    });
    this.syncedAuthSignature = signature;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
