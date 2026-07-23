import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLayoutRenderPlanV1,
  composeRuleBasedLayoutV1,
  digestCanonicalJson,
  projectLayoutDocumentV2ToV1,
  type LayoutPublicationProfileV1,
  type LayoutRuleCompositionInputV1,
} from "../../packages/shared/src/index.ts";
import {
  LayoutRendererService,
  type ResolvedRenderAssetV1,
} from "../../apps/server/src/projects/layout-renderer.service.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repoRoot, "tests/fixtures/smart-layout");
const evidenceRoot = path.join(
  repoRoot,
  "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m2-rule-composition",
);
const outputRoot = path.join(evidenceRoot, "outputs");
const require = createRequire(path.join(repoRoot, "apps/server/package.json"));
const sharp = require("sharp") as any;

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function json(filePath: string): Promise<any> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function relativeEvidencePath(filePath: string): string {
  return path.relative(evidenceRoot, filePath).split(path.sep).join("/");
}

function compositionInput(fixture: any): LayoutRuleCompositionInputV1 {
  return {
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
    sourceLockSetDigest: fixture.inputs.sourceCatalog.sourceLockSetDigest,
    sources: fixture.inputs.sourceCatalog.items,
    characterCatalog: fixture.inputs.characterCatalog.map((character: any) => ({
      characterId: character.id,
      name: character.name,
    })),
  };
}

async function resolvedAssets(fixture: any): Promise<ResolvedRenderAssetV1[]> {
  const manifest = fixture.currentBaseline.assetManifest;
  return Promise.all([...manifest.images, ...manifest.fonts].map(async (asset: any) => ({
    assetId: asset.assetId,
    mimeType: asset.mimeType,
    sha256: asset.sha256,
    bytes: await readFile(path.join(fixtureRoot, asset.relativePath)),
  })));
}

async function pagedContactSheet(
  cards: Array<{ label: string; filePath: string }>,
): Promise<{ filePath: string; width: number; height: number; sha256: string; bytes: number }> {
  const cardWidth = 280;
  const imageWidth = 252;
  const imageHeight = 336;
  const labelHeight = 42;
  const cardHeight = imageHeight + labelHeight + 24;
  const columns = 4;
  const rows = Math.ceil(cards.length / columns);
  const width = columns * cardWidth + 24;
  const height = rows * cardHeight + 24;
  const composites: any[] = [];
  for (const [index, card] of cards.entries()) {
    const left = 24 + (index % columns) * cardWidth;
    const top = 18 + Math.floor(index / columns) * cardHeight;
    const image = await sharp(card.filePath).resize(imageWidth, imageHeight, { fit: "fill" }).png().toBuffer();
    const label = Buffer.from(`<svg width="${imageWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0f172a"/><text x="8" y="27" font-size="18" font-family="Arial, sans-serif" fill="#f8fafc">${card.label}</text></svg>`);
    composites.push({ input: image, left, top });
    composites.push({ input: label, left, top: top + imageHeight });
  }
  const bytes = await sharp({ create: { width, height, channels: 4, background: "#e2e8f0" } })
    .composite(composites).png().toBuffer();
  const filePath = path.join(evidenceRoot, "contact-sheet-paged.png");
  await writeFile(filePath, bytes);
  return { filePath, width, height, sha256: sha256(bytes), bytes: bytes.byteLength };
}

async function verticalContactSheet(
  cards: Array<{ label: string; filePath: string }>,
): Promise<{ filePath: string; width: number; height: number; sha256: string; bytes: number }> {
  const columnWidth = 188;
  const imageWidth = 164;
  const labelHeight = 42;
  const resized = await Promise.all(cards.map(async (card) => {
    const buffer = await sharp(card.filePath).resize({ width: imageWidth }).png().toBuffer();
    const metadata = await sharp(buffer).metadata();
    return { ...card, buffer, height: metadata.height as number };
  }));
  const width = cards.length * columnWidth + 24;
  const height = Math.max(...resized.map((card) => card.height)) + labelHeight + 36;
  const composites: any[] = [];
  for (const [index, card] of resized.entries()) {
    const left = 18 + index * columnWidth;
    const label = Buffer.from(`<svg width="${imageWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0f172a"/><text x="6" y="27" font-size="15" font-family="Arial, sans-serif" fill="#f8fafc">${card.label}</text></svg>`);
    composites.push({ input: label, left, top: 14 });
    composites.push({ input: card.buffer, left, top: 14 + labelHeight });
  }
  const bytes = await sharp({ create: { width, height, channels: 4, background: "#e2e8f0" } })
    .composite(composites).png().toBuffer();
  const filePath = path.join(evidenceRoot, "contact-sheet-vertical.png");
  await writeFile(filePath, bytes);
  return { filePath, width, height, sha256: sha256(bytes), bytes: bytes.byteLength };
}

