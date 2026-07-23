import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  digestCanonicalJson,
  digestLayoutSourceLockSet,
  LayoutDocumentCodecV1,
  StoryboardDocumentCodecV2,
} from "../../packages/shared/src/index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repoRoot, "tests/fixtures/smart-layout");

async function json(relativePath: string): Promise<any> {
  return JSON.parse(await readFile(path.join(fixtureRoot, relativePath), "utf8"));
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

test("M0 corpus freezes ten semantic groups and twelve balanced runnable variants", async () => {
  const manifest = await json("corpus.manifest.json");
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.kind, "smart_layout_m0_corpus_v1");
  assert.equal(manifest.groupCount, 10);
  assert.equal(manifest.runnableVariantCount, 12);
  assert.deepEqual(manifest.groups.map((group: any) => group.groupId), [
    "FIX-V01", "FIX-V02", "FIX-V03", "FIX-V04",
    "FIX-P01", "FIX-P02", "FIX-P03", "FIX-P04",
    "FIX-X01", "FIX-X02",
  ]);
  assert.deepEqual(manifest.groups.at(-2).variantIds, ["fix-x01-vertical", "fix-x01-paged"]);
  assert.deepEqual(manifest.groups.at(-1).variantIds, ["fix-x02-vertical", "fix-x02-paged"]);
  assert.equal(manifest.variants.filter((variant: any) => variant.comicFormat === "vertical_scroll").length, 6);
  assert.equal(manifest.variants.filter((variant: any) => variant.comicFormat === "paged_comic").length, 6);
  assert.equal(manifest.variants.reduce((sum: number, variant: any) => sum + variant.shotCount, 0), 69);
  assert.equal(manifest.variants.reduce((sum: number, variant: any) => sum + variant.dialogueOrCaptionItemCount, 0), 59);
  const { corpusDigest, ...unsigned } = manifest;
  assert.equal(digestCanonicalJson(unsigned), corpusDigest);
  assert.equal(manifest.scoringPolicy.requiredIndependentHumanReviews, 2);
  assert.equal(manifest.scoringPolicy.missingRequiredBalloonCountsAsFailure, true);
});

