import { canonicalizeJson } from "../versioning/canonical-json.js";
import {
  addLayoutProtectionScopesV1,
  clearLayoutProtectionScopesV1,
  digestLayoutDialogueTextV1,
  getApplicableLayoutProtectionScopesV1,
  isLayoutScopeProtectedV1,
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  type LayoutDocumentV2,
  type LayoutProtectionScopeV1,
  type LayoutProtectionTargetKindV1,
} from "./automation.js";
import {
  EDITOR_COMMAND_TYPES_V1,
  LayoutCommandError,
  applyLayoutCommand,
  parseEditorCommandV1,
  type EditorCommandPayloadMapV1,
  type EditorCommandTypeV1,
  type EditorCommandV1,
  type LayoutPreflightScopeV1,
} from "./commands.js";
import { LayoutElementCodecV1, RichTextDocumentCodecV1 } from "./codec.js";
import type {
  BalloonElementV1,
  LayoutCanvasV1,
  LayoutTopLevelElementV1,
  RichTextDocumentV1,
} from "./document.js";
import { richTextPlainTextV1 } from "./text.js";

export const LAYOUT_COMMAND_ACTORS_V1 = ["user", "smart", "system"] as const;
export type LayoutCommandActorV1 = (typeof LAYOUT_COMMAND_ACTORS_V1)[number];

export const EDITOR_COMMAND_TYPES_V2 = [
  ...EDITOR_COMMAND_TYPES_V1,
  "protection.clear",
  "balloon.suppress_bound",
  "balloon.restore_bound",
] as const;

export type EditorCommandTypeV2 = (typeof EDITOR_COMMAND_TYPES_V2)[number];

export interface RestoreBoundBalloonCreateV2 {
  element: BalloonElementV1;
  beforeElementId: string | null;
}

export interface EditorCommandPayloadMapV2 extends EditorCommandPayloadMapV1 {
  "protection.clear": {
    targetKind: LayoutProtectionTargetKindV1;
    targetId: string;
    scopes: LayoutProtectionScopeV1[];
  };
  "balloon.suppress_bound": {
    canvasId: string;
    elementId: string;
    mode: "hide" | "delete";
  };
  "balloon.restore_bound": {
    dialogueItemId: string;
    canvasId: string;
    richText: RichTextDocumentV1;
    create: RestoreBoundBalloonCreateV2 | null;
    clearProtectionScopes: Array<"existence" | "text">;
  };
}

export type EditorCommandV2<TType extends EditorCommandTypeV2 = EditorCommandTypeV2> =
  TType extends EditorCommandTypeV2 ? {
    schemaVersion: 2;
    commandId: string;
    type: TType;
    label: string;
    actor: LayoutCommandActorV1;
    payload: EditorCommandPayloadMapV2[TType];
  } : never;

export interface EditorCommandBatchV2 {
  schemaVersion: 2;
  batchId: string;
  label: string;
  commands: EditorCommandV2[];
}

export interface LayoutInverseCommandV2 {
  schemaVersion: 2;
  commandId: string;
  type: "layout.restore_snapshot";
  label: string;
  actor: "system";
  payload: { document: LayoutDocumentV2 };
}

export type ApplicableLayoutCommandV2 = EditorCommandV2 | LayoutInverseCommandV2;

export interface ApplyLayoutCommandResultV2 {
  document: LayoutDocumentV2;
  inverse: LayoutInverseCommandV2;
  changedElementIds: string[];
  invalidatedPreflightScopes: LayoutPreflightScopeV1[];
}

interface MutationEffectV1 {
  targetKind: LayoutProtectionTargetKindV1;
  targetId: string;
  scopes: LayoutProtectionScopeV1[];
}

interface LocatedCommandTargetV1 {
  canvas: LayoutCanvasV1;
  element: LayoutTopLevelElementV1 | null;
  locked: boolean;
}

function fail(message: string): never {
  throw new LayoutCommandError(message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${path}: expected object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(`${path}: expected plain object`);
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  const row = record(value, path);
  const allowed = new Set(keys);
  for (const key of Object.keys(row)) if (!allowed.has(key)) fail(`${path}.${key}: unknown field`);
  for (const key of keys) if (!Object.prototype.hasOwnProperty.call(row, key)) fail(`${path}.${key}: missing required field`);
  return row;
}

function id(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.includes("\n") || value.includes("\r")) {
    fail(`${path}: expected non-empty single-line string`);
  }
  return value.trim().normalize("NFC");
}

function enumeration<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) fail(`${path}: expected one of ${allowed.join(", ")}`);
  return value as T;
}

