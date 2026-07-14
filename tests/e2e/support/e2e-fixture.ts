import type {
  APIRequestContext,
  APIResponse,
  BrowserContext,
  Page,
  TestInfo,
} from "@playwright/test";
import { expect, test as base } from "@playwright/test";
import type {
  ApiEnvelope,
  CreateProjectRequest,
  ProjectListItem,
} from "@airoaming/shared";
import {
  classifyE2ENetworkTarget,
  createE2ERuntime,
  type E2ENetworkTarget,
  type E2ERuntime,
} from "./e2e-env.ts";

export type E2EProviderFailureMode = "success" | "delay" | "429" | "500" | "late_success";

export interface E2EProviderRequestAudit {
  readonly at: string;
  readonly method: string;
  readonly path: string;
}

type BrowserNetworkAction = "continued" | "blocked";

interface BrowserNetworkAuditEntry extends E2ENetworkTarget {
  readonly action: BrowserNetworkAction;
  readonly method: string;
  readonly resourceType: string;
}

export interface E2EBrowserNetworkAuditSummary {
  readonly totalRequests: number;
  readonly continuedLoopbackRequests: number;
  readonly continuedNonNetworkRequests: number;
  readonly continuedExternalRequests: number;
  readonly blockedExternalRequests: number;
  readonly blockedInvalidRequests: number;
  readonly continuedNetworkOrigins: readonly string[];
  readonly blockedExternalOrigins: readonly string[];
}

export interface E2EBrowserNetworkAudit {
  summary(): E2EBrowserNetworkAuditSummary;
}

interface InstalledBrowserDiagnostics extends E2EBrowserNetworkAudit {
  assertIsolated(): void;
  attach(testInfo: TestInfo): Promise<void>;
}

interface BrowserDiagnostic {
  readonly kind: "console.error" | "pageerror" | "requestfailed";
  readonly message: string;
  readonly url?: string;
  readonly method?: string;
  readonly resourceType?: string;
}

interface E2EFixtures {
  readonly runtime: E2ERuntime;
  readonly api: E2EApiClient;
  readonly provider: E2EFakeProviderClient;
  readonly rainSmokeProject: ProjectListItem;
  readonly browserNetworkAudit: E2EBrowserNetworkAudit;
}

export interface CleanupE2EProjectOptions {
  /** API spec 的 catch 会显式传入；fixture teardown 还会结合 testInfo.status 判断。 */
  readonly primaryTestFailed?: boolean;
}

/**
 * E2E 的唯一 HTTP 信封入口。它只校验传输/信封，不复制任何业务状态机。
 */
export class E2EApiClient {
  constructor(
    private readonly request: APIRequestContext,
    readonly runtime: E2ERuntime,
  ) {}

  get<T>(path: string): Promise<ApiEnvelope<T>> {
    return this.send<T>("GET", path);
  }

  post<T>(path: string, data?: unknown): Promise<ApiEnvelope<T>> {
    return this.send<T>("POST", path, data);
  }

  patch<T>(path: string, data?: unknown): Promise<ApiEnvelope<T>> {
    return this.send<T>("PATCH", path, data);
  }

  delete<T>(path: string): Promise<ApiEnvelope<T>> {
    return this.send<T>("DELETE", path);
  }

  async createRainSmokeProject(scenario: string): Promise<ProjectListItem> {
    const input: CreateProjectRequest = {
      name: `雨夜末班车 · rain_smoke · ${this.runtime.runId} · ${scenario}`,
      type: "comic",
      comicFormat: "vertical_scroll",
      storyTitle: "雨夜末班车",
      description: "林夏在雨夜站台等末班车，广播异常，空车进站。",
    };
    const response = await this.post<{ project: ProjectListItem }>("/projects", input);
    return response.data.project;
  }