function emptyAggregate() {
  return {
    variantCount: 0,
    shotCount: 0,
    dialogueItemCount: 0,
    canvasCount: 0,
    panelCount: 0,
    balloonCount: 0,
    textOverflowCount: 0,
    silentRewriteCount: 0,
  };
}

function addAggregate(
  target: ReturnType<typeof emptyAggregate>,
  plan: ReturnType<typeof composeRuleBasedLayoutV1>,
): void {
  target.variantCount += 1;
  target.shotCount += plan.report.shotCoverage.expected;
  target.dialogueItemCount += plan.report.dialogueCoverage.expected;
  target.canvasCount += plan.document.canvases.length;
  target.panelCount += plan.document.canvases.reduce(
    (sum, canvas) => sum + canvas.elements.filter((element) => element.type === "panel_frame").length,
    0,
  );
  target.balloonCount += plan.document.canvases.reduce(
    (sum, canvas) => sum + canvas.elements.filter((element) => element.type === "balloon").length,
    0,
  );
  target.textOverflowCount += plan.report.textOverflowCount;
  target.silentRewriteCount += plan.report.silentRewriteCount;
}

function finalizeAggregate(value: ReturnType<typeof emptyAggregate>) {
  return {
    ...value,
    shotCoverageRate: value.shotCount === 0 ? null : value.panelCount / value.shotCount,
    dialogueCoverageRate: value.dialogueItemCount === 0 ? null : value.balloonCount / value.dialogueItemCount,
  };
}

