import {
  canonicalJsonBytes,
  canonicalizeJson,
  parseStrictJson,
  sha256Bytes,
} from "../versioning/canonical-json.js";
import {
  LAYOUT_DOCUMENT_MAX_BYTES,
  LayoutDocumentCodecV1,
  LayoutDocumentValidationError,
  type LayoutDocumentValidationContextV1,
} from "./codec.js";
import type {
  BalloonElementV1,
  LayoutDigest,
  LayoutDocumentV1,
  LayoutTopLevelElementV1,
} from "./document.js";
import { normalizePlainLayoutText } from "./text.js";

export interface LayoutDocumentV2 extends Omit<LayoutDocumentV1, "schemaVersion" | "kind"> {
  schemaVersion: 2;
  kind: "layout_document_v2";
  automation: LayoutAutomationStateV1;
}

export interface LayoutCompositionMetadataV1 {
  compositionDigest: LayoutDigest;
  compositionPolicyVersion: "layout_composition_v1";
  storyboardVersionId: string;
  storyboardDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest;
  visualAnalysisSetDigest: LayoutDigest | null;
  mode: "vision" | "rule_fallback";
}

export interface LayoutAutomationStateV1 {
  policyVersion: "layout_automation_v1";
  composition: LayoutCompositionMetadataV1 | null;
  dialogueBindings: LayoutDialogueBindingV1[];
  protections: LayoutProtectionEntryV1[];
}

export interface LayoutDialogueBindingV1 {
  dialogueItemId: string;
  sourceShotId: string;
  sourceTextDigest: LayoutDigest;
  initialTextDigest: LayoutDigest;
  elementId: string | null;
  disposition: "placed" | "user_suppressed";
}

export const LAYOUT_PROTECTION_SCOPES_V1 = [
  "existence",
  "geometry",
  "crop",
  "text",
  "style",
  "tail",
  "source",
  "reading_order",
] as const;

export type LayoutProtectionScopeV1 = (typeof LAYOUT_PROTECTION_SCOPES_V1)[number];
export type LayoutProtectionTargetKindV1 = "canvas" | "element" | "panel_image";
export type LayoutProtectionReasonV1 = "user_edit" | "explicit_preserve";

export interface LayoutProtectionEntryV1 {
  targetKind: LayoutProtectionTargetKindV1;
  targetId: string;
  scopes: LayoutProtectionScopeV1[];
  reason: LayoutProtectionReasonV1;
}

export interface EncodedLayoutDocumentV2 {
  schemaVersion: 2;
  value: LayoutDocumentV2;
  canonical: string;
  canonicalBytes: Uint8Array;
  digest: LayoutDigest;
}

export interface LayoutCompositionDigestInputV1 {
  compositionPolicyVersion: "layout_composition_v1";
  storyboardVersionId: string;
  storyboardDigest: LayoutDigest;
  sourceLockSetDigest: LayoutDigest;
  visualAnalysisSetDigest: LayoutDigest | null;
  mode: "vision" | "rule_fallback";
  planDigest: LayoutDigest;
  initialVisibleDocumentDigest: LayoutDigest;
  initialDialogueBindingsDigest: LayoutDigest;
}

export const LAYOUT_AUTOMATION_MAX_DIALOGUE_BINDINGS = 20_000;
export const LAYOUT_AUTOMATION_MAX_PROTECTIONS = 20_000;

const TARGET_KIND_ORDER: Readonly<Record<LayoutProtectionTargetKindV1, number>> = {
  canvas: 0,
  element: 1,
  panel_image: 2,
};

const REASON_ORDER: Readonly<Record<LayoutProtectionReasonV1, number>> = {
  explicit_preserve: 0,
  user_edit: 1,
};

const SCOPE_ORDER = new Map<LayoutProtectionScopeV1, number>(
  LAYOUT_PROTECTION_SCOPES_V1.map((scope, index) => [scope, index]),
);