test("every variant has a valid formal storyboard, current lock set, ready sources and exact V1 baseline", async () => {
  const manifest = await json("corpus.manifest.json");
  for (const entry of manifest.variants) {
    const fixture = await json(entry.path);
    assert.equal(fixture.fixtureSchemaVersion, 1);
    assert.equal(fixture.kind, "smart_layout_m0_fixture_v1");
    assert.equal(fixture.group.groupId, entry.groupId);
    assert.equal(fixture.variant.variantId, entry.variantId);
    assert.equal(digestCanonicalJson(fixture), entry.fixtureDigest);

    const storyboard = fixture.inputs.storyboardVersion.document;
    const characterIds = new Set(fixture.inputs.characterCatalog.map((character: any) => character.id));
    const beatIds = new Set(fixture.inputs.storyContext.beats.map((beat: any) => beat.id));
    const sceneIds = new Set(fixture.inputs.storyContext.scenes.map((scene: any) => scene.id));
    const parsedStoryboard = StoryboardDocumentCodecV2.parse(storyboard, { characterIds, beatIds, sceneIds });
    const storyboardEncoded = StoryboardDocumentCodecV2.encode(parsedStoryboard);
    assert.equal(storyboardEncoded.digest, fixture.inputs.storyboardVersion.documentDigest);
    assert.equal(storyboardEncoded.digest, entry.storyboardDigest);
    assert.equal(parsedStoryboard.shots.length, entry.shotCount);
    assert.equal(fixture.inputs.storyboardVersion.position, "current");

    const lockSet = fixture.inputs.candidateLockSet;
    assert.equal(lockSet.state, "complete");
    assert.equal(lockSet.sourceApplicability, "current");
    assert.equal(lockSet.items.length, parsedStoryboard.shots.length);
    assert.ok(lockSet.items.every((item: any) => item.status === "ready"));
    assert.deepEqual(lockSet.items.map((item: any) => item.order), parsedStoryboard.shots.map((shot: any) => shot.order));
    assert.deepEqual(lockSet.items.map((item: any) => item.shotId), parsedStoryboard.shots.map((shot: any) => shot.id));

    const sourceCatalog = fixture.inputs.sourceCatalog;
    assert.equal(sourceCatalog.sourceLockSetDigest, lockSet.digest);
    assert.equal(sourceCatalog.items.length, parsedStoryboard.shots.length);
    for (const [index, source] of sourceCatalog.items.entries()) {
      const lock = lockSet.items[index];
      assert.equal(source.order, lock.order);
      assert.equal(source.source.shotId, lock.shotId);
      assert.equal(source.source.candidateId, lock.candidateId);
      assert.equal(source.source.candidateLockRevisionId, lock.candidateLockRevisionId);
      assert.equal(source.source.assetId, lock.assetId);
      assert.equal(source.assetSha256, lock.assetSha256);
      assert.equal(source.status, "ready");
    }

    const layout = LayoutDocumentCodecV1.encode(fixture.currentBaseline.layoutDocument);
    assert.equal(layout.digest, fixture.currentBaseline.layoutDocumentDigest);
    assert.equal(layout.digest, entry.layoutDocumentDigest);
    const activeShotIds = parsedStoryboard.shots.map((shot: any) => shot.id);
    assert.equal(digestLayoutSourceLockSet(layout.value, activeShotIds), lockSet.digest);
    assert.equal(lockSet.digest, entry.sourceLockSetDigest);
    const panels = layout.value.canvases.flatMap((canvas: any) => canvas.elements)
      .filter((element: any) => element.type === "panel_frame" && element.contentImage !== null);
    const textOrBalloons = layout.value.canvases.flatMap((canvas: any) => canvas.elements)
      .filter((element: any) => element.type === "text" || element.type === "balloon");
    assert.equal(panels.length, parsedStoryboard.shots.length);
    assert.equal(textOrBalloons.length, 0);
    assert.equal(fixture.currentBaseline.assessment.summary.currentShotCoverageRate, 1);
  }
});

test("dialogue ledger covers source voice lines and captions once while the current baseline remains honestly red", async () => {
  const manifest = await json("corpus.manifest.json");
  let totalPanels = 0;
  let usablePanels = 0;
  let requiredBalloons = 0;
  let usableBalloons = 0;
  for (const entry of manifest.variants) {
    const fixture = await json(entry.path);
    const storyboard = fixture.inputs.storyboardVersion.document;
    const sourceItemCount = storyboard.shots.reduce((sum: number, shot: any) =>
      sum + shot.motion.voiceLines.length + (shot.comic.caption.trim() === "" ? 0 : 1), 0);
    const ledger = fixture.inputs.dialogueLedger;
    assert.equal(ledger.items.length, sourceItemCount);
    assert.equal(ledger.items.length, entry.dialogueOrCaptionItemCount);
    assert.equal(ledger.digest, digestCanonicalJson(ledger.items));
    assert.equal(new Set(ledger.items.map((item: any) => item.itemId)).size, ledger.items.length);
    for (const item of ledger.items) assert.equal(item.textDigest, digestCanonicalJson(item.text));

    const assessment = fixture.currentBaseline.assessment;
    assert.equal(assessment.status, "red");
    assert.equal(assessment.balloonReview.requiredSourceItemCount, ledger.items.length);
    assert.equal(assessment.balloonReview.placedBalloonCount, 0);
    assert.equal(assessment.balloonReview.directUsableCount, 0);
    assert.equal(assessment.balloonReview.directUsableRate, ledger.items.length === 0 ? null : 0);
    assert.equal(assessment.summary.currentDialogueAndCaptionCoverageRate, ledger.items.length === 0 ? null : 0);
    assert.equal(assessment.panelReview.length, storyboard.shots.length);
    for (const panel of assessment.panelReview) {
      assert.equal(panel.directUsable, panel.layoutOk && panel.cropOk && panel.readingOrderOk && panel.subjectOcclusionOk);
      assert.deepEqual(panel.requiredManualAdjustments, [
        ...(panel.layoutOk ? [] : ["layout"]),
        ...(panel.cropOk ? [] : ["crop"]),
      ]);
    }
    const directCount = assessment.panelReview.filter((panel: any) => panel.directUsable).length;
    assert.equal(assessment.summary.panelDirectUsableCount, directCount);
    assert.equal(assessment.summary.panelsNeedingLayoutAdjustment, assessment.panelReview.filter((panel: any) => !panel.layoutOk).length);
    assert.equal(assessment.summary.panelsNeedingCropAdjustment, assessment.panelReview.filter((panel: any) => !panel.cropOk).length);
    totalPanels += assessment.summary.panelCount;
    usablePanels += directCount;
    requiredBalloons += assessment.balloonReview.requiredSourceItemCount;
    usableBalloons += assessment.balloonReview.directUsableCount;
  }
  assert.equal(totalPanels, 69);
  assert.equal(usablePanels, 5);
  assert.equal(usablePanels / totalPanels, 5 / 69);
  assert.equal(requiredBalloons, 59);
  assert.equal(usableBalloons, 0);
});

