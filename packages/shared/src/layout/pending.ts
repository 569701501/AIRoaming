import {
  applyLayoutCommandBatch,
  parseEditorCommandBatchV1,
  type EditorCommandBatchV1,
} from "./commands.js";
import { LayoutDocumentCodecV1 } from "./codec.js";
import {
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  type LayoutDocumentV2,
} from "./automation.js";
import {
  applyLayoutCommandBatchV2,
  parseEditorCommandBatchV2,
  type EditorCommandBatchV2,
} from "./commands-v2.js";
import { projectLayoutSourceBindings } from "./digest.js";
import { digestCanonicalJson } from "../versioning/canonical-json.js";
import type { LayoutDigest, LayoutDocumentV1 } from "./document.js";
import type { LayoutWorkingCopyResponseV1 } from "./working-copy.js";

export interface CreatePendingEditorCommandSetRequestV1 {
  schemaVersion: 1;
  expectedWorkingCopyRowVersion: number;
  expectedDocumentDigest: LayoutDigest;
  selectionElementIds: string[];
  summary: string;
  warnings: string[];
  commandBatch: EditorCommandBatchV1;
}

export interface PendingEditorCommandSetV1 {
  schemaVersion: 1;
  workingCopyId: string;
  expectedRowVersion: number;
  baseDocumentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest | null;
  selectionElementIds: string[];
  summary: string;
  changedElementIds: string[];
  warnings: string[];
  commandBatch: EditorCommandBatchV1;
  resultDocumentDigest: LayoutDigest;
}

export interface BuiltPendingEditorCommandSetV1 extends PendingEditorCommandSetV1 {
  resultDocument: LayoutDocumentV1;
}

export interface PendingEditorCommandPreviewV1 {
  schemaVersion: 1;
  id: string;
  status: "pending";
  payload: PendingEditorCommandSetV1;
  resultDocument: LayoutDocumentV1;
  createdAt: string;
  updatedAt: string;
}

export interface PendingEditorCommandCurrentResponseV1 {
  schemaVersion: 1;
  item: PendingEditorCommandPreviewV1 | null;
}

export interface ApplyPendingEditorCommandResponseV1 {
  schemaVersion: 1;
  pendingId: string;
  appliedBatch: EditorCommandBatchV1;
  previousDocument: LayoutDocumentV1;
  workingCopy: LayoutWorkingCopyResponseV1;
}

export interface DiscardPendingEditorCommandResponseV1 {
  schemaVersion: 1;
  pendingId: string;
  status: "discarded";
}

export interface PendingEditorCommandSetV2 {
  schemaVersion: 2;
  workingCopyId: string;
  expectedRowVersion: number;
  baseDocumentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest | null;
  selectionElementIds: string[];
  summary: string;
  changedElementIds: string[];
  warnings: string[];
  commandBatch: EditorCommandBatchV2;
  resultDocumentDigest: LayoutDigest;
}

export interface BuiltPendingEditorCommandSetV2 extends PendingEditorCommandSetV2 {
  resultDocument: LayoutDocumentV2;
}

export interface PendingEditorCommandPreviewV2 {
  schemaVersion: 2;
  id: string;
  status: "pending";
  payload: PendingEditorCommandSetV2;
  resultDocument: LayoutDocumentV2;
  createdAt: string;
  updatedAt: string;
}

export interface ApplyPendingEditorCommandResponseV2 {
  schemaVersion: 2;
  pendingId: string;
  appliedBatch: EditorCommandBatchV2;
  previousDocument: LayoutDocumentV2;
  workingCopy: LayoutWorkingCopyResponseV1;
}

export type PendingEditorCommandSetV1OrV2 =
  | PendingEditorCommandSetV1
  | PendingEditorCommandSetV2;
export type PendingEditorCommandPreviewV1OrV2 =
  | PendingEditorCommandPreviewV1
  | PendingEditorCommandPreviewV2;
export interface PendingEditorCommandCurrentResponseV1OrV2 {
  schemaVersion: 1;
  item: PendingEditorCommandPreviewV1OrV2 | null;
}
export type ApplyPendingEditorCommandResponseV1OrV2 =
  | ApplyPendingEditorCommandResponseV1
  | ApplyPendingEditorCommandResponseV2;

export class PendingEditorCommandContractError extends Error {
  readonly code = "LAYOUT_PENDING_COMMAND_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "PendingEditorCommandContractError";
  }
}

