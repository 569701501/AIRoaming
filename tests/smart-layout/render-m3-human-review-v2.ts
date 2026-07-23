import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLayoutRenderPlanV1,
  composeVisuallyGuidedLayoutV1,
  createLayoutImageAnalysisV1,
  digestCandidateImageSourceV1,
  digestCanonicalJson,
  projectLayoutDocumentV2ToV1,
  richTextPlainTextV1,
  type LayoutDigest,
  type LayoutImageAnalysisDraftV1,
  type LayoutPublicationProfileV1,
  type LayoutVisualCompositionInputV1,
} from "../../packages/shared/src/index.ts";
import {
  LayoutRendererService,
  type ResolvedRenderAssetV1,
} from "../../apps/server/src/projects/layout-renderer.service.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repoRoot, "tests/fixtures/smart-layout");
const sourceEvidenceRoot = path.join(
  repoRoot,
  "文档/05_执行与记录/任务记录/2026-07-17_真实图片AB/evidence/runtime",
);
const evidenceRoot = path.join(
  repoRoot,
  "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m3-human-review-v2",
);
const outputRoot = path.join(evidenceRoot, "outputs");
const realAssetRoot = path.join(evidenceRoot, "real-art-assets");
const require = createRequire(path.join(repoRoot, "apps/server/package.json"));
const sharp = require("sharp") as any;

type ComicFormat = "vertical_scroll" | "paged_comic";
type Difficulty = "normal" | "challenging";
type ItemType = "panel" | "required_balloon";

interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SubjectTemplate {
  bodyBox: NormalizedRect;
  faceBox: NormalizedRect | null;
  importance?: number;
}

interface RealAssetTemplate {
  key: string;
  category: "empty" | "single" | "two" | "group" | "effect";
  sourcePath: string;
  subjects: SubjectTemplate[];
  focalRegions: NormalizedRect[];
  textSafeRegions: NormalizedRect[];
}

interface PreparedRealAsset extends RealAssetTemplate {
  assetId: string;
  relativePath: string;
  mimeType: "image/jpeg" | "image/png";
  sha256: LayoutDigest;
  bytes: Buffer;
  width: number;
  height: number;
}

