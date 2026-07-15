import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const G1_RUNTIME_MIGRATION_NAMES = [
  "0001_persistence_and_migration",
  "0002_project_chapter_script",
  "0003_story_storyboard_preflight",
  "0004_character_asset_candidate",
  "0005_dialogue_settings_secret_metadata",
  "0006_generation_task_worker",
  "0007_layout_export_outbox",
  "0008_sqlite_checks_triggers_indexes",
] as const;

export const POST_G1_OPTIONAL_OVERLAY_MIGRATION_NAMES = [
  "0009_g2_version_freshness_overlay",
  "0010_g3_comic_format_immutable",
  "0011_g2_project_purge_pointer_teardown",
  "0012_g4_candidate_lock_linear_history",
  "0013_g5_layout_working_copy_overlay",
  "0014_g5_layout_binding_source_digest",
  "0015_g5_layout_publication_overlay",
  "0016_g5_legacy_layout_cutover",
] as const;

export interface G1RuntimeMigrationExpectationV1 {
  readonly migrationName: (typeof G1_RUNTIME_MIGRATION_NAMES)[number];
  readonly checksum: string;
}

export interface G1RuntimeMigrationLedgerRowV1 {
  readonly migration_name: unknown;
  readonly checksum: unknown;
  readonly finished_at: unknown;
  readonly rolled_back_at: unknown;
  readonly logs: unknown;
  readonly applied_steps_count: unknown;
}

interface MigrationLedgerClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

const MIGRATION_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../prisma/migrations",
);
const LOCK_BYTES = Buffer.from('provider = "sqlite"\n', "utf8");

function fail(code: string, detail?: string, cause?: unknown): never {
  throw new Error(
    detail ? `DB_PERSISTENCE_MIGRATION_${code}:${detail}` : `DB_PERSISTENCE_MIGRATION_${code}`,
    cause === undefined ? undefined : { cause },
  );
}

function assertExactNames(
  actual: readonly string[],
  expected: readonly string[],
  code: string,
): void {
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) {
    fail(code, [...actual].sort().join(","));
  }
}

async function readSingleLinkRegularFile(
  absolutePath: string,
  relativePath: string,
): Promise<Buffer> {
  let stat;
  try {
    stat = await lstat(absolutePath);
  } catch (cause) {
    fail("ARTIFACT_UNAVAILABLE", relativePath, cause);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    fail("ARTIFACT_INVALID", relativePath);
  }
  try {
    return await readFile(absolutePath);
  } catch (cause) {
    fail("ARTIFACT_UNAVAILABLE", relativePath, cause);
  }
}

