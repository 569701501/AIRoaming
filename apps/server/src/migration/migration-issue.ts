import { digestCanonicalJson } from "@airoaming/shared";
import type { ComicFormatIssueCode, ComicFormatMapping } from "./comic-format-migration.plugin.js";
import { ALLOWED_COMIC_FORMATS } from "./comic-format-migration.plugin.js";

export type MigrationIssueSeverity = "blocker";
export type MigrationIssueResolutionStatus = "open" | "resolved" | "not_needed";
export type MigrationIssueEntityType = "Project";
export type ComicFormatDecisionAction = "set_comic_format";
export type ComicFormat = (typeof ALLOWED_COMIC_FORMATS)[number];
export type Digest = `sha256:${string}`;

export interface ComicFormatIssueDetail {
  schemaVersion: 1;
  projectId: string;
  sourceStorageKey: string;
  originalValueKind: string;
  originalValuePreview: string;
  sourceDigest: Digest;
  layoutPresetIntent: "four_panel" | null;
  allowedComicFormats: readonly ComicFormat[];
}

export interface ComicFormatResolution {
  decisionSchemaVersion: 1;
  action: ComicFormatDecisionAction;
  chosenComicFormat: ComicFormat;
  layoutPresetIntent: "four_panel" | null;
}

export interface MigrationIssueRecord {
  runId: string;
  issueKey: string;
  severity: MigrationIssueSeverity;
  code: ComicFormatIssueCode;
  entityType: MigrationIssueEntityType;
  detailJson: string;
  detailSchemaVersion: 1;
  resolutionStatus: MigrationIssueResolutionStatus;
  resolutionJson: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ComicFormatIssueInput {
  runId: string;
  projectId: string;
  sourceStorageKey: string;
  sourceDigest: Digest;
  mapping: ComicFormatMapping;
  createdAt: string;
}

export class MigrationIssueCodecError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const STORAGE_KEY_RE = /^[^/\\\0.][^\\\0]*(?:\/[^/\\\0.][^\\\0]*)*$/;

function assertDigest(value: string): asserts value is Digest {
  if (!DIGEST_RE.test(value)) throw new MigrationIssueCodecError("MIGRATION_SOURCE_DIGEST_INVALID");
}

function assertStorageKey(value: string): void {
  if (!STORAGE_KEY_RE.test(value) || value.split("/").some((segment) => segment === ".." || segment === "." || segment === "")) {
    throw new MigrationIssueCodecError("MIGRATION_STORAGE_KEY_INVALID");
  }
}

function canonicalJson(value: unknown): string {
  try { return JSON.stringify(value, null, 0); } catch { throw new MigrationIssueCodecError("MIGRATION_ISSUE_CODEC_INVALID"); }
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) throw new MigrationIssueCodecError(code);
}

function validateResolution(value: unknown, detail: ComicFormatIssueDetail): asserts value is ComicFormatResolution {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MigrationIssueCodecError("MIGRATION_DECISION_INVALID");
  const resolution = value as Record<string, unknown>;
  assertExactKeys(resolution, ["action", "chosenComicFormat", "decisionSchemaVersion", "layoutPresetIntent"], "MIGRATION_DECISION_EXTRA_FIELD");
  if (resolution.decisionSchemaVersion !== 1 || resolution.action !== "set_comic_format" || !ALLOWED_COMIC_FORMATS.includes(resolution.chosenComicFormat as ComicFormat)) {
    throw new MigrationIssueCodecError("MIGRATION_DECISION_INVALID");
  }
  if (resolution.layoutPresetIntent !== null && resolution.layoutPresetIntent !== "four_panel") throw new MigrationIssueCodecError("MIGRATION_DECISION_INVALID");
  if (detail.layoutPresetIntent === "four_panel" && resolution.layoutPresetIntent !== "four_panel") throw new MigrationIssueCodecError("MIGRATION_DECISION_INVALID");
  if (detail.layoutPresetIntent !== "four_panel" && resolution.layoutPresetIntent === "four_panel") throw new MigrationIssueCodecError("MIGRATION_DECISION_INVALID");
}

