import { digestCanonicalJson } from "../versioning/canonical-json.js";
import { StoryboardDocumentCodecV2 } from "../versioning/document-codec.js";
import type { StoryboardDocumentV2, StoryboardShotV2 } from "../versioning/document-contract.js";
import {
  digestLayoutDialogueTextV1,
  LayoutDocumentCodecV2,
  type LayoutDocumentV2,
} from "./automation.js";
import type { BalloonElementV1, LayoutDigest } from "./document.js";
import { normalizePlainLayoutText, richTextPlainTextV1 } from "./text.js";

export type LayoutDialogueKindV1 = "speech" | "thought" | "shout" | "caption";
export type LayoutDialogueSourceV1 = "voice_line" | "comic_dialogue" | "comic_caption";
export type LayoutDialogueNormalizationV1 = "identity" | "speaker_prefix_removed";
export type LayoutDialogueConfidenceV1 = "exact" | "inferred" | "unresolved";

export interface LayoutDialogueItemV1 {
  id: string;
  shotId: string;
  shotOrder: number;
  lineOrder: number;
  source: LayoutDialogueSourceV1;
  sourceIndex: number;
  speakerCharacterId: string | null;
  speakerName: string;
  kind: LayoutDialogueKindV1;
  sourceText: string;
  sourceTextDigest: LayoutDigest;
  text: string;
  textDigest: LayoutDigest;
  normalization: LayoutDialogueNormalizationV1;
  confidence: LayoutDialogueConfidenceV1;
}

export type LayoutDialogueIssueCodeV1 =
  | "empty_source_record"
  | "punctuation_only_record"
  | "ambiguous_placeholder"
  | "speaker_unresolved"
  | "duplicate_exact_record";

export interface LayoutDialogueIssueV1 {
  code: LayoutDialogueIssueCodeV1;
  severity: "info" | "warning";
  shotId: string;
  source: LayoutDialogueSourceV1;
  sourceIndex: number;
}

export interface LayoutDialogueLedgerV1 {
  schemaVersion: 1;
  policyVersion: "layout_dialogue_v1";
  items: LayoutDialogueItemV1[];
  issues: LayoutDialogueIssueV1[];
  ledgerDigest: LayoutDigest;
}

export interface LayoutDialogueCharacterV1 {
  characterId: string;
  name: string;
}

export interface NormalizeLayoutDialogueInputV1 {
  storyboard: StoryboardDocumentV2;
  characterCatalog: readonly LayoutDialogueCharacterV1[];
}

export interface LayoutDialogueCoverageResultV1 {
  policyVersion: "layout_dialogue_coverage_v1";
  expected: number;
  placedOriginal: number;
  userModified: number;
  userSuppressed: number;
  status: "passed";
}

export class LayoutDialogueContractError extends Error {
  readonly code: "LAYOUT_DIALOGUE_INVALID" | "LAYOUT_DIALOGUE_COVERAGE_INVALID";

  constructor(
    message: string,
    code: "LAYOUT_DIALOGUE_INVALID" | "LAYOUT_DIALOGUE_COVERAGE_INVALID" = "LAYOUT_DIALOGUE_INVALID",
  ) {
    super(message);
    this.name = "LayoutDialogueContractError";
    this.code = code;
  }
}

function fail(message: string): never {
  throw new LayoutDialogueContractError(message);
}

function coverageFail(message: string): never {
  throw new LayoutDialogueContractError(message, "LAYOUT_DIALOGUE_COVERAGE_INVALID");
}

function normalizedRecord(value: string): string {
  return normalizePlainLayoutText(value).trim();
}

function isPunctuationOnly(value: string): boolean {
  return value.replace(/[\p{P}\s]/gu, "") === "";
}

function isAmbiguousPlaceholder(value: string): boolean {
  const comparable = value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  return comparable === "无" || comparable === "none" || comparable === "null";
}

export function digestLayoutDialogueSourceTextV1(value: string): LayoutDigest {
  return digestCanonicalJson({
    policyVersion: "layout_dialogue_source_text_digest_v1",
    text: normalizedRecord(value),
  });
}

function dialogueItemId(
  shotId: string,
  source: LayoutDialogueSourceV1,
  sourceIndex: number,
  sourceTextDigest: LayoutDigest,
): string {
  const digest = digestCanonicalJson({
    policyVersion: "layout_dialogue_item_id_v1",
    shotId,
    source,
    sourceIndex,
    sourceTextDigest,
  });
  return `dialogue_${digest.slice("sha256:".length, "sha256:".length + 32)}`;
}