interface ReviewOverlayV2 {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface HumanReviewItemV2 {
  variantId: string;
  variantTitle: string;
  comicFormat: ComicFormat;
  difficulty: Difficulty;
  itemType: ItemType;
  itemId: string;
  shotId: string;
  shotOrder: number;
  shotSummary: string;
  sourceText: string;
  speakerName: string;
  balloonKind: string;
  evidencePath: string;
  sourceImagePath: string;
  overlay: ReviewOverlayV2;
}

interface HumanReviewPageV2 {
  pageId: string;
  variantId: string;
  variantTitle: string;
  comicFormat: ComicFormat;
  difficulty: Difficulty;
  evidencePath: string;
  label: string;
  itemIds: string[];
}

interface HumanReviewManifestV2 {
  schemaVersion: 2;
  kind: "m3_human_review_visual_evidence_v2";
  reviewStandardId: "AIR-QA-COMIC-FINAL-001-v1";
  acceptancePolicy: {
    normalDirectUseRate: 0.9;
    challengingDirectUseRate: 0.8;
    criticalVisibleFailureLimit: 0;
    requiredIndependentRounds: 2;
    buckets: ["panel", "required_balloon", "page"];
  };
  sourceStatement: string;
  sourceAssetCount: number;
  sourceAssetSetDigest: LayoutDigest;
  sourceAssets: Array<{
    key: string;
    category: RealAssetTemplate["category"];
    relativePath: string;
    mimeType: PreparedRealAsset["mimeType"];
    sha256: LayoutDigest;
    width: number;
    height: number;
  }>;
  renderer: Record<string, unknown> | null;
  variantCount: number;
  pageCount: number;
  panelCount: number;
  balloonCount: number;
  pages: HumanReviewPageV2[];
  items: HumanReviewItemV2[];
  artifacts: Array<{
    variantId: string;
    role: string;
    order: number;
    relativePath: string;
    sha256: string;
    bytes: number;
    width?: number;
    height?: number;
  }>;
  outputManifestDigest: LayoutDigest;
}

const challengingVariants = new Set([
  "fix-v02-vertical",
  "fix-v04-vertical",
  "fix-p02-paged",
  "fix-p04-paged",
]);

function realSource(relativePath: string): string {
  return path.join(sourceEvidenceRoot, relativePath);
}

const realAssetTemplates: RealAssetTemplate[] = [
  {
    key: "empty-grok-v1",
    category: "empty",
    sourcePath: realSource("grok/candidate-no-character-establishing/v1.png"),
    subjects: [],
    focalRegions: [{ x: 0.04, y: 0.18, width: 0.92, height: 0.68 }],
    textSafeRegions: [{ x: 0.05, y: 0.04, width: 0.9, height: 0.18 }],
  },
  {
    key: "empty-grok-v2",
    category: "empty",
    sourcePath: realSource("grok/candidate-no-character-establishing/v2.png"),
    subjects: [],
    focalRegions: [{ x: 0.04, y: 0.16, width: 0.92, height: 0.7 }],
    textSafeRegions: [{ x: 0.05, y: 0.04, width: 0.9, height: 0.18 }],
  },
  {
    key: "single-grok-v1",
    category: "single",
    sourcePath: realSource("grok/candidate-single-character-closeup/v1.jpg"),
    subjects: [{
      bodyBox: { x: 0, y: 0.02, width: 0.72, height: 0.98 },
      faceBox: { x: 0.02, y: 0.05, width: 0.42, height: 0.29 },
    }],
    focalRegions: [
      { x: 0.02, y: 0.05, width: 0.42, height: 0.29 },
      { x: 0.48, y: 0.54, width: 0.22, height: 0.28 },
    ],
    textSafeRegions: [{ x: 0.52, y: 0.05, width: 0.42, height: 0.22 }],
  },
  {
    key: "single-grok-v2",
    category: "single",
    sourcePath: realSource("grok/candidate-single-character-closeup/v2.jpg"),
    subjects: [{
      bodyBox: { x: 0.25, y: 0.02, width: 0.75, height: 0.98 },
      faceBox: { x: 0.35, y: 0.05, width: 0.38, height: 0.28 },
    }],
    focalRegions: [
      { x: 0.35, y: 0.05, width: 0.38, height: 0.28 },
      { x: 0.52, y: 0.58, width: 0.24, height: 0.25 },
    ],
    textSafeRegions: [{ x: 0.04, y: 0.05, width: 0.3, height: 0.26 }],
  },
  {
    key: "two-grok-v1",
    category: "two",
    sourcePath: realSource("grok/candidate-two-character-dialogue/v1.jpg"),
    subjects: [
      {
        bodyBox: { x: 0.04, y: 0.21, width: 0.43, height: 0.79 },
        faceBox: { x: 0.12, y: 0.25, width: 0.22, height: 0.18 },
      },
      {
        bodyBox: { x: 0.31, y: 0.27, width: 0.42, height: 0.73 },
        faceBox: { x: 0.39, y: 0.31, width: 0.2, height: 0.17 },
      },
    ],
    focalRegions: [{ x: 0.04, y: 0.21, width: 0.7, height: 0.62 }],
    textSafeRegions: [{ x: 0.05, y: 0.04, width: 0.9, height: 0.16 }],
  },
  {
    key: "two-grok-v2",
    category: "two",
    sourcePath: realSource("grok/candidate-two-character-dialogue/v2.jpg"),
    subjects: [
      {
        bodyBox: { x: 0.02, y: 0.27, width: 0.44, height: 0.73 },
        faceBox: { x: 0.13, y: 0.3, width: 0.22, height: 0.18 },
      },
      {
        bodyBox: { x: 0.3, y: 0.31, width: 0.4, height: 0.69 },
        faceBox: { x: 0.4, y: 0.34, width: 0.2, height: 0.17 },
      },
      {
        bodyBox: { x: 0.77, y: 0.39, width: 0.15, height: 0.28 },
        faceBox: null,
        importance: 0.6,
      },
    ],
    focalRegions: [{ x: 0.02, y: 0.27, width: 0.9, height: 0.63 }],
    textSafeRegions: [{ x: 0.04, y: 0.04, width: 0.56, height: 0.18 }],
  },
  {
    key: "two-doubao-v2",
    category: "two",
    sourcePath: realSource("doubao/candidate-two-character-dialogue/v2.jpg"),
    subjects: [
      {
        bodyBox: { x: 0.05, y: 0.28, width: 0.4, height: 0.72 },
        faceBox: { x: 0.16, y: 0.31, width: 0.2, height: 0.15 },
      },
      {
        bodyBox: { x: 0.3, y: 0.34, width: 0.54, height: 0.66 },
        faceBox: { x: 0.39, y: 0.36, width: 0.2, height: 0.14 },
      },
      {
        bodyBox: { x: 0.78, y: 0.45, width: 0.12, height: 0.22 },
        faceBox: null,
        importance: 0.55,
      },
    ],
    focalRegions: [{ x: 0.05, y: 0.28, width: 0.85, height: 0.58 }],
    textSafeRegions: [{ x: 0.04, y: 0.04, width: 0.9, height: 0.19 }],
  },
  {
    key: "group-grok-v1",
    category: "group",
    sourcePath: realSource("grok/candidate-group-staging/v1.jpg"),
    subjects: [
      {
        bodyBox: { x: 0, y: 0.31, width: 0.34, height: 0.69 },
        faceBox: { x: 0.07, y: 0.34, width: 0.2, height: 0.16 },
      },
      {
        bodyBox: { x: 0.23, y: 0.36, width: 0.28, height: 0.64 },
        faceBox: { x: 0.29, y: 0.38, width: 0.18, height: 0.15 },
      },
      {
        bodyBox: { x: 0.55, y: 0.29, width: 0.22, height: 0.68 },
        faceBox: { x: 0.61, y: 0.31, width: 0.15, height: 0.14 },
      },
      {
        bodyBox: { x: 0.69, y: 0.16, width: 0.31, height: 0.84 },
        faceBox: { x: 0.75, y: 0.18, width: 0.17, height: 0.15 },
      },
    ],
    focalRegions: [{ x: 0, y: 0.16, width: 1, height: 0.76 }],
    textSafeRegions: [{ x: 0.04, y: 0.03, width: 0.9, height: 0.14 }],
  },
  {
    key: "group-grok-v2",
    category: "group",
    sourcePath: realSource("grok/candidate-group-staging/v2.jpg"),
    subjects: [
      {
        bodyBox: { x: 0, y: 0.37, width: 0.28, height: 0.63 },
        faceBox: { x: 0.08, y: 0.4, width: 0.17, height: 0.14 },
      },
      {
        bodyBox: { x: 0.19, y: 0.25, width: 0.27, height: 0.53 },
        faceBox: { x: 0.24, y: 0.27, width: 0.17, height: 0.14 },
      },
      {
        bodyBox: { x: 0.25, y: 0.42, width: 0.37, height: 0.58 },
        faceBox: { x: 0.32, y: 0.44, width: 0.19, height: 0.15 },
      },
      {
        bodyBox: { x: 0.62, y: 0.24, width: 0.35, height: 0.68 },
        faceBox: { x: 0.7, y: 0.25, width: 0.17, height: 0.14 },
      },
    ],
    focalRegions: [{ x: 0, y: 0.22, width: 0.98, height: 0.72 }],
    textSafeRegions: [{ x: 0.04, y: 0.03, width: 0.9, height: 0.15 }],
  },
  {
    key: "effect-grok-v1",
    category: "effect",
    sourcePath: realSource("grok/candidate-scene-effect/v1.jpg"),
    subjects: [{
      bodyBox: { x: 0.42, y: 0.22, width: 0.51, height: 0.78 },
      faceBox: { x: 0.53, y: 0.26, width: 0.2, height: 0.15 },
    }],
    focalRegions: [
      { x: 0.42, y: 0.22, width: 0.51, height: 0.72 },
      { x: 0.58, y: 0.68, width: 0.3, height: 0.2 },
    ],
    textSafeRegions: [{ x: 0.04, y: 0.05, width: 0.35, height: 0.25 }],
  },
  {
    key: "effect-grok-v2",
    category: "effect",
    sourcePath: realSource("grok/candidate-scene-effect/v2.jpg"),
    subjects: [{
      bodyBox: { x: 0.52, y: 0.2, width: 0.48, height: 0.8 },
      faceBox: { x: 0.62, y: 0.25, width: 0.2, height: 0.15 },
    }],
    focalRegions: [
      { x: 0.52, y: 0.2, width: 0.48, height: 0.78 },
      { x: 0.61, y: 0.67, width: 0.28, height: 0.22 },
    ],
    textSafeRegions: [{ x: 0.04, y: 0.05, width: 0.4, height: 0.24 }],
  },
];

function sha256(bytes: Uint8Array): LayoutDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function json(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function relativeEvidencePath(filePath: string): string {
  return path.relative(evidenceRoot, filePath).split(path.sep).join("/");
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1_000_000) / 1_000_000));
}

function normalizedOverlay(
  transform: { x: number; y: number; width: number; height: number },
  canvas: { width: number; height: number },
  offsetY: number,
  totalHeight: number,
): ReviewOverlayV2 {
  return {
    x: clamp(transform.x / canvas.width),
    y: clamp((offsetY + transform.y) / totalHeight),
    width: clamp(transform.width / canvas.width),
    height: clamp(transform.height / totalHeight),
  };
}

async function prepareRealAssets(): Promise<Map<string, PreparedRealAsset>> {
  await rm(realAssetRoot, { recursive: true, force: true });
  await mkdir(realAssetRoot, { recursive: true });
  const prepared = new Map<string, PreparedRealAsset>();
  for (const template of realAssetTemplates) {
    const bytes = await readFile(template.sourcePath);
    const metadata = await sharp(bytes).metadata();
    const extension = path.extname(template.sourcePath).toLowerCase() === ".png" ? ".png" : ".jpg";
    const mimeType = extension === ".png" ? "image/png" : "image/jpeg";
    const relativePath = `real-art-assets/${template.key}${extension}`;
    await writeFile(path.join(evidenceRoot, relativePath), bytes);
    prepared.set(template.key, {
      ...template,
      assetId: `asset_real_${template.key.replaceAll("-", "_")}`,
      relativePath,
      mimeType,
      sha256: sha256(bytes),
      bytes,
      width: Number(metadata.width),
      height: Number(metadata.height),
    });
  }
  return prepared;
}

const pools: Record<PreparedRealAsset["category"], string[]> = {
  empty: ["empty-grok-v1", "empty-grok-v2"],
  single: ["single-grok-v1", "single-grok-v2"],
  two: ["two-grok-v1", "two-grok-v2", "two-doubao-v2"],
  group: ["group-grok-v1", "group-grok-v2"],
  effect: ["effect-grok-v1", "effect-grok-v2"],
};