function invalid(path: string, message: string): never {
  throw new LayoutDocumentValidationError(`${path}: ${message}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(path, "expected a plain object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(path, "expected a plain object");
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  const row = object(value, path);
  const expected = new Set(keys);
  for (const key of Object.keys(row)) if (!expected.has(key)) invalid(`${path}.${key}`, "unknown field");
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) invalid(`${path}.${key}`, "missing required field");
  }
  return row;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, "expected array");
  return value;
}

function normalizedText(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== "string") invalid(path, "expected string");
  let normalized: string;
  try {
    normalized = normalizePlainLayoutText(value);
  } catch (error) {
    invalid(path, error instanceof Error ? error.message : "invalid text");
  }
  if (!allowEmpty && normalized.trim() === "") invalid(path, "must be non-empty");
  return normalized;
}

function id(value: unknown, path: string): string {
  const normalized = normalizedText(value, path).trim();
  if (normalized.includes("\n")) invalid(path, "id must not contain a line break");
  return normalized;
}

function digest(value: unknown, path: string): LayoutDigest {
  const normalized = normalizedText(value, path);
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    invalid(path, "expected sha256:<64 lowercase hex>");
  }
  return normalized as LayoutDigest;
}

function enumeration<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    invalid(path, `expected one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function inputValue(input: unknown): unknown {
  if (typeof input !== "string") return input;
  if (new TextEncoder().encode(input).length > LAYOUT_DOCUMENT_MAX_BYTES) {
    throw new LayoutDocumentValidationError(
      `document: canonical bytes exceed ${LAYOUT_DOCUMENT_MAX_BYTES}`,
      "LAYOUT_DOCUMENT_TOO_LARGE",
    );
  }
  try {
    return parseStrictJson(input);
  } catch (error) {
    invalid("document", error instanceof Error ? error.message : "invalid JSON");
  }
}

function visibleInput(row: Record<string, unknown>): LayoutDocumentV1 {
  return {
    schemaVersion: 1,
    kind: "layout_document_v1",
    projectId: row.projectId as string,
    chapterId: row.chapterId as string,
    comicFormat: row.comicFormat as LayoutDocumentV1["comicFormat"],
    profile: row.profile as LayoutDocumentV1["profile"],
    fontPolicy: row.fontPolicy as LayoutDocumentV1["fontPolicy"],
    canvases: row.canvases as LayoutDocumentV1["canvases"],
  };
}

interface LocatedProtectionTargetV1 {
  targetKind: LayoutProtectionTargetKindV1;
  targetId: string;
  element: LayoutTopLevelElementV1 | null;
}

function protectionTargetKey(targetKind: LayoutProtectionTargetKindV1, targetId: string): string {
  return `${targetKind}\u0000${targetId}`;
}

function buildProtectionTargetIndex(document: LayoutDocumentV1): Map<string, LocatedProtectionTargetV1> {
  const result = new Map<string, LocatedProtectionTargetV1>();
  for (const canvas of document.canvases) {
    result.set(protectionTargetKey("canvas", canvas.id), {
      targetKind: "canvas",
      targetId: canvas.id,
      element: null,
    });
    for (const element of canvas.elements) {
      result.set(protectionTargetKey("element", element.id), {
        targetKind: "element",
        targetId: element.id,
        element,
      });
      if (element.type === "panel_frame" && element.contentImage) {
        result.set(protectionTargetKey("panel_image", element.contentImage.id), {
          targetKind: "panel_image",
          targetId: element.contentImage.id,
          element,
        });
      }
    }
  }
  return result;
}

function locateProtectionTarget(
  document: LayoutDocumentV1,
  targetKind: LayoutProtectionTargetKindV1,
  targetId: string,
  path: string,
): LocatedProtectionTargetV1 {
  const target = buildProtectionTargetIndex(document).get(protectionTargetKey(targetKind, targetId));
  if (!target) invalid(path, `${targetKind} ${targetId} is missing`);
  return target;
}

function applicableScopes(target: LocatedProtectionTargetV1): readonly LayoutProtectionScopeV1[] {
  if (target.targetKind === "canvas") return ["existence", "geometry", "style", "reading_order"];
  if (target.targetKind === "panel_image") return ["existence", "crop", "source"];
  if (target.element?.type === "panel_frame") return ["existence", "geometry", "style", "reading_order"];
  if (target.element?.type === "free_image") return ["existence", "geometry", "crop", "source", "reading_order"];
  if (target.element?.type === "text") return ["existence", "geometry", "text", "style", "reading_order"];
  if (target.element?.type === "balloon") {
    return ["existence", "geometry", "text", "style", "tail", "source", "reading_order"];
  }
  return invalid("automation.protections", "unsupported protection target");
}

export function getApplicableLayoutProtectionScopesV1(
  documentInput: LayoutDocumentV1,
  targetKind: LayoutProtectionTargetKindV1,
  targetId: string,
): LayoutProtectionScopeV1[] {
  const document = LayoutDocumentCodecV1.parseAndNormalize(documentInput);
  return [...applicableScopes(locateProtectionTarget(document, targetKind, targetId, "protection.targetId"))];
}

function parseComposition(value: unknown, path: string): LayoutCompositionMetadataV1 | null {
  if (value === null) return null;
  const row = exact(value, [
    "compositionDigest",
    "compositionPolicyVersion",
    "storyboardVersionId",
    "storyboardDigest",
    "sourceLockSetDigest",
    "visualAnalysisSetDigest",
    "mode",
  ], path);
  if (row.compositionPolicyVersion !== "layout_composition_v1") {
    invalid(`${path}.compositionPolicyVersion`, "expected layout_composition_v1");
  }
  return {
    compositionDigest: digest(row.compositionDigest, `${path}.compositionDigest`),
    compositionPolicyVersion: "layout_composition_v1",
    storyboardVersionId: id(row.storyboardVersionId, `${path}.storyboardVersionId`),
    storyboardDigest: digest(row.storyboardDigest, `${path}.storyboardDigest`),
    sourceLockSetDigest: digest(row.sourceLockSetDigest, `${path}.sourceLockSetDigest`),
    visualAnalysisSetDigest: row.visualAnalysisSetDigest === null
      ? null
      : digest(row.visualAnalysisSetDigest, `${path}.visualAnalysisSetDigest`),
    mode: enumeration(row.mode, ["vision", "rule_fallback"] as const, `${path}.mode`),
  };
}

function balloonById(document: LayoutDocumentV1): Map<string, BalloonElementV1> {
  const result = new Map<string, BalloonElementV1>();
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) if (element.type === "balloon") result.set(element.id, element);
  }
  return result;
}

