import { digestCanonicalJson } from "../versioning/canonical-json.js";
import { StoryboardDocumentCodecV2 } from "../versioning/document-codec.js";
import type {
  PanelRhythmV2,
  StoryboardDocumentV2,
  StoryboardShotV2,
} from "../versioning/document-contract.js";
import type { LayoutDigest } from "./document.js";
import type { LayoutDialogueItemV1, LayoutDialogueLedgerV1 } from "./dialogue.js";

export type LayoutNarrativeRhythmV1 =
  | "slow"
  | "normal"
  | "fast"
  | "impact"
  | "transition";

export type LayoutNarrativeSemanticV1 =
  | "establishing"
  | "dialogue_exchange"
  | "action"
  | "reaction_detail"
  | "transition"
  | "mixed";

export interface LayoutNarrativeGroupV1 {
  groupId: string;
  order: number;
  sceneId: string | null;
  beatIds: string[];
  shotIds: string[];
  shotOrders: number[];
  dialogueItemIds: string[];
  rhythm: LayoutNarrativeRhythmV1;
  semantic: LayoutNarrativeSemanticV1;
  candidateStrategies: ["balanced", "compact", "relaxed"];
  groupDigest: LayoutDigest;
}

export interface LayoutNarrativePlanV1 {
  schemaVersion: 1;
  policyVersion: "layout_narrative_group_v1";
  groups: LayoutNarrativeGroupV1[];
  planDigest: LayoutDigest;
}

function shotHasDialogue(
  shotId: string,
  itemsByShot: ReadonlyMap<string, readonly LayoutDialogueItemV1[]>,
): boolean {
  return (itemsByShot.get(shotId) ?? []).some((item) => item.kind !== "caption");
}

function isTransition(shot: StoryboardShotV2): boolean {
  return shot.motion.frameType === "transition" || shot.comic.panelRhythm === "transition";
}

function isImpact(shot: StoryboardShotV2): boolean {
  return shot.comic.panelRhythm === "impact";
}

function compatibleScene(left: StoryboardShotV2, right: StoryboardShotV2): boolean {
  return left.sceneId === null || right.sceneId === null || left.sceneId === right.sceneId;
}

function rhythmFor(shots: readonly StoryboardShotV2[]): LayoutNarrativeRhythmV1 {
  const rhythms = shots.map((shot) => shot.comic.panelRhythm);
  if (rhythms.includes("transition")) return "transition";
  if (rhythms.includes("impact")) return "impact";
  if (rhythms.includes("fast")) return "fast";
  if (rhythms.every((rhythm) => rhythm === "slow")) return "slow";
  return "normal";
}

function semanticFor(
  shots: readonly StoryboardShotV2[],
  itemsByShot: ReadonlyMap<string, readonly LayoutDialogueItemV1[]>,
): LayoutNarrativeSemanticV1 {
  if (shots.every(isTransition)) return "transition";
  const frames = new Set(shots.map((shot) => shot.motion.frameType));
  if (shots.some((shot) => shotHasDialogue(shot.id, itemsByShot)) && frames.size <= 3) {
    return "dialogue_exchange";
  }
  if (shots.some((shot) => shot.motion.frameType === "action" || isImpact(shot))) return "action";
  if (shots.every((shot) => shot.motion.frameType === "reaction" || shot.motion.frameType === "detail")) {
    return "reaction_detail";
  }
  if (shots.some((shot) => shot.motion.frameType === "atmosphere" || shot.shotType === "establishing")) {
    return "establishing";
  }
  return "mixed";
}