function kindFromVoiceStyle(voiceStyle: string, text: string): Exclude<LayoutDialogueKindV1, "caption"> {
  const style = normalizedRecord(voiceStyle);
  if (/(?:内心|心声|思考|心想|独白|\bOS\b)/iu.test(style)) return "thought";
  if (/(?:喊|怒吼|吼叫|惊呼|尖叫|咆哮|厉声|命令.*急促|急促.*命令)/u.test(style)) return "shout";
  if (/(?:急切|急促|激动|失控)/u.test(style) && /[！!]+$/u.test(text)) return "shout";
  return "speech";
}

function uniqueCharacters(
  characters: readonly LayoutDialogueCharacterV1[],
): {
  byId: ReadonlyMap<string, LayoutDialogueCharacterV1>;
  byName: ReadonlyMap<string, LayoutDialogueCharacterV1>;
} {
  const byId = new Map<string, LayoutDialogueCharacterV1>();
  const byName = new Map<string, LayoutDialogueCharacterV1>();
  for (const source of characters) {
    const characterId = source.characterId.trim();
    const name = normalizedRecord(source.name);
    if (characterId === "" || name === "") fail("characterCatalog: characterId and name must be non-empty");
    if (byId.has(characterId)) fail(`characterCatalog: duplicate characterId ${characterId}`);
    if (byName.has(name)) fail(`characterCatalog: duplicate character name ${name}`);
    const character = { characterId, name };
    byId.set(characterId, character);
    byName.set(name, character);
  }
  return { byId, byName };
}

interface ParsedSpeakerV1 {
  speakerCharacterId: string | null;
  speakerName: string;
  confidence: LayoutDialogueConfidenceV1;
}

function voiceSpeaker(
  shot: StoryboardShotV2,
  characterId: string | null,
  rawName: string,
  byId: ReadonlyMap<string, LayoutDialogueCharacterV1>,
  byName: ReadonlyMap<string, LayoutDialogueCharacterV1>,
): ParsedSpeakerV1 {
  const name = normalizedRecord(rawName);
  if (characterId !== null) {
    const character = byId.get(characterId);
    if (character && shot.characterIds.includes(characterId)) {
      return {
        speakerCharacterId: characterId,
        speakerName: name || character.name,
        confidence: "exact",
      };
    }
    return { speakerCharacterId: null, speakerName: name, confidence: "unresolved" };
  }
  const candidate = byName.get(name);
  if (candidate && shot.characterIds.includes(candidate.characterId)) {
    return {
      speakerCharacterId: candidate.characterId,
      speakerName: candidate.name,
      confidence: "inferred",
    };
  }
  return { speakerCharacterId: null, speakerName: name, confidence: "unresolved" };
}

function splitExplicitRecords(value: string): string[] {
  return normalizePlainLayoutText(value).split("\n");
}

function prefixSpeaker(
  shot: StoryboardShotV2,
  sourceText: string,
  byName: ReadonlyMap<string, LayoutDialogueCharacterV1>,
): { text: string; speaker: ParsedSpeakerV1; normalization: LayoutDialogueNormalizationV1 } {
  const fullWidth = sourceText.indexOf("：");
  const ascii = sourceText.indexOf(":");
  const separator = fullWidth < 0 ? ascii : ascii < 0 ? fullWidth : Math.min(fullWidth, ascii);
  if (separator <= 0) {
    return {
      text: sourceText,
      speaker: { speakerCharacterId: null, speakerName: "", confidence: "unresolved" },
      normalization: "identity",
    };
  }
  const prefix = sourceText.slice(0, separator).trim();
  const character = byName.get(prefix);
  if (!character || !shot.characterIds.includes(character.characterId)) {
    return {
      text: sourceText,
      speaker: { speakerCharacterId: null, speakerName: "", confidence: "unresolved" },
      normalization: "identity",
    };
  }
  return {
    text: sourceText.slice(separator + 1).trim(),
    speaker: {
      speakerCharacterId: character.characterId,
      speakerName: character.name,
      confidence: "exact",
    },
    normalization: "speaker_prefix_removed",
  };
}

function duplicateOfVoice(
  text: string,
  speakerCharacterId: string | null,
  voiceItems: readonly LayoutDialogueItemV1[],
): boolean {
  const textMatches = voiceItems.filter((item) => item.text === text);
  if (textMatches.length === 0) return false;
  if (speakerCharacterId !== null) {
    return textMatches.some((item) => item.speakerCharacterId === speakerCharacterId);
  }
  return textMatches.length === 1;
}

function duplicatePrefixedNonCharacterVoice(
  sourceText: string,
  voiceItems: readonly LayoutDialogueItemV1[],
): boolean {
  const fullWidth = sourceText.indexOf("：");
  const ascii = sourceText.indexOf(":");
  const separator = fullWidth < 0 ? ascii : ascii < 0 ? fullWidth : Math.min(fullWidth, ascii);
  if (separator <= 0) return false;
  const prefix = sourceText.slice(0, separator).trim();
  const body = sourceText.slice(separator + 1).trim();
  if (prefix === "" || body === "") return false;
  const matches = voiceItems.filter((item) => item.speakerCharacterId === null
    && item.speakerName === prefix
    && item.text === body);
  return matches.length === 1;
}