function values(value: unknown, path: string, minimum = 0, maximum = 500): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    fail(`${path}: expected ${minimum}..${maximum} items`);
  }
  return value;
}

function parseClearScopes(value: unknown, path: string): LayoutProtectionScopeV1[] {
  const allowed = ["existence", "geometry", "crop", "text", "style", "tail", "source", "reading_order"] as const;
  const seen = new Set<LayoutProtectionScopeV1>();
  const scopes = values(value, path, 1, allowed.length).map((item, index) => {
    const scope = enumeration(item, allowed, `${path}[${index}]`);
    if (seen.has(scope)) fail(`${path}[${index}]: duplicate scope ${scope}`);
    seen.add(scope);
    return scope;
  });
  return scopes.sort((left, right) => allowed.indexOf(left) - allowed.indexOf(right));
}

function parseRestoreClearScopes(value: unknown, path: string): Array<"existence" | "text"> {
  const allowed = ["existence", "text"] as const;
  const seen = new Set<"existence" | "text">();
  const scopes = values(value, path, 0, 2).map((item, index) => {
    const scope = enumeration(item, allowed, `${path}[${index}]`);
    if (seen.has(scope)) fail(`${path}[${index}]: duplicate scope ${scope}`);
    seen.add(scope);
    return scope;
  });
  return scopes.sort((left, right) => allowed.indexOf(left) - allowed.indexOf(right));
}

function parseSemanticPayload(
  type: "protection.clear" | "balloon.suppress_bound" | "balloon.restore_bound",
  value: unknown,
): EditorCommandPayloadMapV2[typeof type] {
  if (type === "protection.clear") {
    const row = exact(value, ["targetKind", "targetId", "scopes"], "command.payload");
    return {
      targetKind: enumeration(row.targetKind, ["canvas", "element", "panel_image"] as const, "command.payload.targetKind"),
      targetId: id(row.targetId, "command.payload.targetId"),
      scopes: parseClearScopes(row.scopes, "command.payload.scopes"),
    } as EditorCommandPayloadMapV2[typeof type];
  }
  if (type === "balloon.suppress_bound") {
    const row = exact(value, ["canvasId", "elementId", "mode"], "command.payload");
    return {
      canvasId: id(row.canvasId, "command.payload.canvasId"),
      elementId: id(row.elementId, "command.payload.elementId"),
      mode: enumeration(row.mode, ["hide", "delete"] as const, "command.payload.mode"),
    } as EditorCommandPayloadMapV2[typeof type];
  }
  const row = exact(value, ["dialogueItemId", "canvasId", "richText", "create", "clearProtectionScopes"], "command.payload");
  let create: RestoreBoundBalloonCreateV2 | null = null;
  if (row.create !== null) {
    const createRow = exact(row.create, ["element", "beforeElementId"], "command.payload.create");
    const element = record(createRow.element, "command.payload.create.element");
    if (element.type !== "balloon") fail("command.payload.create.element.type: expected balloon");
    create = {
      element: structuredClone(element) as unknown as BalloonElementV1,
      beforeElementId: createRow.beforeElementId === null
        ? null
        : id(createRow.beforeElementId, "command.payload.create.beforeElementId"),
    };
  }
  return {
    dialogueItemId: id(row.dialogueItemId, "command.payload.dialogueItemId"),
    canvasId: id(row.canvasId, "command.payload.canvasId"),
    richText: RichTextDocumentCodecV1.parseAndNormalize(row.richText),
    create,
    clearProtectionScopes: parseRestoreClearScopes(row.clearProtectionScopes, "command.payload.clearProtectionScopes"),
  } as EditorCommandPayloadMapV2[typeof type];
}

export function parseEditorCommandV2(input: unknown): EditorCommandV2 {
  const row = exact(input, ["schemaVersion", "commandId", "type", "label", "actor", "payload"], "command");
  if (row.schemaVersion !== 2) fail("command.schemaVersion: expected 2");
  const actor = enumeration(row.actor, LAYOUT_COMMAND_ACTORS_V1, "command.actor");
  if (typeof row.type !== "string" || !EDITOR_COMMAND_TYPES_V2.includes(row.type as EditorCommandTypeV2)) {
    fail("command.type: unsupported V2 command");
  }
  const type = row.type as EditorCommandTypeV2;
  const commandId = id(row.commandId, "command.commandId");
  const label = id(row.label, "command.label");
  if (EDITOR_COMMAND_TYPES_V1.includes(type as EditorCommandTypeV1)) {
    const parsed = parseEditorCommandV1({
      schemaVersion: 1,
      commandId,
      type,
      label,
      payload: row.payload,
    });
    return { ...parsed, schemaVersion: 2, actor } as EditorCommandV2;
  }
  return {
    schemaVersion: 2,
    commandId,
    type,
    label,
    actor,
    payload: parseSemanticPayload(type as "protection.clear" | "balloon.suppress_bound" | "balloon.restore_bound", row.payload),
  } as EditorCommandV2;
}

