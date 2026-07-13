import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  assertDbCapabilityRegistry,
  getBlockedDbCapabilities,
  getDbCapabilityOperations,
  getDbCapabilityRegistry,
} from "./db-capability-registry.js";

const execFileAsync = promisify(execFile);
const migrationRoot = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(migrationRoot, "../..");
const cliPath = path.join(migrationRoot, "db-capabilities.cli.ts");

async function runCli(...args: string[]) {
  try {
    const result = await execFileAsync(process.execPath, ["--import", "tsx", cliPath, ...args], {
      cwd: serverRoot,
      env: { ...process.env, AIROAMING_PERSISTENCE_MODE: "db" },
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const result = error as { code?: number; stdout?: string; stderr?: string };
    return { code: result.code ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  }
}

async function readGuardedOperationsFromSource(): Promise<string[]> {
  const sourceFiles = [
    path.join(serverRoot, "src/projects/project-repository.service.ts"),
    path.join(serverRoot, "src/projects/projects.service.ts"),
  ];
  const operations = new Set<string>();
  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8");
    for (const match of source.matchAll(/assertDatabaseOperationSupported\("([^"]+)"\)/g)) {
      operations.add(match[1]!);
    }
  }
  return [...operations].sort();
}

describe("M5-A0 DB capability registry", () => {
  it("CAP-02 exposes exactly eight stable entries and never marks an unproven write as implemented", () => {
    const registry = getDbCapabilityRegistry();
    assertDbCapabilityRegistry(registry);
    expect(registry.map((entry) => entry.id)).toEqual([
      "project_chapter_script",
      "outline_story_storyboard_preflight",
      "character_scene_asset_candidate_lock",
      "layout_export",
      "dialogue_pending_runtime",
      "task_create_claim_complete_cancel_recover",
      "settings_credential_secret_store",
      "project_delete_outbox",
    ]);
    expect(registry.filter((entry) => entry.writeStatus === "implemented").map((entry) => entry.id)).toEqual([
      "project_chapter_script",
      "outline_story_storyboard_preflight",
      "task_create_claim_complete_cancel_recover",
      "settings_credential_secret_store",
    ]);
    expect(registry.filter((entry) => entry.readStatus === "implemented" || entry.writeStatus === "implemented")
      .every((entry) => entry.evidenceTestIds.length > 0)).toBe(true);
    expect(getBlockedDbCapabilities(registry).map((entry) => entry.id)).toEqual([
      "character_scene_asset_candidate_lock",
      "layout_export",
      "dialogue_pending_runtime",
      "project_delete_outbox",
    ]);
  });

  it("D2-A0 registers every operation-level DB gate with an explicit owner, status and evidence", async () => {
    const registry = getDbCapabilityRegistry();
    const operations = getDbCapabilityOperations();
    assertDbCapabilityRegistry(registry);
    expect(operations.map((operation) => operation.operation).sort()).toEqual(
      await readGuardedOperationsFromSource(),
    );
    expect(operations).toHaveLength(36);
    expect(operations.every((operation) => operation.readStatus === "not_applicable")).toBe(true);
    expect(operations.filter((operation) => operation.writeStatus === "implemented").map((operation) => operation.operation)).toEqual([
      "update_project_draft",
      "extract_characters",
      "update_character",
      "ensure_chapter_exists",
      "write_chapter_draft_from_ai",
      "save_script_outline_from_ai",
      "confirm_script_outline",
      "generation_task_create",
    ]);
    expect(operations.filter((operation) => operation.writeStatus === "retired")).toHaveLength(14);
    expect(operations.find((operation) => operation.operation === "generation_task_create")).toMatchObject({
      capabilityId: "task_create_claim_complete_cancel_recover",
      ownerModule: "tasks/persistent-task-repository",
      sourceSymbol: "ProjectsService.guardGenerationTaskCreate",
      evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#creates shot prompt/image tasks through the DB guard and records late candidates as historical"],
    });
    expect(operations.filter((operation) => operation.writeStatus === "unsupported")
      .every((operation) => operation.evidenceTestIds.length === 0)).toBe(true);
  });

  it("CAP-01 reports a complete registry without initializing Prisma", async () => {
    const result = await runCli("--format", "json");
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout) as { code: string; capabilities: unknown[]; operations: unknown[] };
    expect(payload.code).toBe("DB_CAPABILITIES_REPORTED");
    expect(payload.capabilities).toHaveLength(8);
    expect(payload.operations).toHaveLength(36);
  });

  it("CAP-01 keeps the current activation gate fail-closed with exit code 2", async () => {
    const result = await runCli("--check", "--format", "json");
    expect(result.code).toBe(2);
    const payload = JSON.parse(result.stdout) as { code: string; blockedIds: string[] };
    expect(payload.code).toBe("MIGRATION_CAPABILITY_BLOCKED");
    expect(payload.blockedIds).not.toContain("settings_credential_secret_store");
    expect(payload.blockedIds).toHaveLength(4);
    expect(payload.blockedIds).not.toContain("project_chapter_script");
  });

  it("CAP-01 rejects malformed flags before any database initialization", async () => {
    const result = await runCli("--format", "json", "--format", "json");
    expect(result.code).toBe(1);
    expect(result.stderr.trim()).toBe("DB_CAPABILITIES_ARGS_INVALID");
  });
});