function chooseRealAsset(
  assets: Map<string, PreparedRealAsset>,
  shot: any,
  variantIndex: number,
  shotIndex: number,
): PreparedRealAsset {
  let category: PreparedRealAsset["category"];
  if (shot.characterIds.length === 0) category = "empty";
  else if (
    shot.characterIds.length === 1
    && (shot.comic.panelRhythm === "impact" || shot.motion.frameType === "transition")
  ) category = "effect";
  else if (shot.characterIds.length === 1) category = "single";
  else if (shot.characterIds.length === 2) category = "two";
  else category = "group";
  const keys = pools[category];
  const key = keys[(variantIndex + shotIndex) % keys.length]!;
  const asset = assets.get(key);
  if (!asset) throw new Error(`REAL_ASSET_MISSING:${key}`);
  return asset;
}

function sourceLockSetDigest(sources: readonly any[]): LayoutDigest {
  const projection = sources.map((source) => ({
    shotId: source.source.shotId,
    candidateLockRevisionId: source.source.candidateLockRevisionId,
  })).sort((left, right) => left.shotId < right.shotId ? -1 : left.shotId > right.shotId ? 1 : 0);
  return digestCanonicalJson(projection);
}

function analysisFor(
  asset: PreparedRealAsset,
  shot: any,
): ReturnType<typeof createLayoutImageAnalysisV1> {
  const subjects = asset.subjects.map((subject, index) => ({
    id: `${asset.key}_subject_${index + 1}`,
    characterId: shot.characterIds[index] ?? null,
    bodyBox: subject.bodyBox,
    faceBox: subject.faceBox,
    importance: subject.importance ?? (index < shot.characterIds.length ? 0.95 : 0.55),
    confidence: 0.96,
  }));
  const draft: LayoutImageAnalysisDraftV1 = {
    schemaVersion: 1,
    policyVersion: "layout_visual_analysis_v1",
    assetId: asset.assetId,
    assetDigest: asset.sha256,
    mode: "vision",
    subjects,
    focalRegions: asset.focalRegions.map((box, index) => ({ box, weight: index === 0 ? 0.96 : 0.84 })),
    textSafeRegions: asset.textSafeRegions.map((box) => ({ box, score: 0.9 })),
    visualCenter: { x: 0.5, y: 0.5 },
    warnings: ["real_art_shadow_evidence"],
  };
  return createLayoutImageAnalysisV1(draft);
}

async function realCompositionContext(
  fixture: any,
  assets: Map<string, PreparedRealAsset>,
  variantIndex: number,
): Promise<{
  input: LayoutVisualCompositionInputV1;
  assetManifest: any;
  resolvedAssets: ResolvedRenderAssetV1[];
  selectedByShot: Map<string, PreparedRealAsset>;
}> {
  const selectedByShot = new Map<string, PreparedRealAsset>();
  const sources = fixture.inputs.storyboardVersion.document.shots.map((shot: any, shotIndex: number) => {
    const asset = chooseRealAsset(assets, shot, variantIndex, shotIndex);
    selectedByShot.set(shot.id, asset);
    const unsignedSource = {
      shotId: shot.id,
      candidateId: `${fixture.variant.variantId}_real_candidate_${shot.order}`,
      candidateLockRevisionId: `${fixture.variant.variantId}_real_lock_${shot.order}`,
      assetId: asset.assetId,
    };
    return {
      order: shot.order,
      width: asset.width,
      height: asset.height,
      status: "ready",
      assetSha256: asset.sha256,
      source: {
        ...unsignedSource,
        sourceDigest: digestCandidateImageSourceV1(unsignedSource, asset.sha256),
      },
    };
  });
  const uniqueAssets = [...new Map([...selectedByShot.values()].map((asset) => [asset.assetId, asset])).values()];
  const images = uniqueAssets.map((asset) => ({
    assetId: asset.assetId,
    role: "candidate_image",
    relativePath: asset.relativePath,
    mimeType: asset.mimeType,
    sha256: asset.sha256,
    bytes: asset.bytes.byteLength,
    width: asset.width,
    height: asset.height,
  }));
  const fontAssets = fixture.currentBaseline.assetManifest.fonts;
  const assetManifest = {
    ...fixture.currentBaseline.assetManifest,
    images,
    fonts: fontAssets,
  };
  const resolvedImageAssets: ResolvedRenderAssetV1[] = uniqueAssets.map((asset) => ({
    assetId: asset.assetId,
    mimeType: asset.mimeType,
    sha256: asset.sha256,
    bytes: asset.bytes,
  }));
  const resolvedFontAssets: ResolvedRenderAssetV1[] = await Promise.all(fontAssets.map(async (asset: any) => ({
    assetId: asset.assetId,
    mimeType: asset.mimeType,
    sha256: asset.sha256,
    bytes: await readFile(path.join(fixtureRoot, asset.relativePath)),
  })));
  const input: LayoutVisualCompositionInputV1 = {
    projectId: fixture.inputs.sourceCatalog.projectId,
    chapterId: fixture.inputs.sourceCatalog.chapterId,
    comicFormat: fixture.variant.comicFormat,
    profile: fixture.currentBaseline.layoutDocument.profile,
    fontPolicy: fixture.currentBaseline.layoutDocument.fontPolicy,
    storyboardVersion: {
      id: fixture.inputs.storyboardVersion.id,
      documentDigest: fixture.inputs.storyboardVersion.documentDigest,
      document: fixture.inputs.storyboardVersion.document,
    },
    sourceLockSetDigest: sourceLockSetDigest(sources),
    sources,
    characterCatalog: fixture.inputs.characterCatalog.map((character: any) => ({
      characterId: character.id,
      name: character.name,
    })),
    visualEvidence: fixture.inputs.storyboardVersion.document.shots.map((shot: any) => {
      const asset = selectedByShot.get(shot.id)!;
      return {
        shotId: shot.id,
        assetId: asset.assetId,
        assetDigest: asset.sha256,
        analysis: analysisFor(asset, shot),
      };
    }),
  };
  return {
    input,
    assetManifest,
    resolvedAssets: [...resolvedImageAssets, ...resolvedFontAssets],
    selectedByShot,
  };
}

function blankReview(manifestDigest: LayoutDigest, round: "A" | "B") {
  return {
    schemaVersion: 2,
    kind: "m3_human_review_v2",
    reviewStandardId: "AIR-QA-COMIC-FINAL-001-v1",
    manifestDigest,
    round,
    reviewerId: "",
    independent: false,
    calibrated: false,
    completedAt: null,
    itemDecisions: [],
    pageDecisions: [],
  };
}