export function parseEditorCommandBatchV2(input: unknown): EditorCommandBatchV2 {
  const row = exact(input, ["schemaVersion", "batchId", "label", "commands"], "batch");
  if (row.schemaVersion !== 2) fail("batch.schemaVersion: expected 2");
  return {
    schemaVersion: 2,
    batchId: id(row.batchId, "batch.batchId"),
    label: id(row.label, "batch.label"),
    commands: values(row.commands, "batch.commands", 1, 500).map((item) => parseEditorCommandV2(item)),
  };
}

function canvas(document: LayoutDocumentV2, canvasId: string): LayoutCanvasV1 {
  const target = document.canvases.find((item) => item.id === canvasId);
  if (!target) fail(`canvas ${canvasId} is missing`);
  return target;
}

function element(target: LayoutCanvasV1, elementId: string): LayoutTopLevelElementV1 {
  const found = target.elements.find((item) => item.id === elementId);
  if (!found) fail(`element ${elementId} is missing`);
  return found;
}

function locateTarget(
  document: LayoutDocumentV2,
  targetKind: LayoutProtectionTargetKindV1,
  targetId: string,
): LocatedCommandTargetV1 | null {
  if (targetKind === "canvas") {
    const target = document.canvases.find((item) => item.id === targetId);
    return target ? { canvas: target, element: null, locked: false } : null;
  }
  for (const target of document.canvases) {
    for (const item of target.elements) {
      if (targetKind === "element" && item.id === targetId) {
        return { canvas: target, element: item, locked: item.locked };
      }
      if (targetKind === "panel_image" && item.type === "panel_frame" && item.contentImage?.id === targetId) {
        return { canvas: target, element: item, locked: item.contentImage.locked || item.locked };
      }
    }
  }
  return null;
}

function targetKey(targetKind: LayoutProtectionTargetKindV1, targetId: string): string {
  return `${targetKind}\u0000${targetId}`;
}

function targetIndex(document: LayoutDocumentV2): Map<string, LocatedCommandTargetV1> {
  const result = new Map<string, LocatedCommandTargetV1>();
  for (const targetCanvas of document.canvases) {
    result.set(targetKey("canvas", targetCanvas.id), { canvas: targetCanvas, element: null, locked: false });
    for (const item of targetCanvas.elements) {
      result.set(targetKey("element", item.id), { canvas: targetCanvas, element: item, locked: item.locked });
      if (item.type === "panel_frame" && item.contentImage) {
        result.set(targetKey("panel_image", item.contentImage.id), {
          canvas: targetCanvas,
          element: item,
          locked: item.locked || item.contentImage.locked,
        });
      }
    }
  }
  return result;
}

function fullEffectsForElement(elementValue: LayoutTopLevelElementV1): MutationEffectV1[] {
  const elementScopes: LayoutProtectionScopeV1[] = elementValue.type === "panel_frame"
    ? ["existence", "geometry", "style", "reading_order"]
    : elementValue.type === "free_image"
      ? ["existence", "geometry", "crop", "source", "reading_order"]
      : elementValue.type === "text"
        ? ["existence", "geometry", "text", "style", "reading_order"]
        : ["existence", "geometry", "text", "style", "tail", "source", "reading_order"];
  const effects: MutationEffectV1[] = [{ targetKind: "element", targetId: elementValue.id, scopes: elementScopes }];
  if (elementValue.type === "panel_frame" && elementValue.contentImage) {
    effects.push({ targetKind: "panel_image", targetId: elementValue.contentImage.id, scopes: ["existence", "crop", "source"] });
  }
  return effects;
}

function fullEffectsForCanvas(target: LayoutCanvasV1): MutationEffectV1[] {
  return [
    { targetKind: "canvas", targetId: target.id, scopes: ["existence", "geometry", "style", "reading_order"] },
    ...target.elements.flatMap((item) => fullEffectsForElement(item)),
  ];
}

function targetEffect(
  targetKind: LayoutProtectionTargetKindV1,
  targetId: string,
  ...scopes: LayoutProtectionScopeV1[]
): MutationEffectV1 {
  return { targetKind, targetId, scopes };
}

