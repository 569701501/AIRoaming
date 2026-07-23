import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  digestCandidateImageSourceV1,
  digestCanonicalJson,
  digestLayoutSourceLockSet,
  initializeLayoutCanvasesFromSourcesV1,
  LayoutDocumentCodecV1,
  StoryboardDocumentCodecV2,
  type LayoutCanvasV1,
  type LayoutDigest,
  type LayoutDocumentV1,
  type LayoutProfileV1,
  type LayoutSourceCatalogItemV1,
  type PanelFrameElementV1,
  type StoryboardDocumentV2,
} from "../../../packages/shared/src/index.ts";
import {
  SMART_LAYOUT_CHARACTERS,
  SMART_LAYOUT_GROUPS,
  type LayoutIntent,
  type ShotSeed,
  type VariantSeed,
} from "./corpus-seeds.ts";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(fixtureRoot, "../../..");
const assetRoot = path.join(fixtureRoot, "assets");
const generatedFixtureRoot = path.join(fixtureRoot, "fixtures");
const require = createRequire(path.join(repoRoot, "apps/server/package.json"));
const { PNG } = require("pngjs") as {
  PNG: {
    new(options: { width: number; height: number }): { width: number; height: number; data: Buffer };
    sync: { write(value: { width: number; height: number; data: Buffer }, options?: object): Buffer };
  };
};

const SOURCE_DATE = "2026-07-22T00:00:00.000Z";
const FONT_ID = "asset_font_sml_noto_sc_400";
const FONT_SHA256 = "sha256:e1f8a59c19da8a5d97b7703d07ee2416e86cbc3b30fb20cb0d6fd30df43364ce" as const;

interface SubjectBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AssetDefinition {
  name: string;
  width: number;
  height: number;
  subjectBoxes: SubjectBox[];
  palette: { background: [number, number, number]; stripe: [number, number, number]; subject: [number, number, number] };
}

interface GeneratedAsset extends AssetDefinition {
  assetId: string;
  fileName: string;
  relativePath: string;
  bytes: number;
  sha256: LayoutDigest;
  mimeType: "image/png";
  status: "ready";
}

