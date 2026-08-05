import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  G5_RUNTIME_MIGRATION_NAMES,
  loadG5RuntimeMigrationExpectationsV1,
} from "./g5-runtime-migration-ledger.js";
import type { G1RuntimeMigrationLedgerRowV1 } from "./g1-runtime-migration-ledger.js";
import { LAYOUT_DOCUMENT_V2_WORKING_COPY_MIGRATION_NAME } from "./layout-document-v2-working-copy-contract.js";
import { LAYOUT_REVISION_V2_PUBLICATION_MIGRATION_NAME } from "./layout-revision-v2-publication-contract.js";
import { DOCUMENT_LIBRARY_MIGRATION_NAME } from "./document-library-contract.js";
import { SCRIPT_WORKFLOW_SOURCE_STATE_MIGRATION_NAME } from "./script-workflow-source-state-contract.js";

export const SCRIPT_WORKFLOW_RUNTIME_MIGRATION_NAMES = [
  ...G5_RUNTIME_MIGRATION_NAMES,
  SCRIPT_WORKFLOW_SOURCE_STATE_MIGRATION_NAME,
  LAYOUT_DOCUMENT_V2_WORKING_COPY_MIGRATION_NAME,
  LAYOUT_REVISION_V2_PUBLICATION_MIGRATION_NAME,
  DOCUMENT_LIBRARY_MIGRATION_NAME,
] as const;

export interface ScriptWorkflowRuntimeMigrationExpectationV1 {
  readonly migrationName: (typeof SCRIPT_WORKFLOW_RUNTIME_MIGRATION_NAMES)[number];
  readonly checksum: string;
}

const migrationRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../prisma/migrations",
);

function fail(code: string, detail?: string, cause?: unknown): never {
  throw new Error(
    detail
      ? `DB_PERSISTENCE_SCRIPT_WORKFLOW_MIGRATION_${code}:${detail}`
      : `DB_PERSISTENCE_SCRIPT_WORKFLOW_MIGRATION_${code}`,
    cause === undefined ? undefined : { cause },
  );
}

async function readOverlayChecksum(
  root: string,
  migrationName:
    | typeof SCRIPT_WORKFLOW_SOURCE_STATE_MIGRATION_NAME
    | typeof LAYOUT_DOCUMENT_V2_WORKING_COPY_MIGRATION_NAME
    | typeof LAYOUT_REVISION_V2_PUBLICATION_MIGRATION_NAME
    | typeof DOCUMENT_LIBRARY_MIGRATION_NAME,
): Promise<string> {
  const filePath = path.join(root, migrationName, "migration.sql");
  let stat;
  try {
    stat = await lstat(filePath);
  } catch (cause) {
    fail("ARTIFACT_UNAVAILABLE", migrationName, cause);
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    fail("ARTIFACT_INVALID", migrationName);
  }
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function loadScriptWorkflowRuntimeMigrationExpectationsV1(
  root = migrationRoot,
): Promise<readonly ScriptWorkflowRuntimeMigrationExpectationV1[]> {
  return [
    ...await loadG5RuntimeMigrationExpectationsV1(root),
    {
      migrationName: SCRIPT_WORKFLOW_SOURCE_STATE_MIGRATION_NAME,
      checksum: await readOverlayChecksum(root, SCRIPT_WORKFLOW_SOURCE_STATE_MIGRATION_NAME),
    },
    {
      migrationName: LAYOUT_DOCUMENT_V2_WORKING_COPY_MIGRATION_NAME,
      checksum: await readOverlayChecksum(root, LAYOUT_DOCUMENT_V2_WORKING_COPY_MIGRATION_NAME),
    },
    {
      migrationName: LAYOUT_REVISION_V2_PUBLICATION_MIGRATION_NAME,
      checksum: await readOverlayChecksum(root, LAYOUT_REVISION_V2_PUBLICATION_MIGRATION_NAME),
    },
    {
      migrationName: DOCUMENT_LIBRARY_MIGRATION_NAME,
      checksum: await readOverlayChecksum(root, DOCUMENT_LIBRARY_MIGRATION_NAME),
    },
  ];
}

export function assertScriptWorkflowRuntimeMigrationLedgerV1(
  expected: readonly ScriptWorkflowRuntimeMigrationExpectationV1[],
  rows: readonly G1RuntimeMigrationLedgerRowV1[],
): void {
  if (expected.length !== SCRIPT_WORKFLOW_RUNTIME_MIGRATION_NAMES.length) fail("EXPECTED_SET_INVALID");
  const expectedByName = new Map(expected.map((entry) => [entry.migrationName, entry]));
  const rowsByName = new Map<string, G1RuntimeMigrationLedgerRowV1>();
  for (const row of rows) {
    if (typeof row.migration_name !== "string" || rowsByName.has(row.migration_name)) fail("LEDGER_ROW_INVALID");
    if (!expectedByName.has(row.migration_name as ScriptWorkflowRuntimeMigrationExpectationV1["migrationName"])) fail("LEDGER_UNEXPECTED", row.migration_name);
    rowsByName.set(row.migration_name, row);
  }
  for (const entry of expected) {
    const row = rowsByName.get(entry.migrationName);
    if (!row) fail("LEDGER_MISSING", entry.migrationName);
    if (row.checksum !== entry.checksum) fail("LEDGER_CHECKSUM_MISMATCH", entry.migrationName);
    if (row.finished_at === null || row.finished_at === undefined || row.rolled_back_at !== null || (row.logs !== null && row.logs !== "") || Number(row.applied_steps_count) !== 1) fail("LEDGER_FAILED", entry.migrationName);
  }
  if (rows.length !== expected.length) fail("LEDGER_COUNT_MISMATCH", `${rows.length}:${expected.length}`);
}

export async function assertScriptWorkflowRuntimeMigrationReadyV1(client: {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}): Promise<void> {
  const expected = await loadScriptWorkflowRuntimeMigrationExpectationsV1();
  let rows: G1RuntimeMigrationLedgerRowV1[];
  try {
    rows = await client.$queryRawUnsafe<G1RuntimeMigrationLedgerRowV1[]>(
      'SELECT migration_name, checksum, finished_at, rolled_back_at, logs, applied_steps_count FROM "_prisma_migrations" ORDER BY started_at, migration_name',
    );
  } catch (cause) {
    fail("LEDGER_UNAVAILABLE", undefined, cause);
  }
  assertScriptWorkflowRuntimeMigrationLedgerV1(expected, rows);
}
