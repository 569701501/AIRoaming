import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLayoutRenderPlanV1,
  digestCanonicalJson,
  type LayoutPublicationProfileV1,
} from "../../packages/shared/src/index.ts";
import {
  LayoutRendererService,
  type ResolvedRenderAssetV1,
} from "../../apps/server/src/projects/layout-renderer.service.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repoRoot, "tests/fixtures/smart-layout");
const evidenceRoot = path.join(
  repoRoot,
  "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m0-baseline",
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

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function resolvedAssets(fixture: any): Promise<ResolvedRenderAssetV1[]> {
  const manifest = fixture.currentBaseline.assetManifest;
  return Promise.all([...manifest.images, ...manifest.fonts].map(async (asset: any) => {
    const bytes = await readFile(path.join(fixtureRoot, asset.relativePath));
    return { assetId: asset.assetId, mimeType: asset.mimeType, sha256: asset.sha256, bytes };
  }));
}

async function pagedContactSheet(cards: Array<{ label: string; filePath: string }>): Promise<{ filePath: string; width: number; height: number; sha256: string; bytes: number }> {
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
  const bytes = await sharp({ create: { width, height, channels: 4, background: "#e2e8f0" } }).composite(composites).png().toBuffer();
  const filePath = path.join(evidenceRoot, "contact-sheet-paged.png");
  await writeFile(filePath, bytes);
  return { filePath, width, height, sha256: sha256(bytes), bytes: bytes.byteLength };
}

async function verticalContactSheet(cards: Array<{ label: string; filePath: string }>): Promise<{ filePath: string; width: number; height: number; sha256: string; bytes: number }> {
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
  const bytes = await sharp({ create: { width, height, channels: 4, background: "#e2e8f0" } }).composite(composites).png().toBuffer();
  const filePath = path.join(evidenceRoot, "contact-sheet-vertical.png");
  await writeFile(filePath, bytes);
  return { filePath, width, height, sha256: sha256(bytes), bytes: bytes.byteLength };
}

function emptyAggregate() {
  return {
    variantCount: 0,
    shotCount: 0,
    panelCount: 0,
    panelDirectUsableCount: 0,
    requiredDialogueOrCaptionItemCount: 0,
    boundBalloonDirectUsableCount: 0,
    panelsNeedingLayoutAdjustment: 0,
    panelsNeedingCropAdjustment: 0,
    minimumObjectAdjustments: 0,
  };
}

function addFixtureAggregate(target: ReturnType<typeof emptyAggregate>, fixture: any): void {
  const assessment = fixture.currentBaseline.assessment;
  target.variantCount += 1;
  target.shotCount += assessment.summary.shotCount;
  target.panelCount += assessment.summary.panelCount;
  target.panelDirectUsableCount += assessment.summary.panelDirectUsableCount;
  target.requiredDialogueOrCaptionItemCount += assessment.balloonReview.requiredSourceItemCount;
  target.boundBalloonDirectUsableCount += assessment.balloonReview.directUsableCount;
  target.panelsNeedingLayoutAdjustment += assessment.summary.panelsNeedingLayoutAdjustment;
  target.panelsNeedingCropAdjustment += assessment.summary.panelsNeedingCropAdjustment;
  target.minimumObjectAdjustments += assessment.summary.minimumObjectAdjustments;
}

function finalizeAggregate(value: ReturnType<typeof emptyAggregate>) {
  return {
    ...value,
    panelDirectUsableRate: value.panelCount === 0 ? null : value.panelDirectUsableCount / value.panelCount,
    boundBalloonDirectUsableRate: value.requiredDialogueOrCaptionItemCount === 0
      ? null
      : value.boundBalloonDirectUsableCount / value.requiredDialogueOrCaptionItemCount,
  };
}

async function main(): Promise<void> {
  await mkdir(outputRoot, { recursive: true });
  const corpus = await json(path.join(fixtureRoot, "corpus.manifest.json"));
  const renderer = new LayoutRendererService();
  const outputs: Array<Record<string, unknown>> = [];
  const humanReviewRows: unknown[][] = [];
  const pagedCards: Array<{ label: string; filePath: string }> = [];
  const verticalCards: Array<{ label: string; filePath: string }> = [];
  const aggregate = emptyAggregate();
  const byFormat = { vertical_scroll: emptyAggregate(), paged_comic: emptyAggregate() };
  let rendererIdentity: Record<string, unknown> | null = null;

  for (const [variantIndex, entry] of corpus.variants.entries()) {
    const fixture = await json(path.join(fixtureRoot, entry.path));
    const profile = fixture.currentBaseline.publicationProfile as LayoutPublicationProfileV1;
    const plan = buildLayoutRenderPlanV1({
      document: fixture.currentBaseline.layoutDocument,
      sourceLockSetDigest: fixture.currentBaseline.sourceLockSetDigest,
      profile,
      assets: fixture.currentBaseline.assetManifest,
    });
    const rendered = await renderer.render(plan, profile, await resolvedAssets(fixture));
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
    outputs.push({
      groupId: entry.groupId,
      variantId: entry.variantId,
      comicFormat: entry.comicFormat,
      documentDigest: plan.documentDigest,
      sourceLockSetDigest: plan.sourceLockSetDigest,
      profileDigest: plan.profileDigest,
      renderPlanDigest: plan.renderPlanDigest,
      artifacts,
    });
    const primaryEvidence = (artifacts.find((artifact) => artifact.role === "long_png")
      ?? artifacts.find((artifact) => artifact.role === "page_png"))!.relativePath;
    for (const panel of fixture.currentBaseline.assessment.panelReview) {
      humanReviewRows.push([
        "", "", entry.variantId, entry.comicFormat, "panel", panel.panelId, panel.shotId, "",
        "", "", "", "", "", "", "", "", primaryEvidence,
      ]);
    }
    for (const item of fixture.inputs.dialogueLedger.items) {
      humanReviewRows.push([
        "", "", entry.variantId, entry.comicFormat, "required_balloon", item.itemId, item.shotId, item.text,
        "", "", "", "", "", "", "", "", primaryEvidence,
      ]);
    }
    addFixtureAggregate(aggregate, fixture);
    addFixtureAggregate(byFormat[entry.comicFormat as keyof typeof byFormat], fixture);
    process.stdout.write(`[${variantIndex + 1}/${corpus.variants.length}] ${entry.variantId}: ${artifacts.map((artifact) => artifact.role).join(", ")}\n`);
  }

  const pagedSheet = await pagedContactSheet(pagedCards);
  const verticalSheet = await verticalContactSheet(verticalCards);
  const reviewHeader = [
    "reviewer_id", "review_round", "variant_id", "comic_format", "item_type", "item_id", "shot_id", "source_text",
    "layout_ok", "crop_ok", "balloon_geometry_ok", "balloon_type_ok", "reading_order_ok", "subject_occlusion_ok", "text_fit_ok",
    "adjustment_notes", "evidence_path",
  ];
  const reviewCsv = `${[reviewHeader, ...humanReviewRows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
  const reviewTemplatePath = path.join(evidenceRoot, "m0-human-review-template.csv");
  await writeFile(reviewTemplatePath, reviewCsv, "utf8");
  const reviewTemplateBytes = Buffer.from(reviewCsv, "utf8");
  const reviewTemplate = {
    relativePath: relativeEvidencePath(reviewTemplatePath),
    sha256: sha256(reviewTemplateBytes),
    bytes: reviewTemplateBytes.byteLength,
    panelRows: aggregate.panelCount,
    requiredBalloonRows: aggregate.requiredDialogueOrCaptionItemCount,
    instructions: "复制为两个独立 reviewer 文件；panel 填 layout/crop/reading_order/subject_occlusion，required_balloon 填 geometry/type/text_fit；只填 true/false，不删除失败行。",
  };
  const contactSheets = [
    { kind: "paged", relativePath: relativeEvidencePath(pagedSheet.filePath), width: pagedSheet.width, height: pagedSheet.height, sha256: pagedSheet.sha256, bytes: pagedSheet.bytes },
    { kind: "vertical", relativePath: relativeEvidencePath(verticalSheet.filePath), width: verticalSheet.width, height: verticalSheet.height, sha256: verticalSheet.sha256, bytes: verticalSheet.bytes },
  ];
  const outputManifestUnsigned = {
    schemaVersion: 1,
    kind: "smart_layout_m0_baseline_outputs_v1",
    corpusDigest: corpus.corpusDigest,
    renderer: rendererIdentity,
    outputs,
    contactSheets,
    reviewTemplate,
  };
  const outputManifest = { ...outputManifestUnsigned, outputManifestDigest: digestCanonicalJson(outputManifestUnsigned) };
  await writeFile(path.join(evidenceRoot, "m0-baseline-output.manifest.json"), `${JSON.stringify(outputManifest, null, 2)}\n`, "utf8");

  const report = {
    schemaVersion: 1,
    kind: "smart_layout_m0_current_baseline_report_v1",
    corpusDigest: corpus.corpusDigest,
    outputManifestDigest: outputManifest.outputManifestDigest,
    status: "red",
    reasonCodes: [
      "CURRENT_LAYOUT_FIXED_COUNT_ONLY",
      "CURRENT_LAYOUT_HAS_NO_DIALOGUE_OBJECTS",
      "CURRENT_LAYOUT_HAS_NO_SEMANTIC_CROP",
      "CURRENT_LAYOUT_BELOW_PANEL_DIRECT_USABILITY_TARGET",
      "CURRENT_LAYOUT_BELOW_BALLOON_DIRECT_USABILITY_TARGET",
    ],
    currentBehavior: {
      paged: "每 4 镜固定分组，仅按数量套 single/two_horizontal/three_focus/four_panel",
      vertical: "每镜固定一个 1080×1920 single 段落",
      crop: "全部 zoom=1、offset=0 的中心 cover",
      dialogueAndCaption: "不创建文字或气泡对象",
    },
    aggregate: finalizeAggregate(aggregate),
    byFormat: {
      vertical_scroll: finalizeAggregate(byFormat.vertical_scroll),
      paged_comic: finalizeAggregate(byFormat.paged_comic),
    },
    reviewState: {
      deterministicContract: "passed",
      productionRendererOutputs: "generated",
      agentVisualReview: "pending_contact_sheet_review",
      independentHumanReviews: { required: 2, completed: 0, status: "pending_for_future_80_percent_release_gate" },
      reviewTemplate: reviewTemplate.relativePath,
      statement: "本报告冻结现状红灯和最少调整量，不冒充未来智能成稿质量或双人人工签收。",
    },
    futureReleaseTargets: {
      activeShotCoverageRate: 1,
      dialogueAndCaptionCoverageRate: 1,
      panelDirectUsableRate: 0.8,
      boundBalloonDirectUsableRate: 0.8,
      silentRewriteCount: 0,
      textOverflowCount: 0,
    },
  };
  await writeFile(path.join(evidenceRoot, "m0-current-baseline-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    corpusDigest: corpus.corpusDigest,
    outputManifestDigest: outputManifest.outputManifestDigest,
    aggregate: report.aggregate,
    contactSheets: contactSheets.map((sheet) => sheet.relativePath),
  }, null, 2)}\n`);
}

void main();