const ASSET_DEFINITIONS: AssetDefinition[] = [
  { name: "landscape_left", width: 1280, height: 720, subjectBoxes: [{ x: 0.04, y: 0.18, width: 0.28, height: 0.72 }], palette: { background: [25, 45, 78], stripe: [39, 67, 111], subject: [96, 165, 250] } },
  { name: "landscape_center", width: 1280, height: 720, subjectBoxes: [{ x: 0.36, y: 0.16, width: 0.28, height: 0.74 }], palette: { background: [57, 36, 74], stripe: [87, 51, 108], subject: [192, 132, 252] } },
  { name: "landscape_right", width: 1280, height: 720, subjectBoxes: [{ x: 0.68, y: 0.18, width: 0.28, height: 0.72 }], palette: { background: [28, 69, 63], stripe: [38, 99, 88], subject: [52, 211, 153] } },
  { name: "landscape_pair_edges", width: 1280, height: 720, subjectBoxes: [{ x: 0.02, y: 0.2, width: 0.25, height: 0.7 }, { x: 0.73, y: 0.2, width: 0.25, height: 0.7 }], palette: { background: [75, 36, 45], stripe: [111, 50, 61], subject: [251, 113, 133] } },
  { name: "landscape_group", width: 1280, height: 720, subjectBoxes: [{ x: 0.02, y: 0.26, width: 0.2, height: 0.64 }, { x: 0.27, y: 0.2, width: 0.2, height: 0.7 }, { x: 0.53, y: 0.2, width: 0.2, height: 0.7 }, { x: 0.78, y: 0.26, width: 0.2, height: 0.64 }], palette: { background: [65, 51, 24], stripe: [104, 80, 35], subject: [250, 204, 21] } },
  { name: "landscape_detail_bottom", width: 1280, height: 720, subjectBoxes: [{ x: 0.38, y: 0.61, width: 0.24, height: 0.34 }], palette: { background: [25, 57, 68], stripe: [34, 83, 98], subject: [34, 211, 238] } },
  { name: "portrait_left", width: 720, height: 1280, subjectBoxes: [{ x: 0.04, y: 0.16, width: 0.4, height: 0.76 }], palette: { background: [42, 42, 72], stripe: [61, 61, 105], subject: [129, 140, 248] } },
  { name: "portrait_center", width: 720, height: 1280, subjectBoxes: [{ x: 0.3, y: 0.1, width: 0.4, height: 0.82 }], palette: { background: [64, 38, 57], stripe: [100, 54, 84], subject: [244, 114, 182] } },
  { name: "portrait_right", width: 720, height: 1280, subjectBoxes: [{ x: 0.56, y: 0.16, width: 0.4, height: 0.76 }], palette: { background: [39, 62, 44], stripe: [55, 91, 62], subject: [74, 222, 128] } },
  { name: "portrait_pair", width: 720, height: 1280, subjectBoxes: [{ x: 0.03, y: 0.22, width: 0.42, height: 0.7 }, { x: 0.55, y: 0.22, width: 0.42, height: 0.7 }], palette: { background: [70, 43, 35], stripe: [107, 62, 47], subject: [251, 146, 60] } },
  { name: "square_left", width: 1024, height: 1024, subjectBoxes: [{ x: 0.04, y: 0.16, width: 0.42, height: 0.76 }], palette: { background: [30, 58, 77], stripe: [41, 83, 110], subject: [56, 189, 248] } },
  { name: "square_center", width: 1024, height: 1024, subjectBoxes: [{ x: 0.29, y: 0.12, width: 0.42, height: 0.8 }], palette: { background: [65, 40, 71], stripe: [96, 56, 105], subject: [217, 70, 239] } },
  { name: "square_right", width: 1024, height: 1024, subjectBoxes: [{ x: 0.54, y: 0.16, width: 0.42, height: 0.76 }], palette: { background: [34, 66, 55], stripe: [46, 96, 77], subject: [45, 212, 191] } },
  { name: "wide_environment", width: 1536, height: 864, subjectBoxes: [{ x: 0.05, y: 0.28, width: 0.9, height: 0.5 }], palette: { background: [32, 48, 69], stripe: [46, 69, 99], subject: [148, 163, 184] } },
  { name: "wide_group_edges", width: 1536, height: 864, subjectBoxes: [{ x: 0.01, y: 0.2, width: 0.24, height: 0.72 }, { x: 0.38, y: 0.14, width: 0.24, height: 0.78 }, { x: 0.75, y: 0.2, width: 0.24, height: 0.72 }], palette: { background: [73, 40, 36], stripe: [112, 57, 49], subject: [248, 113, 113] } },
  { name: "tall_action", width: 768, height: 1365, subjectBoxes: [{ x: 0.22, y: 0.03, width: 0.56, height: 0.94 }], palette: { background: [47, 50, 31], stripe: [76, 81, 43], subject: [190, 242, 100] } },
  { name: "portrait_replacement", width: 720, height: 1280, subjectBoxes: [{ x: 0.2, y: 0.12, width: 0.6, height: 0.82 }], palette: { background: [38, 54, 76], stripe: [52, 77, 109], subject: [125, 211, 252] } },
];

function sha256(bytes: Uint8Array): LayoutDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function setPixel(data: Buffer, width: number, x: number, y: number, color: readonly [number, number, number], alpha = 255): void {
  const offset = (y * width + x) * 4;
  data[offset] = color[0];
  data[offset + 1] = color[1];
  data[offset + 2] = color[2];
  data[offset + 3] = alpha;
}