function issueForSkipped(
  value: string,
): "empty_source_record" | "punctuation_only_record" | null {
  if (value === "") return "empty_source_record";
  if (isPunctuationOnly(value)) return "punctuation_only_record";
  return null;
}

export function normalizeLayoutDialogueV1(
  input: NormalizeLayoutDialogueInputV1,
): LayoutDialogueLedgerV1 {
  const storyboard = StoryboardDocumentCodecV2.parse(input.storyboard);
  const { byId, byName } = uniqueCharacters(input.characterCatalog);
  const items: LayoutDialogueItemV1[] = [];
  const issues: LayoutDialogueIssueV1[] = [];

  const appendIssue = (
    code: LayoutDialogueIssueCodeV1,
    shotId: string,
    source: LayoutDialogueSourceV1,
    sourceIndex: number,
  ): void => {
    issues.push({
      code,
      severity: code === "duplicate_exact_record" || code === "empty_source_record" ? "info" : "warning",
      shotId,
      source,
      sourceIndex,
    });
  };

  for (const shot of storyboard.shots) {
    const shotItems: LayoutDialogueItemV1[] = [];
    const appendItem = (source: {
      source: LayoutDialogueSourceV1;
      sourceIndex: number;
      sourceText: string;
      text: string;
      speaker: ParsedSpeakerV1;
      kind: LayoutDialogueKindV1;
      normalization: LayoutDialogueNormalizationV1;
    }): void => {
      const sourceTextDigest = digestLayoutDialogueSourceTextV1(source.sourceText);
      shotItems.push({
        id: dialogueItemId(shot.id, source.source, source.sourceIndex, sourceTextDigest),
        shotId: shot.id,
        shotOrder: shot.order,
        lineOrder: shotItems.length + 1,
        source: source.source,
        sourceIndex: source.sourceIndex,
        speakerCharacterId: source.speaker.speakerCharacterId,
        speakerName: source.speaker.speakerName,
        kind: source.kind,
        sourceText: source.sourceText,
        sourceTextDigest,
        text: source.text,
        textDigest: digestLayoutDialogueTextV1(source.text),
        normalization: source.normalization,
        confidence: source.speaker.confidence,
      });
    };

    for (const [sourceIndex, line] of shot.motion.voiceLines.entries()) {
      const sourceText = normalizedRecord(line.line);
      const skipped = issueForSkipped(sourceText);
      if (skipped) {
        appendIssue(skipped, shot.id, "voice_line", sourceIndex);
        continue;
      }
      const speaker = voiceSpeaker(shot, line.characterId, line.name, byId, byName);
      if (speaker.confidence === "unresolved") appendIssue("speaker_unresolved", shot.id, "voice_line", sourceIndex);
      if (isAmbiguousPlaceholder(sourceText)) appendIssue("ambiguous_placeholder", shot.id, "voice_line", sourceIndex);
      appendItem({
        source: "voice_line",
        sourceIndex,
        sourceText,
        text: sourceText,
        speaker,
        kind: kindFromVoiceStyle(line.voiceStyle, sourceText),
        normalization: "identity",
      });
    }

    const voiceItems = [...shotItems];
    for (const [sourceIndex, record] of splitExplicitRecords(shot.comic.dialogue).entries()) {
      const sourceText = normalizedRecord(record);
      const skipped = issueForSkipped(sourceText);
      if (skipped) {
        if (shot.comic.dialogue !== "" || splitExplicitRecords(shot.comic.dialogue).length > 1) {
          appendIssue(skipped, shot.id, "comic_dialogue", sourceIndex);
        }
        continue;
      }
      const parsed = prefixSpeaker(shot, sourceText, byName);
      const parsedSkipped = issueForSkipped(parsed.text);
      if (parsedSkipped) {
        appendIssue(parsedSkipped, shot.id, "comic_dialogue", sourceIndex);
        continue;
      }
      if (
        duplicateOfVoice(parsed.text, parsed.speaker.speakerCharacterId, voiceItems)
        || (parsed.normalization === "identity" && duplicatePrefixedNonCharacterVoice(sourceText, voiceItems))
      ) {
        appendIssue("duplicate_exact_record", shot.id, "comic_dialogue", sourceIndex);
        continue;
      }
      if (parsed.speaker.confidence === "unresolved") appendIssue("speaker_unresolved", shot.id, "comic_dialogue", sourceIndex);
      if (isAmbiguousPlaceholder(parsed.text)) appendIssue("ambiguous_placeholder", shot.id, "comic_dialogue", sourceIndex);
      appendItem({
        source: "comic_dialogue",
        sourceIndex,
        sourceText,
        text: parsed.text,
        speaker: parsed.speaker,
        kind: "speech",
        normalization: parsed.normalization,
      });
    }

    const captionTexts = new Set<string>();
    for (const [sourceIndex, record] of splitExplicitRecords(shot.comic.caption).entries()) {
      const sourceText = normalizedRecord(record);
      const skipped = issueForSkipped(sourceText);
      if (skipped) {
        if (shot.comic.caption !== "" || splitExplicitRecords(shot.comic.caption).length > 1) {
          appendIssue(skipped, shot.id, "comic_caption", sourceIndex);
        }
        continue;
      }
      if (captionTexts.has(sourceText)) {
        appendIssue("duplicate_exact_record", shot.id, "comic_caption", sourceIndex);
        continue;
      }
      captionTexts.add(sourceText);
      if (isAmbiguousPlaceholder(sourceText)) appendIssue("ambiguous_placeholder", shot.id, "comic_caption", sourceIndex);
      appendItem({
        source: "comic_caption",
        sourceIndex,
        sourceText,
        text: sourceText,
        speaker: { speakerCharacterId: null, speakerName: "", confidence: "exact" },
        kind: "caption",
        normalization: "identity",
      });
    }

    items.push(...shotItems);
  }

  const ledgerBase = {
    schemaVersion: 1 as const,
    policyVersion: "layout_dialogue_v1" as const,
    items,
    issues,
  };
  return { ...ledgerBase, ledgerDigest: digestCanonicalJson(ledgerBase) };
}