export async function loadG1RuntimeMigrationExpectationsV1(
  migrationRoot = MIGRATION_ROOT,
): Promise<readonly G1RuntimeMigrationExpectationV1[]> {
  let rootStat;
  let rootEntries;
  try {
    rootStat = await lstat(migrationRoot);
    rootEntries = await readdir(migrationRoot, { withFileTypes: true });
  } catch (cause) {
    fail("ARTIFACT_TREE_UNAVAILABLE", migrationRoot, cause);
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    fail("ARTIFACT_TREE_INVALID", migrationRoot);
  }
  const g1RootEntries = rootEntries
    .map((entry) => entry.name)
    .filter(
      (entry) =>
        !POST_G1_OPTIONAL_OVERLAY_MIGRATION_NAMES.includes(
          entry as (typeof POST_G1_OPTIONAL_OVERLAY_MIGRATION_NAMES)[number],
        ),
    );
  assertExactNames(
    g1RootEntries,
    ["migration_lock.toml", ...G1_RUNTIME_MIGRATION_NAMES],
    "ARTIFACT_TREE_ENTRIES",
  );

  const lockBytes = await readSingleLinkRegularFile(
    path.join(migrationRoot, "migration_lock.toml"),
    "migration_lock.toml",
  );
  if (!lockBytes.equals(LOCK_BYTES)) {
    fail("ARTIFACT_LOCK_INVALID", "migration_lock.toml");
  }

  const expectations: G1RuntimeMigrationExpectationV1[] = [];
  for (const migrationName of G1_RUNTIME_MIGRATION_NAMES) {
    const directoryPath = path.join(migrationRoot, migrationName);
    let directoryStat;
    let entries;
    try {
      directoryStat = await lstat(directoryPath);
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch (cause) {
      fail("ARTIFACT_UNAVAILABLE", migrationName, cause);
    }
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      fail("ARTIFACT_INVALID", migrationName);
    }
    assertExactNames(
      entries.map((entry) => entry.name),
      ["migration.sql"],
      "ARTIFACT_ENTRIES",
    );
    const relativePath = `${migrationName}/migration.sql`;
    const bytes = await readSingleLinkRegularFile(
      path.join(directoryPath, "migration.sql"),
      relativePath,
    );
    expectations.push({
      migrationName,
      checksum: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return expectations;
}

export function assertG1RuntimeMigrationLedgerV1(
  expected: readonly G1RuntimeMigrationExpectationV1[],
  rows: readonly G1RuntimeMigrationLedgerRowV1[],
): void {
  const expectedByName = new Map(expected.map((entry) => [entry.migrationName, entry]));
  if (
    expected.length !== G1_RUNTIME_MIGRATION_NAMES.length ||
    expectedByName.size !== expected.length
  ) {
    fail("EXPECTED_SET_INVALID");
  }

  const rowsByName = new Map<string, G1RuntimeMigrationLedgerRowV1>();
  for (const row of rows) {
    if (typeof row.migration_name !== "string") {
      fail("LEDGER_ROW_INVALID");
    }
    if (rowsByName.has(row.migration_name)) {
      fail("LEDGER_DUPLICATE_NAME", row.migration_name);
    }
    if (!expectedByName.has(row.migration_name as G1RuntimeMigrationExpectationV1["migrationName"])) {
      if (
        POST_G1_OPTIONAL_OVERLAY_MIGRATION_NAMES.includes(
          row.migration_name as (typeof POST_G1_OPTIONAL_OVERLAY_MIGRATION_NAMES)[number],
        )
      ) continue;
      fail("LEDGER_UNEXPECTED", row.migration_name);
    }
    rowsByName.set(row.migration_name, row);
  }

  for (const entry of expected) {
    const row = rowsByName.get(entry.migrationName);
    if (!row) {
      fail("LEDGER_MISSING", entry.migrationName);
    }
    if (row.checksum !== entry.checksum) {
      fail("LEDGER_CHECKSUM_MISMATCH", entry.migrationName);
    }
    if (
      row.finished_at === null ||
      row.finished_at === undefined ||
      row.rolled_back_at !== null ||
      (row.logs !== null && row.logs !== "") ||
      Number(row.applied_steps_count) !== 1
    ) {
      fail("LEDGER_FAILED", entry.migrationName);
    }
  }
  const g1Rows = rows.filter(
    (row) =>
      !POST_G1_OPTIONAL_OVERLAY_MIGRATION_NAMES.includes(
        row.migration_name as (typeof POST_G1_OPTIONAL_OVERLAY_MIGRATION_NAMES)[number],
      ),
  );
  if (g1Rows.length !== expected.length) {
    fail("LEDGER_COUNT_MISMATCH", `${g1Rows.length}:${expected.length}`);
  }
}

export async function assertG1RuntimeMigrationReadyV1(
  client: MigrationLedgerClient,
): Promise<void> {
  const expected = await loadG1RuntimeMigrationExpectationsV1();
  let rows: G1RuntimeMigrationLedgerRowV1[];
  try {
    rows = await client.$queryRawUnsafe<G1RuntimeMigrationLedgerRowV1[]>(
      'SELECT migration_name, checksum, finished_at, rolled_back_at, logs, applied_steps_count FROM "_prisma_migrations" ORDER BY started_at, migration_name',
    );
  } catch (cause) {
    fail("LEDGER_UNAVAILABLE", undefined, cause);
  }
  assertG1RuntimeMigrationLedgerV1(expected, rows);
}