function imageEffect(
  document: LayoutDocumentV2,
  canvasId: string,
  elementId: string,
  ...scopes: Array<"crop" | "source" | "existence">
): MutationEffectV1 {
  const item = element(canvas(document, canvasId), elementId);
  if (item.type === "panel_frame") {
    if (!item.contentImage) fail(`panel ${elementId} has no image`);
    return targetEffect("panel_image", item.contentImage.id, ...scopes);
  }
  if (item.type === "free_image") return targetEffect("element", item.id, ...scopes);
  fail(`element ${elementId} has no image`);
}

function payload(command: EditorCommandV1): Record<string, any> {
  return command.payload as Record<string, any>;
}

function effectsForV1Command(document: LayoutDocumentV2, command: EditorCommandV1): MutationEffectV1[] {
  const p = payload(command);
  switch (command.type) {
    case "canvas.add": case "canvas.duplicate": case "element.add": case "element.duplicate":
      return [];
    case "canvas.delete": case "canvas.resize":
      return fullEffectsForCanvas(canvas(document, p.canvasId));
    case "canvas.reorder":
      return [targetEffect("canvas", p.canvasId, "reading_order")];
    case "layout.resize_profile":
      return document.canvases.flatMap((item) => fullEffectsForCanvas(item));
    case "element.delete":
      return fullEffectsForElement(element(canvas(document, p.canvasId), p.elementId));
    case "element.reorder":
      return [
        targetEffect("element", p.elementId, "reading_order"),
        targetEffect("canvas", p.canvasId, "reading_order"),
      ];
    case "element.set_transform": return [targetEffect("element", p.elementId, "geometry")];
    case "element.set_locked": return [];
    case "element.set_hidden": return [];
    case "panel.set_shape": case "panel.set_border": return [targetEffect("element", p.elementId, "style")];
    case "panel.attach_image": return [targetEffect("element", p.elementId, "existence")];
    case "panel.detach_image_to_free": return [imageEffect(document, p.canvasId, p.elementId, "existence", "crop", "source")];
    case "image.set_display": case "image.set_crop": return [imageEffect(document, p.canvasId, p.elementId, "crop")];
    case "image.replace_source": return [imageEffect(document, p.canvasId, p.elementId, "source", "crop")];
    case "text.replace_range": return [targetEffect("element", p.elementId, "text")];
    case "text.replace_document": return [targetEffect("element", p.elementId, "text", "style")];
    case "text.apply_range_style": case "text.set_paragraph_style": case "text.set_semantic":
      return [targetEffect("element", p.elementId, "style")];
    case "balloon.set_kind": case "balloon.set_visual_style": return [targetEffect("element", p.elementId, "style")];
    case "balloon.set_tail": return [targetEffect("element", p.elementId, "tail")];
    case "balloon.set_source_refs": return [targetEffect("element", p.elementId, "source")];
    case "balloon.replace_text_document": return [targetEffect("element", p.elementId, "text", "style")];
    case "layout.apply_preset": {
      const target = canvas(document, p.canvasId);
      return [
        targetEffect("canvas", target.id, "reading_order"),
        ...target.elements.filter((item) => item.type === "panel_frame").flatMap((item) => fullEffectsForElement(item)),
      ];
    }
    case "layout.replace_sources":
      return p.replacements.flatMap((replacement: Record<string, any>) => [
        imageEffect(document, replacement.canvasId, replacement.elementId, "source", "crop"),
      ]);
    case "batch.transform": case "batch.align": case "batch.distribute": case "batch.reorder":
    case "batch.set_locked": case "batch.set_hidden": case "batch.delete":
      return [];
  }
}

function createdEffects(document: LayoutDocumentV2, command: EditorCommandV1): MutationEffectV1[] {
  const p = payload(command);
  switch (command.type) {
    case "canvas.add": case "canvas.duplicate": {
      const target = document.canvases.find((item) => item.id === p.canvas.id);
      return target ? fullEffectsForCanvas(target) : [];
    }
    case "canvas.resize": {
      const target = document.canvases.find((item) => item.id === p.canvasId);
      return target ? fullEffectsForCanvas(target) : [];
    }
    case "layout.resize_profile":
      return document.canvases.flatMap((item) => fullEffectsForCanvas(item));
    case "element.add": case "element.duplicate": {
      const target = document.canvases.find((item) => item.id === p.canvasId);
      const added = target?.elements.find((item) => item.id === p.element.id);
      return added ? fullEffectsForElement(added) : [];
    }
    case "panel.attach_image": {
      const target = document.canvases.find((item) => item.id === p.canvasId);
      const frame = target?.elements.find((item) => item.id === p.elementId);
      return frame?.type === "panel_frame" && frame.contentImage
        ? [targetEffect("panel_image", frame.contentImage.id, "existence", "crop", "source")]
        : [];
    }
    case "panel.detach_image_to_free": {
      const target = document.canvases.find((item) => item.id === p.canvasId);
      const added = target?.elements.find((item) => item.id === p.freeImage.id);
      return added ? fullEffectsForElement(added) : [];
    }
    case "layout.apply_preset": {
      const target = document.canvases.find((item) => item.id === p.canvasId);
      return target
        ? target.elements.filter((item) => item.type === "panel_frame").flatMap((item) => fullEffectsForElement(item))
        : [];
    }
    default:
      return [];
  }
}