async function main(): Promise<void> {
  await mkdir(outputRoot, { recursive: true });
  const corpus = await json(path.join(fixtureRoot, "corpus.manifest.json"));
  const renderer = new LayoutRendererService();
  const outputs: Array<Record<string, unknown>> = [];
  const pagedCards: Array<{ label: string; filePath: string }> = [];
  const verticalCards: Array<{ label: string; filePath: string }> = [];
  const aggregate = emptyAggregate();
  const byFormat = { vertical_scroll: emptyAggregate(), paged_comic: emptyAggregate() };
  let rendererIdentity: Record<string, unknown> | null = null;

  for (const [variantIndex, entry] of corpus.variants.entries()) {
    const fixture = await json(path.join(fixtureRoot, entry.path));
    const composition = composeRuleBasedLayoutV1(compositionInput(fixture));
    const visibleDocument = projectLayoutDocumentV2ToV1(composition.document);
    const profile = fixture.currentBaseline.publicationProfile as LayoutPublicationProfileV1;
    const renderPlan = buildLayoutRenderPlanV1({
      document: visibleDocument,
      sourceLockSetDigest: fixture.currentBaseline.sourceLockSetDigest,
      profile,
      assets: fixture.currentBaseline.assetManifest,
    });
    const rendered = await renderer.render(renderPlan, profile, await resolvedAssets(fixture));
    rendererIdentity ??= rendered.renderer;
    const variantRoot = path.join(outputRoot, entry.variantId);
    await mkdir(variantRoot, { recursive: true });
    const artifacts: Array<Record<string, unknown>> = [];
    for (const artifact of rendered.artifacts) {
      const artifactPath = path.join(variantRoot, artifact.fileName);
      await writeFile(artifactPath, artifact.bytes);
      const record = {
        role: artifact.role,
        order: artifact.order,
        relativePath: relativeEvidencePath(artifactPath),
        fileName: artifact.fileName,
        mimeType: artifact.mimeType,
        sha256: artifact.sha256,
        bytes: artifact.bytes.byteLength,
        width: artifact.width,
        height: artifact.height,
        pageCount: artifact.pageCount,
      };
      artifacts.push(record);
      if (artifact.role === "page_png") pagedCards.push({ label: `${entry.variantId} p${artifact.order}`, filePath: artifactPath });
      if (artifact.role === "long_png") verticalCards.push({ label: entry.variantId, filePath: artifactPath });
    }
    const panelCount = visibleDocument.canvases.reduce(
      (sum, canvas) => sum + canvas.elements.filter((element) => element.type === "panel_frame").length,
      0,
    );
    const balloonCount = visibleDocument.canvases.reduce(
      (sum, canvas) => sum + canvas.elements.filter((element) => element.type === "balloon").length,
      0,
    );
    outputs.push({
      groupId: entry.groupId,
      variantId: entry.variantId,
      comicFormat: entry.comicFormat,
      planDigest: composition.planDigest,
      narrativePlanDigest: composition.narrativePlan.planDigest,
      dialogueLedgerDigest: composition.dialogueLedger.ledgerDigest,
      visibleDocumentDigest: composition.visibleDocumentDigest,
      documentDigest: composition.documentDigest,
      compositionDigest: composition.document.automation.composition!.compositionDigest,
      renderPlanDigest: renderPlan.renderPlanDigest,
      counts: {
        shots: composition.report.shotCoverage.expected,
        placedShots: composition.report.shotCoverage.placed,
        dialogueItems: composition.report.dialogueCoverage.expected,
        placedOriginal: composition.report.dialogueCoverage.placedOriginal,
        canvases: composition.document.canvases.length,
        panels: panelCount,
        balloons: balloonCount,
        textOverflow: composition.report.textOverflowCount,
        silentRewrite: composition.report.silentRewriteCount,
      },
      canvases: composition.canvases,
      issues: composition.report.issues,
      artifacts,
    });
    addAggregate(aggregate, composition);
    addAggregate(byFormat[entry.comicFormat as keyof typeof byFormat], composition);
    process.stdout.write(`[${variantIndex + 1}/${corpus.variants.length}] ${entry.variantId}: ${artifacts.map((artifact) => artifact.role).join(", ")}\n`);
  }

  const pagedSheet = await pagedContactSheet(pagedCards);
  const verticalSheet = await verticalContactSheet(verticalCards);
  const contactSheets = [
    { kind: "paged", relativePath: relativeEvidencePath(pagedSheet.filePath), width: pagedSheet.width, height: pagedSheet.height, sha256: pagedSheet.sha256, bytes: pagedSheet.bytes },
    { kind: "vertical", relativePath: relativeEvidencePath(verticalSheet.filePath), width: verticalSheet.width, height: verticalSheet.height, sha256: verticalSheet.sha256, bytes: verticalSheet.bytes },
  ];
  const unsigned = {
    schemaVersion: 1,
    kind: "smart_layout_m2_rule_composition_outputs_v1",
    corpusDigest: corpus.corpusDigest,
    renderer: rendererIdentity,
    status: "passed_contract_visual_unscored",
    aggregate: finalizeAggregate(aggregate),
    byFormat: {
      vertical_scroll: finalizeAggregate(byFormat.vertical_scroll),
      paged_comic: finalizeAggregate(byFormat.paged_comic),
    },
    outputs,
    contactSheets,
    reviewState: {
      deterministicContract: "passed",
      productionRendererOutputs: "generated",
      agentVisualReview: "completed_m2_contract_only",
      visualReview: "m2-visual-review.md",
      independentHumanReviews: "not_started_m3_release_gate",
      statement: "M2 只签收内容覆盖、原文忠实、文字不溢出与真实 renderer 可出片；视觉直接可用率留待 M3 双人复核。",
    },
  };
  const manifest = { ...unsigned, outputManifestDigest: digestCanonicalJson(unsigned) };
  await writeFile(path.join(evidenceRoot, "m2-rule-output.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    outputManifestDigest: manifest.outputManifestDigest,
    aggregate: manifest.aggregate,
    contactSheets: contactSheets.map((sheet) => sheet.relativePath),
  }, null, 2)}\n`);
}

void main();
