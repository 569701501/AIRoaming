import type { LayoutSourceEvaluation } from "../candidate-lock.js";
import {
  canonicalJsonBytes,
  canonicalizeJson,
  sha256Bytes,
} from "../versioning/canonical-json.js";
import {
  LayoutDocumentCodecV1,
  LayoutProfileCodecV1,
  type LayoutDocumentValidationContextV1,
} from "./codec.js";
import {
  LayoutDocumentCodecV2,
  LayoutDocumentCodecV1OrV2,
  type LayoutDocumentV1OrV2,
  type LayoutDocumentV2,
} from "./automation.js";
import type {
  CandidateImageSourceV1,
  EncodedLayoutValue,
  LayoutDigest,
  LayoutDocumentV1,
  LayoutProfileV1,
} from "./document.js";

export type LayoutWorkingCopyInitializationModeV1 =
  | "default_storyboard_layout"
  | "blank";

export interface InitializeLayoutWorkingCopyRequestV1 {
  schemaVersion: 1;
  profile: LayoutProfileV1;
  initializationMode: LayoutWorkingCopyInitializationModeV1;
  expectedCurrentLayoutRevisionId: string | null;
}

export interface SaveLayoutWorkingCopyRequestV1 {
  schemaVersion: 1;
  expectedRowVersion: number;
  baseDocumentDigest: LayoutDigest;
  documentDigest: LayoutDigest;
  document: LayoutDocumentV1;
}

export interface SaveLayoutWorkingCopyRequestV1OrV2 {
  schemaVersion: 1;
  expectedRowVersion: number;
  baseDocumentDigest: LayoutDigest;
  documentDigest: LayoutDigest;
  document: LayoutDocumentV1OrV2;
}

export interface LayoutWorkingCopyResponseV1 {
  schemaVersion: 1;
  id: string;
  projectId: string;
  chapterId: string;
  document: LayoutDocumentV1OrV2;
  documentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest | null;
  basedOnRevisionId: string | null;
  rowVersion: number;
  saveState: "saved";
  sourceEvaluation: LayoutSourceEvaluation;
  updatedAt: string;
}

export interface LayoutSourceCatalogItemV1 {
  order: number;
  source: CandidateImageSourceV1;
  width: number;
  height: number;
}

export interface LayoutSourceCatalogResponseV1 {
  schemaVersion: 1;
  projectId: string;
  chapterId: string;
  sourceLockSetDigest: LayoutDigest;
  items: LayoutSourceCatalogItemV1[];
}

export interface InitializeLayoutWorkingCopyResponseV1 {
  schemaVersion: 1;
  result: "created" | "existing";
  value: LayoutWorkingCopyResponseV1;
}

export interface SaveLayoutWorkingCopyResponseV1 {
  schemaVersion: 1;
  result: "updated" | "no_op" | "replayed";
  value: LayoutWorkingCopyResponseV1;
}

export interface LayoutLegacyCutoverStatusV1 {
  schemaVersion: 1;
  state: "none" | "layout_document_v1" | "layout_document_v2" | "legacy_convertible" | "legacy_unresolved";
  workingCopyId: string | null;
  legacyDocumentDigest: LayoutDigest | null;
  sourceResolution: "complete" | "unresolved" | null;
  provenancePreserved: boolean;
}

export interface LayoutLegacyCutoverResponseV1 {
  schemaVersion: 1;
  result: "converted" | "rebuilt";
  value: LayoutWorkingCopyResponseV1;
}

export interface LayoutWorkingCopyRecoveryV1 {
  schemaVersion: 1;
  kind: "layout_working_copy_recovery_v1";
  projectId: string;
  chapterId: string;
  workingCopyId: string;
  serverRowVersion: number;
  serverDocumentDigest: LayoutDigest;
  localDocumentDigest: LayoutDigest;
  document: LayoutDocumentV1OrV2;
}

export class LayoutWorkingCopyContractError extends Error {
  readonly code = "LAYOUT_BODY_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "LayoutWorkingCopyContractError";
  }
}