function parseDialogueBindings(
  value: unknown,
  document: LayoutDocumentV1,
  path: string,
): LayoutDialogueBindingV1[] {
  const values = array(value, path);
  if (values.length > LAYOUT_AUTOMATION_MAX_DIALOGUE_BINDINGS) {
    invalid(path, `must contain at most ${LAYOUT_AUTOMATION_MAX_DIALOGUE_BINDINGS}`);
  }
  const balloons = balloonById(document);
  const dialogueItemIds = new Set<string>();
  const elementIds = new Set<string>();
  const bindings = values.map((valueItem, index): LayoutDialogueBindingV1 => {
    const itemPath = `${path}[${index}]`;
    const row = exact(valueItem, [
      "dialogueItemId",
      "sourceShotId",
      "sourceTextDigest",
      "initialTextDigest",
      "elementId",
      "disposition",
    ], itemPath);
    const dialogueItemId = id(row.dialogueItemId, `${itemPath}.dialogueItemId`);
    if (dialogueItemIds.has(dialogueItemId)) invalid(`${itemPath}.dialogueItemId`, `duplicate id ${dialogueItemId}`);
    dialogueItemIds.add(dialogueItemId);
    const sourceShotId = id(row.sourceShotId, `${itemPath}.sourceShotId`);
    const elementId = row.elementId === null ? null : id(row.elementId, `${itemPath}.elementId`);
    const disposition = enumeration(row.disposition, ["placed", "user_suppressed"] as const, `${itemPath}.disposition`);
    if (disposition === "placed" && elementId === null) invalid(`${itemPath}.elementId`, "placed binding requires a balloon element");
    if (elementId !== null) {
      if (elementIds.has(elementId)) invalid(`${itemPath}.elementId`, `balloon ${elementId} is bound more than once`);
      elementIds.add(elementId);
      const balloon = balloons.get(elementId);
      if (!balloon) invalid(`${itemPath}.elementId`, `balloon ${elementId} is missing`);
      if (balloon.sourceShotId !== sourceShotId) invalid(`${itemPath}.sourceShotId`, "must match the balloon sourceShotId");
      if (disposition === "placed" && balloon.hidden) invalid(`${itemPath}.elementId`, "placed balloon must be visible");
      if (disposition === "user_suppressed" && !balloon.hidden) invalid(`${itemPath}.elementId`, "suppressed balloon must be hidden");
    }
    return {
      dialogueItemId,
      sourceShotId,
      sourceTextDigest: digest(row.sourceTextDigest, `${itemPath}.sourceTextDigest`),
      initialTextDigest: digest(row.initialTextDigest, `${itemPath}.initialTextDigest`),
      elementId,
      disposition,
    };
  });
  return bindings.sort((left, right) => compareText(left.dialogueItemId, right.dialogueItemId));
}

