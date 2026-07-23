import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { SettingsService } from "../settings/settings.service.js";
import { OpenCodeRuntimeService } from "./opencode-runtime.service.js";

describe("OpenCodeRuntimeService", () => {
  const originalBaseUrl = process.env.OPENCODE_BASE_URL;
  const originalStructuredDirectory = process.env.OPENCODE_STRUCTURED_DIRECTORY;
  let server: Server | null = null;
  let structuredDirectory: string | null = null;

  afterEach(async () => {
    if (originalBaseUrl === undefined) delete process.env.OPENCODE_BASE_URL;
    else process.env.OPENCODE_BASE_URL = originalBaseUrl;
    if (originalStructuredDirectory === undefined) delete process.env.OPENCODE_STRUCTURED_DIRECTORY;
    else process.env.OPENCODE_STRUCTURED_DIRECTORY = originalStructuredDirectory;
    if (structuredDirectory) {
      await rm(structuredDirectory, { recursive: true, force: true });
      structuredDirectory = null;
    }
    if (server) {
      await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
      server = null;
    }
  });

  it("creates text-generation sessions with every OpenCode tool permission denied", async () => {
    let requestBody: unknown = null;
    server = createServer((request, response) => {
      if (request.method === "GET" && request.url === "/session") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("[]");
        return;
      }

      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        if (request.method !== "POST" || request.url !== "/session") {
          response.writeHead(404, { "content-type": "application/json" });
          response.end(JSON.stringify({ message: "not found" }));
          return;
        }
        requestBody = JSON.parse(body);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ id: "session-no-tools" }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING");
    process.env.OPENCODE_BASE_URL = `http://127.0.0.1:${address.port}`;
    const settings = {
      getRuntimeAIKeySettings: () => ({ providerId: "self", modelId: "test" }),
    } as unknown as SettingsService;
    const runtime = new OpenCodeRuntimeService(settings);

    await expect(runtime.createSession("只输出文本")).resolves.toBe("session-no-tools");
    expect(requestBody).toEqual({
      title: "只输出文本",
      permission: [{ permission: "*", pattern: "*", action: "deny" }],
    });
  });

  it("denies every tool again when reusing an existing text-generation session", async () => {
    let messageBody: unknown = null;
    server = createServer((request, response) => {
      if (request.method === "GET" && request.url === "/session") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("[]");
        return;
      }

      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        if (request.method === "POST" && request.url === "/session/existing-session/message") {
          messageBody = JSON.parse(body);
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ parts: [{ type: "text", text: "已生成" }] }));
          return;
        }
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ message: "not found" }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING");
    process.env.OPENCODE_BASE_URL = `http://127.0.0.1:${address.port}`;

    const settings = {
      getRuntimeAIKeySettings: () => ({ providerId: "self", modelId: "test" }),
    } as unknown as SettingsService;
    const runtime = new OpenCodeRuntimeService(settings);

    await expect(runtime.sendMessage({
      sessionId: "existing-session",
      content: "只返回文本",
    })).resolves.toEqual({
      content: "已生成",
      model: { providerId: "self", modelId: "test" },
    });
    expect(messageBody).toEqual({
      model: { providerID: "self", modelID: "test" },
      tools: { "*": false },
      parts: [{ type: "text", text: "只返回文本" }],
    });
  });

  it("uses OpenCode JSON Schema output for isolated structured generation", async () => {
    let sessionUrl: string | undefined;
    let sessionBody: Record<string, unknown> | undefined;
    let messageUrl: string | undefined;
    let messageBody: Record<string, unknown> | undefined;
    server = createServer((request, response) => {
      if (request.method === "GET" && request.url === "/session") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("[]");
        return;
      }
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        if (request.method === "POST" && request.url?.startsWith("/session?directory=")) {
          sessionUrl = request.url;
          sessionBody = JSON.parse(body) as Record<string, unknown>;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ id: "structured-session" }));
          return;
        }
        if (request.method === "POST" && request.url?.startsWith("/session/structured-session/message?directory=")) {
          messageUrl = request.url;
          messageBody = JSON.parse(body) as Record<string, unknown>;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({
            info: { role: "assistant", structured: { synopsis: "固定结构" } },
            parts: [],
          }));
          return;
        }
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ message: "not found" }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING");
    process.env.OPENCODE_BASE_URL = `http://127.0.0.1:${address.port}`;

    const settings = {
      getRuntimeAIKeySettings: () => ({ providerId: "self", modelId: "test" }),
    } as unknown as SettingsService;
    const runtime = new OpenCodeRuntimeService(settings);
    structuredDirectory = await mkdtemp(path.join(tmpdir(), "airoaming-structured-"));
    process.env.OPENCODE_STRUCTURED_DIRECTORY = structuredDirectory;
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["synopsis"],
      properties: { synopsis: { type: "string" } },
    };

    await expect(runtime.generateStructured({
      title: "剧情结构",
      content: "生成固定结构",
      schema,
    })).resolves.toEqual({
      value: { synopsis: "固定结构" },
      content: "",
      model: { providerId: "self", modelId: "test" },
    });
    expect(sessionUrl).toContain("directory=");
    expect(sessionBody).toEqual({ title: "剧情结构" });
    expect(messageUrl).toContain("directory=");
    expect(messageBody).toMatchObject({
      model: { providerID: "self", modelID: "test" },
      tools: { "*": false, StructuredOutput: true },
      format: { type: "json_schema", schema, retryCount: 0 },
    });
  });

  it("sends a validated image file part with isolated structured generation", async () => {
    let messageBody: Record<string, unknown> | undefined;
    server = createServer((request, response) => {
      if (request.method === "GET" && request.url === "/session") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("[]");
        return;
      }
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        if (request.method === "POST" && request.url?.startsWith("/session?directory=")) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ id: "vision-structured-session" }));
          return;
        }
        if (request.method === "POST" && request.url?.startsWith("/session/vision-structured-session/message?directory=")) {
          messageBody = JSON.parse(body) as Record<string, unknown>;
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({
            info: { role: "assistant", structured: { visualCenter: { x: 0.5, y: 0.5 } } },
            parts: [],
          }));
          return;
        }
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ message: "not found" }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING");
    process.env.OPENCODE_BASE_URL = `http://127.0.0.1:${address.port}`;

    const settings = {
      getRuntimeAIKeySettings: () => ({ providerId: "self", modelId: "vision-test" }),
    } as unknown as SettingsService;
    const runtime = new OpenCodeRuntimeService(settings);
    structuredDirectory = await mkdtemp(path.join(tmpdir(), "airoaming-structured-image-"));
    process.env.OPENCODE_STRUCTURED_DIRECTORY = structuredDirectory;
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["visualCenter"],
      properties: {
        visualCenter: {
          type: "object",
          additionalProperties: false,
          required: ["x", "y"],
          properties: { x: { type: "number" }, y: { type: "number" } },
        },
      },
    };
    const dataUrl = "data:image/png;base64,iVBORw0KGgo=";

    await expect(runtime.generateStructured({
      title: "画面分析",
      content: "分析附件中的画面。",
      schema,
      images: [{ mimeType: "image/png", fileName: "shot.png", dataUrl }],
    })).resolves.toMatchObject({
      value: { visualCenter: { x: 0.5, y: 0.5 } },
      model: { providerId: "self", modelId: "vision-test" },
    });
    expect(messageBody?.parts).toEqual([
      { type: "text", text: "分析附件中的画面。" },
      { type: "file", mime: "image/png", filename: "shot.png", url: dataUrl },
    ]);
  });

  it("maps a configured xAI proxy to an isolated OpenAI-compatible runtime provider", async () => {
    let authPath: string | undefined;
    let authBody: unknown;
    let messageBody: unknown;
    server = createServer((request, response) => {
      if (request.method === "GET" && request.url === "/session") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("[]");
        return;
      }
      if (request.method === "GET" && request.url === "/config") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          provider: {
            airoaming_xai: {
              name: "xAI Grok 对话",
              npm: "@ai-sdk/openai-compatible",
              options: { baseURL: "https://proxy.example/v1" },
              models: { "grok-4.5": { name: "grok-4.5" } },
            },
          },
        }));
        return;
      }

      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        if (request.method === "PUT" && request.url === "/auth/airoaming_xai") {
          authPath = request.url;
          authBody = JSON.parse(body);
          response.writeHead(200, { "content-type": "application/json" });
          response.end("true");
          return;
        }
        if (request.method === "POST" && request.url === "/session/grok-session/message") {
          messageBody = JSON.parse(body);
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ parts: [{ type: "text", text: "OK" }] }));
          return;
        }
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ message: "not found" }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING");
    process.env.OPENCODE_BASE_URL = `http://127.0.0.1:${address.port}`;

    const settings = {
      getRuntimeAIKeySettings: () => ({
        providerId: "xai",
        modelId: "grok-4.5",
        baseUrl: "https://proxy.example/v1",
        apiKey: "xai-test-key",
      }),
    } as unknown as SettingsService;
    const runtime = new OpenCodeRuntimeService(settings);

    await expect(runtime.listModels()).resolves.toEqual([{
      providerId: "xai",
      modelId: "grok-4.5",
      providerName: "xAI Grok 对话",
      displayName: "grok-4.5",
      default: true,
    }]);
    await expect(runtime.sendMessage({
      sessionId: "grok-session",
      content: "只回复 OK",
    })).resolves.toEqual({
      content: "OK",
      model: { providerId: "xai", modelId: "grok-4.5" },
    });
    expect(authPath).toBe("/auth/airoaming_xai");
    expect(authBody).toEqual({
      type: "api",
      key: "xai-test-key",
    });
    expect(messageBody).toMatchObject({
      model: { providerID: "airoaming_xai", modelID: "grok-4.5" },
    });
  });

  it("reuses the built-in OpenCode Go auth slot for the official Go endpoint", async () => {
    let authPath: string | undefined;
    let authBody: unknown;
    let messageBody: unknown;
    server = createServer((request, response) => {
      if (request.method === "GET" && request.url === "/session") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("[]");
        return;
      }
      if (request.method === "GET" && request.url === "/config") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({
          provider: {
            "opencode-go": {
              name: "self",
              npm: "@ai-sdk/openai-compatible",
              options: { baseURL: "https://opencode.ai/zen/go/v1" },
              models: { "grok-4.5": { name: "grok-4.5" } },
            },
          },
        }));
        return;
      }

      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        if (request.method === "PUT" && request.url === "/auth/opencode-go") {
          authPath = request.url;
          authBody = JSON.parse(body);
          response.writeHead(200, { "content-type": "application/json" });
          response.end("true");
          return;
        }
        if (request.method === "POST" && request.url === "/session/go-session/message") {
          messageBody = JSON.parse(body);
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ parts: [{ type: "text", text: "OPENCODE_GO_OK" }] }));
          return;
        }
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ message: "not found" }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING");
    process.env.OPENCODE_BASE_URL = `http://127.0.0.1:${address.port}`;

    const settings = {
      getRuntimeAIKeySettings: () => ({
        providerId: "self",
        modelId: "grok-4.5",
        baseUrl: "https://opencode.ai/zen/go/v1",
        apiKey: "go-test-key",
      }),
    } as unknown as SettingsService;
    const runtime = new OpenCodeRuntimeService(settings);

    await expect(runtime.listModels()).resolves.toEqual([{
      providerId: "self",
      modelId: "grok-4.5",
      providerName: "self",
      displayName: "grok-4.5",
      default: true,
    }]);
    await expect(runtime.sendMessage({
      sessionId: "go-session",
      content: "Reply with exactly OPENCODE_GO_OK",
    })).resolves.toEqual({
      content: "OPENCODE_GO_OK",
      model: { providerId: "self", modelId: "grok-4.5" },
    });
    expect(authPath).toBe("/auth/opencode-go");
    expect(authBody).toEqual({
      type: "api",
      key: "go-test-key",
    });
    expect(messageBody).toMatchObject({
      model: { providerID: "opencode-go", modelID: "grok-4.5" },
    });
  });

  it("does not advertise a configured default model that OpenCode has not registered", async () => {
    server = createServer((request, response) => {
      if (request.method === "GET" && request.url === "/session") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end("[]");
        return;
      }
      if (request.method === "GET" && request.url === "/config") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ provider: {} }));
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "not found" }));
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS_MISSING");
    process.env.OPENCODE_BASE_URL = `http://127.0.0.1:${address.port}`;

    const settings = {
      getRuntimeAIKeySettings: () => ({
        providerId: "xai",
        modelId: "grok-4.5",
        baseUrl: "https://proxy.example/v1",
        apiKey: null,
      }),
    } as unknown as SettingsService;
    const runtime = new OpenCodeRuntimeService(settings);

    await expect(runtime.listModels()).resolves.toEqual([]);
  });
});