function reviewPageHtml(input: {
  round: "A" | "B";
  manifest: HumanReviewManifestV2;
}): string {
  const seed = JSON.stringify({
    schemaVersion: 2,
    round: input.round,
    reviewStandardId: input.manifest.reviewStandardId,
    manifestDigest: input.manifest.outputManifestDigest,
    pages: input.manifest.pages,
    items: input.manifest.items,
    panelCount: input.manifest.panelCount,
    balloonCount: input.manifest.balloonCount,
    calibrationImage: "real-art-assets/group-grok-v1.jpg",
  }).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="zh-CN" data-review-version="2" data-review-round="${input.round}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <title>漫画成稿真人复核 · ${input.round} 轮</title>
  <style>
    :root{color-scheme:dark;--bg:#070b18;--panel:#10182c;--panel2:#151f38;--line:#2c3858;--text:#f1f5ff;--muted:#9eabc6;--purple:#8b7cff;--mint:#54dfb3;--warn:#ffc56f;--bad:#ff758e}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 14% 0,#211a52 0,transparent 35%),var(--bg);color:var(--text);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}button,input,textarea{font:inherit}.hidden{display:none!important}.top{position:sticky;top:0;z-index:30;padding:14px 22px;background:rgba(7,11,24,.94);backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}.top-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.title{font-size:21px;font-weight:760}.badge{padding:4px 10px;border:1px solid #695bd7;border-radius:999px;background:#261e5e;color:#e0dcff}.muted{color:var(--muted)}.progress{margin-left:auto;padding:7px 11px;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.intro{max-width:1180px;margin:28px auto;padding:0 22px 50px}.hero{padding:26px;border:1px solid #5e52b0;border-radius:20px;background:linear-gradient(135deg,rgba(80,60,176,.28),rgba(17,25,46,.94))}.hero h1{margin:0 0 10px;font-size:30px}.definition{margin:18px 0;padding:16px 18px;border-left:4px solid var(--mint);border-radius:10px;background:#0c2c29;font-size:18px}.critical{padding:15px 17px;border:1px solid #7c3c52;border-radius:14px;background:#351a28}.examples{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin:20px 0}.example{overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--panel)}.example-visual{position:relative;height:300px;overflow:hidden;background:#060a13}.example-visual img{width:100%;height:100%;object-fit:cover}.demo-bubble{position:absolute;padding:10px 16px;border:3px solid #151515;border-radius:50%;background:#fff;color:#111;font-weight:700;box-shadow:0 5px 20px #0008}.demo-bubble.good{top:7%;left:7%}.demo-bubble.bad{top:31%;left:24%;width:48%;height:28%;display:grid;place-items:center}.demo-box{position:absolute;border:4px solid var(--mint);inset:12% 7% 8% 7%;border-radius:10px}.demo-box.bad{border-color:var(--bad);inset:8% 48% 12% -10%}.example-copy{padding:14px 16px}.example-copy strong{display:block;font-size:17px;margin-bottom:4px}.good-text{color:var(--mint)}.bad-text{color:#ff9caf}.standard-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.standard{padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--panel)}.primary{padding:11px 18px;border:1px solid #7769ef;border-radius:11px;background:#4d40c3;color:white;cursor:pointer}.review-shell{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:calc(100vh - 74px)}.sidebar{position:sticky;top:74px;height:calc(100vh - 74px);overflow:auto;padding:14px;border-right:1px solid var(--line);background:rgba(9,14,29,.8)}.group{width:100%;margin:0 0 8px;padding:11px;text-align:left;color:var(--text);background:var(--panel);border:1px solid var(--line);border-radius:11px;cursor:pointer}.group.active{border-color:var(--purple);box-shadow:0 0 0 1px var(--purple) inset}.group.done{border-color:#287b68}.group-head{display:flex;justify-content:space-between;gap:8px;font-weight:680}.main{padding:18px;max-width:1600px;width:100%;margin:auto}.reviewer{display:grid;grid-template-columns:minmax(220px,350px) 1fr;gap:12px;margin-bottom:16px}.field{padding:12px 14px;border:1px solid var(--line);border-radius:13px;background:var(--panel)}.field input[type=text]{width:100%;margin-top:6px;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:#090f1e;color:var(--text)}.workspace{display:grid;grid-template-columns:minmax(420px,62%) minmax(330px,1fr);gap:16px;align-items:start}.visual-panel,.decision-panel{padding:14px;border:1px solid var(--line);border-radius:16px;background:rgba(16,24,44,.94)}.visual-meta{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.visual-meta a{color:#c8c0ff}.image-stage{position:relative;max-height:76vh;overflow:auto;border-radius:10px;background:#03060d}.image-wrap{position:relative;width:100%}.image-wrap img{display:block;width:100%;height:auto}.focus-box{position:absolute;border:4px solid var(--warn);border-radius:10px;background:rgba(255,197,111,.12);box-shadow:0 0 0 9999px rgba(2,5,12,.42),0 0 0 2px #1118;pointer-events:none}.focus-label{position:absolute;top:-34px;left:-4px;padding:5px 9px;border-radius:8px 8px 8px 0;background:var(--warn);color:#1b1305;font-weight:800;white-space:nowrap}.decision-panel h2{margin:0 0 5px}.question{margin:12px 0;padding:14px;border-left:4px solid var(--purple);background:#0c1326;font-size:18px}.context{padding:11px;border:1px solid var(--line);border-radius:10px;background:#0b1122}.source{margin-top:8px;padding:9px 11px;border-left:3px solid var(--purple);background:#0b1122}.criteria-list{display:grid;gap:8px;margin:14px 0}.criterion{padding:10px 11px;border:1px solid var(--line);border-radius:10px;background:var(--panel2)}.criterion strong{display:block}.actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}.btn{padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:#1a2642;color:var(--text);cursor:pointer}.btn.pass{background:#123e35;border-color:#2b806b}.btn.adjust{background:#482334;border-color:#93415c}.btn.active{box-shadow:0 0 0 2px var(--purple)}.details{display:none;margin-top:12px;padding:11px;border-radius:10px;background:#0b1223}.details.show{display:block}.reason-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:9px 0}.reason-grid label{display:flex;gap:7px;align-items:flex-start;padding:8px;border:1px solid var(--line);border-radius:8px}.details textarea{width:100%;min-height:72px;padding:9px;border:1px solid var(--line);border-radius:8px;background:#070d19;color:var(--text)}.error{color:#ff9caf;margin-top:6px}.nav{display:flex;justify-content:space-between;gap:10px;margin-top:14px}.page-check{margin-top:16px;padding:14px;border:1px solid #5b509c;border-radius:14px;background:#17183a}.page-check h3{margin:0 0 7px}.page-check>.actions{margin-top:10px}.footer{position:sticky;bottom:0;display:flex;justify-content:space-between;gap:12px;align-items:center;margin-top:16px;padding:12px;border:1px solid var(--line);border-radius:13px;background:rgba(8,13,27,.95);backdrop-filter:blur(14px)}@media(max-width:1050px){.review-shell{grid-template-columns:1fr}.sidebar{position:relative;top:0;height:auto;display:flex;overflow:auto;border-right:0;border-bottom:1px solid var(--line)}.group{min-width:235px;margin-right:8px}.workspace{grid-template-columns:1fr}.reviewer,.examples,.standard-grid{grid-template-columns:1fr}.top{position:relative}.reason-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <header class="top"><div class="top-row"><span class="title">漫画成稿真人复核</span><span class="badge">${input.round} 轮</span><span class="muted">真实画面 · 自动分隐藏 · 不查看另一轮</span><span id="progress" class="progress">尚未开始</span></div></header>
  <section id="intro" class="intro">
    <div class="hero"><h1>先看懂标准，再开始判断</h1><p>这次判断的不是画师水平，而是系统生成的<strong>画格、裁切、气泡和阅读顺序</strong>是否可以直接使用。</p><div class="definition"><strong>“可以直接用”只有一个含义：</strong>假设这就是正式漫画，你不会为了当前高亮对象再打开编辑器移动、缩放、改类型或重做裁切。</div><div class="critical"><strong>出现以下任何一项，必须选择“我会调整”：</strong>不知道先看哪里；脸、手、武器或关键动作被裁掉/遮住；气泡让人认错说话者；尾巴指错人；文字挤出气泡或小到难读；对白、旁白遗漏或被改写。</div></div>
    <div class="examples">
      <article class="example"><div class="example-visual"><img src="real-art-assets/group-grok-v1.jpg" alt=""><div class="demo-box"></div></div><div class="example-copy"><strong class="good-text">合格：重点人物和动作完整</strong><span>画格保留关键人物、脸和手，读者一眼知道画面重点。</span></div></article>
      <article class="example"><div class="example-visual"><img src="real-art-assets/group-grok-v1.jpg" alt=""><div class="demo-box bad"></div></div><div class="example-copy"><strong class="bad-text">不合格：裁切破坏主体</strong><span>即使画格很整齐，只要切掉关键人物或动作，也必须调整。</span></div></article>
      <article class="example"><div class="example-visual"><img src="real-art-assets/group-grok-v1.jpg" alt=""><div class="demo-bubble good">先看这里</div></div><div class="example-copy"><strong class="good-text">合格：气泡使用留白</strong><span>气泡在自然留白区，既不挡脸，也不会让阅读顺序混乱。</span></div></article>
      <article class="example"><div class="example-visual"><img src="real-art-assets/group-grok-v1.jpg" alt=""><div class="demo-bubble bad">挡住人物</div></div><div class="example-copy"><strong class="bad-text">不合格：气泡遮挡重点</strong><span>文字没有溢出也不代表合格；挡住脸、手或关键动作就要调整。</span></div></article>
    </div>
    <div class="standard-grid"><div class="standard"><strong>先看整页</strong><br>不看编号，确认眼睛能自然找到下一格和下一句。</div><div class="standard"><strong>再看高亮对象</strong><br>每次只判断黄色框里的画格或气泡，避免不知道在评什么。</div><div class="standard"><strong>不要评画风</strong><br>人物是否漂亮、生成图是否一致属于出图质量，不混入本轮排版分。</div></div>
    <button id="start-review" class="primary">我已看懂，开始复核</button>
  </section>
  <section id="review" class="review-shell hidden"><aside id="sidebar" class="sidebar"></aside><main class="main">
    <section class="reviewer"><label class="field">评审人代号<input id="reviewer-id" type="text" autocomplete="off" placeholder="例如 reviewer-01"></label><label class="field"><input id="independent" type="checkbox"> 我确认独立完成本轮，没有查看自动评分或另一轮结果。</label></section>
    <section class="workspace"><article class="visual-panel"><div class="visual-meta"><div><strong id="page-title"></strong><div id="page-meta" class="muted"></div></div><a id="open-original" target="_blank" rel="noopener">打开原尺寸</a></div><div id="image-stage" class="image-stage"><div class="image-wrap"><img id="evidence-image" alt="真实漫画成稿"><div id="focus-box" class="focus-box"><span id="focus-label" class="focus-label"></span></div></div></div></article><article class="decision-panel"><div id="item-panel"></div><section id="page-check" class="page-check"></section></article></section>
    <div class="footer"><button id="reset" class="btn">清空本轮</button><div><span id="export-hint" class="muted"></span> <button id="export" class="primary" disabled>导出 ${input.round} 轮结果</button></div></div>
  </main></section>
  <script>
  "use strict";
  const seed=${seed};
  const itemCriteria={
    panel:[
      {key:"layout_ok",label:"画格大小和节奏",help:"重要镜头得到足够空间，不会拥挤、空洞或抢错重点。"},
      {key:"crop_ok",label:"人物与关键动作完整",help:"脸、手、武器、关键物品和动作没有被不自然地切掉。"},
      {key:"reading_order_ok",label:"阅读顺序自然",help:"不看编号，也知道下一格在哪里。"},
      {key:"subject_occlusion_ok",label:"主体没有被遮挡",help:"气泡和文字没有挡住脸、手或关键动作。"}
    ],
    required_balloon:[
      {key:"balloon_geometry_ok",label:"位置和大小自然",help:"气泡不挤、不飘，也没有离说话者远到认不出来。"},
      {key:"balloon_type_ok",label:"气泡类型正确",help:"对白、思考、喊话和旁白的形状符合内容。"},
      {key:"reading_order_ok",label:"对白顺序自然",help:"读者会按剧情顺序读到这句话。"},
      {key:"subject_occlusion_ok",label:"不遮挡画面重点",help:"没有盖住脸、手、武器、关键物品或动作。"},
      {key:"text_fit_ok",label:"文字清楚好读",help:"字号正常、断行自然，没有溢出或挤成一团。"},
      {key:"source_fidelity_ok",label:"对白与原文一致",help:"没有漏字、改写、重复，也没有把对白变成旁白。"},
      {key:"tail_ok",label:"尾巴指向正确",help:"不会认错说话者；旁白不应出现尾巴。"},
      {key:"shape_safe_ok",label:"文字待在气泡里面",help:"文字没有碰到或穿出椭圆、云朵、爆炸形边缘。"}
    ]
  };
  const criticalReasons=new Set(["crop_ok","reading_order_ok","subject_occlusion_ok","text_fit_ok","source_fidelity_ok","tail_ok","shape_safe_ok"]);
  const storageKey="m3-human-review-v2:"+seed.manifestDigest+":"+seed.round;
  let saved={reviewerId:"",independent:false,calibrated:false,currentPage:0,currentItem:0,itemDecisions:{},pageDecisions:{}};
  try{const raw=localStorage.getItem(storageKey);if(raw){const parsed=JSON.parse(raw);if(parsed&&typeof parsed==="object")saved=Object.assign(saved,parsed)}}catch(_error){}
  const itemById=new Map(seed.items.map(function(item){return[item.itemId,item]}));
  seed.pages.forEach(function(page){page.items=page.itemIds.map(function(id){return itemById.get(id)}).filter(Boolean)});
  saved.currentPage=Math.max(0,Math.min(seed.pages.length-1,Number(saved.currentPage)||0));
  saved.currentItem=Math.max(0,Number(saved.currentItem)||0);
  function itemValid(item){const value=saved.itemDecisions[item.itemId];if(!value)return false;if(value.state==="pass")return true;return value.state==="adjust"&&Array.isArray(value.failed)&&value.failed.length>0&&String(value.notes||"").trim().length>0}
  function pageValid(page){const value=saved.pageDecisions[page.pageId];if(!value)return false;if(value.state==="pass")return true;return value.state==="adjust"&&Array.isArray(value.failed)&&value.failed.length>0&&String(value.notes||"").trim().length>0}
  function persist(){const reviewer=document.getElementById("reviewer-id");const independent=document.getElementById("independent");if(reviewer)saved.reviewerId=reviewer.value.trim();if(independent)saved.independent=independent.checked;try{localStorage.setItem(storageKey,JSON.stringify(saved))}catch(_error){}}
  function progress(){const itemDone=seed.items.filter(itemValid).length;const pageDone=seed.pages.filter(pageValid).length;return{itemDone:itemDone,pageDone:pageDone,total:seed.items.length+seed.pages.length,done:itemDone+pageDone}}
  function renderProgress(){const value=progress();const panelDone=seed.items.filter(function(item){return item.itemType==="panel"&&itemValid(item)}).length;const balloonDone=seed.items.filter(function(item){return item.itemType==="required_balloon"&&itemValid(item)}).length;document.getElementById("progress").textContent=saved.calibrated?("进度 "+value.done+"/"+value.total+" · 画格 "+panelDone+"/"+seed.panelCount+" · 气泡 "+balloonDone+"/"+seed.balloonCount+" · 整页 "+value.pageDone+"/"+seed.pages.length):"尚未开始";const ready=saved.calibrated&&value.done===value.total&&saved.reviewerId&&saved.independent;document.getElementById("export").disabled=!ready;document.getElementById("export-hint").textContent=ready?"已完成，可以导出":"还需完成 "+(value.total-value.done)+" 项"}
  function selectPage(index){saved.currentPage=index;saved.currentItem=0;persist();renderReview()}
  function renderSidebar(){const root=document.getElementById("sidebar");root.textContent="";seed.pages.forEach(function(page,index){const itemDone=page.items.filter(itemValid).length;const done=itemDone===page.items.length&&pageValid(page);const button=document.createElement("button");button.type="button";button.className="group"+(index===saved.currentPage?" active":"")+(done?" done":"");const head=document.createElement("div");head.className="group-head";const title=document.createElement("span");title.textContent=page.label;const count=document.createElement("span");count.textContent=(itemDone+(pageValid(page)?1:0))+"/"+(page.items.length+1);head.append(title,count);const meta=document.createElement("div");meta.className="muted";meta.textContent=(page.comicFormat==="paged_comic"?"页漫":"条漫")+" · "+(page.difficulty==="challenging"?"困难样例":"普通样例");button.append(head,meta);button.addEventListener("click",function(){selectPage(index)});root.append(button)})}
  function current(){const page=seed.pages[saved.currentPage];saved.currentItem=Math.max(0,Math.min(page.items.length-1,saved.currentItem));return{page:page,item:page.items[saved.currentItem]}}
  function setItemDecision(item,state){const previous=saved.itemDecisions[item.itemId]||{};saved.itemDecisions[item.itemId]={state:state,failed:state==="adjust"?(previous.failed||[]):[],notes:state==="adjust"?(previous.notes||""):""};if(state==="pass"){const page=seed.pages[saved.currentPage];if(saved.currentItem<page.items.length-1)saved.currentItem+=1}persist();renderReview()}
  function setPageDecision(page,state){const previous=saved.pageDecisions[page.pageId]||{};saved.pageDecisions[page.pageId]={state:state,failed:state==="adjust"?(previous.failed||[]):[],notes:state==="adjust"?(previous.notes||""):""};persist();renderReview()}
  function decisionDetails(owner,value,criteria,rerender){const details=document.createElement("div");details.className="details"+(value.state==="adjust"?" show":"");const intro=document.createElement("div");intro.textContent="请选择需要调整的原因，并说明你会改什么：";details.append(intro);const grid=document.createElement("div");grid.className="reason-grid";criteria.forEach(function(entry){const label=document.createElement("label");const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=(value.failed||[]).includes(entry.key);checkbox.addEventListener("change",function(){const next=new Set(value.failed||[]);if(checkbox.checked)next.add(entry.key);else next.delete(entry.key);value.failed=Array.from(next);owner.failed=value.failed;persist();renderProgress();renderError()});const copy=document.createElement("span");copy.innerHTML="<strong>"+entry.label+"</strong><br><span class='muted'>"+entry.help+"</span>";label.append(checkbox,copy);grid.append(label)});details.append(grid);const notes=document.createElement("textarea");notes.placeholder="例如：第二个人的脸被气泡挡住，需要把气泡移到左上留白。";notes.value=String(value.notes||"");notes.addEventListener("input",function(){owner.notes=notes.value;value.notes=notes.value;persist();renderProgress();renderError()});details.append(notes);const error=document.createElement("div");error.className="error";details.append(error);function renderError(){error.textContent=value.state==="adjust"&&((value.failed||[]).length===0||!String(value.notes||"").trim())?"必须选择原因并写清楚要调整什么。":""}renderError();return details}
  function actionButtons(scope,value,onPass,onAdjust){const actions=document.createElement("div");actions.className="actions";const pass=document.createElement("button");pass.type="button";pass.dataset.action=scope+"-pass";pass.className="btn pass"+(value.state==="pass"?" active":"");pass.textContent="可以直接用";pass.addEventListener("click",onPass);const adjust=document.createElement("button");adjust.type="button";adjust.dataset.action=scope+"-adjust";adjust.className="btn adjust"+(value.state==="adjust"?" active":"");adjust.textContent="我会调整";adjust.addEventListener("click",onAdjust);actions.append(pass,adjust);return actions}
  function renderItem(page,item){const root=document.getElementById("item-panel");root.textContent="";root.dataset.itemId=item.itemId;root.dataset.itemType=item.itemType;const value=saved.itemDecisions[item.itemId]||{state:"",failed:[],notes:""};const eyebrow=document.createElement("div");eyebrow.className="muted";eyebrow.textContent=(item.itemType==="panel"?"画格":"气泡")+" "+(saved.currentItem+1)+"/"+page.items.length;const title=document.createElement("h2");title.textContent=item.itemType==="panel"?"判断黄色框中的画格":"判断黄色框中的气泡";const question=document.createElement("div");question.className="question";question.textContent=item.itemType==="panel"?"如果这是正式漫画，你会不会主动调整这个画格的大小、位置或图片裁切？":"如果这是正式漫画，你会不会主动移动、缩放、换类型或修改这个气泡？";const kindLabel={speech:"普通对白",thought:"思考气泡",shout:"喊话气泡",caption:"旁白框",system:"系统/设备声音"};const context=document.createElement("div");context.className="context";context.innerHTML="<strong>镜头 "+item.shotOrder+"：</strong>"+item.shotSummary+(item.speakerName?"<br><span class='muted'>说话者："+item.speakerName+(item.balloonKind?" · "+(kindLabel[item.balloonKind]||item.balloonKind):"")+"</span>":"");const sourceLink=document.createElement("a");sourceLink.href=item.sourceImagePath;sourceLink.target="_blank";sourceLink.rel="noopener";sourceLink.textContent="查看未裁切原图";sourceLink.style.color="#c8c0ff";sourceLink.style.display="inline-block";sourceLink.style.marginTop="8px";context.append(document.createElement("br"),sourceLink);root.append(eyebrow,title,question,context);if(item.sourceText){const source=document.createElement("div");source.className="source";source.textContent="原文："+item.sourceText;root.append(source)}const criteria=document.createElement("div");criteria.className="criteria-list";itemCriteria[item.itemType].forEach(function(entry){const card=document.createElement("div");card.className="criterion";card.innerHTML="<strong>"+entry.label+"</strong><span class='muted'>"+entry.help+"</span>";criteria.append(card)});root.append(criteria);root.append(actionButtons("item",value,function(){setItemDecision(item,"pass")},function(){setItemDecision(item,"adjust")}));root.append(decisionDetails(saved.itemDecisions[item.itemId]||(saved.itemDecisions[item.itemId]=value),value,itemCriteria[item.itemType],renderReview));const nav=document.createElement("div");nav.className="nav";const previous=document.createElement("button");previous.className="btn";previous.disabled=saved.currentItem===0;previous.textContent="上一个";previous.addEventListener("click",function(){saved.currentItem-=1;persist();renderReview()});const next=document.createElement("button");next.className="btn";next.disabled=saved.currentItem===page.items.length-1;next.textContent="下一个";next.addEventListener("click",function(){saved.currentItem+=1;persist();renderReview()});nav.append(previous,next);root.append(nav)}
  function renderPageCheck(page){const root=document.getElementById("page-check");root.textContent="";const value=saved.pageDecisions[page.pageId]||{state:"",failed:[],notes:""};const title=document.createElement("h3");title.textContent="整页/整段再看一次";const help=document.createElement("p");help.textContent="不看黄色框，按正常读漫画的方式从头读到尾：你是否自然知道先看哪里、谁先说话，节奏是否舒服？";const readFromTop=document.createElement("button");readFromTop.type="button";readFromTop.id="read-page-from-start";readFromTop.className="btn";readFromTop.textContent="从页首阅读（暂时隐藏黄色框）";readFromTop.addEventListener("click",function(){document.getElementById("focus-box").classList.add("hidden");document.getElementById("image-stage").scrollTop=0});root.append(title,help,readFromTop);root.append(actionButtons("page",value,function(){setPageDecision(page,"pass")},function(){setPageDecision(page,"adjust")}));const criteria=[{key:"page_reading_order",label:"阅读顺序混乱",help:"不知道下一格或下一句在哪里，容易读反。 "},{key:"page_rhythm",label:"节奏不舒服",help:"该停顿的地方太挤，该爆发的地方不够突出。 "},{key:"page_publishable",label:"整页仍需排版微调",help:"即使单个对象勉强合格，整页的留白、平衡或强调关系仍需调整。 "}];root.append(decisionDetails(saved.pageDecisions[page.pageId]||(saved.pageDecisions[page.pageId]=value),value,criteria,renderReview))}
  function renderVisual(page,item){document.getElementById("page-title").textContent=page.variantTitle;document.getElementById("page-meta").textContent=page.label+" · "+(page.difficulty==="challenging"?"困难样例":"普通样例");const link=document.getElementById("open-original");link.href=page.evidencePath;const image=document.getElementById("evidence-image");const box=document.getElementById("focus-box");box.classList.remove("hidden");const label=document.getElementById("focus-label");const overlay=item.overlay;box.style.left=(overlay.x*100)+"%";box.style.top=(overlay.y*100)+"%";box.style.width=(overlay.width*100)+"%";box.style.height=(overlay.height*100)+"%";label.textContent=item.itemType==="panel"?"当前画格":"当前气泡";image.onload=function(){const stage=document.getElementById("image-stage");const center=image.clientHeight*(overlay.y+overlay.height/2);stage.scrollTop=Math.max(0,center-stage.clientHeight/2)};if(image.getAttribute("src")!==page.evidencePath)image.src=page.evidencePath;else image.onload()}
  function renderReview(){document.getElementById("reviewer-id").value=saved.reviewerId||"";document.getElementById("independent").checked=!!saved.independent;const value=current();renderSidebar();renderVisual(value.page,value.item);renderItem(value.page,value.item);renderPageCheck(value.page);renderProgress()}
  function exportReview(){persist();const value=progress();if(!saved.calibrated||value.done!==value.total||!saved.reviewerId||!saved.independent)return;const body={schemaVersion:2,kind:"m3_human_review_v2",reviewStandardId:seed.reviewStandardId,manifestDigest:seed.manifestDigest,round:seed.round,reviewerId:saved.reviewerId,independent:true,calibrated:true,completedAt:new Date().toISOString(),itemDecisions:seed.items.map(function(item){const decision=saved.itemDecisions[item.itemId];return{itemId:item.itemId,itemType:item.itemType,variantId:item.variantId,difficulty:item.difficulty,shotId:item.shotId,evidencePath:item.evidencePath,sourceImagePath:item.sourceImagePath,state:decision.state,failed:decision.failed||[],critical:(decision.failed||[]).some(function(key){return criticalReasons.has(key)}),notes:decision.state==="adjust"?decision.notes:""}}),pageDecisions:seed.pages.map(function(page){const decision=saved.pageDecisions[page.pageId];return{pageId:page.pageId,variantId:page.variantId,difficulty:page.difficulty,evidencePath:page.evidencePath,state:decision.state,failed:decision.failed||[],critical:(decision.failed||[]).includes("page_reading_order"),notes:decision.state==="adjust"?decision.notes:""}})};const blob=new Blob([JSON.stringify(body,null,2)+"\\n"],{type:"application/json;charset=utf-8"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download="m3-human-review-v2-round-"+seed.round.toLowerCase()+".json";document.body.append(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url)},1000)}
  document.getElementById("start-review").addEventListener("click",function(){saved.calibrated=true;persist();document.getElementById("intro").classList.add("hidden");document.getElementById("review").classList.remove("hidden");renderReview()});document.getElementById("reviewer-id").addEventListener("input",function(){persist();renderProgress()});document.getElementById("independent").addEventListener("change",function(){persist();renderProgress()});document.getElementById("export").addEventListener("click",exportReview);document.getElementById("reset").addEventListener("click",function(){if(!window.confirm("确认清空 ${input.round} 轮全部进度？"))return;saved={reviewerId:"",independent:false,calibrated:true,currentPage:0,currentItem:0,itemDecisions:{},pageDecisions:{}};persist();renderReview()});if(saved.calibrated){document.getElementById("intro").classList.add("hidden");document.getElementById("review").classList.remove("hidden");renderReview()}else{renderProgress()}
  </script>
</body>
</html>`;
}

async function main(): Promise<void> {
  await mkdir(evidenceRoot, { recursive: true });
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  const assets = await prepareRealAssets();
  const corpus = await json(path.join(fixtureRoot, "corpus.manifest.json"));
  const renderer = new LayoutRendererService();
  const items: HumanReviewItemV2[] = [];
  const pages: HumanReviewPageV2[] = [];
  const artifacts: HumanReviewManifestV2["artifacts"] = [];
  let rendererIdentity: Record<string, unknown> | null = null;

  for (const [variantIndex, entry] of corpus.variants.entries()) {
    const fixture = await json(path.join(fixtureRoot, entry.path));
    const context = await realCompositionContext(fixture, assets, variantIndex);
    const composition = composeVisuallyGuidedLayoutV1(context.input);
    const visibleDocument = projectLayoutDocumentV2ToV1(composition.document);
    const profile = fixture.currentBaseline.publicationProfile as LayoutPublicationProfileV1;
    const renderPlan = buildLayoutRenderPlanV1({
      document: visibleDocument,
      sourceLockSetDigest: context.input.sourceLockSetDigest,
      profile,
      assets: context.assetManifest,
    });
    const rendered = await renderer.render(renderPlan, profile, context.resolvedAssets);
    rendererIdentity ??= rendered.renderer;
    const variantRoot = path.join(outputRoot, entry.variantId);
    await mkdir(variantRoot, { recursive: true });
    const artifactRecords: Array<{
      role: string;
      order: number;
      relativePath: string;
      width?: number;
      height?: number;
    }> = [];
    for (const artifact of rendered.artifacts) {
      const artifactPath = path.join(variantRoot, artifact.fileName);
      await writeFile(artifactPath, artifact.bytes);
      const relativePath = relativeEvidencePath(artifactPath);
      artifactRecords.push({
        role: artifact.role,
        order: artifact.order,
        relativePath,
        width: artifact.width,
        height: artifact.height,
      });
      artifacts.push({
        variantId: entry.variantId,
        role: artifact.role,
        order: artifact.order,
        relativePath,
        sha256: artifact.sha256,
        bytes: artifact.bytes.byteLength,
        width: artifact.width,
        height: artifact.height,
      });
    }
    const canvasIndex = new Map(composition.document.canvases.map((canvas, index) => [canvas.id, index]));
    const canvasOffsets = new Map<string, number>();
    let verticalOffset = 0;
    for (const canvas of composition.document.canvases) {
      canvasOffsets.set(canvas.id, verticalOffset);
      verticalOffset += canvas.height;
    }
    const totalVerticalHeight = Math.max(1, verticalOffset);
    const evidenceFor = (canvasId: string): string => {
      if (entry.comicFormat === "vertical_scroll") {
        return artifactRecords.find((artifact) => artifact.role === "long_png")?.relativePath ?? "";
      }
      const order = (canvasIndex.get(canvasId) ?? 0) + 1;
      return artifactRecords.find((artifact) => artifact.role === "page_png" && artifact.order === order)?.relativePath ?? "";
    };
    const shotById = new Map(fixture.inputs.storyboardVersion.document.shots.map((shot: any) => [shot.id, shot]));
    const characterNameById = new Map(fixture.inputs.characterCatalog.map((character: any) => [character.id, character.name]));
    const elementById = new Map(composition.document.canvases.flatMap((canvas) => (
      canvas.elements.map((element) => [element.id, { canvas, element }] as const)
    )));
    const difficulty: Difficulty = challengingVariants.has(entry.variantId) ? "challenging" : "normal";
    const variantItems: HumanReviewItemV2[] = [];

    for (const quality of composition.report.quality.panels) {
      const located = elementById.get(quality.panelId);
      const shot = shotById.get(quality.shotId) as any;
      if (!located || located.element.type !== "panel_frame" || !shot) {
        throw new Error(`REAL_REVIEW_PANEL_MISSING:${quality.panelId}`);
      }
      const totalHeight = entry.comicFormat === "vertical_scroll" ? totalVerticalHeight : located.canvas.height;
      const offsetY = entry.comicFormat === "vertical_scroll" ? (canvasOffsets.get(located.canvas.id) ?? 0) : 0;
      variantItems.push({
        variantId: entry.variantId,
        variantTitle: entry.title,
        comicFormat: entry.comicFormat,
        difficulty,
        itemType: "panel",
        itemId: quality.panelId,
        shotId: quality.shotId,
        shotOrder: shot.order,
        shotSummary: shot.coreAction,
        sourceText: "",
        speakerName: "",
        balloonKind: "",
        evidencePath: evidenceFor(quality.canvasId),
        sourceImagePath: context.selectedByShot.get(quality.shotId)!.relativePath,
        overlay: normalizedOverlay(located.element.transform, located.canvas, offsetY, totalHeight),
      });
    }
    for (const quality of composition.report.quality.balloons) {
      const located = elementById.get(quality.elementId);
      const shot = shotById.get(quality.shotId) as any;
      if (!located || located.element.type !== "balloon" || !shot) {
        throw new Error(`REAL_REVIEW_BALLOON_MISSING:${quality.elementId}`);
      }
      const totalHeight = entry.comicFormat === "vertical_scroll" ? totalVerticalHeight : located.canvas.height;
      const offsetY = entry.comicFormat === "vertical_scroll" ? (canvasOffsets.get(located.canvas.id) ?? 0) : 0;
      variantItems.push({
        variantId: entry.variantId,
        variantTitle: entry.title,
        comicFormat: entry.comicFormat,
        difficulty,
        itemType: "required_balloon",
        itemId: quality.elementId,
        shotId: quality.shotId,
        shotOrder: shot.order,
        shotSummary: shot.coreAction,
        sourceText: richTextPlainTextV1(located.element.richText),
        speakerName: located.element.speakerCharacterId
          ? String(characterNameById.get(located.element.speakerCharacterId) ?? "未识别")
          : located.element.balloonKind === "caption" ? "旁白" : "未识别",
        balloonKind: located.element.balloonKind,
        evidencePath: evidenceFor(quality.canvasId),
        sourceImagePath: context.selectedByShot.get(quality.shotId)!.relativePath,
        overlay: normalizedOverlay(located.element.transform, located.canvas, offsetY, totalHeight),
      });
    }
    items.push(...variantItems);
    const pageKeys = [...new Set(variantItems.map((item) => item.evidencePath))];
    for (const [pageIndex, evidencePath] of pageKeys.entries()) {
      const pageItems = variantItems.filter((item) => item.evidencePath === evidencePath);
      pages.push({
        pageId: `page_${digestCanonicalJson({
          policyVersion: "m3_human_review_page_v2",
          variantId: entry.variantId,
          evidencePath,
        }).slice("sha256:".length, "sha256:".length + 24)}`,
        variantId: entry.variantId,
        variantTitle: entry.title,
        comicFormat: entry.comicFormat,
        difficulty,
        evidencePath,
        label: entry.comicFormat === "paged_comic"
          ? `${entry.title} · 第 ${pageIndex + 1} 页`
          : `${entry.title} · 完整条漫`,
        itemIds: pageItems.map((item) => item.itemId),
      });
    }
    process.stdout.write(`[${variantIndex + 1}/${corpus.variants.length}] ${entry.variantId}: real-art ${rendered.artifacts.map((artifact) => artifact.role).join(", ")}\n`);
  }

  const sourceAssetSetDigest = digestCanonicalJson([...assets.values()].map((asset) => ({
    key: asset.key,
    sha256: asset.sha256,
    width: asset.width,
    height: asset.height,
  })));
  const unsigned = {
    schemaVersion: 2 as const,
    kind: "m3_human_review_visual_evidence_v2" as const,
    reviewStandardId: "AIR-QA-COMIC-FINAL-001-v1" as const,
    acceptancePolicy: {
      normalDirectUseRate: 0.9 as const,
      challengingDirectUseRate: 0.8 as const,
      criticalVisibleFailureLimit: 0 as const,
      requiredIndependentRounds: 2 as const,
      buckets: ["panel", "required_balloon", "page"] as [
        "panel",
        "required_balloon",
        "page",
      ],
    },
    sourceStatement: "复用项目既有真实雨夜仓库出图，只评排版、裁切、气泡和阅读顺序；不把画风与角色一致性计入本轮。",
    sourceAssetCount: assets.size,
    sourceAssetSetDigest,
    sourceAssets: [...assets.values()].map((asset) => ({
      key: asset.key,
      category: asset.category,
      relativePath: asset.relativePath,
      mimeType: asset.mimeType,
      sha256: asset.sha256,
      width: asset.width,
      height: asset.height,
    })),
    renderer: rendererIdentity,
    variantCount: corpus.variants.length,
    pageCount: pages.length,
    panelCount: items.filter((item) => item.itemType === "panel").length,
    balloonCount: items.filter((item) => item.itemType === "required_balloon").length,
    pages,
    items,
    artifacts,
  };
  const manifest: HumanReviewManifestV2 = {
    ...unsigned,
    outputManifestDigest: digestCanonicalJson(unsigned),
  };
  await writeFile(
    path.join(evidenceRoot, "m3-human-review-v2.manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  for (const round of ["A", "B"] as const) {
    await writeFile(
      path.join(evidenceRoot, `m3-human-review-v2-round-${round.toLowerCase()}.html`),
      reviewPageHtml({ round, manifest }),
      "utf8",
    );
    const blank = `${JSON.stringify(blankReview(manifest.outputManifestDigest, round), null, 2)}\n`;
    await writeFile(
      path.join(evidenceRoot, `m3-human-review-v2-round-${round.toLowerCase()}.template.json`),
      blank,
      "utf8",
    );
    try {
      await writeFile(
        path.join(evidenceRoot, `m3-human-review-v2-round-${round.toLowerCase()}.json`),
        blank,
        { encoding: "utf8", flag: "wx" },
      );
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
  }
  process.stdout.write(`${JSON.stringify({
    manifestDigest: manifest.outputManifestDigest,
    variants: manifest.variantCount,
    pages: manifest.pageCount,
    panels: manifest.panelCount,
    balloons: manifest.balloonCount,
    sourceAssetSetDigest: manifest.sourceAssetSetDigest,
  }, null, 2)}\n`);
}

void main();
