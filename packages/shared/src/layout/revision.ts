import type {
  LayoutDigest,
  LayoutDocumentV1,
  LayoutPublicationProfileV1,
} from "./document.js";
import type { LayoutDocumentV2 } from "./automation.js";
import { parseLayoutPublicationProfileV1 } from "./publication.js";
import type {
  LayoutPreflightIssueV1,
  LayoutPreflightIssueV2,
  LayoutPreflightReportV1,
  LayoutPreflightReportV2,
} from "./preflight.js";
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

export interface CreateLayoutRevisionRequestV2 {
  schemaVersion: 2;
  expectedWorkingCopyRowVersion: number;
  expectedRevisionDocumentDigest: LayoutDigest;
  expectedVisibleDocumentDigest: LayoutDigest;
  expectedCurrentRevisionId: string | null;
  saveReason: LayoutRevisionSaveReasonV1;
  acknowledgedIssueKeys: string[];
}

export type CreateLayoutRevisionRequestV1OrV2 =
  | CreateLayoutRevisionRequestV1
  | CreateLayoutRevisionRequestV2;

export interface RestoreLayoutRevisionRequestV1 {
  schemaVersion: 1;
  expectedWorkingCopyRowVersion: number;
  expectedWorkingCopyDigest: LayoutDigest;
}

export interface RestoreLayoutRevisionRequestV2 {
  schemaVersion: 2;
  expectedWorkingCopyRowVersion: number;
  expectedWorkingCopyRevisionDocumentDigest: LayoutDigest;
  expectedWorkingCopyVisibleDocumentDigest: LayoutDigest;
}

export type RestoreLayoutRevisionRequestV1OrV2 =
  | RestoreLayoutRevisionRequestV1
  | RestoreLayoutRevisionRequestV2;

export interface RunLayoutPreflightRequestV1 {
  schemaVersion: 1;
  target:
    | { kind: "working_copy"; expectedRowVersion: number; expectedDocumentDigest: LayoutDigest }
    | { kind: "layout_revision"; layoutRevisionId: string };
  profile: LayoutPublicationProfileV1 | null;
}

export interface RunLayoutPreflightRequestV2 {
  schemaVersion: 2;
  target:
    | {
        kind: "working_copy";
        expectedRowVersion: number;
        expectedRevisionDocumentDigest: LayoutDigest;
        expectedVisibleDocumentDigest: LayoutDigest;
      }
    | { kind: "layout_revision"; layoutRevisionId: string };
  profile: LayoutPublicationProfileV1 | null;
}

export type RunLayoutPreflightRequestV1OrV2 =
  | RunLayoutPreflightRequestV1
  | RunLayoutPreflightRequestV2;

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

export interface LayoutRevisionSummaryV2 {
  documentSchemaVersion: 2;
  id: string;
  projectId: string;
  chapterId: string;
  revision: number;
  previousRevisionId: string | null;
  contentBasedOnRevisionId: string | null;
  revisionDocumentDigest: LayoutDigest;
  visibleDocumentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest;
  saveReason: LayoutRevisionSaveReasonV1 | "legacy_import";
  sourceResolution: "current" | "stale" | "unresolved";
  createdAt: string;
}

export type LayoutRevisionSummaryV1OrV2 =
  | (LayoutRevisionSummaryV1 & { documentSchemaVersion: 1 })
  | LayoutRevisionSummaryV2;

export interface LayoutRevisionDetailV1 extends LayoutRevisionSummaryV1 {
  document: LayoutDocumentV1;
  bindingSetSealedAt: string;
}

export interface LayoutRevisionDetailV2 extends LayoutRevisionSummaryV2 {
  document: LayoutDocumentV2;
  bindingSetSealedAt: string;
}

export type LayoutRevisionDetailV1OrV2 =
  | LayoutRevisionDetailV1
  | LayoutRevisionDetailV2;

export interface LayoutRevisionHistoryResponseV1 {
  schemaVersion: 1;
  currentLayoutRevisionId: string | null;
  items: LayoutRevisionSummaryV1[];
}

export interface LayoutRevisionHistoryResponseV2 {
  schemaVersion: 2;
  currentLayoutRevisionId: string | null;
  items: LayoutRevisionSummaryV1OrV2[];
}

export interface CreateLayoutRevisionResponseV1 {
  schemaVersion: 1;
  result: "created" | "replayed";
  revision: LayoutRevisionDetailV1;
  warnings: LayoutPreflightIssueV1[];
  preflight: LayoutPreflightReportV1;
  workingCopy: LayoutWorkingCopyResponseV1;
}

export interface CreateLayoutRevisionResponseV2 {
  schemaVersion: 2;
  result: "created" | "replayed";
  revision: LayoutRevisionDetailV2;
  warnings: LayoutPreflightIssueV2[];
  preflight: LayoutPreflightReportV2;
  workingCopy: LayoutWorkingCopyResponseV1;
}

export interface RestoreLayoutRevisionResponseV1 {
  schemaVersion: 1;
  result: "restored" | "replayed";
  restoredFromRevisionId: string;
  workingCopy: LayoutWorkingCopyResponseV1;
}