function balloonsById(document: LayoutDocumentV2): ReadonlyMap<string, BalloonElementV1> {
  const result = new Map<string, BalloonElementV1>();
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) if (element.type === "balloon") result.set(element.id, element);
  }
  return result;
}

export function assertInitialLayoutDialogueCoverageV1(
  documentInput: LayoutDocumentV2,
  ledger: LayoutDialogueLedgerV1,
): LayoutDialogueCoverageResultV1 {
  const document = LayoutDocumentCodecV2.parseAndNormalize(documentInput);
  const itemById = new Map(ledger.items.map((item) => [item.id, item]));
  if (itemById.size !== ledger.items.length) coverageFail("dialogue ledger contains duplicate item IDs");
  const bindingById = new Map(document.automation.dialogueBindings.map((binding) => [binding.dialogueItemId, binding]));
  if (bindingById.size !== document.automation.dialogueBindings.length) coverageFail("document contains duplicate dialogue bindings");
  if (bindingById.size !== itemById.size) {
    coverageFail(`dialogue binding count ${bindingById.size} does not match expected ${itemById.size}`);
  }
  const balloons = balloonsById(document);
  for (const item of ledger.items) {
    const binding = bindingById.get(item.id);
    if (!binding) coverageFail(`dialogue item ${item.id} is unplaced`);
    if (binding.disposition !== "placed" || binding.elementId === null) {
      coverageFail(`initial dialogue item ${item.id} must be placed`);
    }
    if (binding.sourceShotId !== item.shotId || binding.sourceTextDigest !== item.sourceTextDigest) {
      coverageFail(`dialogue binding source mismatch for ${item.id}`);
    }
    if (binding.initialTextDigest !== item.textDigest) coverageFail(`dialogue binding text digest mismatch for ${item.id}`);
    const balloon = balloons.get(binding.elementId);
    if (!balloon || balloon.hidden) coverageFail(`dialogue balloon ${binding.elementId} is missing or hidden`);
    if (balloon.sourceShotId !== item.shotId) coverageFail(`dialogue balloon source mismatch for ${item.id}`);
    if (balloon.balloonKind !== item.kind) coverageFail(`dialogue balloon kind mismatch for ${item.id}`);
    if (balloon.speakerCharacterId !== item.speakerCharacterId) coverageFail(`dialogue balloon speaker mismatch for ${item.id}`);
    const actualTextDigest = digestLayoutDialogueTextV1(richTextPlainTextV1(balloon.richText));
    if (actualTextDigest !== item.textDigest) coverageFail(`dialogue text was rewritten for ${item.id}`);
  }
  for (const binding of document.automation.dialogueBindings) {
    if (!itemById.has(binding.dialogueItemId)) coverageFail(`unexpected dialogue binding ${binding.dialogueItemId}`);
  }
  return {
    policyVersion: "layout_dialogue_coverage_v1",
    expected: ledger.items.length,
    placedOriginal: ledger.items.length,
    userModified: 0,
    userSuppressed: 0,
    status: "passed",
  };
}