function assertGenericBindingSafety(document: LayoutDocumentV2, command: EditorCommandV1): void {
  const p = payload(command);
  if (command.type === "element.delete" || command.type === "element.set_hidden") {
    const binding = document.automation.dialogueBindings.find((item) => item.elementId === p.elementId);
    if (binding) fail(`bound balloon ${p.elementId} requires balloon.suppress_bound or balloon.restore_bound`);
  }
  if (command.type === "balloon.set_source_refs") {
    const binding = document.automation.dialogueBindings.find((item) => item.elementId === p.elementId);
    if (binding && binding.sourceShotId !== p.sourceShotId) {
      fail(`bound balloon ${p.elementId} sourceShotId must not change through a generic command`);
    }
  }
}

function assertSmartAllowed(document: LayoutDocumentV2, command: EditorCommandV1, effects: readonly MutationEffectV1[]): void {
  if (command.type === "element.set_locked") fail("smart command must not change explicit locks");
  const targets = targetIndex(document);
  for (const effect of effects) {
    const target = targets.get(targetKey(effect.targetKind, effect.targetId));
    if (target?.locked) fail(`${effect.targetKind} ${effect.targetId} is locked`);
    for (const scope of effect.scopes) {
      if (isLayoutScopeProtectedV1(document.automation, effect.targetKind, effect.targetId, scope)) {
        fail(`smart command touches protected ${scope} on ${effect.targetKind} ${effect.targetId}`);
      }
    }
  }
}

function addUserProtections(
  document: LayoutDocumentV2,
  effects: readonly MutationEffectV1[],
): LayoutDocumentV2 {
  const automation = structuredClone(document.automation);
  const allowedByTarget = protectionScopeMap(document);
  const byTarget = new Map(
    automation.protections
      .filter((entry) => entry.reason === "user_edit")
      .map((entry) => [targetKey(entry.targetKind, entry.targetId), entry] as const),
  );
  const scopeOrder = ["existence", "geometry", "crop", "text", "style", "tail", "source", "reading_order"] as const;
  for (const effect of effects) {
    const key = targetKey(effect.targetKind, effect.targetId);
    const allowed = allowedByTarget.get(key);
    if (!allowed) continue;
    const scopes = effect.scopes.filter((scope) => allowed.has(scope));
    if (scopes.length === 0) continue;
    const entry = byTarget.get(key);
    if (entry) {
      entry.scopes = [...new Set([...entry.scopes, ...scopes])]
        .sort((left, right) => scopeOrder.indexOf(left) - scopeOrder.indexOf(right));
    } else {
      const created = {
        targetKind: effect.targetKind,
        targetId: effect.targetId,
        scopes: [...new Set(scopes)].sort((left, right) => scopeOrder.indexOf(left) - scopeOrder.indexOf(right)),
        reason: "user_edit" as const,
      };
      automation.protections.push(created);
      byTarget.set(key, created);
    }
  }
  return { ...document, automation };
}

function userProtectionEffects(
  before: LayoutDocumentV2,
  command: EditorCommandV1,
  effects: readonly MutationEffectV1[],
): MutationEffectV1[] {
  if (command.type !== "canvas.resize" && command.type !== "layout.resize_profile") {
    return [...effects];
  }
  const existingTargets = targetIndex(before);
  const ownershipScopes = new Set<LayoutProtectionScopeV1>(["existence", "text", "source"]);
  return effects.flatMap((effect) => {
    if (!existingTargets.has(targetKey(effect.targetKind, effect.targetId))) return [effect];
    const scopes = effect.scopes.filter((scope) => !ownershipScopes.has(scope));
    return scopes.length > 0 ? [{ ...effect, scopes }] : [];
  });
}

function toV1(command: EditorCommandV2<EditorCommandTypeV1>): EditorCommandV1 {
  return {
    schemaVersion: 1,
    commandId: command.commandId,
    type: command.type,
    label: command.label,
    payload: command.payload,
  } as EditorCommandV1;
}