  async deleteProjectIfPresent(projectId: string): Promise<boolean> {
    const projects = await this.get<{ items: ProjectListItem[] }>("/projects");
    if (!projects.data.items.some((project) => project.id === projectId)) {
      return false;
    }
    await this.delete(`/projects/${encodeURIComponent(projectId)}`);
    return true;
  }

  private async send<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, data?: unknown): Promise<ApiEnvelope<T>> {
    const url = resolveApiUrl(this.runtime, path);
    const response = await this.request.fetch(url, {
      method,
      data,
      failOnStatusCode: false,
    });
    return readSuccessEnvelope<T>(response, `${method} ${path}`);
  }
}

/** Fake provider 的公开审计与故障注入入口，供后续外部边界用例复用。 */
export class E2EFakeProviderClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly runtime: E2ERuntime,
  ) {}

  async listRequests(): Promise<readonly E2EProviderRequestAudit[]> {
    const response = await this.request.get(`${this.runtime.providerUrl}/__e2e__/requests`, {
      failOnStatusCode: false,
    });
    const payload = await readJsonRecord(response, "GET fake provider audit");
    if (!response.ok() || !Array.isArray(payload.items)) {
      throw new Error(`E2E_PROVIDER_AUDIT_FAILED:${response.status()}`);
    }
    if (!payload.items.every(isProviderRequestAudit)) {
      throw new Error("E2E_PROVIDER_AUDIT_SHAPE_INVALID");
    }
    return payload.items;
  }

  async setFailureMode(mode: E2EProviderFailureMode): Promise<void> {
    const response = await this.request.post(`${this.runtime.providerUrl}/__e2e__/control`, {
      data: { mode },
      failOnStatusCode: false,
    });
    if (response.status() !== 204) {
      throw new Error(`E2E_PROVIDER_CONTROL_FAILED:${response.status()}:${await response.text()}`);
    }
  }
}

/**
 * 删除单测项目，但不允许二次清理错误覆盖原测试失败。
 * 全局 teardown 仍会独立清理整棵临时 workspace。
 */
export async function cleanupE2EProject(
  api: E2EApiClient,
  projectId: string,
  testInfo: TestInfo,
  options: CleanupE2EProjectOptions = {},
): Promise<void> {
  try {
    await api.deleteProjectIfPresent(projectId);
  } catch (error) {
    const primaryTestFailed = options.primaryTestFailed === true || isFailedStatus(testInfo.status);
    if (!primaryTestFailed) {
      throw error;
    }
    await testInfo.attach("e2e-project-cleanup-error", {
      body: Buffer.from(JSON.stringify({
        runId: api.runtime.runId,
        projectId,
        testStatus: testInfo.status,
        error: error instanceof Error
          ? { name: error.name, message: error.message, stack: error.stack }
          : { message: String(error) },
      }, null, 2)),
      contentType: "application/json",
    }).catch(() => undefined);
  }
}

export const test = base.extend<E2EFixtures>({
  runtime: async ({}, use) => {
    await use(createE2ERuntime());
  },

  api: async ({ request, runtime }, use) => {
    await use(new E2EApiClient(request, runtime));
  },

  provider: async ({ request, runtime }, use) => {
    await use(new E2EFakeProviderClient(request, runtime));
  },

  rainSmokeProject: async ({ api }, use, testInfo) => {
    const testIdentity = testInfo.testId.replace(/[^a-zA-Z0-9_-]/g, "").slice(-12) || "case";
    const scenario = `ui-${testIdentity}-${testInfo.workerIndex}-${testInfo.repeatEachIndex}-${testInfo.retry}`;
    const project = await api.createRainSmokeProject(scenario);
    let primaryTestFailed = false;
    try {
      await use(project);
    } catch (error) {
      primaryTestFailed = true;
      throw error;
    } finally {
      await cleanupE2EProject(api, project.id, testInfo, { primaryTestFailed });
    }
  },

  browserNetworkAudit: async ({ context, runtime }, use, testInfo) => {
    const audit = await installBrowserDiagnostics(context, runtime);
    let primaryTestFailed = false;
    try {
      await use(audit);
    } catch (error) {
      primaryTestFailed = true;
      throw error;
    } finally {
      try {
        await audit.attach(testInfo);
        audit.assertIsolated();
      } catch (error) {
        if (!primaryTestFailed && !isFailedStatus(testInfo.status)) {
          throw error;
        }
      }
    }
  },

  // 覆写内建 page fixture：只有真正请求 page 的 UI spec 才创建 BrowserContext/Chromium。
  // route 与监听在 newPage 前安装，纯 API spec 不依赖 browser/context。
  page: async ({ browserNetworkAudit, context }, use) => {
    // 依赖 browserNetworkAudit，保证 route 守卫先于 newPage 安装。
    void browserNetworkAudit;
    const page = await context.newPage();
    await use(page);
  },
});

