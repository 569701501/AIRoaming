import { randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import {
  G1_MIGRATION_NAMES,
  assertG1FreshMigrationLedgerV1,
  assertG1MigrationArtifactTreeV1,
  assertG1MigrationManifestV1,
  assertG1MigrationPlanV1,
  buildG1MigrationPlanV1,
  checkG1MigrationArtifactTreeV1,
  verifyG1SqliteDryDatabaseV1,
  writeG1MigrationPlanV1,
  type G1MigrationArtifactV1,
  type G1FreshMigrationLedgerRowV1,
  type G1MigrationManifest,
  type G1MigrationPlanV1,
  type G1SqliteDatabaseLike,
} from "./g1-migration-plan.js";

type DatabaseSync = InstanceType<typeof NodeDatabaseSync>;

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  "apps/server/prisma/contracts/g1-schema-manifest.json",
);
const MIGRATION_OUTPUT = path.join(
  REPO_ROOT,
  "apps/server/prisma/migrations",
);

interface DryDatabase {
  readonly root: string;
  readonly database: DatabaseSync;
  close(): Promise<void>;
}

interface OwnedTempRoot {
  readonly root: string;
  close(): Promise<void>;
}

async function loadManifest(): Promise<G1MigrationManifest> {
  return JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as G1MigrationManifest;
}

async function makeOwnedTempRoot(): Promise<OwnedTempRoot> {
  const runId = `g1-migration-${randomUUID()}`;
  const createdRoot = await mkdtemp(path.join(os.tmpdir(), `${runId}-`));
  const root = await realpath(createdRoot);
  const markerPath = path.join(root, ".airoaming-test-root");
  await writeFile(
    markerPath,
    `${JSON.stringify({ schemaVersion: 1, owner: "g1-migration-dry-test", runId, root })}\n`,
    "utf8",
  );
  return {
    root,
    async close() {
      const marker = JSON.parse(await readFile(markerPath, "utf8")) as {
        owner: string;
        runId: string;
        root: string;
      };
      expect(marker).toEqual({
        schemaVersion: 1,
        owner: "g1-migration-dry-test",
        runId,
        root,
      });
      await rm(root, { recursive: true, force: false });
    },
  };
}

async function makeDryDatabase(): Promise<DryDatabase> {
  const owned = await makeOwnedTempRoot();
  const databaseRoot = path.join(owned.root, "data", "db");
  await mkdir(databaseRoot, { recursive: true });
  const database = new DatabaseSync(path.join(databaseRoot, "g1.sqlite"));
  return {
    root: owned.root,
    database,
    async close() {
      database.close();
      await owned.close();
    },
  };
}

function migrations(plan: G1MigrationPlanV1): readonly G1MigrationArtifactV1[] {
  return plan.artifacts.filter((artifact) => artifact.kind === "migration");
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function createLedger(database: DatabaseSync): void {
  database.exec(`CREATE TABLE "_prisma_migrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
  );`);
}

function recordMigration(
  database: DatabaseSync,
  artifact: G1MigrationArtifactV1,
): void {
  expect(artifact.migrationName).not.toBeNull();
  database
    .prepare(
      `INSERT INTO "_prisma_migrations"
       ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "applied_steps_count")
       VALUES (?, ?, CURRENT_TIMESTAMP, ?, NULL, NULL, 1)`,
    )
    .run(
      randomUUID(),
      artifact.checksum.slice("sha256:".length),
      artifact.migrationName!,
    );
}

function seedRowPreservationSentinel(database: DatabaseSync): void {
  database.exec(`INSERT INTO "persistence_states"
    ("id", "storage_contract_version", "activation_state", "created_at", "updated_at")
    VALUES ('primary', 1, 'shadow', '2026-07-12T00:00:00.000Z', '2026-07-12T00:00:00.000Z');`);
}

function applyPlan(
  database: DatabaseSync,
  plan: G1MigrationPlanV1,
  options: { readonly seedBeforeFinal?: boolean } = {},
): void {
  createLedger(database);
  for (const artifact of migrations(plan)) {
    if (
      options.seedBeforeFinal &&
      artifact.migrationName === "0008_sqlite_checks_triggers_indexes"
    ) {
      seedRowPreservationSentinel(database);
    }
    database.exec(artifact.bytes);
    recordMigration(database, artifact);
  }
}

function readLedger(database: DatabaseSync): G1FreshMigrationLedgerRowV1[] {
  return database
    .prepare(
      `SELECT migration_name, checksum, finished_at, rolled_back_at, logs, applied_steps_count
       FROM "_prisma_migrations" ORDER BY migration_name`,
    )
    .all() as unknown as G1FreshMigrationLedgerRowV1[];
}

async function runCli(argument: "--check" | "--write" = "--write"): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "apps/server/src/persistence/g1-migration-plan.cli.ts",
        argument,
      ],
      { cwd: REPO_ROOT, env: { ...process.env } },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function materializeMigrationArtifacts(
  prismaRoot: string,
  plan: G1MigrationPlanV1,
  artifacts: readonly G1MigrationArtifactV1[] = plan.artifacts,
): Promise<void> {
  for (const artifact of artifacts) {
    const relative = path.posix.relative("apps/server/prisma", artifact.path);
    const destination = path.join(prismaRoot, ...relative.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, artifact.bytes, "utf8");
  }
}