function parseProtectionScopes(
  value: unknown,
  allowed: readonly LayoutProtectionScopeV1[],
  path: string,
): LayoutProtectionScopeV1[] {
  const values = array(value, path);
  if (values.length < 1) invalid(path, "requires at least one scope");
  const seen = new Set<LayoutProtectionScopeV1>();
  const scopes = values.map((valueItem, index) => {
    const scope = enumeration(valueItem, LAYOUT_PROTECTION_SCOPES_V1, `${path}[${index}]`);
    if (seen.has(scope)) invalid(`${path}[${index}]`, `duplicate scope ${scope}`);
    if (!allowed.includes(scope)) invalid(`${path}[${index}]`, `scope ${scope} is not applicable to this target`);
    seen.add(scope);
    return scope;
  });
  return scopes.sort((left, right) => SCOPE_ORDER.get(left)! - SCOPE_ORDER.get(right)!);
}

function parseProtections(
  value: unknown,
  document: LayoutDocumentV1,
  path: string,
): LayoutProtectionEntryV1[] {
  const values = array(value, path);
  if (values.length > LAYOUT_AUTOMATION_MAX_PROTECTIONS) {
    invalid(path, `must contain at most ${LAYOUT_AUTOMATION_MAX_PROTECTIONS}`);
  }
  const keys = new Set<string>();
  const targets = buildProtectionTargetIndex(document);
  const protections = values.map((valueItem, index): LayoutProtectionEntryV1 => {
    const itemPath = `${path}[${index}]`;
    const row = exact(valueItem, ["targetKind", "targetId", "scopes", "reason"], itemPath);
    const targetKind = enumeration(row.targetKind, ["canvas", "element", "panel_image"] as const, `${itemPath}.targetKind`);
    const targetId = id(row.targetId, `${itemPath}.targetId`);
    const reason = enumeration(row.reason, ["user_edit", "explicit_preserve"] as const, `${itemPath}.reason`);
    const key = `${targetKind}\u0000${targetId}\u0000${reason}`;
    if (keys.has(key)) invalid(itemPath, "duplicate protection target/reason entry");
    keys.add(key);
    const target = targets.get(protectionTargetKey(targetKind, targetId));
    if (!target) invalid(`${itemPath}.targetId`, `${targetKind} ${targetId} is missing`);
    return {
      targetKind,
      targetId,
      scopes: parseProtectionScopes(row.scopes, applicableScopes(target), `${itemPath}.scopes`),
      reason,
    };
  });
  return protections.sort((left, right) => (
    TARGET_KIND_ORDER[left.targetKind] - TARGET_KIND_ORDER[right.targetKind]
    || compareText(left.targetId, right.targetId)
    || REASON_ORDER[left.reason] - REASON_ORDER[right.reason]
  ));
}

function parseAutomation(value: unknown, document: LayoutDocumentV1, path: string): LayoutAutomationStateV1 {
  const row = exact(value, ["policyVersion", "composition", "dialogueBindings", "protections"], path);
  if (row.policyVersion !== "layout_automation_v1") invalid(`${path}.policyVersion`, "expected layout_automation_v1");
  return {
    policyVersion: "layout_automation_v1",
    composition: parseComposition(row.composition, `${path}.composition`),
    dialogueBindings: parseDialogueBindings(row.dialogueBindings, document, `${path}.dialogueBindings`),
    protections: parseProtections(row.protections, document, `${path}.protections`),
  };
}

