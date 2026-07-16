import type {
  ImportAnalysisOutputV1,
  ScriptOutlineChapterCardV1,
  ScriptSourceBlockRefV1,
  ScriptSourceRangeV1,
} from "./script-workflow-contract.js";
import {
  canonicalizeJson,
  digestCanonicalJson,
  sha256Text,
  type JsonValue,
} from "./versioning/canonical-json.js";

export const SCRIPT_RAW_SOURCE_SNAPSHOT_SCHEMA_VERSION = "script-raw-source/1.0" as const;
export const SCRIPT_CHAPTER_MAP_SCHEMA_VERSION = "script-chapter-map/1.0" as const;
export const SCRIPT_PENDING_SOURCE_SCHEMA_VERSION = "script-pending-sources/1.0" as const;
export const SCRIPT_RAW_SOURCE_BLOCK_CHAR_LIMIT = 12_000;

export type ScriptRawSourceInputModeV1 = "upload" | "paste" | "mixed";
export type ScriptRawSourceContentTypeHintV1 = "script" | "story_prose" | "scene_draft" | "mixed" | "unknown";
export type ScriptSourceBlockKindV1 = "narrative" | "title" | "non_story";

export interface ScriptRawSourceDocumentInputV1 {
  sourceRef?: string;
  name: string;
  mediaType: string;
  sourceText: string;
}

export interface ScriptRawSourceBlockV1 extends ScriptSourceBlockRefV1 {
  sourceOrder: number;
  locatorLabel: string;
  kind: ScriptSourceBlockKindV1;
  sourceText: string;
  sourceDigest: `sha256:${string}`;
}

export interface ScriptRawSourceDocumentV1 {
  sourceRef: string;
  order: number;
  name: string;
  mediaType: string;
  sourceText: string;
  sourceDigest: `sha256:${string}`;
  blocks: ScriptRawSourceBlockV1[];
}

export interface ScriptRawSourceSnapshotV1 {
  schemaVersion: typeof SCRIPT_RAW_SOURCE_SNAPSHOT_SCHEMA_VERSION;
  inputMode: ScriptRawSourceInputModeV1;
  contentTypeHint: ScriptRawSourceContentTypeHintV1;
  documents: ScriptRawSourceDocumentV1[];
  sourceDigest: `sha256:${string}`;
}

export class ScriptWorkflowStateError extends Error {
  readonly code = "SCRIPT_WORKFLOW_STATE_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "ScriptWorkflowStateError";
  }
}

function invalid(path: string, message: string): never {
  throw new ScriptWorkflowStateError(`${path}: ${message}`);
}

function normalizeText(value: string, path: string): string {
  if (typeof value !== "string") invalid(path, "expected string");
  const normalized = value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) invalid(path, "must be non-empty");
  return normalized + "\n";
}

function nonEmpty(value: string, path: string): string {
  if (typeof value !== "string" || !value.trim()) invalid(path, "must be non-empty");
  return value.trim();
}