export function buildComicFormatIssue(input: ComicFormatIssueInput): MigrationIssueRecord | null {
  if (input.mapping.mappingKind !== "decision_required" || !input.mapping.issueCode) return null;
  if (!input.runId || !input.projectId || !input.createdAt) throw new MigrationIssueCodecError("MIGRATION_ISSUE_CODEC_INVALID");
  assertStorageKey(input.sourceStorageKey);
  assertDigest(input.sourceDigest);
  const detail: ComicFormatIssueDetail = {
    schemaVersion: 1,
    projectId: input.projectId,
    sourceStorageKey: input.sourceStorageKey,
    originalValueKind: input.mapping.originalValueKind,
    originalValuePreview: input.mapping.originalValuePreview,
    sourceDigest: input.sourceDigest,
    layoutPresetIntent: input.mapping.layoutPresetIntent,
    allowedComicFormats: ALLOWED_COMIC_FORMATS,
  };
  return {
    runId: input.runId,
    issueKey: `project:${input.projectId}:comic-format`,
    severity: "blocker",
    code: input.mapping.issueCode,
    entityType: "Project",
    detailJson: canonicalJson(detail),
    detailSchemaVersion: 1,
    resolutionStatus: "open",
    resolutionJson: null,
    createdAt: input.createdAt,
    resolvedAt: null,
  };
}

export function resolveComicFormatIssue(issue: MigrationIssueRecord, resolution: ComicFormatResolution, resolvedAt: string): MigrationIssueRecord {
  if (issue.resolutionStatus !== "open") throw new MigrationIssueCodecError("MIGRATION_ISSUE_NOT_OPEN");
  const detail = parseComicFormatIssueDetail(issue.detailJson);
  validateResolution(resolution, detail);
  return {
    ...issue,
    resolutionStatus: "resolved",
    resolutionJson: canonicalJson(resolution),
    resolvedAt,
  };
}

export function parseComicFormatIssueDetail(raw: string): ComicFormatIssueDetail {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new MigrationIssueCodecError("MIGRATION_ISSUE_DETAIL_INVALID"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MigrationIssueCodecError("MIGRATION_ISSUE_DETAIL_INVALID");
  const detail = value as Partial<ComicFormatIssueDetail>;
  assertExactKeys(value as Record<string, unknown>, ["allowedComicFormats", "layoutPresetIntent", "originalValueKind", "originalValuePreview", "projectId", "schemaVersion", "sourceDigest", "sourceStorageKey"], "MIGRATION_ISSUE_DETAIL_EXTRA_FIELD");
  if (detail.schemaVersion !== 1 || typeof detail.projectId !== "string" || typeof detail.sourceStorageKey !== "string" || typeof detail.originalValueKind !== "string" || typeof detail.originalValuePreview !== "string" || typeof detail.sourceDigest !== "string" || !Array.isArray(detail.allowedComicFormats)) {
    throw new MigrationIssueCodecError("MIGRATION_ISSUE_DETAIL_INVALID");
  }
  assertStorageKey(detail.sourceStorageKey);
  assertDigest(detail.sourceDigest);
  if (detail.layoutPresetIntent !== null && detail.layoutPresetIntent !== "four_panel") throw new MigrationIssueCodecError("MIGRATION_ISSUE_DETAIL_INVALID");
  if (detail.allowedComicFormats.length !== ALLOWED_COMIC_FORMATS.length || detail.allowedComicFormats.some((item, index) => item !== ALLOWED_COMIC_FORMATS[index])) throw new MigrationIssueCodecError("MIGRATION_ISSUE_DETAIL_INVALID");
  return detail as ComicFormatIssueDetail;
}

export function parseComicFormatResolution(raw: string, detail: ComicFormatIssueDetail): ComicFormatResolution {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new MigrationIssueCodecError("MIGRATION_DECISION_INVALID"); }
  validateResolution(value, detail);
  return value;
}

export function issueDetailDigest(issue: MigrationIssueRecord): Digest {
  return digestCanonicalJson(parseComicFormatIssueDetail(issue.detailJson));
}