export { expect };

async function installBrowserDiagnostics(
  context: BrowserContext,
  runtime: E2ERuntime,
): Promise<InstalledBrowserDiagnostics> {
  const networkAudit: BrowserNetworkAuditEntry[] = [];
  const diagnostics: BrowserDiagnostic[] = [];
  const observedPages = new WeakSet<Page>();

  const observePage = (page: Page) => {
    if (observedPages.has(page)) {
      return;
    }
    observedPages.add(page);
    page.on("console", (message) => {
      if (message.type() === "error") {
        diagnostics.push({
          kind: "console.error",
          message: message.text(),
          url: page.url(),
        });
      }
    });
    page.on("pageerror", (error) => {
      diagnostics.push({
        kind: "pageerror",
        message: error.message,
        url: page.url(),
      });
    });
  };

  for (const page of context.pages()) {
    observePage(page);
  }
  context.on("page", observePage);
  context.on("requestfailed", (request) => {
    diagnostics.push({
      kind: "requestfailed",
      message: request.failure()?.errorText ?? "request failed",
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
    });
  });

  // page fixture 在 newPage 前完成 route 安装，因此任何页面都不能绕过公网守卫。
  await context.route("**/*", async (route) => {
    const request = route.request();
    const target = classifyE2ENetworkTarget(runtime, request.url());
    if (target.decision === "block_external" || target.decision === "block_invalid") {
      await route.abort("blockedbyclient");
      networkAudit.push({
        ...target,
        action: "blocked",
        method: request.method(),
        resourceType: request.resourceType(),
      });
      return;
    }
    await route.continue();
    networkAudit.push({
      ...target,
      action: "continued",
      method: request.method(),
      resourceType: request.resourceType(),
    });
  });

  // HTTP route 不覆盖 WebSocket；HMR 等 socket 同样只能连接当前运行的 loopback origin。
  await context.routeWebSocket(/.*/, async (webSocket) => {
    const target = classifyE2ENetworkTarget(runtime, webSocket.url());
    if (target.decision === "block_external" || target.decision === "block_invalid") {
      await webSocket.close({ code: 1008, reason: "E2E external network blocked" });
      networkAudit.push({
        ...target,
        action: "blocked",
        method: "WEBSOCKET",
        resourceType: "websocket",
      });
      return;
    }
    webSocket.connectToServer();
    networkAudit.push({
      ...target,
      action: "continued",
      method: "WEBSOCKET",
      resourceType: "websocket",
    });
  });

  return {
    summary: () => summarizeBrowserNetworkAudit(networkAudit),
    assertIsolated() {
      const audit = summarizeBrowserNetworkAudit(networkAudit);
      if (audit.continuedExternalRequests > 0) {
        throw new Error("E2E_BROWSER_EXTERNAL_REQUEST_CONTINUED");
      }
    },
    async attach(testInfo: TestInfo) {
      const audit = summarizeBrowserNetworkAudit(networkAudit);
      await testInfo.attach("e2e-browser-network-audit", {
        body: Buffer.from(JSON.stringify({ runId: runtime.runId, ...audit }, null, 2)),
        contentType: "application/json",
      });
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach("e2e-browser-diagnostics", {
          body: Buffer.from(JSON.stringify({
            runId: runtime.runId,
            status: testInfo.status,
            expectedStatus: testInfo.expectedStatus,
            networkAudit,
            diagnostics,
          }, null, 2)),
          contentType: "application/json",
        });
      }
    },
  };
}