export function parseAndNormalizeLayoutDocumentV2(
  input: unknown,
  context: LayoutDocumentValidationContextV1 = {},
): LayoutDocumentV2 {
  const row = exact(inputValue(input), [
    "schemaVersion",
    "kind",
    "projectId",
    "chapterId",
    "comicFormat",
    "profile",
    "fontPolicy",
    "canvases",
    "automation",
  ], "document");
  if (row.schemaVersion !== 2) invalid("document.schemaVersion", "expected 2");
  if (row.kind !== "layout_document_v2") invalid("document.kind", "expected layout_document_v2");
  const visible = LayoutDocumentCodecV1.parseAndNormalize(visibleInput(row), context);
  const document: LayoutDocumentV2 = {
    ...visible,
    schemaVersion: 2,
    kind: "layout_document_v2",
    automation: parseAutomation(row.automation, visible, "document.automation"),
  };
  if (canonicalJsonBytes(document).length > LAYOUT_DOCUMENT_MAX_BYTES) {
    throw new LayoutDocumentValidationError(
      `document: canonical bytes exceed ${LAYOUT_DOCUMENT_MAX_BYTES}`,
      "LAYOUT_DOCUMENT_TOO_LARGE",
    );
  }
  return document;
}

export function encodeLayoutDocumentV2(
  input: unknown,
  context: LayoutDocumentValidationContextV1 = {},
): EncodedLayoutDocumentV2 {
  const value = parseAndNormalizeLayoutDocumentV2(input, context);
  const canonical = canonicalizeJson(value);
  const canonicalBytes = canonicalJsonBytes(value);
  return { schemaVersion: 2, value, canonical, canonicalBytes, digest: sha256Bytes(canonicalBytes) };
}

export const LayoutDocumentCodecV2 = {
  schemaVersion: 2 as const,
  parse: parseAndNormalizeLayoutDocumentV2,
  parseAndNormalize: parseAndNormalizeLayoutDocumentV2,
  encode: encodeLayoutDocumentV2,
};

export function projectLayoutDocumentV2ToV1(
  input: unknown,
  context: LayoutDocumentValidationContextV1 = {},
): LayoutDocumentV1 {
  const document = parseAndNormalizeLayoutDocumentV2(input, context);
  const { automation: _automation, ...visible } = document;
  return LayoutDocumentCodecV1.parseAndNormalize({
    ...visible,
    schemaVersion: 1,
    kind: "layout_document_v1",
  }, context);
}

function preserveEntry(
  targetKind: LayoutProtectionTargetKindV1,
  targetId: string,
  element: LayoutTopLevelElementV1 | null,
): LayoutProtectionEntryV1 {
  return {
    targetKind,
    targetId,
    scopes: [...applicableScopes({ targetKind, targetId, element })],
    reason: "explicit_preserve",
  };
}

export function upgradeLayoutWorkingCopyV1ToV2(
  input: unknown,
  context: LayoutDocumentValidationContextV1 = {},
): LayoutDocumentV2 {
  const visible = LayoutDocumentCodecV1.parseAndNormalize(input, context);
  const protections: LayoutProtectionEntryV1[] = [];
  for (const canvas of visible.canvases) {
    protections.push(preserveEntry("canvas", canvas.id, null));
    for (const element of canvas.elements) {
      protections.push(preserveEntry("element", element.id, element));
      if (element.type === "panel_frame" && element.contentImage) {
        protections.push(preserveEntry("panel_image", element.contentImage.id, element));
      }
    }
  }
  return parseAndNormalizeLayoutDocumentV2({
    ...visible,
    schemaVersion: 2,
    kind: "layout_document_v2",
    automation: {
      policyVersion: "layout_automation_v1",
      composition: null,
      dialogueBindings: [],
      protections,
    },
  }, context);
}

export function addLayoutProtectionScopesV1(
  automation: LayoutAutomationStateV1,
  targetKind: LayoutProtectionTargetKindV1,
  targetId: string,
  scopes: readonly LayoutProtectionScopeV1[],
  reason: LayoutProtectionReasonV1 = "user_edit",
): LayoutAutomationStateV1 {
  if (scopes.length === 0) return structuredClone(automation);
  const next = structuredClone(automation);
  const entry = next.protections.find((item) => (
    item.targetKind === targetKind && item.targetId === targetId && item.reason === reason
  ));
  const combined = new Set<LayoutProtectionScopeV1>([...(entry?.scopes ?? []), ...scopes]);
  const normalizedScopes = [...combined].sort((left, right) => SCOPE_ORDER.get(left)! - SCOPE_ORDER.get(right)!);
  if (entry) entry.scopes = normalizedScopes;
  else next.protections.push({ targetKind, targetId, scopes: normalizedScopes, reason });
  return next;
}

