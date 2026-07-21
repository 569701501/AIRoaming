import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  G3_RUNTIME_MIGRATION_NAMES,
  loadG3RuntimeMigrationExpectationsV1,
} from "./g3-runtime-migration-ledger.js";
import type { G1RuntimeMigrationLedgerRowV1 } from "./g1-runtime-migration-ledger.js";
import { PROJECT_PURGE_OVERLAY_MIGRATION_NAME } from "./project-purge-overlay-contract.js";

export const PROJECT_PURGE_RUNTIME_MIGRATION_NAMES = [
  ...G3_RUNTIME_MIGRATION_NAMES,
  PROJECT_PURGE_OVERLAY_MIGRATION_NAME,
] as const;

export interface ProjectPurgeRuntimeMigrationExpectationV1 {
  readonly migrationName: (typeof PROJECT_PURGE_RUNTIME_MIGRATION_NAMES)[number];
  readonly checksum: string;
}

const migrationRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../prisma/migrations",
);

function fail(code: string, detail?: string, cause?: unknown): never {
  throw new Error(
    detail
      ? `DB_PERSISTENCE_PROJECT_PURGE_MIGRATION_${code}:${detail}`
      : `DB_PERSISTENCE_PROJECT_PURGE_MIGRATION_${code}`,
    cause === undefined ? undefined : { cause },
  );
}

async function readOverlayChecksum(root: string): Promise<string> {
  const filePath = path.join(
    root,
    PROJECT_PURGE_OVERLAY_MIGRATION_NAME,
    "migration.sql",
  );
  let stat;
  try {
    stat = await lstat(filePath);
  } catch (cause) {
    fail("ARTIFACT_UNAVAILABLE", PROJECT_PURGE_OVERLAY_MIGRATION_NAME, cause);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    fail("ARTIFACT_INVALID", PROJECT_PURGE_OVERLAY_MIGRATION_NAME);
  }
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function loadProjectPurgeRuntimeMigrationExpectationsV1(
  root = migrationRoot,
): Promise<readonly ProjectPurgeRuntimeMigrationExpectationV1[]> {
  const g3 = await loadG3RuntimeMigrationExpectationsV1(root);
  return [
    ...g3,
    {
      migrationName: PROJECT_PURGE_OVERLAY_MIGRATION_NAME,
      checksum: await readOverlayChecksum(root),
    },
  ];
}

export function assertProjectPurgeRuntimeMigrationLedgerV1(
  expected: readonly ProjectPurgeRuntimeMigrationExpectationV1[],
  rows: readonly G1RuntimeMigrationLedgerRowV1[],
): void {
  if (expected.length !== PROJECT_PURGE_RUNTIME_MIGRATION_NAMES.length) {
    fail("EXPECTED_SET_INVALID");
  }
  const expectedByName = new Map(
    expected.map((entry) => [entry.migrationName, entry]),
  );
  const rowsByName = new Map<string, G1RuntimeMigrationLedgerRowV1>();
  for (const row of rows) {
    if (typeof row.migration_name !== "string" || rowsByName.has(row.migration_name)) {
      fail("LEDGER_ROW_INVALID");
    }
    if (!expectedByName.has(row.migration_name as ProjectPurgeRuntimeMigrationExpectationV1["migrationName"])) {
      fail("LEDGER_UNEXPECTED", row.migration_name);
    }
    rowsByName.set(row.migration_name, row);
  }
  for (const entry of expected) {
    const row = rowsByName.get(entry.migrationName);
    if (!row) fail("LEDGER_MISSING", entry.migrationName);
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
  if (rows.length !== expected.length) {
    fail("LEDGER_COUNT_MISMATCH", `${rows.length}:${expected.length}`);
  }
}