function drawAsset(definition: AssetDefinition): Buffer {
  const image = new PNG({ width: definition.width, height: definition.height });
  for (let y = 0; y < definition.height; y += 1) {
    for (let x = 0; x < definition.width; x += 1) {
      const grid = x % Math.max(48, Math.round(definition.width / 12)) < 3 || y % Math.max(48, Math.round(definition.height / 12)) < 3;
      setPixel(image.data, definition.width, x, y, grid ? definition.palette.stripe : definition.palette.background);
    }
  }
  for (const [boxIndex, box] of definition.subjectBoxes.entries()) {
    const left = Math.round(box.x * definition.width);
    const top = Math.round(box.y * definition.height);
    const right = Math.round((box.x + box.width) * definition.width);
    const bottom = Math.round((box.y + box.height) * definition.height);
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    const radiusX = Math.max(1, (right - left) / 2);
    const radiusY = Math.max(1, (bottom - top) / 2);
    for (let y = Math.max(0, top); y < Math.min(definition.height, bottom); y += 1) {
      for (let x = Math.max(0, left); x < Math.min(definition.width, right); x += 1) {
        const dx = (x - centerX) / radiusX;
        const dy = (y - centerY) / radiusY;
        if (dx * dx + dy * dy <= 1) setPixel(image.data, definition.width, x, y, definition.palette.subject);
      }
    }
    const faceRadius = Math.max(10, Math.round(Math.min(radiusX, radiusY) * 0.35));
    const faceX = Math.round(centerX);
    const faceY = Math.round(top + (bottom - top) * 0.28);
    for (let y = Math.max(0, faceY - faceRadius); y < Math.min(definition.height, faceY + faceRadius); y += 1) {
      for (let x = Math.max(0, faceX - faceRadius); x < Math.min(definition.width, faceX + faceRadius); x += 1) {
        const dx = x - faceX;
        const dy = y - faceY;
        if (dx * dx + dy * dy <= faceRadius * faceRadius) setPixel(image.data, definition.width, x, y, [255, 237, 213]);
      }
    }
    const eyeOffset = Math.max(3, Math.round(faceRadius * 0.35));
    const eyeRadius = Math.max(2, Math.round(faceRadius * 0.09));
    for (const eyeX of [faceX - eyeOffset, faceX + eyeOffset]) {
      for (let y = faceY - eyeRadius; y <= faceY + eyeRadius; y += 1) {
        for (let x = eyeX - eyeRadius; x <= eyeX + eyeRadius; x += 1) {
          if (x >= 0 && y >= 0 && x < definition.width && y < definition.height) setPixel(image.data, definition.width, x, y, [15, 23, 42]);
        }
      }
    }
    const borderColor: [number, number, number] = boxIndex % 2 === 0 ? [255, 255, 255] : [253, 224, 71];
    const borderWidth = Math.max(4, Math.round(Math.min(definition.width, definition.height) / 160));
    for (let offset = 0; offset < borderWidth; offset += 1) {
      for (let x = left; x <= right; x += 1) {
        if (x >= 0 && x < definition.width && top + offset >= 0 && top + offset < definition.height) setPixel(image.data, definition.width, x, top + offset, borderColor);
        if (x >= 0 && x < definition.width && bottom - offset >= 0 && bottom - offset < definition.height) setPixel(image.data, definition.width, x, bottom - offset, borderColor);
      }
      for (let y = top; y <= bottom; y += 1) {
        if (left + offset >= 0 && left + offset < definition.width && y >= 0 && y < definition.height) setPixel(image.data, definition.width, left + offset, y, borderColor);
        if (right - offset >= 0 && right - offset < definition.width && y >= 0 && y < definition.height) setPixel(image.data, definition.width, right - offset, y, borderColor);
      }
    }
  }
  return PNG.sync.write(image, { colorType: 6, inputColorType: 6, bitDepth: 8, inputHasAlpha: true });
}

function profileFor(format: VariantSeed["format"]): LayoutProfileV1 {
  return format === "paged_comic"
    ? { kind: "paged", presetId: "portrait_3_4", width: 1800, height: 2400, safeArea: { top: 72, right: 72, bottom: 72, left: 72 }, panelReadingDirection: "ltr_ttb" }
    : { kind: "vertical_strip", presetId: "webtoon_1080", width: 1080, defaultSectionHeight: 1920, safeInsetX: 64 };
}

function publicationProfileFor(format: VariantSeed["format"]) {
  return format === "paged_comic"
    ? { schemaVersion: 1 as const, kind: "paged_publication" as const, outputScale: 1 as const, includePdf: true, pdfPixelDpi: 96 as const }
    : { schemaVersion: 1 as const, kind: "vertical_publication" as const, outputScale: 1 as const, maxSliceHeightPx: 8192, cutPolicy: "prefer_section_boundary_then_exact" as const, includeLongPng: true };
}