test("all image/font bytes are local, ready, hashed and dimension-pinned", async () => {
  const manifest = await json("corpus.manifest.json");
  assert.ok(manifest.assets.images.length >= 12);
  for (const asset of manifest.assets.images) {
    const bytes = await readFile(path.join(fixtureRoot, asset.relativePath));
    assert.equal(asset.status, "ready");
    assert.equal(sha256(bytes), asset.sha256);
    assert.equal(bytes.readUInt32BE(0), 0x89504e47);
    assert.equal(bytes.readUInt32BE(16), asset.width);
    assert.equal(bytes.readUInt32BE(20), asset.height);
    assert.ok(asset.width >= 720);
    assert.ok(asset.height >= 720);
    assert.ok(asset.subjectBoxes.length >= 1);
  }
  assert.equal(manifest.assets.fonts.length, 1);
  const font = manifest.assets.fonts[0];
  const fontBytes = await readFile(path.join(fixtureRoot, font.relativePath));
  assert.equal(font.status, "ready");
  assert.equal(sha256(fontBytes), font.sha256);
  assert.equal(fontBytes.subarray(0, 4).toString("ascii"), "wOF2");
  assert.equal(font.metadata.license.spdx, "OFL-1.1");
  assert.equal(font.metadata.license.embeddingAllowed, true);
});

test("source-update group freezes both paged and vertical ready replacement inputs", async () => {
  const manifest = await json("corpus.manifest.json");
  const replacementEntries = manifest.variants.filter((entry: any) => entry.groupId === "FIX-X02");
  assert.deepEqual(replacementEntries.map((entry: any) => entry.comicFormat).sort(), ["paged_comic", "vertical_scroll"]);
  for (const entry of replacementEntries) {
    const fixture = await json(entry.path);
    const scenario = fixture.replacementScenario;
    assert.equal(scenario.status, "ready");
    assert.equal(scenario.currentSource.shotId, scenario.nextSource.shotId);
    assert.notEqual(scenario.currentSource.candidateLockRevisionId, scenario.nextSource.candidateLockRevisionId);
    assert.notEqual(scenario.currentSource.assetId, scenario.nextSource.assetId);
    const bytes = await readFile(path.join(fixtureRoot, scenario.nextAsset.relativePath));
    assert.equal(sha256(bytes), scenario.nextAsset.sha256);
    assert.deepEqual(scenario.expectedPreservation, ["panel_geometry", "crop", "dialogue_text", "balloon", "historical_revision", "historical_publication"]);
  }
});
