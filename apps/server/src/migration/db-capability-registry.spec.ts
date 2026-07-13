import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  assertDbCapabilityRegistry,
  getBlockedDbCapabilities,
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
      "task_create_claim_complete_cancel_recover",
    ]);
    expect(registry.filter((entry) => entry.readStatus === "implemented" || entry.writeStatus === "implemented")
      .every((entry) => entry.evidenceTestIds.length > 0)).toBe(true);
    expect(getBlockedDbCapabilities(registry).map((entry) => entry.id)).toEqual([
      "project_chapter_script",
      "outline_story_storyboard_preflight",
      "character_scene_asset_candidate_lock",
      "layout_export",
      "dialogue_pending_runtime",
      "settings_credential_secret_store",
      "project_delete_outbox",
    ]);
  });

  it("CAP-01 reports a complete registry without initializing Prisma", async () => {
    const result = await runCli("--format", "json");
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const payload = JSON.parse(result.stdout) as { code: string; capabilities: unknown[] };
    expect(payload.code).toBe("DB_CAPABILITIES_REPORTED");
    expect(payload.capabilities).toHaveLength(8);
  });

  it("CAP-01 keeps the current activation gate fail-closed with exit code 2", async () => {
    const result = await runCli("--check", "--format", "json");
    expect(result.code).toBe(2);
    const payload = JSON.parse(result.stdout) as { code: string; blockedIds: string[] };
    expect(payload.code).toBe("MIGRATION_CAPABILITY_BLOCKED");
    expect(payload.blockedIds).toContain("settings_credential_secret_store");
  });

  it("CAP-01 rejects malformed flags before any database initialization", async () => {
    const result = await runCli("--format", "json", "--format", "json");
    expect(result.code).toBe(1);
    expect(result.stderr.trim()).toBe("DB_CAPABILITIES_ARGS_INVALID");
  });
});