function composeStoryboard(variant: VariantSeed): {
  storyContext: { scenes: Array<{ id: string; name: string }>; beats: Array<{ id: string; title: string; sceneId: string }> };
  document: StoryboardDocumentV2;
} {
  const sceneByName = new Map<string, string>();
  const beatByKey = new Map<string, string>();
  for (const shot of variant.shots) {
    if (!sceneByName.has(shot.scene)) sceneByName.set(shot.scene, `${variant.variantId}_scene_${sceneByName.size + 1}`);
    const beatKey = `${shot.scene}\0${shot.beat}`;
    if (!beatByKey.has(beatKey)) beatByKey.set(beatKey, `${variant.variantId}_beat_${beatByKey.size + 1}`);
  }
  const shots = variant.shots.map((shot, index) => ({
    id: `${variant.variantId}_shot_${String(index + 1).padStart(2, "0")}`,
    order: index + 1,
    beatId: beatByKey.get(`${shot.scene}\0${shot.beat}`)!,
    sceneId: sceneByName.get(shot.scene)!,
    characterIds: shot.characters,
    coreAction: shot.coreAction,
    emotion: shot.emotion,
    shotType: shot.shotType,
    cameraAngle: shot.cameraAngle,
    comic: {
      panelDescription: shot.coreAction,
      composition: `布局意图：${shot.layoutIntent}`,
      dialogue: shot.comicDialogue ?? (shot.voices ?? []).map((item) => `${item.name}：${item.line}`).join("\n"),
      caption: shot.caption ?? "",
      panelRhythm: shot.rhythm,
    },
    motion: {
      visualDescription: shot.coreAction,
      compositionDesign: `景别 ${shot.shotType}，布局意图 ${shot.layoutIntent}`,
      cameraMovement: shot.frameType === "action" ? "handheld" as const : "static" as const,
      frameType: shot.frameType,
      durationMs: shot.rhythm === "slow" ? 2200 : shot.rhythm === "impact" ? 800 : 1400,
      durationHint: shot.rhythm,
      voiceLines: (shot.voices ?? []).map(({ expectedBalloonKind: _kind, ...line }) => line),
    },
    promptDraft: "",
  }));
  const document = StoryboardDocumentCodecV2.encode({
    schemaVersion: 2,
    chapterId: `chapter_${variant.variantId}`,
    shots,
    notes: `M0 固定语料：${variant.title}`,
  }).value;
  return {
    storyContext: {
      scenes: [...sceneByName.entries()].map(([name, id]) => ({ id, name })),
      beats: [...beatByKey.entries()].map(([key, id]) => {
        const [sceneName, title] = key.split("\0");
        return { id, title: title!, sceneId: sceneByName.get(sceneName!)! };
      }),
    },
    document,
  };
}

function createSources(variant: VariantSeed, storyboard: StoryboardDocumentV2, assets: ReadonlyMap<string, GeneratedAsset>): Array<LayoutSourceCatalogItemV1 & { assetSha256: LayoutDigest; status: "ready" }> {
  return storyboard.shots.map((shot, index) => {
    const asset = assets.get(variant.shots[index]!.visualAsset);
    if (!asset) throw new Error(`SMART_LAYOUT_ASSET_UNKNOWN:${variant.shots[index]!.visualAsset}`);
    const unsigned = {
      shotId: shot.id,
      candidateId: `${variant.variantId}_candidate_${String(index + 1).padStart(2, "0")}`,
      candidateLockRevisionId: `${variant.variantId}_lock_${String(index + 1).padStart(2, "0")}`,
      assetId: asset.assetId,
    };
    return {
      order: shot.order,
      width: asset.width,
      height: asset.height,
      status: "ready" as const,
      assetSha256: asset.sha256,
      source: { ...unsigned, sourceDigest: digestCandidateImageSourceV1(unsigned, asset.sha256) },
    };
  });
}

function currentLayoutDocument(variant: VariantSeed, sources: readonly LayoutSourceCatalogItemV1[]): LayoutDocumentV1 {
  const counters = { canvas: 0, panel: 0, image: 0 };
  const profile = profileFor(variant.format);
  const canvases = initializeLayoutCanvasesFromSourcesV1({
    profile,
    sources,
    createId: (kind) => `${variant.variantId}_${kind}_${++counters[kind]}`,
  });
  return LayoutDocumentCodecV1.encode({
    schemaVersion: 1,
    kind: "layout_document_v1",
    projectId: `project_${variant.variantId}`,
    chapterId: `chapter_${variant.variantId}`,
    comicFormat: variant.format,
    profile,
    fontPolicy: { defaultFontAssetId: FONT_ID, fallbackFontAssetIds: [] },
    canvases,
  }).value;
}

