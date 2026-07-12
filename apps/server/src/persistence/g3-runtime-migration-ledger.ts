import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  G2_RUNTIME_MIGRATION_NAMES,
  loadG2RuntimeMigrationExpectationsV1,
} from "./g2-runtime-migration-ledger.js";
import type { G1RuntimeMigrationLedgerRowV1 } from "./g1-runtime-migration-ledger.js";

export const G3_RUNTIME_MIGRATION_NAME =
  "0010_g3_comic_format_immutable" as const;
export const G3_RUNTIME_MIGRATION_NAMES = [
  ...G2_RUNTIME_MIGRATION_NAMES,
  G3_RUNTIME_MIGRATION_NAME,
] as const;

export interface G3RuntimeMigrationExpectationV1 {
  readonly migrationName: (typeof G3_RUNTIME_MIGRATION_NAMES)[number];
  readonly checksum: string;
}

const migrationRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../prisma/migrations",
);

function fail(code: string, detail?: string, cause?: unknown): never {
  throw new Error(
    detail
      ? "DB_PERSISTENCE_G3_MIGRATION_" + code + ":" + detail
      : "DB_PERSISTENCE_G3_MIGRATION_" + code,
    cause === undefined ? undefined : { cause },
  );
}

async function readOverlayChecksum(root: string): Promise<string> {
  const filePath = path.join(root, G3_RUNTIME_MIGRATION_NAME, "migration.sql");
  let stat;
  try {
    stat = await lstat(filePath);
  } catch (cause) {
    fail("ARTIFACT_UNAVAILABLE", G3_RUNTIME_MIGRATION_NAME, cause);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    fail("ARTIFACT_INVALID", G3_RUNTIME_MIGRATION_NAME);
  }
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function loadG3RuntimeMigrationExpectationsV1(
  root = migrationRoot,
): Promise<readonly G3RuntimeMigrationExpectationV1[]> {
  const g2 = await loadG2RuntimeMigrationExpectationsV1(root);
  return [
    ...g2,
    {
      migrationName: G3_RUNTIME_MIGRATION_NAME,
      checksum: await readOverlayChecksum(root),
    },
  ];
}

export function assertG3RuntimeMigrationLedgerV1(
  expected: readonly G3RuntimeMigrationExpectationV1[],
  rows: readonly G1RuntimeMigrationLedgerRowV1[],
): void {
  if (expected.length !== G3_RUNTIME_MIGRATION_NAMES.length) {
    fail("EXPECTED_SET_INVALID");
  }
  const expectedByName = new Map(expected.map((entry) => [entry.migrationName, entry]));
  const rowsByName = new Map<string, G1RuntimeMigrationLedgerRowV1>();
  for (const row of rows) {
    if (typeof row.migration_name !== "string" || rowsByName.has(row.migration_name)) {
      fail("LEDGER_ROW_INVALID");
    }
    if (!expectedByName.has(row.migration_name as (typeof G3_RUNTIME_MIGRATION_NAMES)[number])) {
      fail("LEDGER_UNEXPECTED", row.migration_name);
    }
    rowsByName.set(row.migration_name, row);
  }
  for (const entry of expected) {
    const row = rowsByName.get(entry.migrationName);
    if (!row) fail("LEDGER_MISSING", entry.migrationName);
    if (row.checksum !== entry.checksum) fail("LEDGER_CHECKSUM_MISMATCH", entry.migrationName);
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
    fail("LEDGER_COUNT_MISMATCH", rows.length + ":" + expected.length);
  }
}

export async function assertG3RuntimeMigrationReadyV1(
  client: {
    $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  },
): Promise<void> {
  const expected = await loadG3RuntimeMigrationExpectationsV1();
  let rows: G1RuntimeMigrationLedgerRowV1[];
  try {
    rows = await client.$queryRawUnsafe<G1RuntimeMigrationLedgerRowV1[]>(
      'SELECT migration_name, checksum, finished_at, rolled_back_at, logs, applied_steps_count FROM "_prisma_migrations" ORDER BY started_at, migration_name',
    );
  } catch (cause) {
    fail("LEDGER_UNAVAILABLE", undefined, cause);
  }
  assertG3RuntimeMigrationLedgerV1(expected, rows);
}
