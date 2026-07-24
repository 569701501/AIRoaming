import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceUrl = new URL("./LayoutExportWorkspace.vue", import.meta.url);
const presetsUrl = new URL("./layout-editor-presets.ts", import.meta.url);
const sessionUrl = new URL("../../composables/layout-editor-session.ts", import.meta.url);
const apiUrl = new URL("../../services/api.ts", import.meta.url);

test("pending proposals keep structural comparison and require the complete visual preview", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(source, /<LayoutDocumentMiniPreview[\s\S]*<LayoutDocumentMiniPreview/);
  assert.match(source, /data-testid="layout-authoritative-pending-preview"/);
  assert.match(source, /<LayoutDocumentVisualPreview[\s\S]*<LayoutDocumentVisualPreview/);
  assert.match(source, /authoritativePreviewReviewed/);
  assert.match(source, /review-required/);
  assert.match(source, /@review-state="captureAuthoritativePreviewReviewState"/);
  assert.match(source, /data-testid="layout-authoritative-preview-review-state"/);
  assert.match(source, /:disabled="aiBusy \|\| !authoritativePreviewReviewed"/);
});

test("mobile preview reports popup failures and keeps a same-page fallback reachable", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(source, /openDetachedPreviewWindow/);
  assert.match(source, /mobilePreviewFallbackUrl/);
  assert.match(source, /:href="mobilePreviewFallbackUrl"/);
  assert.match(source, />在当前页打开手机预览</);
  assert.match(source, /浏览器阻止了新标签页/);
  assert.match(source, /手机预览跳转失败/);
});

test("dirty mobile preview saves through the already-open blank window before navigation", async () => {
  const source = await readFile(workspaceUrl, "utf8");
  const openPreview = source.slice(
    source.indexOf("async function openMobilePreview"),
    source.indexOf("async function generateInitialComposition"),
  );

  assert.match(openPreview, /openDetachedPreviewWindowAfterPreparation/);
  assert.match(openPreview, /await session\.flush\(\)/);
  assert.match(openPreview, /!session\.isDirty\.value/);
  assert.match(openPreview, /preparation_failed/);
  assert.match(openPreview, /当前成稿保存失败/);
  assert.doesNotMatch(openPreview, /openDetachedPreviewWindow\(url\)/);
  assert.match(source, /mobilePreviewBusy/);
});

test("mobile preview preparation prevents switching the active chapter", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(
    source,
    /<select\s+:value="chapterId \?\? ''"\s+:disabled="loading \|\| mobilePreviewBusy"/,
  );
});