function dialogueLedger(variant: VariantSeed, storyboard: StoryboardDocumentV2) {
  const items: Array<Record<string, unknown>> = [];
  for (const [shotIndex, shot] of storyboard.shots.entries()) {
    const seed = variant.shots[shotIndex]!;
    for (const [lineIndex, line] of (seed.voices ?? []).entries()) {
      items.push({
        itemId: `${variant.variantId}_dialogue_${String(shot.order).padStart(2, "0")}_${lineIndex + 1}`,
        kind: "dialogue",
        source: "motion.voiceLines",
        shotId: shot.id,
        sourceOrder: lineIndex + 1,
        characterId: line.characterId,
        speakerName: line.name,
        text: line.line,
        textDigest: digestCanonicalJson(line.line),
        expectedBalloonKind: line.expectedBalloonKind,
      });
    }
    if ((seed.voices ?? []).length === 0 && seed.comicDialogue?.trim()) {
      items.push({
        itemId: `${variant.variantId}_dialogue_${String(shot.order).padStart(2, "0")}_fallback`,
        kind: "dialogue",
        source: "comic.dialogue",
        shotId: shot.id,
        sourceOrder: 1,
        characterId: null,
        speakerName: null,
        text: seed.comicDialogue,
        textDigest: digestCanonicalJson(seed.comicDialogue),
        expectedBalloonKind: "speech",
      });
    }
    if (seed.caption?.trim()) {
      items.push({
        itemId: `${variant.variantId}_caption_${String(shot.order).padStart(2, "0")}`,
        kind: "caption",
        source: "comic.caption",
        shotId: shot.id,
        sourceOrder: 1,
        characterId: null,
        speakerName: null,
        text: seed.caption,
        textDigest: digestCanonicalJson(seed.caption),
        expectedBalloonKind: "caption",
      });
    }
  }
  return { schemaVersion: 1, items, digest: digestCanonicalJson(items) };
}

function geometryMatchesIntent(intent: LayoutIntent, panel: PanelFrameElementV1, canvas: LayoutCanvasV1): boolean {
  const areaRatio = (panel.transform.width * panel.transform.height) / (canvas.width * canvas.height);
  const aspect = panel.transform.width / panel.transform.height;
  const paged = canvas.kind === "page";
  switch (intent) {
    case "standard": return paged ? areaRatio >= 0.14 && areaRatio <= 0.31 : areaRatio >= 0.25 && areaRatio <= 0.75;
    case "focus": return paged ? areaRatio >= 0.38 : areaRatio >= 0.65;
    case "impact": return paged ? areaRatio >= 0.34 : areaRatio >= 0.65;
    case "wide": return aspect >= 1.2 && areaRatio >= (paged ? 0.18 : 0.2);
    case "detail": return areaRatio <= (paged ? 0.22 : 0.28);
    case "pause": return areaRatio <= (paged ? 0.18 : 0.22);
    case "transition": return aspect >= 1.1 && areaRatio <= (paged ? 0.3 : 0.32);
  }
}

function subjectFitsCenterCover(panel: PanelFrameElementV1, asset: GeneratedAsset): boolean {
  const frameAspect = panel.transform.width / panel.transform.height;
  const sourceAspect = asset.width / asset.height;
  let visible = { x: 0, y: 0, width: 1, height: 1 };
  if (sourceAspect > frameAspect) {
    visible.width = frameAspect / sourceAspect;
    visible.x = (1 - visible.width) / 2;
  } else if (sourceAspect < frameAspect) {
    visible.height = sourceAspect / frameAspect;
    visible.y = (1 - visible.height) / 2;
  }
  const tolerance = 0.015;
  return asset.subjectBoxes.every((box) => box.x >= visible.x - tolerance
    && box.y >= visible.y - tolerance
    && box.x + box.width <= visible.x + visible.width + tolerance
    && box.y + box.height <= visible.y + visible.height + tolerance);
}