function summarizeBrowserNetworkAudit(
  entries: readonly BrowserNetworkAuditEntry[],
): E2EBrowserNetworkAuditSummary {
  const continuedNetworkOrigins = new Set<string>();
  const blockedExternalOrigins = new Set<string>();
  let continuedLoopbackRequests = 0;
  let continuedNonNetworkRequests = 0;
  let continuedExternalRequests = 0;
  let blockedExternalRequests = 0;
  let blockedInvalidRequests = 0;

  for (const entry of entries) {
    if (entry.action === "continued") {
      if (entry.decision === "allow_loopback") {
        continuedLoopbackRequests += 1;
        continuedNetworkOrigins.add(normalizeNetworkOrigin(entry.origin));
      } else if (entry.decision === "allow_non_network") {
        continuedNonNetworkRequests += 1;
      } else {
        continuedExternalRequests += 1;
      }
      continue;
    }

    if (entry.decision === "block_external") {
      blockedExternalRequests += 1;
      blockedExternalOrigins.add(entry.origin);
    } else if (entry.decision === "block_invalid") {
      blockedInvalidRequests += 1;
    }
  }

  return {
    totalRequests: entries.length,
    continuedLoopbackRequests,
    continuedNonNetworkRequests,
    continuedExternalRequests,
    blockedExternalRequests,
    blockedInvalidRequests,
    continuedNetworkOrigins: [...continuedNetworkOrigins].sort(),
    blockedExternalOrigins: [...blockedExternalOrigins].sort(),
  };
}

function normalizeNetworkOrigin(origin: string): string {
  const url = new URL(origin);
  const protocol = url.protocol === "ws:"
    ? "http:"
    : url.protocol === "wss:"
      ? "https:"
      : url.protocol;
  return `${protocol}//${url.host}`;
}

function isFailedStatus(status: TestInfo["status"]): boolean {
  return status === "failed" || status === "timedOut" || status === "interrupted";
}

function resolveApiUrl(runtime: E2ERuntime, input: string): string {
  if (!input.startsWith("/") || input.startsWith("//")) {
    throw new Error("E2E_API_PATH_INVALID");
  }
  const url = `${runtime.apiBaseUrl}${input}`;
  const target = classifyE2ENetworkTarget(runtime, url);
  if (target.decision !== "allow_loopback" || new URL(url).origin !== runtime.serverUrl) {
    throw new Error("E2E_API_TARGET_BLOCKED");
  }
  return url;
}

async function readSuccessEnvelope<T>(response: APIResponse, label: string): Promise<ApiEnvelope<T>> {
  const payload = await readJsonRecord(response, label);
  if (!response.ok() || payload.success !== true || !("data" in payload)) {
    throw new Error(`E2E_API_REQUEST_FAILED:${label}:${response.status()}:${JSON.stringify(payload)}`);
  }
  return { success: true, data: payload.data as T };
}

async function readJsonRecord(response: APIResponse, label: string): Promise<Record<string, unknown>> {
  const body = await response.text();
  try {
    const payload: unknown = JSON.parse(body);
    if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
  } catch {
    // 下方以带上下文的稳定错误结束。
  }
  throw new Error(`E2E_HTTP_JSON_REQUIRED:${label}:${response.status()}:${body.slice(0, 500)}`);
}

function isProviderRequestAudit(value: unknown): value is E2EProviderRequestAudit {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return typeof item.at === "string" && typeof item.method === "string" && typeof item.path === "string";
}
