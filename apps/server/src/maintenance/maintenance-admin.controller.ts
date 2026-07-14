import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { readFile, stat } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import * as path from "node:path";
import { ok } from "../http.js";
import { MaintenanceCoordinator, MaintenanceException } from "./maintenance-coordinator.service.js";

interface MaintenanceRequest {
  socket: { remoteAddress?: string };
  ip?: string;
  header(name: string): string | undefined;
}

@Controller("_local/maintenance")
export class MaintenanceAdminController {
  constructor(private readonly coordinator: MaintenanceCoordinator) {}

  @Get("status")
  async status(@Req() request: MaintenanceRequest) {
    await this.authorize(request);
    return ok(await this.coordinator.status());
  }

  @Get("identity")
  async identity(@Req() request: MaintenanceRequest) {
    await this.authorize(request);
    const workspaceRoot = process.env.AIROAMING_WORKSPACE_ROOT?.trim();
    const releaseRoot = process.env.AIROAMING_RELEASE_ROOT?.trim();
    const appCommit = process.env.AIROAMING_APP_COMMIT?.trim();
    const persistenceMode = process.env.AIROAMING_PERSISTENCE_MODE?.trim();
    if (!workspaceRoot || !releaseRoot || !path.isAbsolute(workspaceRoot) || !path.isAbsolute(releaseRoot) || workspaceRoot.includes("\0") || releaseRoot.includes("\0") || !/^[0-9a-f]{40}$/.test(appCommit ?? "") || persistenceMode !== "file") {
      throw new MaintenanceException("MAINTENANCE_RUNTIME_IDENTITY_UNAVAILABLE", 503);
    }
    return ok({
      persistenceMode: "file" as const,
      workspaceRoot: path.resolve(workspaceRoot),
      releaseRoot: path.resolve(releaseRoot),
      appCommit,
      runtimeInstanceId: this.coordinator.getRuntimeInstanceId(),
    });
  }

  @Post("drain")
  async drain(@Req() request: MaintenanceRequest, @Body() body: { timeoutMs?: number } = {}) {
    await this.authorize(request);
    const timeoutMs = body.timeoutMs === undefined ? undefined : Number(body.timeoutMs);
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)) {
      throw new MaintenanceException("MAINTENANCE_TIMEOUT_INVALID", 400);
    }
    return ok(await this.coordinator.drain(timeoutMs));
  }

  @Post("close")
  async close(@Req() request: MaintenanceRequest) {
    await this.authorize(request);
    return ok(await this.coordinator.close());
  }

  @Post("reopen")
  async reopen(@Req() request: MaintenanceRequest) {
    await this.authorize(request);
    return ok(await this.coordinator.reopen());
  }

  @Post("bundle")
  async bundle(@Req() request: MaintenanceRequest) {
    await this.authorize(request);
    return ok(await this.coordinator.createRuntimeBundle());
  }

  private async authorize(request: MaintenanceRequest): Promise<void> {
    const remoteAddress = request.socket.remoteAddress ?? request.ip;
    const isLoopback = remoteAddress === "127.0.0.1" || remoteAddress === "::1" || remoteAddress === "::ffff:127.0.0.1";
    if (!isLoopback) throw new MaintenanceException("MAINTENANCE_LOOPBACK_REQUIRED", 403);

    const tokenPath = process.env.AIROAMING_MAINTENANCE_TOKEN_FILE?.trim();
    if (!tokenPath) throw new MaintenanceException("MAINTENANCE_TOKEN_FILE_REQUIRED", 403);
    try {
      const metadata = await stat(tokenPath);
      if ((metadata.mode & 0o077) !== 0) throw new MaintenanceException("MAINTENANCE_TOKEN_FILE_PERMISSIONS", 403);
      const expected = (await readFile(tokenPath, "utf8")).trim();
      const actual = String(request.header("X-AIRoaming-Maintenance-Token") ?? "").trim();
      const expectedBuffer = Buffer.from(expected, "utf8");
      const actualBuffer = Buffer.from(actual, "utf8");
      if (!expected || expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
        throw new MaintenanceException("MAINTENANCE_TOKEN_INVALID", 403);
      }
    } catch (error) {
      if (error instanceof MaintenanceException) throw error;
      throw new MaintenanceException("MAINTENANCE_TOKEN_INVALID", 403);
    }
  }
}
