import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { digestCanonicalJson } from "@airoaming/shared";
import { MaintenanceCoordinator } from "../maintenance/maintenance-coordinator.service.js";
import { digestMaintenanceJson } from "../maintenance/canonical-json.js";
import { FakeSecretStore, MacOSKeychainSecretStore, SecretStoreError, SecretString, type SecretStore } from "../settings/secret-store.js";
import { createCutoverAction, productionCutoverRunnerDependencies } from "./cutover-runner.service.js";
import { CutoverEvidenceStore, type CutoverEvidenceStep } from "./cutover-evidence.service.js";
import { DbCutoverService } from "./db-cutover.service.js";
import { createMigrationDecisionArtifact } from "./migration-decision.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { assertFileModeBridgeAllowed } from "../persistence/file-mode-guard.js";
import { RuntimeBundleFileService } from "./runtime-bundle-file.service.js";
import { CUTOVER_SHADOW_CHECKS } from "./cutover-shadow-gate.js";
import { AppBackupService } from "../backup/app-backup.service.js";
import type { CutoverPlanV1 } from "./cutover-plan.types.js";
import type { RuntimeBundleEnvelope } from "./snapshot.types.js";

function makePlan(root: string, overrides: Partial<CutoverPlanV1> = {}): CutoverPlanV1 {
  const unsigned = {
    schemaVersion: 1 as const,
    kind: "airoaming_cutover_plan_v1" as const,
    cutoverId: "runner-test",
    appCommit: "a".repeat(40),
    runId: "runner-run",
    releaseRoot: root,
    sourceWorkspaceRoot: path.join(root, "source"),
    targetDatabaseUrl: `file:${path.join(root, "target.sqlite")}` as `file:${string}`,
    targetDataRoot: path.join(root, "target-data"),
    targetWorkspaceRoot: path.join(root, "target-workspace"),
    snapshotRoot: path.join(root, "snapshot"),
    decisionsPath: path.join(root, "decisions.json"),
    finalReportPath: path.join(root, "final-report.json"),
    maintenanceBaseUrl: "http://127.0.0.1:3010",
    maintenanceWindow: { startsAt: "2026-07-14T22:00:00+08:00", endsAt: "2026-07-14T23:00:00+08:00", timeZone: "Asia/Shanghai" as const },
    maintenanceTokenFile: path.join(root, "maintenance-token"),
    runtimeBundlePath: path.join(root, "runtime-bundle.json"),
    backupRoot: path.join(root, "backup"),
    restoreDataRoot: path.join(root, "restore-data"),
    restoreWorkspaceRoot: path.join(root, "restore-workspace"),
    archiveRoot: path.join(root, "archive"),
    evidenceRoot: path.join(root, "evidence"),
    shadowGatePath: path.join(root, "shadow-gate.json"),
    settingsStartState: "already_sanitized" as const,
    credentialAction: "verify_existing" as const,
    effectiveSchemaManifestDigest: `sha256:${"1".repeat(64)}` as `sha256:${string}`,
  };
  return { ...unsigned, ...overrides, planDigest: digestCanonicalJson(unsigned) as `sha256:${string}` };
}

async function writeIsolatedShadowGate(plan: CutoverPlanV1): Promise<void> {
  const checks = Object.fromEntries(CUTOVER_SHADOW_CHECKS.map((check) => [check, { status: "passed", evidenceDigest: `sha256:${"a".repeat(64)}` }])) as Record<string, { status: "passed"; evidenceDigest: `sha256:${string}` }>;
  const unsigned = { schemaVersion: 1 as const, kind: "airoaming_cutover_shadow_gate_v1" as const, cutoverId: plan.cutoverId, appCommit: plan.appCommit, planDigest: plan.planDigest, runId: plan.runId, effectiveSchemaManifestDigest: plan.effectiveSchemaManifestDigest, checks, migrationReportDigest: `sha256:${"b".repeat(64)}` as `sha256:${string}`, humanReviewer: { reviewerId: "isolated-test-human", signedAt: "2026-07-14T00:00:00.000Z" } };
  await writeFile(plan.shadowGatePath!, JSON.stringify({ ...unsigned, gateDigest: digestCanonicalJson(unsigned) }) + "\n", { mode: 0o600 });
}

function resignPlan(input: CutoverPlanV1): CutoverPlanV1 {
  const { planDigest: _oldDigest, ...unsigned } = input;
  return { ...input, planDigest: digestCanonicalJson(unsigned) as `sha256:${string}` };
}

function fakeSecretStore(): SecretStore {
  const values = new Map<string, SecretString>();
  return {
    async put({ credentialId, secret }) { values.set(credentialId, secret); return { credentialId, secretRef: `airoaming:image:v1:${credentialId}`, fingerprint: `sha256:${"2".repeat(64)}`, configured: true, updatedAt: new Date(0).toISOString() }; },
    async get(credentialId) { const value = values.get(credentialId); if (!value) throw new SecretStoreError("SECRET_STORE_ENTRY_MISSING"); return value; },
    async delete(credentialId) { values.delete(credentialId); },
    async probe() { return { available: true, adapter: "fake", reason: null }; },
  };
}