function baselineAssessment(
  variant: VariantSeed,
  storyboard: StoryboardDocumentV2,
  document: LayoutDocumentV1,
  assets: ReadonlyMap<string, GeneratedAsset>,
  requiredBalloonCount: number,
) {
  const orderByShotId = new Map(storyboard.shots.map((shot) => [shot.id, shot.order]));
  const targetGroupByOrder = new Map<number, number[]>();
  for (const group of variant.targetNarrativeGroups) for (const order of group) targetGroupByOrder.set(order, group);
  const panels: Array<Record<string, unknown>> = [];
  for (const canvas of document.canvases) {
    const canvasPanels = canvas.elements.filter((element): element is PanelFrameElementV1 => element.type === "panel_frame" && element.contentImage !== null);
    const canvasOrders = canvasPanels.map((panel) => orderByShotId.get(panel.contentImage!.source.shotId)!).sort((left, right) => left - right);
    for (const panel of canvasPanels) {
      const order = orderByShotId.get(panel.contentImage!.source.shotId)!;
      const seed = variant.shots[order - 1]!;
      const asset = assets.get(seed.visualAsset)!;
      const targetGroup = targetGroupByOrder.get(order)!;
      const groupMatches = JSON.stringify(canvasOrders) === JSON.stringify(targetGroup);
      const geometryIntentOk = geometryMatchesIntent(seed.layoutIntent, panel, canvas);
      const layoutOk = groupMatches && geometryIntentOk;
      const cropOk = subjectFitsCenterCover(panel, asset);
      const readingOrderOk = canvas.panelReadingOrder.indexOf(panel.id) === canvasPanels.indexOf(panel);
      const subjectOcclusionOk = true;
      const directUsable = layoutOk && cropOk && readingOrderOk && subjectOcclusionOk;
      panels.push({
        shotId: panel.contentImage!.source.shotId,
        shotOrder: order,
        canvasId: canvas.id,
        panelId: panel.id,
        layoutIntent: seed.layoutIntent,
        targetNarrativeGroup: targetGroup,
        currentCanvasOrders: canvasOrders,
        groupMatches,
        geometryIntentOk,
        layoutOk,
        cropOk,
        readingOrderOk,
        subjectOcclusionOk,
        directUsable,
        requiredManualAdjustments: [
          ...(layoutOk ? [] : ["layout"]),
          ...(cropOk ? [] : ["crop"]),
        ],
      });
    }
  }
  const panelDirectUsableCount = panels.filter((item) => item.directUsable).length;
  const panelsNeedingLayoutAdjustment = panels.filter((item) => !item.layoutOk).length;
  const panelsNeedingCropAdjustment = panels.filter((item) => !item.cropOk).length;
  return {
    schemaVersion: 1,
    status: "red",
    reasonCodes: ["CURRENT_LAYOUT_FIXED_COUNT_ONLY", "CURRENT_LAYOUT_HAS_NO_DIALOGUE_OBJECTS", "CURRENT_LAYOUT_HAS_NO_SEMANTIC_CROP"],
    scoringBasis: "deterministic_rubric_pending_two_independent_human_reviews",
    panelReview: panels,
    balloonReview: {
      requiredSourceItemCount: requiredBalloonCount,
      placedBalloonCount: 0,
      directUsableCount: 0,
      directUsableRate: requiredBalloonCount === 0 ? null : 0,
      applicability: requiredBalloonCount === 0 ? "not_applicable_no_dialogue_or_caption" : "failed_all_required_items_missing",
    },
    summary: {
      shotCount: storyboard.shots.length,
      panelCount: panels.length,
      panelDirectUsableCount,
      panelDirectUsableRate: panels.length === 0 ? null : panelDirectUsableCount / panels.length,
      panelsNeedingLayoutAdjustment,
      panelsNeedingCropAdjustment,
      dialogueOrCaptionItemsNeedingCreation: requiredBalloonCount,
      minimumObjectAdjustments: panelsNeedingLayoutAdjustment + panelsNeedingCropAdjustment + requiredBalloonCount,
      currentShotCoverageRate: panels.length / storyboard.shots.length,
      currentDialogueAndCaptionCoverageRate: requiredBalloonCount === 0 ? null : 0,
    },
  };
}

async function generateAssets(): Promise<Map<string, GeneratedAsset>> {
  await mkdir(assetRoot, { recursive: true });
  const assets = new Map<string, GeneratedAsset>();
  for (const definition of ASSET_DEFINITIONS) {
    const bytes = drawAsset(definition);
    const fileName = `${definition.name}.png`;
    await writeFile(path.join(assetRoot, fileName), bytes);
    assets.set(definition.name, {
      ...definition,
      assetId: `asset_sml_${definition.name}`,
      fileName,
      relativePath: `assets/${fileName}`,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      mimeType: "image/png",
      status: "ready",
    });
  }
  return assets;
}

async function generateFont() {
  const sourcePath = require.resolve("@openfonts/noto-sans-sc_chinese-simplified/files/noto-sans-sc-chinese-simplified-400.woff2");
  const bytes = await readFile(sourcePath);
  if (sha256(bytes) !== FONT_SHA256) throw new Error("SMART_LAYOUT_FONT_DIGEST_MISMATCH");
  const fileName = "noto-sans-sc-chinese-simplified-400.woff2";
  await writeFile(path.join(assetRoot, fileName), bytes);
  const metadata = {
    schemaVersion: 1,
    kind: "layout_font_asset_v1",
    packageId: "@openfonts/noto-sans-sc_chinese-simplified@1.44.9",
    familyName: "Noto Sans SC",
    displayName: "Noto Sans SC 受控常规体",
    face: { weight: 400, style: "normal" },
    format: "woff2",
    license: { spdx: "OFL-1.1", sourceUrl: "https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE", embeddingAllowed: true },
  };
  return {
    assetId: FONT_ID,
    role: "font" as const,
    relativePath: `assets/${fileName}`,
    mimeType: "font/woff2",
    sha256: FONT_SHA256,
    bytes: bytes.byteLength,
    metadata,
    metadataDigest: digestCanonicalJson(metadata),
    status: "ready" as const,
  };
}

