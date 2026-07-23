import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createLayoutImageAnalysisV1,
  digestCanonicalJson,
  digestLayoutVisualAnalysisSetV1,
  type LayoutDigest,
  type LayoutNormalizedRectV1,
} from "../../../packages/shared/src/index.ts";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(fixtureRoot, "m3-visual-analysis.fixture.json");

interface CorpusAsset {
  assetId: string;
  sha256: LayoutDigest;
  width: number;
  height: number;
  subjectBoxes: LayoutNormalizedRectV1[];
}

interface CorpusManifest {
  corpusDigest: LayoutDigest;
  variants: Array<{ variantId: string; path: string }>;
  assets: { images: CorpusAsset[] };
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function faceBox(body: LayoutNormalizedRectV1, asset: CorpusAsset): LayoutNormalizedRectV1 {
  const radiusX = body.width * asset.width / 2;
  const radiusY = body.height * asset.height / 2;
  const radius = Math.max(10, Math.round(Math.min(radiusX, radiusY) * 0.35));
  const centerX = body.x + body.width / 2;
  const centerY = body.y + body.height * 0.28;
  const width = radius * 2 / asset.width;
  const height = radius * 2 / asset.height;
  return {
    x: rounded(clamp(centerX - width / 2)),
    y: rounded(clamp(centerY - height / 2)),
    width: rounded(Math.min(width, 1 - clamp(centerX - width / 2))),
    height: rounded(Math.min(height, 1 - clamp(centerY - height / 2))),
  };
}

function union(boxes: readonly LayoutNormalizedRectV1[]): LayoutNormalizedRectV1 {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function textSafeRegions(boxes: readonly LayoutNormalizedRectV1[]): Array<{ box: LayoutNormalizedRectV1; score: number }> {
  const occupied = union(boxes);
  const inset = 0.035;
  const candidates = [
    { box: { x: inset, y: inset, width: 1 - inset * 2, height: occupied.y - inset * 1.6 }, score: 0.96 },
    { box: { x: inset, y: occupied.y + occupied.height + inset * 0.6, width: 1 - inset * 2, height: 1 - occupied.y - occupied.height - inset * 1.6 }, score: 0.82 },
    { box: { x: inset, y: inset, width: occupied.x - inset * 1.6, height: 1 - inset * 2 }, score: 0.9 },
    { box: { x: occupied.x + occupied.width + inset * 0.6, y: inset, width: 1 - occupied.x - occupied.width - inset * 1.6, height: 1 - inset * 2 }, score: 0.94 },
  ];
  return candidates
    .filter((candidate) => candidate.box.width >= 0.16 && candidate.box.height >= 0.14)
    .map((candidate) => ({
      box: {
        x: rounded(candidate.box.x),
        y: rounded(candidate.box.y),
        width: rounded(candidate.box.width),
        height: rounded(candidate.box.height),
      },
      score: candidate.score,
    }));
}

async function main(): Promise<void> {
  const corpus = JSON.parse(await readFile(path.join(fixtureRoot, "corpus.manifest.json"), "utf8")) as CorpusManifest;
  const assetById = new Map(corpus.assets.images.map((asset) => [asset.assetId, asset]));
  const variants = [];

  for (const manifestVariant of corpus.variants) {
    const fixture = JSON.parse(await readFile(path.join(fixtureRoot, manifestVariant.path), "utf8"));
    const sourceByShot = new Map(fixture.inputs.sourceCatalog.items.map((source: any) => [source.source.shotId, source]));
    const entries = fixture.inputs.storyboardVersion.document.shots.map((shot: any) => {
      const source: any = sourceByShot.get(shot.id);
      if (!source) throw new Error(`M3_ANALYSIS_SOURCE_MISSING:${manifestVariant.variantId}:${shot.id}`);
      const asset = assetById.get(source.source.assetId);
      if (!asset) throw new Error(`M3_ANALYSIS_ASSET_MISSING:${source.source.assetId}`);
      const characterIds: string[] = shot.characterIds;
      const mappedCharacters = characterIds.length === asset.subjectBoxes.length ? characterIds : [];
      const subjects = asset.subjectBoxes.map((body, index) => ({
        id: `${shot.id}_subject_${String(index + 1).padStart(2, "0")}`,
        characterId: mappedCharacters[index] ?? null,
        bodyBox: body,
        faceBox: faceBox(body, asset),
        importance: index === 0 ? 1 : 0.92,
        confidence: 0.98,
      }));
      const occupied = union(asset.subjectBoxes);
      const safeRegions = textSafeRegions(asset.subjectBoxes);
      const analysis = createLayoutImageAnalysisV1({
        schemaVersion: 1,
        policyVersion: "layout_visual_analysis_v1",
        assetId: asset.assetId,
        assetDigest: asset.sha256,
        mode: "vision",
        subjects,
        focalRegions: asset.subjectBoxes.map((box, index) => ({ box, weight: index === 0 ? 1 : 0.9 })),
        textSafeRegions: safeRegions,
        visualCenter: {
          x: rounded(occupied.x + occupied.width / 2),
          y: rounded(occupied.y + occupied.height / 2),
        },
        warnings: safeRegions.length === 0 ? ["no_large_text_safe_region"] : [],
      });
      return { shotId: shot.id, sourceDigest: source.source.sourceDigest, analysis };
    });
    variants.push({
      variantId: manifestVariant.variantId,
      visualAnalysisSetDigest: digestLayoutVisualAnalysisSetV1(entries),
      entries,
    });
  }

  const unsigned = {
    schemaVersion: 1,
    kind: "smart_layout_m3_visual_analysis_fixture_v1",
    corpusDigest: corpus.corpusDigest,
    variantCount: variants.length,
    variants,
  };
  const output = { ...unsigned, fixtureDigest: digestCanonicalJson(unsigned) };
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    variantCount: variants.length,
    analysisCount: variants.reduce((sum, variant) => sum + variant.entries.length, 0),
    fixtureDigest: output.fixtureDigest,
  }, null, 2)}\n`);
}

void main();