describe("createCutoverAction", () => {
  it("RCUT-SEC-08 keeps the production runner on Keychain even if the fake env is present", () => {
    const previousAdapter = process.env.AIROAMING_SECRET_STORE_ADAPTER;
    const previousRoot = process.env.AIROAMING_FAKE_SECRET_STORE_ROOT;
    process.env.AIROAMING_SECRET_STORE_ADAPTER = "fake";
    process.env.AIROAMING_FAKE_SECRET_STORE_ROOT = path.join(os.tmpdir(), "airoaming-forbidden-fake-root");
    try {
      const dependencies = productionCutoverRunnerDependencies();
      expect(dependencies.secretStoreAdapter).toBe("keychain");
      expect(dependencies.secretStore).toBeInstanceOf(MacOSKeychainSecretStore);
      expect(dependencies.secretStore).not.toBeInstanceOf(FakeSecretStore);
    } finally {
      if (previousAdapter === undefined) delete process.env.AIROAMING_SECRET_STORE_ADAPTER; else process.env.AIROAMING_SECRET_STORE_ADAPTER = previousAdapter;
      if (previousRoot === undefined) delete process.env.AIROAMING_FAKE_SECRET_STORE_ROOT; else process.env.AIROAMING_FAKE_SECRET_STORE_ROOT = previousRoot;
    }
  });

  it("C1 uses only the injected maintenance client and seals a cutover runtime bundle", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c1-"));
    const plan = makePlan(root);
    await writeFile(plan.maintenanceTokenFile, "fake-maintenance-token\n", { mode: 0o600 });
    const coordinator = new MaintenanceCoordinator();
    await coordinator.drain();
    await coordinator.close();
    const bundle = await coordinator.createRuntimeBundle() as RuntimeBundleEnvelope;
    const calls: string[] = [];
    const dependencies = { ...productionCutoverRunnerDependencies(), now: () => new Date("2026-07-14T22:30:00+08:00"), fetch: (async (input: string | URL) => {
      const action = String(input).split("/").pop()!;
      calls.push(action);
      return { ok: true, json: async () => ({ success: true, data: action === "identity" ? { persistenceMode: "file", workspaceRoot: plan.sourceWorkspaceRoot, releaseRoot: plan.releaseRoot, appCommit: plan.appCommit, runtimeInstanceId: coordinator.getRuntimeInstanceId() } : action === "bundle" ? bundle : undefined }) };
    }) as unknown as typeof fetch };
    const result = await createCutoverAction("C1", undefined, dependencies)({ plan, step: "C1" });
    expect(result.summaryCode).toBe("CUTOVER_C1_OK");
    expect(calls).toEqual(["identity", "drain", "close", "identity", "bundle"]);
    expect((await stat(plan.runtimeBundlePath)).mode & 0o077).toBe(0);
  });

  it("C1 maintenance failure leaves no runtime bundle behind", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c1-fail-"));
    const plan = makePlan(root);
    await writeFile(plan.maintenanceTokenFile, "fake-maintenance-token\n", { mode: 0o600 });
    let calls = 0;
    const dependencies = { ...productionCutoverRunnerDependencies(), now: () => new Date("2026-07-14T22:30:00+08:00"), fetch: (async () => {
      calls += 1;
      return calls === 1
        ? { ok: true, json: async () => ({ success: true, data: { persistenceMode: "file", workspaceRoot: plan.sourceWorkspaceRoot, releaseRoot: plan.releaseRoot, appCommit: plan.appCommit, runtimeInstanceId: "00000000-0000-4000-8000-000000000001" } }) }
        : calls === 2
          ? { ok: true, json: async () => ({ success: true }) }
          : { ok: false, json: async () => ({ success: false, error: { code: "MAINTENANCE_CLOSE_FAILED" } }) };
    }) as unknown as typeof fetch };
    await expect(createCutoverAction("C1", undefined, dependencies)({ plan, step: "C1" })).rejects.toMatchObject({ code: "MAINTENANCE_CLOSE_FAILED" });
    await expect(stat(plan.runtimeBundlePath)).rejects.toThrow();
  });

  it("RCUT-C1-IDENTITY rejects a maintenance process that is not the bound file runtime", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c1-identity-"));
    const plan = makePlan(root);
    await writeFile(plan.maintenanceTokenFile, "fake-maintenance-token\n", { mode: 0o600 });
    let calls = 0;
    const dependencies = { ...productionCutoverRunnerDependencies(), now: () => new Date("2026-07-14T22:30:00+08:00"), fetch: (async () => {
      calls += 1;
      return { ok: true, json: async () => ({ success: true, data: { persistenceMode: "db", workspaceRoot: plan.sourceWorkspaceRoot, releaseRoot: plan.releaseRoot, appCommit: plan.appCommit, runtimeInstanceId: "00000000-0000-4000-8000-000000000001" } }) };
    }) as unknown as typeof fetch };
    await expect(createCutoverAction("C1", undefined, dependencies)({ plan, step: "C1" })).rejects.toMatchObject({ code: "CUTOVER_SOURCE_RUNTIME_IDENTITY_MISMATCH" });
    expect(calls).toBe(1);
    await expect(stat(plan.runtimeBundlePath)).rejects.toThrow();
  });

  it("RCUT-C1-WINDOW rejects C1 before contacting maintenance outside the bound window", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c1-window-"));
    const plan = makePlan(root);
    await writeFile(plan.maintenanceTokenFile, "fake-maintenance-token\n", { mode: 0o600 });
    let calls = 0;
    const dependencies = { ...productionCutoverRunnerDependencies(), now: () => new Date("2026-07-14T21:59:59+08:00"), fetch: (async () => { calls += 1; throw new Error("unexpected fetch"); }) as unknown as typeof fetch };
    await expect(createCutoverAction("C1", undefined, dependencies)({ plan, step: "C1" })).rejects.toMatchObject({ code: "CUTOVER_MAINTENANCE_WINDOW_CLOSED" });
    expect(calls).toBe(0);
  });

  it("RCUT-C1-INSTANCE rejects a process change between identity and sealed bundle", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c1-instance-"));
    const plan = makePlan(root);
    await writeFile(plan.maintenanceTokenFile, "fake-maintenance-token\n", { mode: 0o600 });
    const coordinator = new MaintenanceCoordinator();
    await coordinator.drain();
    await coordinator.close();
    const bundle = await coordinator.createRuntimeBundle() as RuntimeBundleEnvelope;
    let identityCalls = 0;
    const dependencies = { ...productionCutoverRunnerDependencies(), now: () => new Date("2026-07-14T22:30:00+08:00"), fetch: (async (input: string | URL) => {
      const action = String(input).split("/").pop()!;
      if (action === "identity") {
        identityCalls += 1;
        return { ok: true, json: async () => ({ success: true, data: { persistenceMode: "file", workspaceRoot: plan.sourceWorkspaceRoot, releaseRoot: plan.releaseRoot, appCommit: plan.appCommit, runtimeInstanceId: identityCalls === 1 ? "00000000-0000-4000-8000-000000000001" : "00000000-0000-4000-8000-000000000002" } }) };
      }
      return { ok: true, json: async () => ({ success: true, data: action === "bundle" ? bundle : undefined }) };
    }) as unknown as typeof fetch };
    await expect(createCutoverAction("C1", undefined, dependencies)({ plan, step: "C1" })).rejects.toMatchObject({ code: "CUTOVER_SOURCE_RUNTIME_INSTANCE_CHANGED" });
    await expect(stat(plan.runtimeBundlePath)).rejects.toThrow();
  });

  it("RCUT-C1-BUNDLE-INSTANCE rejects a bundle from another process without persisting it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c1-bundle-instance-"));
    const plan = makePlan(root);
    await writeFile(plan.maintenanceTokenFile, "fake-maintenance-token\n", { mode: 0o600 });
    const coordinator = new MaintenanceCoordinator();
    await coordinator.drain();
    await coordinator.close();
    const bundle = await coordinator.createRuntimeBundle() as RuntimeBundleEnvelope;
    const expectedInstanceId = "00000000-0000-4000-8000-000000000001";
    const dependencies = { ...productionCutoverRunnerDependencies(), now: () => new Date("2026-07-14T22:30:00+08:00"), fetch: (async (input: string | URL) => {
      const action = String(input).split("/").pop()!;
      return { ok: true, json: async () => ({ success: true, data: action === "identity" ? { persistenceMode: "file", workspaceRoot: plan.sourceWorkspaceRoot, releaseRoot: plan.releaseRoot, appCommit: plan.appCommit, runtimeInstanceId: expectedInstanceId } : action === "bundle" ? bundle : undefined }) };
    }) as unknown as typeof fetch };
    await expect(createCutoverAction("C1", undefined, dependencies)({ plan, step: "C1" })).rejects.toMatchObject({ code: "CUTOVER_SOURCE_RUNTIME_INSTANCE_CHANGED" });
    await expect(stat(plan.runtimeBundlePath)).rejects.toThrow();
  });

  it("C3 keeps migration shell-free and writes expectations without plaintext credentials", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c3-"));
    const source = path.join(root, "source");
    const settingsPath = path.join(source, "settings", "app-settings.json");
    const plan = makePlan(root, { sourceWorkspaceRoot: source, settingsStartState: "legacy_plaintext_requires_two_phase", credentialAction: "prestage_legacy" });
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ openaiImageProvider: { providerId: "default", apiKey: "sk-runner-secret" } }));
    const spawnCalls: Array<{ file: string; args: readonly string[]; options: { shell?: boolean } }> = [];
    const fakeSpawn = ((file: string, args: readonly string[], options: { shell?: boolean }) => {
      spawnCalls.push({ file, args, options });
      const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
      child.stderr = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0));
      return child;
    }) as typeof import("node:child_process").spawn;
    const dependencies = { ...productionCutoverRunnerDependencies(), secretStore: fakeSecretStore(), spawn: fakeSpawn };
    const result = await createCutoverAction("C3", undefined, dependencies)({ plan, step: "C3" });
    expect(result.summaryCode).toBe("CUTOVER_C3_OK");
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0]).toMatchObject({ file: "pnpm", options: { shell: false } });
    expect(spawnCalls[0].args).toEqual(["--dir", "apps/server", "exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]);
    const expectations = await readFile(path.join(plan.evidenceRoot, "credential-expectations.json"), "utf8");
    expect(expectations).not.toContain("sk-runner-secret");
    expect(expectations).toContain("image_openai_default");
    expect(digestMaintenanceJson(JSON.parse(expectations))).toMatch(/^sha256:/);
  });

  it("C3 migration failure stops before settings or evidence writes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c3-fail-"));
    const source = path.join(root, "source");
    const plan = makePlan(root, { sourceWorkspaceRoot: source, settingsStartState: "legacy_plaintext_requires_two_phase", credentialAction: "prestage_legacy" });
    const spawnFailure = (() => {
      const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
      child.stderr = new EventEmitter();
      queueMicrotask(() => child.emit("close", 1));
      return child;
    }) as unknown as typeof import("node:child_process").spawn;
    const dependencies = { ...productionCutoverRunnerDependencies(), secretStore: fakeSecretStore(), spawn: spawnFailure };
    await expect(createCutoverAction("C3", undefined, dependencies)({ plan, step: "C3" })).rejects.toMatchObject({ code: "CUTOVER_MIGRATION_DEPLOY_FAILED" });
    await expect(stat(path.join(plan.evidenceRoot, "credential-expectations.json"))).rejects.toThrow();
    await expect(stat(plan.targetDataRoot)).rejects.toThrow();
    await expect(stat(path.resolve(plan.targetDatabaseUrl.slice("file:".length)))).rejects.toThrow();
  });

  it("RCUT-C3-ROLLBACK removes only target artifacts created before a post-migration failure", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c3-cleanup-"));
    const plan = makePlan(root);
    const spawnSuccess = (() => {
      const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
      child.stderr = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0));
      return child;
    }) as unknown as typeof import("node:child_process").spawn;
    const dependencies = {
      ...productionCutoverRunnerDependencies(),
      spawn: spawnSuccess,
      createSettings: () => ({ inspect: async () => { throw new Error("SETTINGS_INSPECT_FAILED"); } }) as never,
    };
    await expect(createCutoverAction("C3", undefined, dependencies)({ plan, step: "C3" })).rejects.toThrow("SETTINGS_INSPECT_FAILED");
    await expect(stat(plan.targetDataRoot)).rejects.toThrow();
    await expect(stat(path.resolve(plan.targetDatabaseUrl.slice("file:".length)))).rejects.toThrow();
  });

  it("RCUT-PATH-01 rejects a symlinked C3 expectations output", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c3-path-"));
    const source = path.join(root, "source");
    const settingsPath = path.join(source, "settings", "app-settings.json");
    const plan = makePlan(root, { sourceWorkspaceRoot: source, settingsStartState: "legacy_plaintext_requires_two_phase", credentialAction: "prestage_legacy" });
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ openaiImageProvider: { providerId: "default", apiKey: "sk-c3-path-secret" } }));
    await mkdir(plan.evidenceRoot, { recursive: true });
    const outside = path.join(root, "outside.json");
    const original = "outside-bytes\n";
    await writeFile(outside, original, { mode: 0o600 });
    await symlink(outside, path.join(plan.evidenceRoot, "credential-expectations.json"));
    const fakeSpawn = (() => {
      const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
      child.stderr = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0));
      return child;
    }) as unknown as typeof import("node:child_process").spawn;
    const dependencies = { ...productionCutoverRunnerDependencies(), secretStore: fakeSecretStore(), spawn: fakeSpawn };
    await expect(createCutoverAction("C3", undefined, dependencies)({ plan, step: "C3" })).rejects.toMatchObject({ code: "CUTOVER_PATH_SYMLINK" });
    expect(await readFile(outside, "utf8")).toBe(original);
  });

  it("RCUT-PATH-02 rejects a symlinked C4 final report before writing through it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c4-path-"));
    const plan = makePlan(root);
    await mkdir(plan.evidenceRoot, { recursive: true });
    await writeFile(path.join(plan.evidenceRoot, "credential-expectations.json"), "[]\n", { mode: 0o600 });
    await writeFile(plan.decisionsPath, `${JSON.stringify({ decisionsDigest: `sha256:${"6".repeat(64)}` })}\n`, { mode: 0o600 });
    const outside = path.join(root, "outside-report.json");
    const original = "report-outside\n";
    await writeFile(outside, original, { mode: 0o600 });
    await symlink(outside, plan.finalReportPath);
    const calls: string[] = [];
    const prisma = { onModuleInit: async () => calls.push("init"), onModuleDestroy: async () => calls.push("destroy") };
    const dependencies = {
      ...productionCutoverRunnerDependencies(),
      secretStore: fakeSecretStore(),
      createPrisma: () => prisma as never,
      createFinalImporter: () => ({ import: async () => ({ run: { status: "succeeded" }, report: { reportDigest: `sha256:${"7".repeat(64)}` } }) }) as never,
      createReady: () => ({ markReady: async () => { calls.push("ready"); } }) as never,
    };
    await expect(createCutoverAction("C4", undefined, dependencies)({ plan, step: "C4" })).rejects.toMatchObject({ code: "CUTOVER_PATH_SYMLINK" });
    expect(await readFile(outside, "utf8")).toBe(original);
    expect(calls).toEqual([]);
  });

  it("RCUT-PATH-02 rejects a symlinked C4 backup pointer before restore", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c4-pointer-"));
    const plan = makePlan(root);
    await mkdir(plan.evidenceRoot, { recursive: true });
    await writeFile(path.join(plan.evidenceRoot, "credential-expectations.json"), "[]\n", { mode: 0o600 });
    await writeFile(plan.decisionsPath, `${JSON.stringify({ decisionsDigest: `sha256:${"6".repeat(64)}` })}\n`, { mode: 0o600 });
    await writeFile(plan.finalReportPath, "{}\n", { mode: 0o600 });
    const outside = path.join(root, "outside-pointer.json");
    const original = "pointer-outside\n";
    await writeFile(outside, original, { mode: 0o600 });
    await symlink(outside, path.join(plan.evidenceRoot, "backup-pointer.json"));
    const calls: string[] = [];
    const prisma = { onModuleInit: async () => calls.push("init"), onModuleDestroy: async () => calls.push("destroy") };
    const dependencies = {
      ...productionCutoverRunnerDependencies(),
      secretStore: fakeSecretStore(),
      createPrisma: () => prisma as never,
      createFinalImporter: () => ({ import: async () => ({ run: { status: "succeeded" }, report: { reportDigest: `sha256:${"7".repeat(64)}` } }) }) as never,
      createReady: () => ({ markReady: async () => { calls.push("ready"); } }) as never,
      createBackup: () => ({ backup: async () => { calls.push("backup"); return { bundlePath: path.join(root, "bundle.tar"), bundleDigest: `sha256:${"8".repeat(64)}` }; } }) as never,
      createRestore: () => ({ restore: async () => { calls.push("restore"); } }) as never,
    };
    await expect(createCutoverAction("C4", undefined, dependencies)({ plan, step: "C4" })).rejects.toMatchObject({ code: "CUTOVER_PATH_SYMLINK" });
    expect(await readFile(outside, "utf8")).toBe(original);
    expect(calls).toEqual([]);
  });

  it("C4 blocked final import does not write report or backup pointers", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c4-fail-"));
    const plan = makePlan(root);
    await mkdir(plan.evidenceRoot, { recursive: true });
    await writeFile(path.join(plan.evidenceRoot, "credential-expectations.json"), "{}\n", { mode: 0o600 });
    await writeFile(plan.decisionsPath, `${JSON.stringify({ decisionsDigest: `sha256:${"6".repeat(64)}` })}\n`, { mode: 0o600 });
    const lifecycle = { initialized: false, destroyed: false };
    const prisma = { onModuleInit: async () => { lifecycle.initialized = true; }, onModuleDestroy: async () => { lifecycle.destroyed = true; } };
    const dependencies = {
      ...productionCutoverRunnerDependencies(),
      secretStore: fakeSecretStore(),
      createPrisma: () => prisma as never,
      createFinalImporter: () => ({ import: async () => ({ run: { status: "blocked" }, report: {} }) }) as never,
    };
    await expect(createCutoverAction("C4", undefined, dependencies)({ plan, step: "C4" })).rejects.toMatchObject({ code: "CUTOVER_FINAL_IMPORT_BLOCKED" });
    expect(lifecycle).toEqual({ initialized: true, destroyed: true });
    await expect(stat(plan.finalReportPath)).rejects.toThrow();
    await expect(stat(path.join(plan.evidenceRoot, "backup-pointer.json"))).rejects.toThrow();
  });

  it("C5 smoke failure leaves no step result and restores the caller DB environment", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c5-fail-"));
    const plan = makePlan(root);
    const coordinator = new MaintenanceCoordinator();
    await coordinator.drain();
    await coordinator.close();
    await new RuntimeBundleFileService().writeAtomic(plan.runtimeBundlePath, await coordinator.createRuntimeBundle() as RuntimeBundleEnvelope);
    const previousPersistenceMode = process.env.AIROAMING_PERSISTENCE_MODE;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.AIROAMING_PERSISTENCE_MODE;
    delete process.env.DATABASE_URL;
    const prisma = { onModuleInit: async () => undefined, onModuleDestroy: async () => undefined, database: () => ({ persistenceState: { findUnique: async () => ({ activationState: "ready_for_activation", firstBusinessWriteAt: null }) }, $transaction: async () => { throw new Error("SMOKE_FAILED"); } }) };
    const dependencies = { ...productionCutoverRunnerDependencies(), createPrisma: () => prisma as never };
    await expect(createCutoverAction("C5", undefined, dependencies)({ plan, step: "C5" })).rejects.toThrow("SMOKE_FAILED");
    expect(process.env.AIROAMING_PERSISTENCE_MODE).toBeUndefined();
    expect(process.env.DATABASE_URL).toBeUndefined();
    if (previousPersistenceMode !== undefined) process.env.AIROAMING_PERSISTENCE_MODE = previousPersistenceMode;
    if (previousDatabaseUrl !== undefined) process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("C7 activation failure stops before completion and always closes Prisma", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c7-fail-"));
    const plan = makePlan(root);
    const identity = { cutoverId: plan.cutoverId, appCommit: plan.appCommit, planDigest: plan.planDigest, runId: plan.runId, effectiveSchemaManifestDigest: plan.effectiveSchemaManifestDigest };
    const evidence = new CutoverEvidenceStore(plan.evidenceRoot, identity);
    const digest = (value: unknown) => digestCanonicalJson(value) as `sha256:${string}`;
    for (const step of ["C0", "C1", "C2", "C3", "C4", "C5"] as const) {
      await evidence.runStep(step, digest({ step }), async () => {
        const artifactDigests: Record<string, `sha256:${string}`> = {};
        if (step === "C2") { artifactDigests.sourceManifestDigest = `sha256:${"3".repeat(64)}`; artifactDigests.snapshotManifestDigest = `sha256:${"4".repeat(64)}`; }
        if (step === "C4") artifactDigests.backupDigest = `sha256:${"8".repeat(64)}`;
        return { summaryCode: `${step}_OK`, artifactDigests };
      });
    }
    await evidence.runStep("C6", digest({ step: "C6" }), async () => ({ summaryCode: "C6_OK", artifactDigests: { archiveDigest: `sha256:${"5".repeat(64)}` } }));
    await mkdir(path.join(root, "backup.tar"), { recursive: true });
    await writeFile(path.join(plan.evidenceRoot, "backup-pointer.json"), JSON.stringify({ bundlePath: path.join(root, "backup.tar"), bundleDigest: `sha256:${"8".repeat(64)}` }), { mode: 0o600 });
    const calls: string[] = [];
    const prisma = { onModuleInit: async () => { calls.push("init"); }, onModuleDestroy: async () => { calls.push("destroy"); }, database: () => ({ persistenceState: { findUnique: async () => ({ activationState: "ready_for_activation", activatedAt: null, firstBusinessWriteAt: null }) } }) };
    const dependencies = {
      ...productionCutoverRunnerDependencies(),
      createPrisma: () => prisma as never,
      createActivate: () => ({ activate: async ({ mode }: { mode: string }) => { calls.push(mode); if (mode === "execute") throw new Error("ACTIVATE_EXECUTE_FAILED"); return { activatedAt: "2026-07-13T00:00:00.000Z", firstBusinessWriteAt: null }; } }) as never,
    };
    await expect(createCutoverAction("C7", path.join(root, "AUTH-C7.json"), dependencies)({ plan, step: "C7" })).rejects.toThrow("ACTIVATE_EXECUTE_FAILED");
    expect(calls).toEqual(["init", "dry-run", "execute", "destroy"]);
    await expect(stat(path.join(plan.evidenceRoot, "COMPLETED"))).rejects.toThrow();
  });

  it("RCUT-EVD-09 rejects a backup pointer whose digest is not bound to C4", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-runner-c7-pointer-"));
    const plan = makePlan(root);
    const identity = { cutoverId: plan.cutoverId, appCommit: plan.appCommit, planDigest: plan.planDigest, runId: plan.runId, effectiveSchemaManifestDigest: plan.effectiveSchemaManifestDigest };
    const evidence = new CutoverEvidenceStore(plan.evidenceRoot, identity);
    const digest = (value: unknown) => digestCanonicalJson(value) as `sha256:${string}`;
    for (const step of ["C0", "C1", "C2", "C3", "C4", "C5", "C6"] as const) {
      await evidence.runStep(step, digest({ step }), async () => {
        const artifactDigests: Record<string, `sha256:${string}`> = {};
        if (step === "C2") { artifactDigests.sourceManifestDigest = `sha256:${"3".repeat(64)}`; artifactDigests.snapshotManifestDigest = `sha256:${"4".repeat(64)}`; }
        if (step === "C4") artifactDigests.backupDigest = `sha256:${"a".repeat(64)}`;
        return { summaryCode: `${step}_OK`, artifactDigests };
      });
    }
    const bundlePath = path.join(root, "backup-bundle");
    await mkdir(bundlePath, { recursive: true });
    await writeFile(path.join(plan.evidenceRoot, "backup-pointer.json"), JSON.stringify({ bundlePath, bundleDigest: `sha256:${"b".repeat(64)}` }), { mode: 0o600 });
    await expect(createCutoverAction("C7", path.join(root, "AUTH-C7.json"), productionCutoverRunnerDependencies())({ plan, step: "C7" })).rejects.toMatchObject({ code: "CUTOVER_BACKUP_DIGEST_MISMATCH" });
  });

  it("runs two fresh real domain C0-C7 chains through DbCutoverService with isolated fake boundaries", async () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../../..");
    const release = await loadReleaseSchemaIdentityV1(repoRoot);
    const runChain = async (suffix: string, options: { simulateCrashBeforeEvidence?: boolean; assertFirstWriteFileGuard?: boolean } = {}) => {
      const root = await mkdtemp(path.join(os.tmpdir(), `airoaming-runner-chain-${suffix}-`));
      const source = path.join(root, "source");
      const dataRoot = path.join(root, "data");
      const plan = resignPlan(makePlan(root, {
        releaseRoot: repoRoot,
        sourceWorkspaceRoot: source,
        targetDataRoot: dataRoot,
        targetDatabaseUrl: `file:${path.join(dataRoot, "airoaming.sqlite")}` as `file:${string}`,
        effectiveSchemaManifestDigest: release.effectiveSchemaManifestDigest,
        cutoverId: `runner-chain-${suffix}`,
        runId: `runner-chain-run-${suffix}`,
        settingsStartState: "legacy_plaintext_requires_two_phase",
        credentialAction: "prestage_legacy",
      }));
      await writeIsolatedShadowGate(plan);
      await mkdir(path.join(source, "projects", "p1", "chapters", "chapter-001"), { recursive: true });
      await mkdir(path.join(source, "settings"), { recursive: true });
      await writeFile(path.join(source, "projects/p1/project.json"), `${JSON.stringify({ id: "p1", name: "Runner chain", type: "comic", comicFormat: "vertical_scroll", genreTags: [] })}\n`, { mode: 0o600 });
      await writeFile(path.join(source, "projects/p1/chapters/chapter-001/chapter.json"), `${JSON.stringify({ id: "p1-chapter-001", order: 1, title: "第一章", status: "draft" })}\n`, { mode: 0o600 });
      await writeFile(path.join(source, "projects/p1/chapters/chapter-001/script.md"), "runner chain\n", { mode: 0o600 });
      await writeFile(path.join(source, "settings/app-settings.json"), `${JSON.stringify({ openaiImageProvider: { providerId: "default", providerName: "OpenAI Image", modelId: "gpt-image-1", baseUrl: "https://api.openai.com/v1", apiKey: "sk-runner-chain-secret" } })}\n`, { mode: 0o600 });
      await writeFile(plan.maintenanceTokenFile, "runner-token\n", { mode: 0o600 });
      const maintenance = new MaintenanceCoordinator();
      await maintenance.drain();
      await maintenance.close();
      const bundle = await maintenance.createRuntimeBundle() as RuntimeBundleEnvelope;
      let backupWorkspaceRoot: string | undefined;
      const dependencies = {
        ...productionCutoverRunnerDependencies(),
        now: () => new Date("2026-07-14T22:30:00+08:00"),
        createBackup: (prisma: PrismaService) => {
          const backup = new AppBackupService(prisma);
          return { backup: async (input: Parameters<AppBackupService["backup"]>[0]) => { backupWorkspaceRoot = input.workspaceRoot; return backup.backup(input); } } as never;
        },
        secretStore: fakeSecretStore(),
        secretStoreAdapter: "fake" as const,
        fetch: (async (input: string | URL) => ({ ok: true, json: async () => ({ success: true, data: String(input).endsWith("/identity") ? { persistenceMode: "file", workspaceRoot: plan.sourceWorkspaceRoot, releaseRoot: plan.releaseRoot, appCommit: plan.appCommit, runtimeInstanceId: maintenance.getRuntimeInstanceId() } : String(input).endsWith("/bundle") ? bundle : undefined }) })) as unknown as typeof fetch,
      };
      const service = new DbCutoverService();
      const planPath = path.join(root, "plan.json");
      await writeFile(planPath, `${JSON.stringify(plan)}\n`, { mode: 0o600 });
      const action = (step: CutoverEvidenceStep) => createCutoverAction(step, undefined, dependencies);
      const c0 = await service.runStep(planPath, plan.evidenceRoot, "C0", action("C0"));
      const authorization = async (scope: "AUTH-C1" | "AUTH-C5" | "AUTH-C7", evidenceDigest: string) => {
        const acknowledgements = {
          "AUTH-C1": "我确认 C0 证据、plan、release、备份与回滚责任人，授权进入 C1 并按 plan 执行 C3 凭据验证；未授权 C5/C7。",
          "AUTH-C5": "我确认 final/ready/pre-cutover backup 与 materialize 恢复均通过，授权关闭旧 file 进程并进入 C5/C6；未授权 C7 激活。",
          "AUTH-C7": "我确认 C5 关闭态 DB smoke 与 C6 archive 通过，理解首次 DB 写后禁止 file-only 回退，授权执行 C7 激活。",
        } as const;
        const unsigned = { schemaVersion: 1 as const, kind: "airoaming_cutover_authorization_v1" as const, scope, cutoverId: plan.cutoverId, appCommit: plan.appCommit, planDigest: plan.planDigest, runId: plan.runId, effectiveSchemaManifestDigest: plan.effectiveSchemaManifestDigest, evidenceDigest, authorizedAt: "2026-07-13T00:00:00.000Z", authorizedBy: "isolated-runner-test", acknowledgement: acknowledgements[scope] };
        const file = path.join(root, `${scope}.json`);
        await writeFile(file, `${JSON.stringify({ ...unsigned, authorizationDigest: digestCanonicalJson(unsigned) })}\n`, { mode: 0o600 });
        return file;
      };
      const authC1 = await authorization("AUTH-C1", c0.evidenceDigest);
      for (const step of ["C1", "C2"] as const) await service.runStep(planPath, plan.evidenceRoot, step, action(step), authC1);
      const evidenceAfterC2 = await new CutoverEvidenceStore(plan.evidenceRoot, { cutoverId: plan.cutoverId, appCommit: plan.appCommit, planDigest: plan.planDigest, runId: plan.runId, effectiveSchemaManifestDigest: plan.effectiveSchemaManifestDigest }).readVerified();
      const sourceManifestDigest = evidenceAfterC2.steps.find((item) => item.step === "C2")?.artifactDigests.sourceManifestDigest;
      if (!sourceManifestDigest) throw new Error("runner chain source digest missing");
      await writeFile(plan.decisionsPath, `${JSON.stringify(createMigrationDecisionArtifact(sourceManifestDigest, []))}\n`, { mode: 0o600 });
      for (const step of ["C3", "C4"] as const) await service.runStep(planPath, plan.evidenceRoot, step, action(step), authC1);
      expect(backupWorkspaceRoot).toBe(plan.targetWorkspaceRoot);
      const c4 = await service.status(planPath, plan.evidenceRoot);
      const authC5 = await authorization("AUTH-C5", c4.evidenceDigest!);
      for (const step of ["C5", "C6"] as const) await service.runStep(planPath, plan.evidenceRoot, step, action(step), authC5);
      const c6 = await service.status(planPath, plan.evidenceRoot);
      const authC7 = await authorization("AUTH-C7", c6.evidenceDigest!);
      const c7Action = createCutoverAction("C7", authC7, dependencies);
      if (options.simulateCrashBeforeEvidence) {
        // Simulate a process crash after activate committed db_only but before
        // the C7 step and COMPLETED marker were persisted.
        await c7Action({ plan, step: "C7" });
        const previousMode = process.env.AIROAMING_PERSISTENCE_MODE;
        const previousDatabaseUrl = process.env.DATABASE_URL;
        process.env.AIROAMING_PERSISTENCE_MODE = "db";
        process.env.DATABASE_URL = plan.targetDatabaseUrl;
        const resumedPrisma = new PrismaService();
        let activatedAt: string | null = null;
        try {
          await resumedPrisma.onModuleInit();
          const state = await resumedPrisma.database().persistenceState.findUnique({ where: { id: "primary" } });
          expect(state?.activationState).toBe("db_only");
          expect(state?.firstBusinessWriteAt).toBeNull();
          activatedAt = state?.activatedAt?.toISOString() ?? null;
        } finally {
          await resumedPrisma.onModuleDestroy();
          if (previousMode === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = previousMode;
          if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
        }
        expect(activatedAt).toMatch(/^2026-/);
        await new DbCutoverService().runStep(planPath, plan.evidenceRoot, "C7", createCutoverAction("C7", authC7, dependencies), authC7);
      } else {
        await service.runStep(planPath, plan.evidenceRoot, "C7", c7Action, authC7);
      }
      const status = await service.status(planPath, plan.evidenceRoot);
      expect(status.completedThrough).toBe("C7");
      if (options.assertFirstWriteFileGuard) {
        const previousMode = process.env.AIROAMING_PERSISTENCE_MODE;
        const previousDatabaseUrl = process.env.DATABASE_URL;
        process.env.AIROAMING_PERSISTENCE_MODE = "db";
        process.env.DATABASE_URL = plan.targetDatabaseUrl;
        const firstWritePrisma = new PrismaService();
        try {
          await firstWritePrisma.onModuleInit();
          const project = await firstWritePrisma.database().project.findFirstOrThrow();
          await firstWritePrisma.runBusinessTransaction((tx) => tx.project.update({ where: { id: project.id }, data: { description: "first business write after C7" } }));
          const state = await firstWritePrisma.database().persistenceState.findUnique({ where: { id: "primary" } });
          expect(state?.firstBusinessWriteAt).toBeInstanceOf(Date);
        } finally {
          await firstWritePrisma.onModuleDestroy();
          if (previousMode === undefined) delete process.env.AIROAMING_PERSISTENCE_MODE; else process.env.AIROAMING_PERSISTENCE_MODE = previousMode;
          if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
        }
        await expect(assertFileModeBridgeAllowed(plan.targetDatabaseUrl)).rejects.toThrow("FILE_MODE_FORBIDDEN_AFTER_FIRST_WRITE");
      }
      return status.evidenceDigest;
    };
    const first = await runChain("one", { simulateCrashBeforeEvidence: true, assertFirstWriteFileGuard: true });
    const second = await runChain("two");
    expect(first).toMatch(/^sha256:/);
    expect(second).toMatch(/^sha256:/);
    expect(first).not.toBe(second);
  }, 120_000);
});