async function main(): Promise<void> {
  await mkdir(generatedFixtureRoot, { recursive: true });
  const assets = await generateAssets();
  const font = await generateFont();
  const manifestVariants: Array<Record<string, unknown>> = [];
  const manifestGroups: Array<Record<string, unknown>> = [];

  for (const group of SMART_LAYOUT_GROUPS) {
    const groupVariants: string[] = [];
    for (const variant of group.variants) {
      groupVariants.push(variant.variantId);
      const { storyContext, document: storyboard } = composeStoryboard(variant);
      const storyboardEncoded = StoryboardDocumentCodecV2.encode(storyboard);
      const sources = createSources(variant, storyboard, assets);
      const layoutDocument = currentLayoutDocument(variant, sources);
      const layoutEncoded = LayoutDocumentCodecV1.encode(layoutDocument);
      const sourceLockSetDigest = digestLayoutSourceLockSet(layoutDocument, storyboard.shots.map((shot) => shot.id));
      if (!sourceLockSetDigest) throw new Error(`SMART_LAYOUT_SOURCE_LOCK_DIGEST_MISSING:${variant.variantId}`);
      const ledger = dialogueLedger(variant, storyboard);
      const usedAssets = [...new Set(sources.map((item) => item.source.assetId))]
        .map((assetId) => [...assets.values()].find((item) => item.assetId === assetId)!)
        .sort((left, right) => left.assetId.localeCompare(right.assetId));
      const imageManifest = usedAssets.map((asset) => ({
        assetId: asset.assetId,
        role: "candidate_image" as const,
        relativePath: asset.relativePath,
        mimeType: asset.mimeType,
        sha256: asset.sha256,
        bytes: asset.bytes,
        width: asset.width,
        height: asset.height,
      }));
      const replacementAsset = variant.replacementAsset ? assets.get(variant.replacementAsset) : null;
      const replacementSource = replacementAsset && variant.replacementAtOrder
        ? (() => {
            const shot = storyboard.shots[variant.replacementAtOrder! - 1]!;
            const unsigned = {
              shotId: shot.id,
              candidateId: `${variant.variantId}_candidate_replacement`,
              candidateLockRevisionId: `${variant.variantId}_lock_replacement`,
              assetId: replacementAsset.assetId,
            };
            return { ...unsigned, sourceDigest: digestCandidateImageSourceV1(unsigned, replacementAsset.sha256) };
          })()
        : null;
      const assessment = baselineAssessment(variant, storyboard, layoutDocument, assets, ledger.items.length);
      const fixture = {
        fixtureSchemaVersion: 1,
        kind: "smart_layout_m0_fixture_v1",
        sourceDate: SOURCE_DATE,
        group: { groupId: group.groupId, title: group.title },
        variant: {
          variantId: variant.variantId,
          title: variant.title,
          comicFormat: variant.format,
          coverageTags: variant.coverageTags,
          targetNarrativeGroups: variant.targetNarrativeGroups,
          shotLayoutIntents: variant.shots.map((shot, index) => ({ shotOrder: index + 1, intent: shot.layoutIntent, visualAsset: shot.visualAsset })),
        },
        inputs: {
          storyContext,
          storyboardVersion: {
            id: `storyboard_version_${variant.variantId}`,
            revision: 1,
            position: "current",
            schemaVersion: 2,
            documentDigest: storyboardEncoded.digest,
            document: storyboardEncoded.value,
          },
          characterCatalog: SMART_LAYOUT_CHARACTERS.filter((character) => storyboard.shots.some((shot) => shot.characterIds.includes(character.id))),
          candidateLockSet: {
            state: "complete",
            sourceApplicability: "current",
            digest: sourceLockSetDigest,
            items: sources.map((item) => ({
              order: item.order,
              shotId: item.source.shotId,
              candidateId: item.source.candidateId,
              candidateLockRevisionId: item.source.candidateLockRevisionId,
              assetId: item.source.assetId,
              assetSha256: item.assetSha256,
              width: item.width,
              height: item.height,
              status: item.status,
            })),
          },
          sourceCatalog: {
            schemaVersion: 1,
            projectId: layoutDocument.projectId,
            chapterId: layoutDocument.chapterId,
            sourceLockSetDigest,
            items: sources,
          },
          fontAsset: font,
          dialogueLedger: ledger,
        },
        replacementScenario: replacementSource && replacementAsset ? {
          status: "ready",
          shotOrder: variant.replacementAtOrder,
          shotId: replacementSource.shotId,
          currentSource: sources[variant.replacementAtOrder! - 1]!.source,
          nextSource: replacementSource,
          nextAsset: {
            assetId: replacementAsset.assetId,
            relativePath: replacementAsset.relativePath,
            mimeType: replacementAsset.mimeType,
            sha256: replacementAsset.sha256,
            bytes: replacementAsset.bytes,
            width: replacementAsset.width,
            height: replacementAsset.height,
            status: replacementAsset.status,
          },
          expectedPreservation: ["panel_geometry", "crop", "dialogue_text", "balloon", "historical_revision", "historical_publication"],
        } : null,
        currentBaseline: {
          implementation: "initializeLayoutCanvasesFromSourcesV1",
          behavior: variant.format === "paged_comic"
            ? "每 4 镜固定成页，仅按镜头数量选择 single/two_horizontal/three_focus/four_panel"
            : "每镜固定一个 1080×1920 段落并使用 single 模板",
          limitations: ["不读取 scene/beat/frameType/panelRhythm", "不创建对白、旁白或气泡", "crop 固定 zoom=1 且居中"],
          layoutDocumentDigest: layoutEncoded.digest,
          layoutDocument: layoutEncoded.value,
          sourceLockSetDigest,
          publicationProfile: publicationProfileFor(variant.format),
          assetManifest: { schemaVersion: 1, images: imageManifest, fonts: [font] },
          assessment,
        },
        futureAcceptanceTargets: {
          activeShotCoverageRate: 1,
          dialogueAndCaptionCoverageRate: ledger.items.length === 0 ? null : 1,
          silentRewriteCount: 0,
          textOverflowCount: 0,
          aggregatePanelDirectUsableRate: 0.8,
          aggregateBoundBalloonDirectUsableRate: 0.8,
        },
      };
      const relativePath = `fixtures/${variant.variantId}.json`;
      await writeFile(path.join(fixtureRoot, relativePath), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
      manifestVariants.push({
        groupId: group.groupId,
        variantId: variant.variantId,
        title: variant.title,
        comicFormat: variant.format,
        path: relativePath,
        fixtureDigest: digestCanonicalJson(fixture),
        storyboardDigest: storyboardEncoded.digest,
        sourceLockSetDigest,
        layoutDocumentDigest: layoutEncoded.digest,
        shotCount: storyboard.shots.length,
        dialogueOrCaptionItemCount: ledger.items.length,
        currentPanelDirectUsableRate: assessment.summary.panelDirectUsableRate,
        currentBalloonDirectUsableRate: assessment.balloonReview.directUsableRate,
        baselineStatus: "red",
      });
    }
    manifestGroups.push({ groupId: group.groupId, title: group.title, variantIds: groupVariants });
  }

  const manifestUnsigned = {
    schemaVersion: 1,
    kind: "smart_layout_m0_corpus_v1",
    sourceDate: SOURCE_DATE,
    groupCount: manifestGroups.length,
    runnableVariantCount: manifestVariants.length,
    groups: manifestGroups,
    variants: manifestVariants,
    assets: {
      images: [...assets.values()].map((asset) => ({
        assetId: asset.assetId,
        fixtureName: asset.name,
        relativePath: asset.relativePath,
        mimeType: asset.mimeType,
        sha256: asset.sha256,
        bytes: asset.bytes,
        width: asset.width,
        height: asset.height,
        status: asset.status,
        subjectBoxes: asset.subjectBoxes,
      })),
      fonts: [font],
    },
    scoringPolicy: {
      panelDirectUsable: "layout_ok && crop_ok && reading_order_ok && subject_occlusion_ok",
      boundBalloonDirectUsable: "balloon_geometry_ok && balloon_type_ok && text_fit_ok",
      missingRequiredBalloonCountsAsFailure: true,
      futureReleaseThreshold: 0.8,
      requiredIndependentHumanReviews: 2,
      currentAutomatedRubricRole: "现状红灯与调整下限，不替代最终双人人工视觉签收",
    },
  };
  const manifest = { ...manifestUnsigned, corpusDigest: digestCanonicalJson(manifestUnsigned) };
  await writeFile(path.join(fixtureRoot, "corpus.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ groupCount: manifest.groupCount, runnableVariantCount: manifest.runnableVariantCount, corpusDigest: manifest.corpusDigest }, null, 2)}\n`);
}

void main();