function inverse(before: LayoutDocumentV2, commandId: string, label: string): LayoutInverseCommandV2 {
  return {
    schemaVersion: 2,
    commandId: `inverse:${commandId}`,
    type: "layout.restore_snapshot",
    label: `Undo ${label}`,
    actor: "system",
    payload: { document: structuredClone(before) },
  };
}

function changedIds(before: LayoutDocumentV2, after: LayoutDocumentV2): string[] {
  const map = (document: LayoutDocumentV2) => new Map(
    document.canvases.flatMap((target) => target.elements.map((item) => [item.id, canonicalizeJson(item)] as const)),
  );
  const left = map(before);
  const right = map(after);
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((item) => left.get(item) !== right.get(item))
    .sort();
}

function protectionScopeMap(visible: Pick<LayoutDocumentV2, "canvases">): Map<string, Set<LayoutProtectionScopeV1>> {
  const result = new Map<string, Set<LayoutProtectionScopeV1>>();
  for (const targetCanvas of visible.canvases) {
    result.set(targetKey("canvas", targetCanvas.id), new Set(["existence", "geometry", "style", "reading_order"]));
    for (const item of targetCanvas.elements) {
      for (const effect of fullEffectsForElement(item)) {
        result.set(targetKey(effect.targetKind, effect.targetId), new Set(effect.scopes));
      }
    }
  }
  return result;
}