export interface RestoreLayoutRevisionResponseV2 {
  schemaVersion: 2;
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

function saveReason(value: unknown, path: string): LayoutRevisionSaveReasonV1 {
  if (value !== "user_checkpoint" && value !== "export_checkpoint" && value !== "history_restore") {
    fail(path, "unsupported save reason");
  }
  return value;
}

function issueKeys(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length > 5_000) {
    fail(path, "expected array with at most 5000 entries");
  }
  const parsed = value.map((item, index) => id(item, `${path}[${index}]`));
  if (new Set(parsed).size !== parsed.length) fail(path, "duplicate issue key");
  return parsed;
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
  return {
    schemaVersion: 1,
    expectedWorkingCopyRowVersion: rowVersion(row.expectedWorkingCopyRowVersion, "request.expectedWorkingCopyRowVersion"),
    expectedDocumentDigest: digest(row.expectedDocumentDigest, "request.expectedDocumentDigest"),
    expectedCurrentRevisionId: nullableId(row.expectedCurrentRevisionId, "request.expectedCurrentRevisionId"),
    saveReason: saveReason(row.saveReason, "request.saveReason"),
    acknowledgedIssueKeys: issueKeys(row.acknowledgedIssueKeys, "request.acknowledgedIssueKeys"),
  };
}

export function parseCreateLayoutRevisionRequestV2(input: unknown): CreateLayoutRevisionRequestV2 {
  const row = exact(input, [
    "schemaVersion",
    "expectedWorkingCopyRowVersion",
    "expectedRevisionDocumentDigest",
    "expectedVisibleDocumentDigest",
    "expectedCurrentRevisionId",
    "saveReason",
    "acknowledgedIssueKeys",
  ], "request");
  if (row.schemaVersion !== 2) fail("request.schemaVersion", "expected 2");
  return {
    schemaVersion: 2,
    expectedWorkingCopyRowVersion: rowVersion(row.expectedWorkingCopyRowVersion, "request.expectedWorkingCopyRowVersion"),
    expectedRevisionDocumentDigest: digest(row.expectedRevisionDocumentDigest, "request.expectedRevisionDocumentDigest"),
    expectedVisibleDocumentDigest: digest(row.expectedVisibleDocumentDigest, "request.expectedVisibleDocumentDigest"),
    expectedCurrentRevisionId: nullableId(row.expectedCurrentRevisionId, "request.expectedCurrentRevisionId"),
    saveReason: saveReason(row.saveReason, "request.saveReason"),
    acknowledgedIssueKeys: issueKeys(row.acknowledgedIssueKeys, "request.acknowledgedIssueKeys"),
  };
}

export function parseCreateLayoutRevisionRequestV1OrV2(
  input: unknown,
): CreateLayoutRevisionRequestV1OrV2 {
  return record(input, "request").schemaVersion === 2
    ? parseCreateLayoutRevisionRequestV2(input)
    : parseCreateLayoutRevisionRequestV1(input);
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

export function parseRestoreLayoutRevisionRequestV2(input: unknown): RestoreLayoutRevisionRequestV2 {
  const row = exact(input, [
    "schemaVersion",
    "expectedWorkingCopyRowVersion",
    "expectedWorkingCopyRevisionDocumentDigest",
    "expectedWorkingCopyVisibleDocumentDigest",
  ], "request");
  if (row.schemaVersion !== 2) fail("request.schemaVersion", "expected 2");
  return {
    schemaVersion: 2,
    expectedWorkingCopyRowVersion: rowVersion(row.expectedWorkingCopyRowVersion, "request.expectedWorkingCopyRowVersion"),
    expectedWorkingCopyRevisionDocumentDigest: digest(
      row.expectedWorkingCopyRevisionDocumentDigest,
      "request.expectedWorkingCopyRevisionDocumentDigest",
    ),
    expectedWorkingCopyVisibleDocumentDigest: digest(
      row.expectedWorkingCopyVisibleDocumentDigest,
      "request.expectedWorkingCopyVisibleDocumentDigest",
    ),
  };
}

export function parseRestoreLayoutRevisionRequestV1OrV2(
  input: unknown,
): RestoreLayoutRevisionRequestV1OrV2 {
  return record(input, "request").schemaVersion === 2
    ? parseRestoreLayoutRevisionRequestV2(input)
    : parseRestoreLayoutRevisionRequestV1(input);
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

export function parseRunLayoutPreflightRequestV2(input: unknown): RunLayoutPreflightRequestV2 {
  const row = exact(input, ["schemaVersion", "target", "profile"], "request");
  if (row.schemaVersion !== 2) fail("request.schemaVersion", "expected 2");
  const target = record(row.target, "request.target");
  let parsedTarget: RunLayoutPreflightRequestV2["target"];
  if (target.kind === "working_copy") {
    const value = exact(target, [
      "kind",
      "expectedRowVersion",
      "expectedRevisionDocumentDigest",
      "expectedVisibleDocumentDigest",
    ], "request.target");
    parsedTarget = {
      kind: "working_copy",
      expectedRowVersion: rowVersion(value.expectedRowVersion, "request.target.expectedRowVersion"),
      expectedRevisionDocumentDigest: digest(
        value.expectedRevisionDocumentDigest,
        "request.target.expectedRevisionDocumentDigest",
      ),
      expectedVisibleDocumentDigest: digest(
        value.expectedVisibleDocumentDigest,
        "request.target.expectedVisibleDocumentDigest",
      ),
    };
  } else if (target.kind === "layout_revision") {
    const value = exact(target, ["kind", "layoutRevisionId"], "request.target");
    parsedTarget = {
      kind: "layout_revision",
      layoutRevisionId: id(value.layoutRevisionId, "request.target.layoutRevisionId"),
    };
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
  return { schemaVersion: 2, target: parsedTarget, profile };
}

export function parseRunLayoutPreflightRequestV1OrV2(
  input: unknown,
): RunLayoutPreflightRequestV1OrV2 {
  return record(input, "request").schemaVersion === 2
    ? parseRunLayoutPreflightRequestV2(input)
    : parseRunLayoutPreflightRequestV1(input);
}