function sourceRef(value: string | undefined, order: number): string {
  const result = value?.trim() || `source-${String(order).padStart(3, "0")}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(result)) {
    invalid(`documents[${order - 1}].sourceRef`, "invalid stable sourceRef");
  }
  return result;
}

function blockKind(text: string): ScriptSourceBlockKindV1 {
  const line = text.trim();
  if (/^#{1,6}\s+\S/.test(line) || /^(?:第[一二三四五六七八九十百千万零〇两\d]+[章节回幕卷集]|序章|楔子|尾声|后记)(?:\s|[:：]|$)/.test(line)) {
    return "title";
  }
  return "narrative";
}

function splitLongBlock(source: string): string[] {
  const chunks: string[] = [];
  let cursor = 0;
  while (source.length - cursor > SCRIPT_RAW_SOURCE_BLOCK_CHAR_LIMIT) {
    const hardEnd = cursor + SCRIPT_RAW_SOURCE_BLOCK_CHAR_LIMIT;
    const preferredEnd = source.lastIndexOf("\n", hardEnd);
    let end = preferredEnd > cursor + Math.floor(SCRIPT_RAW_SOURCE_BLOCK_CHAR_LIMIT / 2)
      ? preferredEnd
      : hardEnd;
    const previous = source.charCodeAt(end - 1);
    const next = source.charCodeAt(end);
    if (previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) {
      end -= 1;
    }
    chunks.push(source.slice(cursor, end).trim());
    cursor = end;
  }
  const tail = source.slice(cursor).trim();
  if (tail) chunks.push(tail);
  return chunks;
}

function splitBlocks(sourceText: string): string[] {
  return sourceText
    .trimEnd()
    .split(/\n[\t ]*\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap(splitLongBlock);
}

export function buildScriptRawSourceSnapshotV1(input: {
  inputMode: ScriptRawSourceInputModeV1;
  contentTypeHint?: ScriptRawSourceContentTypeHintV1;
  documents: readonly ScriptRawSourceDocumentInputV1[];
}): ScriptRawSourceSnapshotV1 {
  if (!["upload", "paste", "mixed"].includes(input.inputMode)) invalid("inputMode", "unsupported value");
  const contentTypeHint = input.contentTypeHint ?? "unknown";
  if (!["script", "story_prose", "scene_draft", "mixed", "unknown"].includes(contentTypeHint)) invalid("contentTypeHint", "unsupported value");
  if (!Array.isArray(input.documents) || input.documents.length === 0) invalid("documents", "expected at least one document");
  const refs = new Set<string>();
  let globalOrder = 0;
  const documents = input.documents.map((item, index): ScriptRawSourceDocumentV1 => {
    const order = index + 1;
    const stableRef = sourceRef(item.sourceRef, order);
    if (refs.has(stableRef)) invalid(`documents[${index}].sourceRef`, "duplicate sourceRef");
    refs.add(stableRef);
    const sourceText = normalizeText(item.sourceText, `documents[${index}].sourceText`);
    const blocks = splitBlocks(sourceText).map((text, blockIndex): ScriptRawSourceBlockV1 => {
      globalOrder += 1;
      const sourceOrder = blockIndex + 1;
      return {
        sourceRef: stableRef,
        blockRef: `${stableRef}:block-${String(sourceOrder).padStart(6, "0")}`,
        globalOrder,
        sourceOrder,
        locatorLabel: `${item.name.trim() || stableRef} · 第 ${sourceOrder} 段`,
        kind: blockKind(text),
        sourceText: text,
        sourceDigest: sha256Text(text),
      };
    });
    if (blocks.length === 0) invalid(`documents[${index}].sourceText`, "must contain at least one block");
    return {
      sourceRef: stableRef,
      order,
      name: nonEmpty(item.name, `documents[${index}].name`),
      mediaType: nonEmpty(item.mediaType, `documents[${index}].mediaType`),
      sourceText,
      sourceDigest: sha256Text(sourceText),
      blocks,
    };
  });
  const identity = {
    schemaVersion: SCRIPT_RAW_SOURCE_SNAPSHOT_SCHEMA_VERSION,
    inputMode: input.inputMode,
    contentTypeHint,
    documents: documents.map((document) => ({
      sourceRef: document.sourceRef,
      order: document.order,
      name: document.name,
      mediaType: document.mediaType,
      sourceDigest: document.sourceDigest,
      blocks: document.blocks.map((block) => ({
        blockRef: block.blockRef,
        globalOrder: block.globalOrder,
        sourceOrder: block.sourceOrder,
        kind: block.kind,
        sourceDigest: block.sourceDigest,
      })),
    })),
  };
  return { ...identity, documents, sourceDigest: digestCanonicalJson(identity) };
}

export function scriptSourceBlockCatalogV1(snapshot: ScriptRawSourceSnapshotV1): ScriptSourceBlockRefV1[] {
  return snapshot.documents.flatMap((document) => document.blocks.map((block) => ({
    sourceRef: block.sourceRef,
    blockRef: block.blockRef,
    globalOrder: block.globalOrder,
    kind: block.kind,
  })));
}

export interface ConfirmedScriptChapterMapItemV1 {
  mapItemRef: string;
  order: number;
  title: string;
  titleBasis: "source" | "suggested";
  summary: string;
  sourceRanges: ScriptSourceRangeV1[];
  boundaryMode: ImportAnalysisOutputV1["chapterCandidates"][number]["boundaryMode"];
  boundaryEvidence: ImportAnalysisOutputV1["chapterCandidates"][number]["boundaryEvidence"];
  confidence: ImportAnalysisOutputV1["chapterCandidates"][number]["confidence"];
  warnings: string[];
  sourceRangeDigest: `sha256:${string}`;
}

export interface ConfirmedScriptChapterMapV1 {
  schemaVersion: typeof SCRIPT_CHAPTER_MAP_SCHEMA_VERSION;
  rawSourceDigest: `sha256:${string}`;
  analysisDigest: `sha256:${string}`;
  chapters: ConfirmedScriptChapterMapItemV1[];
  excludedRanges: ImportAnalysisOutputV1["excludedRanges"];
  mapDigest: `sha256:${string}`;
}

export function scriptSourceRangesDigestV1(ranges: readonly ScriptSourceRangeV1[]): `sha256:${string}` {
  if (ranges.length === 0) invalid("sourceRanges", "expected at least one range");
  return digestCanonicalJson(ranges);
}

export function buildConfirmedScriptChapterMapV1(input: {
  rawSourceDigest: `sha256:${string}`;
  analysis: ImportAnalysisOutputV1;
}): ConfirmedScriptChapterMapV1 {
  if (!/^sha256:[0-9a-f]{64}$/.test(input.rawSourceDigest)) invalid("rawSourceDigest", "invalid digest");
  if (input.analysis.unresolvedItems.some((item) => ["source_scope", "source_order", "boundary"].includes(item.impact))) {
    invalid("analysis.unresolvedItems", "blocking source or boundary issue remains");
  }
  const chapters = input.analysis.chapterCandidates.map((candidate): ConfirmedScriptChapterMapItemV1 => ({
    mapItemRef: candidate.localRef,
    order: candidate.order,
    title: candidate.title.value,
    titleBasis: candidate.title.basis,
    summary: candidate.summary,
    sourceRanges: candidate.sourceRanges,
    boundaryMode: candidate.boundaryMode,
    boundaryEvidence: candidate.boundaryEvidence,
    confidence: candidate.confidence,
    warnings: candidate.warnings,
    sourceRangeDigest: scriptSourceRangesDigestV1(candidate.sourceRanges),
  }));
  const base = {
    schemaVersion: SCRIPT_CHAPTER_MAP_SCHEMA_VERSION,
    rawSourceDigest: input.rawSourceDigest,
    analysisDigest: digestCanonicalJson(input.analysis),
    chapters,
    excludedRanges: input.analysis.excludedRanges,
  };
  return { ...base, mapDigest: digestCanonicalJson(base) };
}

export type ScriptPendingKindV1 = "legacy" | "ai" | "import";
export type ScriptPendingSourcePolicyV1 = "ai-chapter-generate/1.0" | "import-chapter-materialize/1.0";
export type ScriptPendingSourceTypeV1 =
  | "project_script_outline"
  | "project_script_outline_card"
  | "chapter_script_version"
  | "script_raw_source_version"
  | "script_import_analysis_candidate"
  | "script_chapter_map"
  | "script_chapter_map_item"
  | "script_import_batch_item"
  | "script_import_fidelity_report";

export interface ScriptPendingSourceBindingV1 {
  role: string;
  order: number;
  sourceType: ScriptPendingSourceTypeV1;
  sourceId: string;
  sourceDigest: `sha256:${string}`;
}

export interface ScriptPendingSourceProjectionV1 {
  schemaVersion: typeof SCRIPT_PENDING_SOURCE_SCHEMA_VERSION;
  kind: Exclude<ScriptPendingKindV1, "legacy">;
  policyVersion: ScriptPendingSourcePolicyV1;
  bindings: ScriptPendingSourceBindingV1[];
}

const AI_SOURCES = [
  ["outline", "project_script_outline"],
  ["chapter_card", "project_script_outline_card"],
] as const;
const IMPORT_SOURCES = [
  ["raw_source", "script_raw_source_version"],
  ["analysis", "script_import_analysis_candidate"],
  ["chapter_map", "script_chapter_map"],
  ["map_item", "script_chapter_map_item"],
  ["batch_item", "script_import_batch_item"],
  ["fidelity_report", "script_import_fidelity_report"],
] as const;

function validateBinding(binding: ScriptPendingSourceBindingV1, path: string): void {
  nonEmpty(binding.role, `${path}.role`);
  nonEmpty(binding.sourceId, `${path}.sourceId`);
  if (!Number.isInteger(binding.order) || binding.order < 1) invalid(`${path}.order`, "expected positive integer");
  if (!/^sha256:[0-9a-f]{64}$/.test(binding.sourceDigest)) invalid(`${path}.sourceDigest`, "invalid digest");
}

export function buildScriptPendingSourceProjectionV1(input: {
  kind: "ai" | "import";
  policyVersion: ScriptPendingSourcePolicyV1;
  bindings: readonly ScriptPendingSourceBindingV1[];
}): { projection: ScriptPendingSourceProjectionV1; canonicalJson: string; sourceSetDigest: `sha256:${string}` } {
  const bindings = [...input.bindings].sort((left, right) => left.order - right.order || left.role.localeCompare(right.role));
  bindings.forEach((binding, index) => validateBinding(binding, `bindings[${index}]`));
  if (new Set(bindings.map((item) => item.order)).size !== bindings.length) invalid("bindings", "duplicate order");
  if (new Set(bindings.map((item) => `${item.role}\u0000${item.sourceType}\u0000${item.sourceId}`)).size !== bindings.length) invalid("bindings", "duplicate source binding");
  const required = input.kind === "ai" ? AI_SOURCES : IMPORT_SOURCES;
  if (input.kind === "ai" && input.policyVersion !== "ai-chapter-generate/1.0") invalid("policyVersion", "does not match kind");
  if (input.kind === "import" && input.policyVersion !== "import-chapter-materialize/1.0") invalid("policyVersion", "does not match kind");
  required.forEach(([role, type]) => {
    if (bindings.filter((item) => item.role === role && item.sourceType === type).length !== 1) invalid("bindings", `expected exactly one ${role}/${type}`);
  });
  const optionalAi = bindings.filter((item) => item.role === "previous_script" && item.sourceType === "chapter_script_version");
  if (input.kind === "ai" && optionalAi.length > 1) invalid("bindings", "expected at most one previous_script");
  const allowed = new Set<string>([
    ...required.map(([role, type]) => `${role}\u0000${type}`),
    ...(input.kind === "ai" ? [["previous_script", "chapter_script_version"].join("\u0000")] : []),
  ]);
  bindings.forEach((binding) => {
    if (!allowed.has(`${binding.role}\u0000${binding.sourceType}`)) invalid("bindings", `source ${binding.role}/${binding.sourceType} is not allowed by policy`);
  });
  if (bindings.some((binding, index) => binding.order !== index + 1)) invalid("bindings", "order must be contiguous from 1");
  const projection: ScriptPendingSourceProjectionV1 = {
    schemaVersion: SCRIPT_PENDING_SOURCE_SCHEMA_VERSION,
    kind: input.kind,
    policyVersion: input.policyVersion,
    bindings,
  };
  return {
    projection,
    canonicalJson: canonicalizeJson(projection as unknown as JsonValue),
    sourceSetDigest: digestCanonicalJson(projection),
  };
}

export function scriptOutlineCardDigestV1(card: ScriptOutlineChapterCardV1): `sha256:${string}` {
  return digestCanonicalJson(card);
}