function composeVisible(
  document: LayoutDocumentV2,
  visible: ReturnType<typeof projectLayoutDocumentV2ToV1>,
  removeStaleUserTargets: boolean,
): LayoutDocumentV2 {
  const automation = structuredClone(document.automation);
  if (removeStaleUserTargets) {
    const allowed = protectionScopeMap(visible);
    automation.protections = automation.protections
      .map((entry) => ({
        ...entry,
        scopes: entry.scopes.filter((scope) => allowed.get(targetKey(entry.targetKind, entry.targetId))?.has(scope)),
      }))
      .filter((entry) => entry.scopes.length > 0);
  }
  try {
    return LayoutDocumentCodecV2.parseAndNormalize({
      ...visible,
      schemaVersion: 2,
      kind: "layout_document_v2",
      automation,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "command produced an invalid V2 document");
  }
}

function applyGenericSingle(
  before: LayoutDocumentV2,
  command: EditorCommandV2<EditorCommandTypeV1>,
): ApplyLayoutCommandResultV2 {
  const v1Command = toV1(command);
  assertGenericBindingSafety(before, v1Command);
  const effects = effectsForV1Command(before, v1Command);
  if (command.actor === "smart") assertSmartAllowed(before, v1Command, effects);
  const applied = applyLayoutCommand(projectLayoutDocumentV2ToV1(before), v1Command);
  let after = composeVisible(before, applied.document, command.actor === "user");
  if (command.actor === "user") {
    after = addUserProtections(
      after,
      userProtectionEffects(before, v1Command, [...effects, ...createdEffects(after, v1Command)]),
    );
    after = LayoutDocumentCodecV2.parseAndNormalize(after);
  }
  return {
    document: after,
    inverse: inverse(before, command.commandId, command.label),
    changedElementIds: applied.changedElementIds,
    invalidatedPreflightScopes: applied.invalidatedPreflightScopes,
  };
}

function applyV1BackedCommand(
  before: LayoutDocumentV2,
  command: EditorCommandV2<EditorCommandTypeV1>,
): ApplyLayoutCommandResultV2 {
  if (!command.type.startsWith("batch.")) return applyGenericSingle(before, command);
  const children = (command.payload as { commands: EditorCommandV1[] }).commands;
  let current = before;
  const scopeSet = new Set<LayoutPreflightScopeV1>();
  for (const child of children) {
    const parsed = parseEditorCommandV1(child);
    const result = applyGenericSingle(current, {
      ...parsed,
      schemaVersion: 2,
      actor: command.actor,
    } as EditorCommandV2<EditorCommandTypeV1>);
    current = result.document;
    result.invalidatedPreflightScopes.forEach((scope) => scopeSet.add(scope));
  }
  return {
    document: current,
    inverse: inverse(before, command.commandId, command.label),
    changedElementIds: changedIds(before, current),
    invalidatedPreflightScopes: [...scopeSet],
  };
}

function applyProtectionClear(
  before: LayoutDocumentV2,
  command: EditorCommandV2<"protection.clear">,
): ApplyLayoutCommandResultV2 {
  if (command.actor !== "user") fail("only user commands may clear layout protections");
  const p = command.payload;
  const allowed = getApplicableLayoutProtectionScopesV1(
    projectLayoutDocumentV2ToV1(before),
    p.targetKind,
    p.targetId,
  );
  for (const scope of p.scopes) if (!allowed.includes(scope)) fail(`scope ${scope} is not applicable to ${p.targetKind}`);
  const after = LayoutDocumentCodecV2.parseAndNormalize({
    ...before,
    automation: clearLayoutProtectionScopesV1(before.automation, p.targetKind, p.targetId, p.scopes),
  });
  return {
    document: after,
    inverse: inverse(before, command.commandId, command.label),
    changedElementIds: [],
    invalidatedPreflightScopes: ["document"],
  };
}

function applySuppressBound(
  before: LayoutDocumentV2,
  command: EditorCommandV2<"balloon.suppress_bound">,
): ApplyLayoutCommandResultV2 {
  if (command.actor !== "user") fail("only user commands may suppress a bound balloon");
  const p = command.payload;
  const targetCanvas = canvas(before, p.canvasId);
  const target = element(targetCanvas, p.elementId);
  if (target.type !== "balloon") fail(`element ${p.elementId} is not a balloon`);
  if (target.locked) fail(`element ${p.elementId} is locked`);
  const binding = before.automation.dialogueBindings.find((item) => item.elementId === p.elementId);
  if (!binding || binding.disposition !== "placed") fail(`balloon ${p.elementId} has no placed dialogue binding`);
  const draft = structuredClone(before);
  const draftCanvas = canvas(draft, p.canvasId);
  const draftTarget = element(draftCanvas, p.elementId);
  const draftBinding = draft.automation.dialogueBindings.find((item) => item.dialogueItemId === binding.dialogueItemId)!;
  draftBinding.disposition = "user_suppressed";
  if (p.mode === "hide") {
    draftTarget.hidden = true;
    draft.automation = addLayoutProtectionScopesV1(
      draft.automation,
      "element",
      p.elementId,
      ["existence"],
      "user_edit",
    );
  } else {
    draftCanvas.elements.splice(draftCanvas.elements.indexOf(draftTarget), 1);
    draftBinding.elementId = null;
    draft.automation.protections = draft.automation.protections.filter((entry) => !(
      entry.targetKind === "element" && entry.targetId === p.elementId
    ));
  }
  const after = LayoutDocumentCodecV2.parseAndNormalize(draft);
  return {
    document: after,
    inverse: inverse(before, command.commandId, command.label),
    changedElementIds: changedIds(before, after),
    invalidatedPreflightScopes: ["document", "geometry", "layers", "text"],
  };
}

function insertBefore<T extends { id: string }>(items: T[], item: T, beforeId: string | null): void {
  if (beforeId === null) {
    items.push(item);
    return;
  }
  const index = items.findIndex((value) => value.id === beforeId);
  if (index < 0) fail(`before target ${beforeId} is missing`);
  items.splice(index, 0, item);
}

function applyRestoreBound(
  before: LayoutDocumentV2,
  command: EditorCommandV2<"balloon.restore_bound">,
): ApplyLayoutCommandResultV2 {
  if (command.actor !== "user") fail("only user commands may restore a bound balloon");
  const p = command.payload;
  const binding = before.automation.dialogueBindings.find((item) => item.dialogueItemId === p.dialogueItemId);
  if (!binding || binding.disposition !== "user_suppressed") fail(`dialogue binding ${p.dialogueItemId} is not suppressed`);
  const restoredTextDigest = digestLayoutDialogueTextV1(richTextPlainTextV1(p.richText));
  const draft = structuredClone(before);
  const draftBinding = draft.automation.dialogueBindings.find((item) => item.dialogueItemId === p.dialogueItemId)!;
  let restoredId: string;
  if (draftBinding.elementId !== null) {
    if (p.create !== null) fail("hidden bound balloon restore requires create=null");
    const located = locateTarget(draft, "element", draftBinding.elementId);
    if (!located || located.canvas.id !== p.canvasId || located.element?.type !== "balloon") {
      fail(`hidden bound balloon ${draftBinding.elementId} is missing from canvas ${p.canvasId}`);
    }
    if (located.element.locked) fail(`element ${located.element.id} is locked`);
    if (!located.element.hidden) fail(`bound balloon ${located.element.id} is not hidden`);
    if (canonicalizeJson(located.element.richText) !== canonicalizeJson(p.richText)) {
      fail(`hidden bound balloon ${located.element.id} richText must stay unchanged while restoring`);
    }
    const hasUserTextProtection = before.automation.protections.some((entry) => (
      entry.targetKind === "element"
      && entry.targetId === located.element!.id
      && entry.reason === "user_edit"
      && entry.scopes.includes("text")
    ));
    if (restoredTextDigest !== binding.initialTextDigest && !hasUserTextProtection) {
      fail(`modified restored dialogue is missing user text protection for ${p.dialogueItemId}`);
    }
    located.element.hidden = false;
    located.element.richText = structuredClone(p.richText);
    restoredId = located.element.id;
  } else {
    if (restoredTextDigest !== binding.initialTextDigest) {
      fail(`restored dialogue text does not match initialTextDigest for ${p.dialogueItemId}`);
    }
    if (p.create === null) fail("deleted bound balloon restore requires create element");
    const targetCanvas = canvas(draft, p.canvasId);
    const parsed = LayoutElementCodecV1.parseAndNormalize(p.create.element, {
      canvasWidth: targetCanvas.width,
      canvasHeight: targetCanvas.height,
      projectId: draft.projectId,
      chapterId: draft.chapterId,
    });
    if (parsed.type !== "balloon") fail("restored element must be a balloon");
    if (parsed.hidden) fail("restored balloon must be visible");
    if (parsed.sourceShotId !== binding.sourceShotId) fail("restored balloon sourceShotId must match its binding");
    if (canonicalizeJson(parsed.richText) !== canonicalizeJson(p.richText)) fail("restored balloon richText must match command richText");
    insertBefore(targetCanvas.elements, parsed, p.create.beforeElementId);
    restoredId = parsed.id;
  }
  draftBinding.elementId = restoredId;
  draftBinding.disposition = "placed";
  draft.automation = clearLayoutProtectionScopesV1(
    draft.automation,
    "element",
    restoredId,
    p.clearProtectionScopes,
  );
  const retained = (["existence", "text"] as const).filter((scope) => !p.clearProtectionScopes.includes(scope));
  draft.automation = addLayoutProtectionScopesV1(
    draft.automation,
    "element",
    restoredId,
    retained,
    "user_edit",
  );
  const after = LayoutDocumentCodecV2.parseAndNormalize(draft);
  return {
    document: after,
    inverse: inverse(before, command.commandId, command.label),
    changedElementIds: changedIds(before, after),
    invalidatedPreflightScopes: ["document", "geometry", "layers", "text", "fonts"],
  };
}

export function applyLayoutCommandV2(
  input: LayoutDocumentV2,
  commandInput: ApplicableLayoutCommandV2,
): ApplyLayoutCommandResultV2 {
  const before = LayoutDocumentCodecV2.parseAndNormalize(input);
  if (commandInput.type === "layout.restore_snapshot") {
    const row = exact(commandInput, ["schemaVersion", "commandId", "type", "label", "actor", "payload"], "inverse");
    if (row.schemaVersion !== 2 || row.actor !== "system") fail("inverse must be a V2 system command");
    const payloadRow = exact(row.payload, ["document"], "inverse.payload");
    const restored = LayoutDocumentCodecV2.parseAndNormalize(payloadRow.document);
    return {
      document: restored,
      inverse: inverse(before, id(row.commandId, "inverse.commandId"), id(row.label, "inverse.label")),
      changedElementIds: changedIds(before, restored),
      invalidatedPreflightScopes: ["document", "geometry", "layers", "sources", "text", "fonts"],
    };
  }
  const command = parseEditorCommandV2(commandInput);
  if (EDITOR_COMMAND_TYPES_V1.includes(command.type as EditorCommandTypeV1)) {
    return applyV1BackedCommand(before, command as EditorCommandV2<EditorCommandTypeV1>);
  }
  if (command.type === "protection.clear") return applyProtectionClear(before, command);
  if (command.type === "balloon.suppress_bound") return applySuppressBound(before, command);
  return applyRestoreBound(before, command as EditorCommandV2<"balloon.restore_bound">);
}

export function applyLayoutCommandBatchV2(
  input: LayoutDocumentV2,
  batchInput: EditorCommandBatchV2,
): ApplyLayoutCommandResultV2 {
  const batch = parseEditorCommandBatchV2(batchInput);
  const before = LayoutDocumentCodecV2.parseAndNormalize(input);
  let current = before;
  const scopeSet = new Set<LayoutPreflightScopeV1>();
  for (const command of batch.commands) {
    const result = applyLayoutCommandV2(current, command);
    current = result.document;
    result.invalidatedPreflightScopes.forEach((scope) => scopeSet.add(scope));
  }
  return {
    document: current,
    inverse: inverse(before, batch.batchId, batch.label),
    changedElementIds: changedIds(before, current),
    invalidatedPreflightScopes: [...scopeSet],
  };
}