test("editable mid-width layouts wrap all top actions instead of hiding preview and publication", async () => {
  const source = await readFile(workspaceUrl, "utf8");
  const responsiveDesktopStart = source.indexOf("@media (min-width: 1024px) and (max-width: 1260px)");
  const mobileStart = source.indexOf("@media (max-width: 1023px)");

  assert.notEqual(responsiveDesktopStart, -1);
  assert.ok(mobileStart > responsiveDesktopStart);
  const responsiveDesktop = source.slice(responsiveDesktopStart, mobileStart);
  assert.match(responsiveDesktop, /\.editor-topbar\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(responsiveDesktop, /\.top-actions\s*\{[^}]*flex:\s*1 1 100%[^}]*flex-wrap:\s*wrap/);
  assert.match(responsiveDesktop, /\.layout-editor\s*\{[^}]*--layout-topbar-offset:\s*91px/);
  assert.match(source, /\.layout-ai-drawer\s*\{[^}]*top:\s*var\(--layout-topbar-offset\)/);
  assert.match(source, /\.mobile-preview-feedback\s*\{[^}]*top:\s*calc\(var\(--layout-topbar-offset\) \+ 9px\)/);
  assert.doesNotMatch(source, /\.top-actions button:nth-last-child\(-n \+ 2\)\s*\{\s*display:\s*none/);
});

test("changing balloon kind applies one semantic style batch", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(source, /layoutBalloonVisualPresetV1/);
  assert.match(source, /executeBatch\("应用语义气泡样式"/);
  assert.match(source, /command\("balloon\.set_kind"/);
  assert.match(source, /command\("balloon\.set_visual_style"/);
  assert.match(source, /command\("balloon\.set_tail"/);
  assert.match(source, /command\("balloon\.replace_text_document"/);
  assert.match(source, /resolveLayoutBalloonVisualRoleV1\(primaryElement\)/);
  assert.match(source, /enabled: visual\.tailAllowed && element\.tail\.enabled/);
});

test("balloon appearance presets expand only to the existing visual-style command", async () => {
  const source = await readFile(workspaceUrl, "utf8");
  const applyPreset = source.slice(
    source.indexOf("function applyBalloonAppearancePreset"),
    source.indexOf("function normalizeReservedBalloonToSpeech"),
  );

  assert.match(source, /data-testid="balloon-appearance-presets"/);
  assert.match(applyPreset, /applyBalloonVisualStyle/);
  assert.doesNotMatch(applyPreset, /balloon\.set_kind/);
  assert.doesNotMatch(applyPreset, /replace_text/);
  assert.doesNotMatch(applyPreset, /balloon\.set_tail/);
  assert.doesNotMatch(applyPreset, /presetId/);
});

test("reserved legacy color pairs are guarded in both directions and have an explicit escape", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(source, /function reservedBalloonPairRole/);
  assert.match(source, /implicitReservedBalloonRole/);
  assert.match(source, /element\.balloonKind === "speech"\s*\?\s*reservedBalloonPairRole/);
  assert.match(source, /data-testid="normalize-reserved-balloon"/);
  assert.match(source, /function normalizeReservedBalloonToSpeech/);
  assert.match(source, /layoutBalloonVisualPresetV1\(\s*"speech"/);
});

test("SFX presets are one undoable batch and preserve content, size and position", async () => {
  const [source, presetSource] = await Promise.all([
    readFile(workspaceUrl, "utf8"),
    readFile(presetsUrl, "utf8"),
  ]);
  const applyPreset = source.slice(
    source.indexOf("function applySfxPreset"),
    source.indexOf("function reservedBalloonPairRole"),
  );

  assert.match(source, /data-testid="sfx-preset-controls"/);
  assert.match(applyPreset, /session\.executeBatch\(buildLayoutSfxPresetBatchV1/);
  assert.match(presetSource, /const richText = structuredClone\(input\.element\.richText\)/);
  assert.match(presetSource, /type: "text\.set_semantic"/);
  assert.match(presetSource, /type: "text\.replace_document"/);
  assert.match(presetSource, /type: "element\.set_transform"/);
  assert.match(presetSource, /\.\.\.input\.element\.transform/);
  assert.doesNotMatch(presetSource, /run\.text\s*=/);
  assert.doesNotMatch(presetSource, /run\.fontSize\s*=/);
});

test("controlled semantic text roles select actual font faces", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(source, /balloonKind === "shout" \? 900 : balloonKind === "caption" \? 500 : 400/);
  assert.match(source, /font\.metadata\.face\.weight === desiredWeight/);
  assert.match(source, /run\.fontAssetId = semanticFace\.assetId/);
  assert.match(source, /run\.fontWeight = semanticFace\.metadata\.face\.weight/);
});

test("Konva stays an interaction adapter with crop, guides, pan and text focus exclusion", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(source, /<LayoutKonvaInteractionLayer/);
  assert.match(source, /@commit-transform="commitKonvaTransforms"/);
  assert.match(source, /@commit-tail="commitKonvaTail"/);
  assert.match(source, /@commit-crop="commitKonvaCrop"/);
  assert.match(source, /@pan="panKonvaViewport"/);
  assert.match(source, /@zoom="zoomKonvaViewport"/);
  assert.match(source, /activeTool === 'crop'/);
  assert.match(source, /target\?\.closest\("input, textarea, select, \[contenteditable='true'\]"\)/);
});

test("formal release follows preflight, warning acknowledgement, Revision, publication preflight and publication", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(source, /data-testid="layout-release-flow"/);
  assert.match(source, />成稿预检</);
  assert.match(source, />保存 Revision</);
  assert.match(source, />出版预检</);
  assert.match(source, />提交出版任务</);
  assert.match(source, /missingAcknowledgementCount/);
  assert.match(source, /publicationMissingAcknowledgementCount/);
  assert.match(source, /schemaVersion: 2,[\s\S]*expectedRevisionDocumentDigest: revision\.revisionDocumentDigest/);
  assert.match(source, /expectedVisibleDocumentDigest: revision\.visibleDocumentDigest/);
});

test("visible empty text preflight is presented with a Chinese label", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(source, /VISIBLE_TEXT_EMPTY:\s*"可见文字内容为空"/);
});

test("warning acknowledgements and request ids invalidate with mutable release identity", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(source, /watch\(\(\) => session\.isDirty\.value/);
  assert.match(source, /session\.server\.value\?\.documentDigest/);
  assert.match(source, /session\.server\.value\?\.sourceLockSetDigest/);
  assert.match(source, /session\.preflight\.value\?\.preflightDigest/);
  assert.match(source, /publicationPreflight\.value\?\.preflightDigest/);
  assert.match(source, /publicationRequestId\.value = null/);
});

test("V1/V2 API unions and session release/source-repair requests carry the correct digests", async () => {
  const [apiSource, sessionSource] = await Promise.all([
    readFile(apiUrl, "utf8"),
    readFile(sessionUrl, "utf8"),
  ]);

  assert.match(apiSource, /RunLayoutPreflightRequestV1OrV2/);
  assert.match(apiSource, /CreateLayoutRevisionRequestV1OrV2/);
  assert.match(apiSource, /CreateLayoutPublicationRequestV1OrV2/);
  assert.match(apiSource, /PreviewLayoutSourceReplacementRequestV2/);
  assert.match(apiSource, /CommitLayoutSourceReplacementRequestV2/);
  assert.match(sessionSource, /expectedRevisionDocumentDigest/);
  assert.match(sessionSource, /expectedVisibleDocumentDigest/);
  assert.match(sessionSource, /resultRevisionDocumentDigest/);
  assert.match(sessionSource, /resultVisibleDocumentDigest/);
  assert.match(sessionSource, /preview\.commandBatch\.batchId/);
  assert.match(sessionSource, /restoreRequestSchemaForWorkingCopyV1\(current\.document\) === 2\s*\?\s*await api\.restoreLayoutRevision/);
});

test("command batches create one history entry and Undo/Redo restore the exact endpoints", async () => {
  const source = await readFile(sessionUrl, "utf8");
  const executeBatch = source.slice(
    source.indexOf("function executeBatch"),
    source.indexOf("function clearSelectedSmartProtections"),
  );

  assert.match(executeBatch, /for \(const command of batch\.commands\)/);
  assert.equal((executeBatch.match(/pushSnapshotHistory/g) ?? []).length, 1);
  assert.match(source, /function undo\(\)[\s\S]*replaceLocalDocument\(entry\.before\)/);
  assert.match(source, /function redo\(\)[\s\S]*replaceLocalDocument\(entry\.after\)/);
});