export function pendingEditorSourceProjectionUnchangedV1(
  before: LayoutDocumentV1,
  after: LayoutDocumentV1,
): boolean {
  return digestCanonicalJson(projectLayoutSourceBindings(before))
    === digestCanonicalJson(projectLayoutSourceBindings(after));
}

export function pendingEditorSourceProjectionUnchangedV2(
  before: LayoutDocumentV2,
  after: LayoutDocumentV2,
): boolean {
  return pendingEditorSourceProjectionUnchangedV1(
    projectLayoutDocumentV2ToV1(before),
    projectLayoutDocumentV2ToV1(after),
  );
}

function fail(path: string, message: string): never {
  throw new PendingEditorCommandContractError(`${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "expected plain object");
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
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value.trim() !== value || value.includes("\0")) {
    fail(path, "expected trimmed non-empty ID");
  }
  return value;
}

function text(value: unknown, path: string, maximum: number): string {
  if (typeof value !== "string" || value.trim() === "" || value.trim() !== value || value.length > maximum || value.includes("\0")) {
    fail(path, `expected trimmed text with at most ${maximum} characters`);
  }
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) fail(path, "expected non-negative integer");
  return value;
}

function digest(value: unknown, path: string): LayoutDigest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value)) fail(path, "expected sha256 digest");
  return value as LayoutDigest;
}

function nullableDigest(value: unknown, path: string): LayoutDigest | null {
  return value === null ? null : digest(value, path);
}

function stringArray(value: unknown, path: string, maximum: number, itemMaximum = 500): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(path, `expected array with at most ${maximum} entries`);
  const parsed = value.map((item, index) => text(item, `${path}[${index}]`, itemMaximum));
  if (new Set(parsed).size !== parsed.length) fail(path, "duplicate entry");
  return parsed;
}

export function parseCreatePendingEditorCommandSetRequestV1(
  input: unknown,
): CreatePendingEditorCommandSetRequestV1 {
  const row = exact(input, [
    "schemaVersion",
    "expectedWorkingCopyRowVersion",
    "expectedDocumentDigest",
    "selectionElementIds",
    "summary",
    "warnings",
    "commandBatch",
  ], "request");
  if (row.schemaVersion !== 1) fail("request.schemaVersion", "expected 1");
  return {
    schemaVersion: 1,
    expectedWorkingCopyRowVersion: integer(row.expectedWorkingCopyRowVersion, "request.expectedWorkingCopyRowVersion"),
    expectedDocumentDigest: digest(row.expectedDocumentDigest, "request.expectedDocumentDigest"),
    selectionElementIds: stringArray(row.selectionElementIds, "request.selectionElementIds", 500, 200),
    summary: text(row.summary, "request.summary", 2_000),
    warnings: stringArray(row.warnings, "request.warnings", 100, 1_000),
    commandBatch: parseEditorCommandBatchV1(row.commandBatch),
  };
}

export function parsePendingEditorCommandSetV1(input: unknown): PendingEditorCommandSetV1 {
  const row = exact(input, [
    "schemaVersion",
    "workingCopyId",
    "expectedRowVersion",
    "baseDocumentDigest",
    "sourceLockSetDigest",
    "selectionElementIds",
    "summary",
    "changedElementIds",
    "warnings",
    "commandBatch",
    "resultDocumentDigest",
  ], "pending");
  if (row.schemaVersion !== 1) fail("pending.schemaVersion", "expected 1");
  return {
    schemaVersion: 1,
    workingCopyId: id(row.workingCopyId, "pending.workingCopyId"),
    expectedRowVersion: integer(row.expectedRowVersion, "pending.expectedRowVersion"),
    baseDocumentDigest: digest(row.baseDocumentDigest, "pending.baseDocumentDigest"),
    sourceLockSetDigest: nullableDigest(row.sourceLockSetDigest, "pending.sourceLockSetDigest"),
    selectionElementIds: stringArray(row.selectionElementIds, "pending.selectionElementIds", 500, 200),
    summary: text(row.summary, "pending.summary", 2_000),
    changedElementIds: stringArray(row.changedElementIds, "pending.changedElementIds", 5_000, 200),
    warnings: stringArray(row.warnings, "pending.warnings", 100, 1_000),
    commandBatch: parseEditorCommandBatchV1(row.commandBatch),
    resultDocumentDigest: digest(row.resultDocumentDigest, "pending.resultDocumentDigest"),
  };
}

export function buildPendingEditorCommandSetV1(input: {
  workingCopyId: string;
  expectedRowVersion: number;
  baseDocumentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest | null;
  selectionElementIds: readonly string[];
  summary: string;
  warnings: readonly string[];
  commandBatch: EditorCommandBatchV1;
  document: LayoutDocumentV1;
}): BuiltPendingEditorCommandSetV1 {
  const encoded = LayoutDocumentCodecV1.encode(input.document);
  if (encoded.digest !== input.baseDocumentDigest) fail("input.baseDocumentDigest", "does not match document");
  const commandBatch = parseEditorCommandBatchV1(input.commandBatch);
  const result = applyLayoutCommandBatch(encoded.value, commandBatch);
  const resultDocument = LayoutDocumentCodecV1.encode(result.document);
  const payload = parsePendingEditorCommandSetV1({
    schemaVersion: 1,
    workingCopyId: input.workingCopyId,
    expectedRowVersion: input.expectedRowVersion,
    baseDocumentDigest: input.baseDocumentDigest,
    sourceLockSetDigest: input.sourceLockSetDigest,
    selectionElementIds: [...input.selectionElementIds],
    summary: input.summary,
    changedElementIds: result.changedElementIds,
    warnings: [...input.warnings],
    commandBatch,
    resultDocumentDigest: resultDocument.digest,
  });
  return { ...payload, resultDocument: resultDocument.value };
}

export function parsePendingEditorCommandSetV2(input: unknown): PendingEditorCommandSetV2 {
  const row = exact(input, [
    "schemaVersion",
    "workingCopyId",
    "expectedRowVersion",
    "baseDocumentDigest",
    "sourceLockSetDigest",
    "selectionElementIds",
    "summary",
    "changedElementIds",
    "warnings",
    "commandBatch",
    "resultDocumentDigest",
  ], "pending");
  if (row.schemaVersion !== 2) fail("pending.schemaVersion", "expected 2");
  return {
    schemaVersion: 2,
    workingCopyId: id(row.workingCopyId, "pending.workingCopyId"),
    expectedRowVersion: integer(row.expectedRowVersion, "pending.expectedRowVersion"),
    baseDocumentDigest: digest(row.baseDocumentDigest, "pending.baseDocumentDigest"),
    sourceLockSetDigest: nullableDigest(row.sourceLockSetDigest, "pending.sourceLockSetDigest"),
    selectionElementIds: stringArray(row.selectionElementIds, "pending.selectionElementIds", 500, 200),
    summary: text(row.summary, "pending.summary", 2_000),
    changedElementIds: stringArray(row.changedElementIds, "pending.changedElementIds", 5_000, 200),
    warnings: stringArray(row.warnings, "pending.warnings", 100, 1_000),
    commandBatch: parseEditorCommandBatchV2(row.commandBatch),
    resultDocumentDigest: digest(row.resultDocumentDigest, "pending.resultDocumentDigest"),
  };
}

export function buildPendingEditorCommandSetV2(input: {
  workingCopyId: string;
  expectedRowVersion: number;
  baseDocumentDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest | null;
  selectionElementIds: readonly string[];
  summary: string;
  warnings: readonly string[];
  commandBatch: EditorCommandBatchV2;
  document: LayoutDocumentV2;
}): BuiltPendingEditorCommandSetV2 {
  const encoded = LayoutDocumentCodecV2.encode(input.document);
  if (encoded.digest !== input.baseDocumentDigest) fail("input.baseDocumentDigest", "does not match document");
  const commandBatch = parseEditorCommandBatchV2(input.commandBatch);
  const result = applyLayoutCommandBatchV2(encoded.value, commandBatch);
  const resultDocument = LayoutDocumentCodecV2.encode(result.document);
  const payload = parsePendingEditorCommandSetV2({
    schemaVersion: 2,
    workingCopyId: input.workingCopyId,
    expectedRowVersion: input.expectedRowVersion,
    baseDocumentDigest: input.baseDocumentDigest,
    sourceLockSetDigest: input.sourceLockSetDigest,
    selectionElementIds: [...input.selectionElementIds],
    summary: input.summary,
    changedElementIds: result.changedElementIds,
    warnings: [...input.warnings],
    commandBatch,
    resultDocumentDigest: resultDocument.digest,
  });
  return { ...payload, resultDocument: resultDocument.value };
}