async function preparePrismaDeployRoot(
  owned: OwnedTempRoot,
  plan: G1MigrationPlanV1,
  artifacts: readonly G1MigrationArtifactV1[] = plan.artifacts,
): Promise<{
  readonly prismaRoot: string;
  readonly schemaPath: string;
  readonly databasePath: string;
}> {
  const prismaRoot = path.join(owned.root, "prisma");
  await mkdir(prismaRoot, { recursive: true });
  const schemaPath = path.join(prismaRoot, "schema.prisma");
  const databasePath = path.join(prismaRoot, "g1.sqlite");
  await writeFile(
    schemaPath,
    await readFile(path.join(REPO_ROOT, "apps/server/prisma/schema.prisma"), "utf8"),
    "utf8",
  );
  // Prisma 6.19.3 migrate deploy expects the SQLite file to exist.
  const databaseHandle = await open(databasePath, "wx", 0o600);
  await databaseHandle.close();
  await materializeMigrationArtifacts(prismaRoot, plan, artifacts);
  return { prismaRoot, schemaPath, databasePath };
}

async function runPrismaDeploy(
  schemaPath: string,
  databaseUrl: string,
): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(REPO_ROOT, "apps/server/node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        schemaPath,
      ],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, DATABASE_URL: databaseUrl },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("G1 M0-A pure migration plan", () => {
  it("renders migration_lock plus deterministic 0001-0008 bytes matching the formal tree", async () => {
    const manifest = await loadManifest();
    const plan = buildG1MigrationPlanV1(manifest);

    expect(plan.manifestDigest).toBe(manifest.manifestDigest);
    expect(plan.artifacts).toHaveLength(9);
    expect(plan.artifacts.map((artifact) => artifact.path)).toEqual([
      "apps/server/prisma/migrations/migration_lock.toml",
      ...G1_MIGRATION_NAMES.map(
        (name) => `apps/server/prisma/migrations/${name}/migration.sql`,
      ),
    ]);
    expect(plan.counts).toMatchObject({
      migrations: 8,
      models: 44,
      scalarFields: 556,
      foreignKeys: 105,
      uniqueConstraints: 70,
      indexes: 60,
      checks: 195,
      triggers: 194,
      rebuildTables: 43,
    });
    expect(plan.copyMappings).toHaveLength(43);
    for (const mapping of plan.copyMappings) {
      expect(mapping.destinationColumns).toEqual(mapping.sourceColumns);
      expect(new Set(mapping.sourceColumns).size).toBe(mapping.sourceColumns.length);
    }
    const finalSql = migrations(plan).at(-1)?.bytes ?? "";
    expect(finalSql.indexOf("PRAGMA foreign_keys = OFF;")).toBeLessThan(
      finalSql.indexOf('CONSTRAINT "ck_g1_foreign_key_mode_guard_disabled"'),
    );
    expect(
      finalSql.indexOf('CONSTRAINT "ck_g1_foreign_key_mode_guard_disabled"'),
    ).toBeLessThan(finalSql.indexOf("BEGIN IMMEDIATE;"));
    expect(finalSql).toContain("INSERT OR ROLLBACK INTO \"_g1_foreign_key_guard\"");
    expect(finalSql).toContain("SELECT COUNT(*) FROM pragma_foreign_key_check");
    expect(finalSql.match(/CREATE TRIGGER /g)).toHaveLength(194);
    expect(await readFile(MANIFEST_PATH, "utf8")).toContain(plan.manifestDigest);
    await expect(
      assertG1MigrationArtifactTreeV1(MIGRATION_OUTPUT, plan),
    ).resolves.toBeUndefined();
  });

  it("checks the signed nine-artifact tree and rejects tampered, missing, extra, symlink, and hardlink entries", async () => {
    const manifest = await loadManifest();
    const plan = buildG1MigrationPlanV1(manifest);
    const owned = await makeOwnedTempRoot();
    try {
      const prismaRoot = path.join(owned.root, "apps/server/prisma");
      await materializeMigrationArtifacts(prismaRoot, plan);
      const outputRoot = path.join(prismaRoot, "migrations");
      await expect(
        assertG1MigrationArtifactTreeV1(outputRoot, plan),
      ).resolves.toBeUndefined();

      const firstMigration = plan.artifacts.find(
        (artifact) => artifact.migrationName === G1_MIGRATION_NAMES[0],
      )!;
      const firstPath = path.join(
        prismaRoot,
        ...path.posix
          .relative("apps/server/prisma", firstMigration.path)
          .split("/"),
      );
      await writeFile(firstPath, `${firstMigration.bytes}-- tampered\n`, "utf8");
      await expect(
        assertG1MigrationArtifactTreeV1(outputRoot, plan),
      ).rejects.toThrow(/G1_MIGRATION_ARTIFACT_BYTES_DRIFT/);

      await writeFile(firstPath, firstMigration.bytes, "utf8");
      await rm(firstPath);
      await expect(
        assertG1MigrationArtifactTreeV1(outputRoot, plan),
      ).rejects.toThrow(/G1_MIGRATION_ARTIFACT_DIRECTORY_ENTRIES/);

      await writeFile(firstPath, firstMigration.bytes, "utf8");
      const extraPath = path.join(outputRoot, "extra.sql");
      await writeFile(extraPath, "-- extra\n", "utf8");
      await expect(
        assertG1MigrationArtifactTreeV1(outputRoot, plan),
      ).rejects.toThrow(/G1_MIGRATION_ARTIFACT_ROOT_ENTRIES/);
      await rm(extraPath);

      const symlinkTarget = path.join(owned.root, "symlink-target.sql");
      await writeFile(symlinkTarget, firstMigration.bytes, "utf8");
      await rm(firstPath);
      await symlink(symlinkTarget, firstPath);
      await expect(
        assertG1MigrationArtifactTreeV1(outputRoot, plan),
      ).rejects.toThrow(/G1_MIGRATION_ARTIFACT_FILE_INVALID/);

      await rm(firstPath);
      await writeFile(firstPath, firstMigration.bytes, "utf8");
      const hardlinkAlias = path.join(owned.root, "hardlink-alias.sql");
      await link(firstPath, hardlinkAlias);
      await expect(
        assertG1MigrationArtifactTreeV1(outputRoot, plan),
      ).rejects.toThrow(/G1_MIGRATION_ARTIFACT_FILE_INVALID/);
      await rm(hardlinkAlias);

      const lastDirectory = path.join(outputRoot, G1_MIGRATION_NAMES.at(-1)!);
      const directoryTarget = path.join(owned.root, "directory-target");
      await mkdir(directoryTarget);
      await writeFile(path.join(directoryTarget, "migration.sql"), "-- target\n");
      await rm(lastDirectory, { recursive: true });
      await symlink(directoryTarget, lastDirectory);
      await expect(
        assertG1MigrationArtifactTreeV1(outputRoot, plan),
      ).rejects.toThrow(/G1_MIGRATION_ARTIFACT_DIRECTORY_INVALID/);
    } finally {
      await owned.close();
    }
  });

  it("rejects drift from the exact 4/6/10/5/9/4/6 base model groups", async () => {
    const manifest = structuredClone(await loadManifest()) as any;
    const moved = manifest.models.find(
      (model: any) => model.migration === "0001_persistence_and_migration",
    );
    moved.migration = "0002_project_chapter_script";
    for (const field of moved.fields) field.migration = moved.migration;
    expect(() => assertG1MigrationManifestV1(manifest)).toThrow(
      /G1_MIGRATION_MODEL_GROUP_SIZE:0001_persistence_and_migration:3:4/,
    );
  });

  it("fails the pre-transaction FK-mode guard before persistent schema mutation when an outer transaction ignores PRAGMA OFF", async () => {
    const manifest = await loadManifest();
    const plan = buildG1MigrationPlanV1(manifest);
    const dry = await makeDryDatabase();
    try {
      createLedger(dry.database);
      for (const artifact of migrations(plan).slice(0, 7)) {
        dry.database.exec(artifact.bytes);
        recordMigration(dry.database, artifact);
      }
      const before = dry.database
        .prepare(
          "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
        )
        .all();
      dry.database.exec("PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;");
      expect(() => dry.database.exec(migrations(plan).at(-1)!.bytes)).toThrow(
        /ck_g1_foreign_key_mode_guard_disabled/,
      );
      expect(
        dry.database
          .prepare(
            "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
          )
          .all(),
      ).toEqual(before);
      expect(
        dry.database
          .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger'")
          .get(),
      ).toEqual({ count: 0 });
      expect(readLedger(dry.database)).toHaveLength(7);
    } finally {
      await dry.close();
    }
  });

  it("rolls back 0008 when a same-count rebuild copy rewrites any persisted value", async () => {
    const manifest = await loadManifest();
    const plan = buildG1MigrationPlanV1(manifest);
    const dry = await makeDryDatabase();
    try {
      createLedger(dry.database);
      for (const artifact of migrations(plan).slice(0, 7)) {
        dry.database.exec(artifact.bytes);
        recordMigration(dry.database, artifact);
      }
      seedRowPreservationSentinel(dry.database);

      const mapping = plan.copyMappings.find(
        (candidate) => candidate.table === "persistence_states",
      )!;
      const exactSource = mapping.sourceColumns.map(quoteIdentifier).join(", ");
      const mutatedSource = mapping.sourceColumns
        .map((column) =>
          column === "updated_at"
            ? "'2099-01-01T00:00:00.000Z'"
            : quoteIdentifier(column),
        )
        .join(", ");
      const originalFragment = `SELECT ${exactSource} FROM "persistence_states";`;
      const mutatedFinal = migrations(plan)
        .at(-1)!
        .bytes.replace(
          originalFragment,
          `SELECT ${mutatedSource} FROM "persistence_states";`,
        );
      expect(mutatedFinal).not.toBe(migrations(plan).at(-1)!.bytes);
      expect(() => dry.database.exec(mutatedFinal)).toThrow(
        /ck_g1_rebuild_row_guard_value_equal/,
      );
      expect(
        dry.database
          .prepare('SELECT id, updated_at FROM "persistence_states"')
          .get(),
      ).toEqual({
        id: "primary",
        updated_at: "2026-07-12T00:00:00.000Z",
      });
      expect(
        String(
          dry.database
            .prepare(
              "SELECT sql FROM sqlite_master WHERE type='table' AND name='persistence_states'",
            )
            .get()?.sql ?? "",
        ),
      ).not.toContain("ck_persistence_states_activation_state");
      expect(readLedger(dry.database)).toHaveLength(7);
    } finally {
      await dry.close();
    }
  });

  it("deploys the full pure plan through the installed Prisma 6.19.3 runner without an outer transaction", async () => {
    const manifest = await loadManifest();
    const plan = buildG1MigrationPlanV1(manifest);
    const owned = await makeOwnedTempRoot();
    let database: DatabaseSync | undefined;
    try {
      const { prismaRoot, schemaPath, databasePath } =
        await preparePrismaDeployRoot(owned, plan);

      const deployed = await runPrismaDeploy(
        schemaPath,
        "file:./g1.sqlite",
      );
      expect(deployed.code, `${deployed.stdout}\n${deployed.stderr}`).toBe(0);
      expect(deployed.stdout).toContain("8 migrations found");
      expect(deployed.stdout).toContain("All migrations have been successfully applied.");
      const repeated = await runPrismaDeploy(schemaPath, "file:./g1.sqlite");
      expect(repeated.code, `${repeated.stdout}\n${repeated.stderr}`).toBe(0);
      expect(repeated.stdout).toContain("No pending migrations to apply.");
      expect(
        JSON.parse(
          await readFile(
            path.join(REPO_ROOT, "apps/server/node_modules/prisma/package.json"),
            "utf8",
          ),
        ).version,
      ).toBe("6.19.3");

      database = new DatabaseSync(databasePath);
      expect(
        verifyG1SqliteDryDatabaseV1(
          database as unknown as G1SqliteDatabaseLike,
          manifest,
          plan,
        ),
      ).toMatchObject({
        models: 44,
        foreignKeys: 105,
        checks: 195,
        triggers: 194,
        integrityCheck: "ok",
        foreignKeyViolationCount: 0,
      });
    } finally {
      database?.close();
      await owned.close();
    }
  });

  it("records a real Prisma P3018 rollback for an orphaned 0008 and P3009 on the next deploy", async () => {
    const manifest = await loadManifest();
    const plan = buildG1MigrationPlanV1(manifest);
    const owned = await makeOwnedTempRoot();
    let database: DatabaseSync | undefined;
    try {
      const initialArtifacts = plan.artifacts.filter(
        (artifact) =>
          artifact.kind === "migration_lock" ||
          artifact.migrationName !== "0008_sqlite_checks_triggers_indexes",
      );
      const { prismaRoot, schemaPath, databasePath } =
        await preparePrismaDeployRoot(owned, plan, initialArtifacts);
      const firstSeven = await runPrismaDeploy(schemaPath, "file:./g1.sqlite");
      expect(firstSeven.code, `${firstSeven.stdout}\n${firstSeven.stderr}`).toBe(0);
      expect(firstSeven.stdout).toContain("7 migrations found");

      database = new DatabaseSync(databasePath);
      database.exec("PRAGMA foreign_keys = OFF;");
      database.exec(`INSERT INTO "migration_issues"
        ("id", "run_id", "issue_key", "severity", "code", "detail_json", "detail_schema_version", "resolution_status", "created_at")
        VALUES ('prisma-orphan', 'missing-run', 'prisma-orphan', 'info', 'PRISMA_ORPHAN', '{}', 1, 'open', '2026-07-12T00:00:00.000Z');`);
      database.close();
      database = undefined;

      const finalArtifact = plan.artifacts.find(
        (artifact) =>
          artifact.migrationName === "0008_sqlite_checks_triggers_indexes",
      )!;
      await materializeMigrationArtifacts(prismaRoot, plan, [finalArtifact]);
      const failed = await runPrismaDeploy(schemaPath, "file:./g1.sqlite");
      expect(`${failed.stdout}\n${failed.stderr}`).toContain("P3018");
      expect(failed.code).toBe(1);

      database = new DatabaseSync(databasePath);
      expect(
        String(
          database
            .prepare(
              "SELECT sql FROM sqlite_master WHERE type='table' AND name='migration_issues'",
            )
            .get()?.sql ?? "",
        ),
      ).not.toContain("ck_migration_issues_resolution_status");
      expect(
        database
          .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger'")
          .get(),
      ).toEqual({ count: 0 });
      expect(
        database
          .prepare(
            "SELECT COUNT(*) AS count FROM migration_issues WHERE id='prisma-orphan'",
          )
          .get(),
      ).toEqual({ count: 1 });
      const failedLedger = database
        .prepare(
          `SELECT finished_at, rolled_back_at, logs, applied_steps_count
           FROM "_prisma_migrations"
           WHERE migration_name='0008_sqlite_checks_triggers_indexes'`,
        )
        .get() as Record<string, unknown>;
      expect(failedLedger.finished_at).toBeNull();
      expect(failedLedger.rolled_back_at).toBeNull();
      expect(String(failedLedger.logs)).toContain(
        "ck_g1_foreign_key_guard_zero",
      );
      expect(Number(failedLedger.applied_steps_count)).toBe(0);
      database.close();
      database = undefined;

      const blocked = await runPrismaDeploy(schemaPath, "file:./g1.sqlite");
      expect(blocked.code).toBe(1);
      expect(`${blocked.stdout}\n${blocked.stderr}`).toContain("P3009");
    } finally {
      database?.close();
      await owned.close();
    }
  });

  it("replays all eight artifacts twice with identical exact SQLite inventories and preserves a pre-0008 row", async () => {
    const manifest = await loadManifest();
    const plan = buildG1MigrationPlanV1(manifest);
    const reports = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const dry = await makeDryDatabase();
      try {
        applyPlan(dry.database, plan, { seedBeforeFinal: true });
        expect(
          dry.database
            .prepare(
              'SELECT id, storage_contract_version, activation_state, updated_at FROM "persistence_states"',
            )
            .get(),
        ).toEqual({
          id: "primary",
          storage_contract_version: 1,
          activation_state: "shadow",
          updated_at: "2026-07-12T00:00:00.000Z",
        });
        reports.push(
          (() => {
            dry.database.exec("PRAGMA foreign_keys = OFF;");
            expect(dry.database.prepare("PRAGMA foreign_keys").get()).toEqual({
              foreign_keys: 0,
            });
            return verifyG1SqliteDryDatabaseV1(
              dry.database as unknown as G1SqliteDatabaseLike,
              manifest,
              plan,
            );
          })(),
        );
        expect(dry.database.prepare("PRAGMA foreign_keys").get()).toEqual({
          foreign_keys: 1,
        });
      } finally {
        await dry.close();
      }
    }
    expect(reports[0]).toEqual(reports[1]);
    expect(reports[0]).toMatchObject({
      models: 44,
      scalarFields: 556,
      primaryKeys: 44,
      foreignKeys: 105,
      uniqueConstraints: 70,
      indexes: 60,
      checks: 195,
      triggers: 194,
      integrityCheck: "ok",
      foreignKeyViolationCount: 0,
      failedLedgerCount: 0,
      migrationChecksumStatus: "verified",
    });
  });

  it("fails verification when an outer transaction prevents enabling foreign keys", async () => {
    const manifest = await loadManifest();
    const plan = buildG1MigrationPlanV1(manifest);
    const dry = await makeDryDatabase();
    try {
      applyPlan(dry.database, plan);
      dry.database.exec("PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;");
      expect(() =>
        verifyG1SqliteDryDatabaseV1(
          dry.database as unknown as G1SqliteDatabaseLike,
          manifest,
          plan,
        ),
      ).toThrow(/G1_MIGRATION_SQLITE_FOREIGN_KEYS_DISABLED/);
      dry.database.exec("ROLLBACK;");
    } finally {
      await dry.close();
    }
  });

  it("uses an executable pre-COMMIT foreign_key_check guard that rolls back 0008 on an orphan", async () => {
    const manifest = await loadManifest();
    const plan = buildG1MigrationPlanV1(manifest);
    const dry = await makeDryDatabase();
    try {
      createLedger(dry.database);
      for (const artifact of migrations(plan).slice(0, 7)) {
        dry.database.exec(artifact.bytes);
        recordMigration(dry.database, artifact);
      }
      dry.database.exec("PRAGMA foreign_keys = OFF;");
      dry.database.exec(`INSERT INTO "migration_issues"
        ("id", "run_id", "issue_key", "severity", "code", "detail_json", "detail_schema_version", "resolution_status", "created_at")
        VALUES ('orphan-issue', 'missing-run', 'orphan', 'info', 'ORPHAN_TEST', '{}', 1, 'open', '2026-07-12T00:00:00.000Z');`);
      const finalArtifact = migrations(plan).at(-1)!;
      expect(() => dry.database.exec(finalArtifact.bytes)).toThrow(
        /(?:ck_g1_foreign_key_guard_zero|violation_count)/,
      );
      expect(
        String(
          dry.database
            .prepare(
              "SELECT sql FROM sqlite_master WHERE type='table' AND name='migration_issues'",
            )
            .get()?.sql ?? "",
        ),
      ).not.toContain("ck_migration_issues_resolution_status");
      expect(readLedger(dry.database)).toHaveLength(7);
    } finally {
      await dry.close();
    }
  });

  it("fails closed on tampered/missing artifacts and missing/checksum/failed ledger rows", async () => {
    const manifest = await loadManifest();
    const plan = buildG1MigrationPlanV1(manifest);
    const tampered = structuredClone(plan) as any;
    tampered.artifacts[1].bytes += "-- tampered\n";
    expect(() => assertG1MigrationPlanV1(manifest, tampered)).toThrow(
      /G1_MIGRATION_PLAN_ARTIFACT_DRIFT/,
    );
    const missing = structuredClone(plan) as any;
    missing.artifacts.splice(4, 1);
    expect(() => assertG1MigrationPlanV1(manifest, missing)).toThrow(
      /G1_MIGRATION_PLAN_ARTIFACT_COUNT_MISMATCH/,
    );

    const dry = await makeDryDatabase();
    try {
      applyPlan(dry.database, plan);
      const ledger = readLedger(dry.database);
      expect(() => assertG1FreshMigrationLedgerV1(plan, ledger)).not.toThrow();
      expect(() => assertG1FreshMigrationLedgerV1(plan, ledger.slice(1))).toThrow(
        /G1_MIGRATION_LEDGER_COUNT_MISMATCH/,
      );
      const badChecksum = structuredClone(ledger);
      (badChecksum[0] as any).checksum = "0".repeat(64);
      expect(() => assertG1FreshMigrationLedgerV1(plan, badChecksum)).toThrow(
        /G1_MIGRATION_LEDGER_CHECKSUM_MISMATCH/,
      );
      const failed = structuredClone(ledger);
      (failed[0] as any).finished_at = null;
      (failed[0] as any).logs = "P3018";
      expect(() => assertG1FreshMigrationLedgerV1(plan, failed)).toThrow(
        /G1_MIGRATION_LEDGER_FAILED/,
      );
    } finally {
      await dry.close();
    }
  });

  it("checks the formal production tree and refuses to overwrite it", async () => {
    const plan = await checkG1MigrationArtifactTreeV1(REPO_ROOT);
    expect(plan.counts.migrations).toBe(8);
    const checkCli = await runCli("--check");
    expect(checkCli.code, checkCli.stderr).toBe(0);
    expect(checkCli.stdout).toContain("G1_MIGRATIONS_OK");
    expect(checkCli.stderr).toBe("");

    await expect(writeG1MigrationPlanV1(REPO_ROOT)).rejects.toThrow(
      /G1_MIGRATION_OUTPUT_ALREADY_EXISTS/,
    );
    const cli = await runCli("--write");
    expect(cli.code).toBe(1);
    expect(cli.stdout).toBe("");
    expect(cli.stderr).toContain("G1_MIGRATION_OUTPUT_ALREADY_EXISTS");
    await expect(
      assertG1MigrationArtifactTreeV1(MIGRATION_OUTPUT, plan),
    ).resolves.toBeUndefined();
  });
});
