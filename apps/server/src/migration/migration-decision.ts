import { digestCanonicalJson } from "@airoaming/shared";
import { ALLOWED_COMIC_FORMATS } from "./comic-format-migration.plugin.js";
import { parseComicFormatIssueDetail, type Digest, type ComicFormat, MigrationIssueCodecError } from "./migration-issue.js";

export interface MigrationDecisionEntry {
  issueKey: string;
  sourceKey: string;
  sourceDigest: Digest;
  action: "set_comic_format";
  chosenComicFormat: ComicFormat;
  layoutPresetIntent: "four_panel" | null;
}

export interface MigrationDecisionArtifact {
  schemaVersion: 1;
  kind: "airoaming_migration_decisions_v1";
  sourceManifestDigest: Digest;
  entries: MigrationDecisionEntry[];
  decisionsDigest: Digest;
}

export class MigrationDecisionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;
const ENTRY_KEYS = ["action", "chosenComicFormat", "issueKey", "layoutPresetIntent", "sourceDigest", "sourceKey"];

function assertDigest(value: unknown, code = "MIGRATION_SOURCE_DIGEST_INVALID"): asserts value is Digest {
  if (typeof value !== "string" || !DIGEST_RE.test(value)) throw new MigrationDecisionError(code);
}

function assertPlainObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MigrationDecisionError("MIGRATION_DECISION_INVALID");
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new MigrationDecisionError(code);
}

function entryFromUnknown(value: unknown): MigrationDecisionEntry {
  assertPlainObject(value);
  assertExactKeys(value, ENTRY_KEYS, "MIGRATION_DECISION_EXTRA_FIELD");
  if (typeof value.issueKey !== "string" || !value.issueKey.startsWith("project:") || typeof value.sourceKey !== "string" || !value.sourceKey.startsWith("workspace-v1:")) throw new MigrationDecisionError("MIGRATION_DECISION_INVALID");
  assertDigest(value.sourceDigest);
  if (value.action !== "set_comic_format" || !ALLOWED_COMIC_FORMATS.includes(value.chosenComicFormat as ComicFormat)) throw new MigrationDecisionError("MIGRATION_DECISION_INVALID");
  if (value.layoutPresetIntent !== null && value.layoutPresetIntent !== "four_panel") throw new MigrationDecisionError("MIGRATION_DECISION_INVALID");
  return value as unknown as MigrationDecisionEntry;
}

export function createMigrationDecisionArtifact(sourceManifestDigest: Digest, entries: readonly MigrationDecisionEntry[]): MigrationDecisionArtifact {
  assertDigest(sourceManifestDigest);
  const sorted = [...entries].sort((left, right) => left.issueKey.localeCompare(right.issueKey));
  const base = { schemaVersion: 1 as const, kind: "airoaming_migration_decisions_v1" as const, sourceManifestDigest, entries: sorted };
  return { ...base, decisionsDigest: digestCanonicalJson(base) };
}

export function normalizeMigrationDecisionArtifact(input: unknown, expectedSourceManifestDigest?: Digest): MigrationDecisionArtifact {
  assertPlainObject(input);
  assertExactKeys(input, ["decisionsDigest", "entries", "kind", "schemaVersion", "sourceManifestDigest"], "MIGRATION_DECISION_EXTRA_FIELD");
  if (input.schemaVersion !== 1 || input.kind !== "airoaming_migration_decisions_v1" || !Array.isArray(input.entries)) throw new MigrationDecisionError("MIGRATION_DECISION_INVALID");
  assertDigest(input.sourceManifestDigest);
  if (expectedSourceManifestDigest && input.sourceManifestDigest !== expectedSourceManifestDigest) throw new MigrationDecisionError("MIGRATION_SOURCE_DIGEST_MISMATCH");
  assertDigest(input.decisionsDigest, "MIGRATION_DECISIONS_DIGEST_INVALID");
  const entries = input.entries.map(entryFromUnknown);
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1].issueKey >= entries[index].issueKey) throw new MigrationDecisionError("MIGRATION_DECISION_ORDER_INVALID");
  }
  const base = { schemaVersion: 1 as const, kind: "airoaming_migration_decisions_v1" as const, sourceManifestDigest: input.sourceManifestDigest, entries };
  if (digestCanonicalJson(base) !== input.decisionsDigest) throw new MigrationDecisionError("MIGRATION_DECISIONS_DIGEST_MISMATCH");
  return { ...base, decisionsDigest: input.decisionsDigest } as MigrationDecisionArtifact;
}

export function assertDecisionMatchesIssue(entry: MigrationDecisionEntry, issueKey: string, issueDetailJson: string): void {
  if (entry.issueKey !== issueKey) throw new MigrationDecisionError("MIGRATION_DECISION_STALE");
  let detail;
  try { detail = parseComicFormatIssueDetail(issueDetailJson); } catch (error) {
    if (error instanceof MigrationIssueCodecError) throw new MigrationDecisionError(error.code);
    throw error;
  }
  const expectedSourceKey = `workspace-v1:${detail.projectId}:Project:${detail.projectId}`;
  if (entry.sourceKey !== expectedSourceKey || entry.sourceDigest !== detail.sourceDigest) throw new MigrationDecisionError("MIGRATION_DECISION_STALE");
  if (detail.layoutPresetIntent === "four_panel" && entry.layoutPresetIntent !== "four_panel") throw new MigrationDecisionError("MIGRATION_DECISION_INVALID");
  if (detail.layoutPresetIntent !== "four_panel" && entry.layoutPresetIntent === "four_panel") throw new MigrationDecisionError("MIGRATION_DECISION_INVALID");
}