function fail(path: string, message: string): never {
  throw new LayoutWorkingCopyContractError(`${path}: ${message}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "expected a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(path, "expected a plain object");
  }
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  const row = object(value, path);
  const expected = new Set(keys);
  for (const key of Object.keys(row)) {
    if (!expected.has(key)) fail(`${path}.${key}`, "unknown field");
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) fail(`${path}.${key}`, "missing required field");
  }
  return row;
}

function id(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.trim() !== value || value.includes("\0")) {
    fail(path, "expected a trimmed non-empty ID");
  }
  return value;
}

function nullableId(value: unknown, path: string): string | null {
  return value === null ? null : id(value, path);
}

function nonnegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    fail(path, "expected a non-negative integer");
  }
  return value;
}

function digest(value: unknown, path: string): LayoutDigest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    fail(path, "expected sha256:<64 lowercase hex> digest");
  }
  return value as LayoutDigest;
}

export function parseInitializeLayoutWorkingCopyRequestV1(
  input: unknown,
): InitializeLayoutWorkingCopyRequestV1 {
  const row = exact(input, [
    "schemaVersion",
    "profile",
    "initializationMode",
    "expectedCurrentLayoutRevisionId",
  ], "request");
  if (row.schemaVersion !== 1) fail("request.schemaVersion", "expected 1");
  if (row.initializationMode !== "default_storyboard_layout" && row.initializationMode !== "blank") {
    fail("request.initializationMode", "unsupported initialization mode");
  }
  return {
    schemaVersion: 1,
    profile: LayoutProfileCodecV1.parseAndNormalize(row.profile),
    initializationMode: row.initializationMode,
    expectedCurrentLayoutRevisionId: nullableId(
      row.expectedCurrentLayoutRevisionId,
      "request.expectedCurrentLayoutRevisionId",
    ),
  };
}

export function parseSaveLayoutWorkingCopyRequestV1(
  input: unknown,
  context: LayoutDocumentValidationContextV1 = {},
): SaveLayoutWorkingCopyRequestV1 {
  const row = exact(input, [
    "schemaVersion",
    "expectedRowVersion",
    "baseDocumentDigest",
    "documentDigest",
    "document",
  ], "request");
  if (row.schemaVersion !== 1) fail("request.schemaVersion", "expected 1");
  const encoded = LayoutDocumentCodecV1.encode(row.document, context);
  const claimedDigest = digest(row.documentDigest, "request.documentDigest");
  if (claimedDigest !== encoded.digest) {
    fail("request.documentDigest", "does not match the canonical document digest");
  }
  return {
    schemaVersion: 1,
    expectedRowVersion: nonnegativeInteger(row.expectedRowVersion, "request.expectedRowVersion"),
    baseDocumentDigest: digest(row.baseDocumentDigest, "request.baseDocumentDigest"),
    documentDigest: claimedDigest,
    document: encoded.value,
  };
}

export function parseSaveLayoutWorkingCopyRequestV1OrV2(
  input: unknown,
  context: LayoutDocumentValidationContextV1 = {},
): SaveLayoutWorkingCopyRequestV1OrV2 {
  const row = exact(input, [
    "schemaVersion",
    "expectedRowVersion",
    "baseDocumentDigest",
    "documentDigest",
    "document",
  ], "request");
  if (row.schemaVersion !== 1) fail("request.schemaVersion", "expected 1");
  const documentRow = object(row.document, "request.document");
  const encoded = documentRow.schemaVersion === 2 && documentRow.kind === "layout_document_v2"
    ? LayoutDocumentCodecV2.encode(row.document as LayoutDocumentV2, context)
    : LayoutDocumentCodecV1.encode(row.document, context);
  const claimedDigest = digest(row.documentDigest, "request.documentDigest");
  if (claimedDigest !== encoded.digest) {
    fail("request.documentDigest", "does not match the canonical document digest");
  }
  return {
    schemaVersion: 1,
    expectedRowVersion: nonnegativeInteger(row.expectedRowVersion, "request.expectedRowVersion"),
    baseDocumentDigest: digest(row.baseDocumentDigest, "request.baseDocumentDigest"),
    documentDigest: claimedDigest,
    document: encoded.value,
  };
}

export function encodeLayoutWorkingCopyRecoveryV1(
  input: unknown,
): EncodedLayoutValue<LayoutWorkingCopyRecoveryV1> {
  const row = exact(input, [
    "schemaVersion",
    "kind",
    "projectId",
    "chapterId",
    "workingCopyId",
    "serverRowVersion",
    "serverDocumentDigest",
    "localDocumentDigest",
    "document",
  ], "recovery");
  if (row.schemaVersion !== 1) fail("recovery.schemaVersion", "expected 1");
  if (row.kind !== "layout_working_copy_recovery_v1") fail("recovery.kind", "unsupported kind");
  const projectId = id(row.projectId, "recovery.projectId");
  const chapterId = id(row.chapterId, "recovery.chapterId");
  const encodedDocument = LayoutDocumentCodecV1OrV2.encode(row.document, { projectId, chapterId });
  const localDocumentDigest = digest(row.localDocumentDigest, "recovery.localDocumentDigest");
  if (localDocumentDigest !== encodedDocument.digest) {
    fail("recovery.localDocumentDigest", "does not match the canonical document digest");
  }
  const value: LayoutWorkingCopyRecoveryV1 = {
    schemaVersion: 1,
    kind: "layout_working_copy_recovery_v1",
    projectId,
    chapterId,
    workingCopyId: id(row.workingCopyId, "recovery.workingCopyId"),
    serverRowVersion: nonnegativeInteger(row.serverRowVersion, "recovery.serverRowVersion"),
    serverDocumentDigest: digest(row.serverDocumentDigest, "recovery.serverDocumentDigest"),
    localDocumentDigest,
    document: encodedDocument.value,
  };
  const canonical = canonicalizeJson(value);
  const canonicalBytes = canonicalJsonBytes(value);
  return {
    schemaVersion: 1,
    value,
    canonical,
    canonicalBytes,
    digest: sha256Bytes(canonicalBytes),
  };
}