export function clearLayoutProtectionScopesV1(
  automation: LayoutAutomationStateV1,
  targetKind: LayoutProtectionTargetKindV1,
  targetId: string,
  scopes: readonly LayoutProtectionScopeV1[],
): LayoutAutomationStateV1 {
  const removed = new Set(scopes);
  const next = structuredClone(automation);
  next.protections = next.protections
    .map((entry) => entry.targetKind === targetKind && entry.targetId === targetId
      ? { ...entry, scopes: entry.scopes.filter((scope) => !removed.has(scope)) }
      : entry)
    .filter((entry) => entry.scopes.length > 0);
  return next;
}

export function isLayoutScopeProtectedV1(
  automation: LayoutAutomationStateV1,
  targetKind: LayoutProtectionTargetKindV1,
  targetId: string,
  scope: LayoutProtectionScopeV1,
): boolean {
  return automation.protections.some((entry) => (
    entry.targetKind === targetKind && entry.targetId === targetId && entry.scopes.includes(scope)
  ));
}

export function digestLayoutDialogueTextV1(value: string): LayoutDigest {
  return sha256Bytes(canonicalJsonBytes({
    policyVersion: "layout_dialogue_text_digest_v1",
    text: normalizePlainLayoutText(value),
  }));
}

export function digestLayoutCompositionV1(input: LayoutCompositionDigestInputV1): LayoutDigest {
  if (input.compositionPolicyVersion !== "layout_composition_v1") {
    invalid("composition.compositionPolicyVersion", "expected layout_composition_v1");
  }
  return sha256Bytes(canonicalJsonBytes({
    policyVersion: "layout_composition_digest_v1",
    compositionPolicyVersion: input.compositionPolicyVersion,
    storyboardVersionId: id(input.storyboardVersionId, "composition.storyboardVersionId"),
    storyboardDigest: digest(input.storyboardDigest, "composition.storyboardDigest"),
    sourceLockSetDigest: digest(input.sourceLockSetDigest, "composition.sourceLockSetDigest"),
    visualAnalysisSetDigest: input.visualAnalysisSetDigest === null
      ? null
      : digest(input.visualAnalysisSetDigest, "composition.visualAnalysisSetDigest"),
    mode: enumeration(input.mode, ["vision", "rule_fallback"] as const, "composition.mode"),
    planDigest: digest(input.planDigest, "composition.planDigest"),
    initialVisibleDocumentDigest: digest(input.initialVisibleDocumentDigest, "composition.initialVisibleDocumentDigest"),
    initialDialogueBindingsDigest: digest(input.initialDialogueBindingsDigest, "composition.initialDialogueBindingsDigest"),
  }));
}

export type LayoutDocumentV1OrV2 = LayoutDocumentV1 | LayoutDocumentV2;

export function parseLayoutDocumentV1OrV2(
  input: unknown,
  context: LayoutDocumentValidationContextV1 = {},
): LayoutDocumentV1OrV2 {
  const value = inputValue(input);
  const row = object(value, "document");
  if (row.schemaVersion === 1 && row.kind === "layout_document_v1") {
    return LayoutDocumentCodecV1.parseAndNormalize(value, context);
  }
  if (row.schemaVersion === 2 && row.kind === "layout_document_v2") {
    return LayoutDocumentCodecV2.parseAndNormalize(value, context);
  }
  invalid("document", "expected LayoutDocumentV1 or LayoutDocumentV2");
}

export const LayoutDocumentCodecV1OrV2 = {
  parse: parseLayoutDocumentV1OrV2,
  parseAndNormalize: parseLayoutDocumentV1OrV2,
  encode(input: unknown, context: LayoutDocumentValidationContextV1 = {}) {
    const value = parseLayoutDocumentV1OrV2(input, context);
    return value.schemaVersion === 1
      ? LayoutDocumentCodecV1.encode(value, context)
      : LayoutDocumentCodecV2.encode(value, context);
  },
};