function makeGroup(
  shots: readonly StoryboardShotV2[],
  order: number,
  itemsByShot: ReadonlyMap<string, readonly LayoutDialogueItemV1[]>,
): LayoutNarrativeGroupV1 {
  const beatIds = [...new Set(shots.flatMap((shot) => shot.beatId === null ? [] : [shot.beatId]))];
  const dialogueItemIds = shots.flatMap((shot) => (itemsByShot.get(shot.id) ?? []).map((item) => item.id));
  const projection = {
    policyVersion: "layout_narrative_group_v1",
    order,
    sceneId: shots.every((shot) => shot.sceneId === shots[0]!.sceneId) ? shots[0]!.sceneId : null,
    beatIds,
    shotIds: shots.map((shot) => shot.id),
    dialogueItemIds,
    rhythm: rhythmFor(shots),
    semantic: semanticFor(shots, itemsByShot),
  } as const;
  const groupDigest = digestCanonicalJson(projection);
  return {
    groupId: `narrative_${groupDigest.slice("sha256:".length, "sha256:".length + 24)}`,
    order,
    sceneId: projection.sceneId,
    beatIds,
    shotIds: projection.shotIds,
    shotOrders: shots.map((shot) => shot.order),
    dialogueItemIds,
    rhythm: projection.rhythm,
    semantic: projection.semantic,
    candidateStrategies: ["balanced", "compact", "relaxed"],
    groupDigest,
  };
}

function itemsByShot(ledger: LayoutDialogueLedgerV1): ReadonlyMap<string, readonly LayoutDialogueItemV1[]> {
  const result = new Map<string, LayoutDialogueItemV1[]>();
  for (const item of ledger.items) {
    const list = result.get(item.shotId) ?? [];
    list.push(item);
    result.set(item.shotId, list);
  }
  return result;
}

function shouldJoin(
  current: readonly StoryboardShotV2[],
  shot: StoryboardShotV2,
  dialogueByShot: ReadonlyMap<string, readonly LayoutDialogueItemV1[]>,
): boolean {
  if (current.length === 0) return true;
  const previous = current.at(-1)!;
  if (!compatibleScene(previous, shot)) return false;
  if (isTransition(previous) || isTransition(shot)) return false;
  if (current.length >= 4) return false;

  const currentHasImpact = current.some(isImpact);
  if (currentHasImpact) {
    return current.length === 1
      && previous.beatId === shot.beatId
      && shot.motion.frameType === "reaction";
  }
  if (isImpact(shot)) {
    return current.length === 1
      && previous.beatId === shot.beatId
      && previous.comic.panelRhythm !== "impact";
  }
  if (previous.beatId !== null && previous.beatId === shot.beatId) return true;

  const dialogueContinues = shotHasDialogue(previous.id, dialogueByShot)
    && shotHasDialogue(shot.id, dialogueByShot);
  return dialogueContinues && current.length < 2;
}

export function buildLayoutNarrativeGroupsV1(
  storyboardInput: StoryboardDocumentV2,
  dialogueLedger: LayoutDialogueLedgerV1,
): LayoutNarrativePlanV1 {
  const storyboard = StoryboardDocumentCodecV2.parse(storyboardInput);
  const dialogueByShot = itemsByShot(dialogueLedger);
  const shotIds = new Set(storyboard.shots.map((shot) => shot.id));
  if (dialogueLedger.items.some((item) => !shotIds.has(item.shotId))) {
    throw new Error("layout dialogue ledger references a shot outside the storyboard");
  }

  const rawGroups: StoryboardShotV2[][] = [];
  let current: StoryboardShotV2[] = [];
  const flush = (): void => {
    if (current.length > 0) rawGroups.push(current);
    current = [];
  };

  for (const shot of storyboard.shots) {
    if (isTransition(shot)) {
      flush();
      rawGroups.push([shot]);
      continue;
    }
    if (!shouldJoin(current, shot, dialogueByShot)) flush();
    current.push(shot);
    if (isImpact(shot)) flush();
  }
  flush();

  const groups = rawGroups.map((shots, index) => makeGroup(shots, index + 1, dialogueByShot));
  const projection = {
    schemaVersion: 1 as const,
    policyVersion: "layout_narrative_group_v1" as const,
    groups,
  };
  return { ...projection, planDigest: digestCanonicalJson(projection) };
}

export function isSlowLayoutRhythmV1(rhythm: PanelRhythmV2): boolean {
  return rhythm === "slow" || rhythm === "transition";
}
