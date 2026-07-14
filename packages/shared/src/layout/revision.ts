import type {
  LayoutDigest,
  LayoutDocumentV1,
  LayoutPublicationProfileV1,
} from "./document.js";
import { parseLayoutPublicationProfileV1 } from "./publication.js";
import type { LayoutPreflightIssueV1, LayoutPreflightReportV1 } from "./preflight.js";
import type { LayoutWorkingCopyResponseV1 } from "./working-copy.js";

export type LayoutRevisionSaveReasonV1 =
  | "user_checkpoint"
  | "export_checkpoint"
  | "history_restore";

export interface CreateLayoutRevisionRequestV1 {
  schemaVersion: 1;
  expectedWorkingCopyRowVersion: number;
  expectedDocumentDigest: LayoutDigest;
  expectedCurrentRevisionId: string | null;
  saveReason: LayoutRevisionSaveReasonV1;
  acknowledgedIssueKeys: string[];
}

export interface RestoreLayoutRevisionRequestV1 {
  schemaVersion: 1;
  expectedWorkingCopyRowVersion: number;
  expectedWorkingCopyDigest: LayoutDigest;
}

export interface RunLayoutPreflightRequestV1 {
  schemaVersion: 1;
  target:
    | { kind: "working_copy"; expectedRowVersion: number; expectedDocumentDigest: LayoutDigest }
    | { kind: "layout_revision"; layoutRevisionId: string };
  profile: LayoutPublicationProfileV1 | null;
}

export interface LayoutRevisionSummaryV1 {
  id: string;
  projectId: string;
  chapterId: string;
  revision: number;
  previousRevisionId: string | null;
  contentBasedOnRevisionId: string | null;
  documentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest | null;
  saveReason: LayoutRevisionSaveReasonV1 | "legacy_import";
  sourceResolution: "current" | "stale" | "unresolved";
  createdAt: string;
}

export interface LayoutRevisionDetailV1 extends LayoutRevisionSummaryV1 {
  document: LayoutDocumentV1;
  bindingSetSealedAt: string;
}

export interface LayoutRevisionHistoryResponseV1 {
  schemaVersion: 1;
  currentLayoutRevisionId: string | null;
  items: LayoutRevisionSummaryV1[];
}

export interface CreateLayoutRevisionResponseV1 {
  schemaVersion: 1;
  result: "created" | "replayed";
  revision: LayoutRevisionDetailV1;
  warnings: LayoutPreflightIssueV1[];
  preflight: LayoutPreflightReportV1;
  workingCopy: LayoutWorkingCopyResponseV1;
}

export interface RestoreLayoutRevisionResponseV1 {
  schemaVersion: 1;
  result: "restored" | "replayed";
  restoredFromRevisionId: string;
  workingCopy: LayoutWorkingCopyResponseV1;
}

export class LayoutRevisionContractError extends Error {
  readonly code = "LAYOUT_REVISION_BODY_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "LayoutRevisionContractError";
  }
}

function fail(path: string, message: string): never {
  throw new LayoutRevisionContractError(`${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "expected object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "expected plain object");
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  const row = record(value, path);
  const allowed = new Set(keys);
  for (const key of Object.keys(row)) if (!allowed.has(key)) fail(`${path}.${key}`, "unknown field");
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(row, key)) fail(`${path}.${key}`, "missing required field");
  return row;
}

function id(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.trim() !== value || value.includes("\0")) {
    fail(path, "expected non-empty ID");
  }
  return value;
}

function nullableId(value: unknown, path: string): string | null {
  return value === null ? null : id(value, path);
}

function digest(value: unknown, path: string): LayoutDigest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) fail(path, "expected sha256 digest");
  return value as LayoutDigest;
}

function rowVersion(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) fail(path, "expected non-negative integer");
  return value as number;
}

export function parseCreateLayoutRevisionRequestV1(input: unknown): CreateLayoutRevisionRequestV1 {
  const row = exact(input, [
    "schemaVersion",
    "expectedWorkingCopyRowVersion",
    "expectedDocumentDigest",
    "expectedCurrentRevisionId",
    "saveReason",
    "acknowledgedIssueKeys",
  ], "request");
  if (row.schemaVersion !== 1) fail("request.schemaVersion", "expected 1");
  if (row.saveReason !== "user_checkpoint" && row.saveReason !== "export_checkpoint" && row.saveReason !== "history_restore") {
    fail("request.saveReason", "unsupported save reason");
  }
  if (!Array.isArray(row.acknowledgedIssueKeys) || row.acknowledgedIssueKeys.length > 5_000) {
    fail("request.acknowledgedIssueKeys", "expected array with at most 5000 entries");
  }
  const acknowledgedIssueKeys = row.acknowledgedIssueKeys.map((value, index) =>
    id(value, `request.acknowledgedIssueKeys[${index}]`));
  if (new Set(acknowledgedIssueKeys).size !== acknowledgedIssueKeys.length) {
    fail("request.acknowledgedIssueKeys", "duplicate issue key");
  }
  return {
    schemaVersion: 1,
    expectedWorkingCopyRowVersion: rowVersion(row.expectedWorkingCopyRowVersion, "request.expectedWorkingCopyRowVersion"),
    expectedDocumentDigest: digest(row.expectedDocumentDigest, "request.expectedDocumentDigest"),
    expectedCurrentRevisionId: nullableId(row.expectedCurrentRevisionId, "request.expectedCurrentRevisionId"),
    saveReason: row.saveReason,
    acknowledgedIssueKeys,
  };
}

export function parseRestoreLayoutRevisionRequestV1(input: unknown): RestoreLayoutRevisionRequestV1 {
  const row = exact(input, [
    "schemaVersion",
    "expectedWorkingCopyRowVersion",
    "expectedWorkingCopyDigest",
  ], "request");
  if (row.schemaVersion !== 1) fail("request.schemaVersion", "expected 1");
  return {
    schemaVersion: 1,
    expectedWorkingCopyRowVersion: rowVersion(row.expectedWorkingCopyRowVersion, "request.expectedWorkingCopyRowVersion"),
    expectedWorkingCopyDigest: digest(row.expectedWorkingCopyDigest, "request.expectedWorkingCopyDigest"),
  };
}

export function parseRunLayoutPreflightRequestV1(input: unknown): RunLayoutPreflightRequestV1 {
  const row = exact(input, ["schemaVersion", "target", "profile"], "request");
  if (row.schemaVersion !== 1) fail("request.schemaVersion", "expected 1");
  const target = record(row.target, "request.target");
  let parsedTarget: RunLayoutPreflightRequestV1["target"];
  if (target.kind === "working_copy") {
    const value = exact(target, ["kind", "expectedRowVersion", "expectedDocumentDigest"], "request.target");
    parsedTarget = {
      kind: "working_copy",
      expectedRowVersion: rowVersion(value.expectedRowVersion, "request.target.expectedRowVersion"),
      expectedDocumentDigest: digest(value.expectedDocumentDigest, "request.target.expectedDocumentDigest"),
    };
  } else if (target.kind === "layout_revision") {
    const value = exact(target, ["kind", "layoutRevisionId"], "request.target");
    parsedTarget = { kind: "layout_revision", layoutRevisionId: id(value.layoutRevisionId, "request.target.layoutRevisionId") };
  } else {
    fail("request.target.kind", "unsupported target");
  }
  let profile: LayoutPublicationProfileV1 | null = null;
  if (row.profile !== null) {
    try {
      profile = parseLayoutPublicationProfileV1(row.profile);
    } catch (error) {
      fail("request.profile", error instanceof Error ? error.message : "invalid profile");
    }
  }
  return { schemaVersion: 1, target: parsedTarget, profile };
}
