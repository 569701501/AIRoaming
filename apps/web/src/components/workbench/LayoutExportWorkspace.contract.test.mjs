import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspaceUrl = new URL("./LayoutExportWorkspace.vue", import.meta.url);
const exportDialogUrl = new URL("./LayoutExportDialog.vue", import.meta.url);
const settingsDrawerUrl = new URL("./LayoutCanvasSettingsDrawer.vue", import.meta.url);
const presetsUrl = new URL("./layout-editor-presets.ts", import.meta.url);
const sessionUrl = new URL("../../composables/layout-editor-session.ts", import.meta.url);
const compositionSessionUrl = new URL("../../composables/layout-composition-session.ts", import.meta.url);
const apiUrl = new URL("../../services/api.ts", import.meta.url);

test("the basic editor exposes autosave, preview, local undo and one export action without secondary AI controls", async () => {
  const [source, sessionSource] = await Promise.all([
    readFile(workspaceUrl, "utf8"),
    readFile(sessionUrl, "utf8"),
  ]);

  assert.match(source, /data-testid="layout-simple-export"/);
  assert.match(source, /saveStateLabel/);
  assert.match(source, /aria-label="手机预览"/);
  assert.doesNotMatch(source, /layout-ai-drawer/);
  assert.doesNotMatch(source, />智能调整</);
  assert.doesNotMatch(source, /aria-label="立即保存"/);
  // 本地撤销:内存快照栈、Cmd/Ctrl+Z、顶栏撤销按钮;不引入 redo、不持久化
  assert.match(source, /data-testid="layout-undo"/);
  assert.match(source, /session\.undo\(\)/);
  assert.match(sessionSource, /LAYOUT_UNDO_STACK_LIMIT = 50/);
  assert.match(sessionSource, /undoStack\.push\(structuredClone\(before\)\)/);
  assert.doesNotMatch(sessionSource, /redo/);
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
    /<select\s+:value="chapterId \?\? ''"\s+:disabled="loading \|\| mobilePreviewBusy \|\| exportOperationBusy"/,
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

test("SFX presets are one atomic batch and preserve content, size and position", async () => {
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

test("elements and layers expose a right-click context menu wired to existing actions", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(source, /@context-menu="openElementContextMenu"/);
  assert.match(source, /@contextmenu\.prevent="openElementContextMenu/);
  assert.match(source, /data-testid="layout-context-menu"/);
  assert.match(source, /role="menu"/);
  assert.match(source, /runContextMenuAction\(duplicatePrimaryElement\)/);
  assert.match(source, /runContextMenuAction\(deletePrimaryElement\)/);
  assert.match(source, /moveLayer\(contextMenuElement!\.id, 'up'\)/);
  assert.match(source, /if \(contextMenu\.value\) \{\s*closeContextMenu\(\);\s*return;\s*\}/);
  assert.doesNotMatch(source, /oncontextmenu\s*=\s*"return false"/);
});

test("one export action internally runs save, both preflights, Revision and publication", async () => {
  const [source, dialogSource] = await Promise.all([
    readFile(workspaceUrl, "utf8"),
    readFile(exportDialogUrl, "utf8"),
  ]);
  const flow = source.slice(
    source.indexOf("async function startSimpleExport"),
    source.indexOf("function publicationArtifactUrl"),
  );

  assert.match(source, /data-testid="layout-simple-export"/);
  assert.match(dialogSource, /data-testid="layout-export-dialog"/);
  assert.doesNotMatch(source, /data-testid="layout-release-flow"/);
  assert.doesNotMatch(source, />保存 Revision</);
  assert.doesNotMatch(source, />出版预检</);
  assert.match(flow, /await session\.flush\(\)/);
  assert.match(flow, /session\.runPreflight/);
  assert.match(flow, /session\.createRevision/);
  assert.match(flow, /const revision = created\.revision/);
  assert.match(flow, /api\.runLayoutPreflight/);
  assert.match(flow, /api\.createLayoutPublication/);
  assert.match(flow, /expectedRevisionDocumentDigest: revision\.revisionDocumentDigest/);
  assert.match(flow, /expectedVisibleDocumentDigest: revision\.visibleDocumentDigest/);
});

test("a committed Revision remains usable when its follow-up history refresh fails", async () => {
  const source = await readFile(sessionUrl, "utf8");
  const createRevision = source.slice(
    source.indexOf("async function createRevision"),
    source.indexOf("async function keepLocalAndRetry"),
  );

  assert.match(createRevision, /expectedCurrentRevisionId:\s*current\.basedOnRevisionId/);
  assert.match(createRevision, /api\.listLayoutRevisions[\s\S]*\.catch\(\(\) => null\)/);
  assert.match(createRevision, /currentLayoutRevisionId:\s*result\.revision\.id/);
  assert.ok(createRevision.indexOf("return result") > createRevision.indexOf("api.listLayoutRevisions"));
});

test("an ambiguous Revision response is retried from the exact retained attempt before fresh preflight", async () => {
  const [workspaceSource, sessionSource] = await Promise.all([
    readFile(workspaceUrl, "utf8"),
    readFile(sessionUrl, "utf8"),
  ]);
  const createRevision = sessionSource.slice(
    sessionSource.indexOf("async function createRevision"),
    sessionSource.indexOf("async function keepLocalAndRetry"),
  );
  const retryExport = workspaceSource.slice(
    workspaceSource.indexOf("async function retrySimpleExport"),
    workspaceSource.indexOf("async function confirmSimpleExport"),
  );

  assert.match(createRevision, /pendingRevisionAttempt\.value = attempt/);
  assert.match(createRevision, /api\.createLayoutRevision\([\s\S]*attempt\.request/);
  assert.match(createRevision, /error instanceof ApiClientError[\s\S]*error\.status >= 400[\s\S]*error\.status < 500/);
  assert.match(retryExport, /session\.hasPendingRevisionAttempt\.value/);
  assert.match(retryExport, /await createRevisionAndPublication\(\)/);
});

test("publication state survives history failure and an ambiguous POST stays in recovery", async () => {
  const [source, dialogSource] = await Promise.all([
    readFile(workspaceUrl, "utf8"),
    readFile(exportDialogUrl, "utf8"),
  ]);
  const submit = source.slice(
    source.indexOf("async function submitCurrentPublication"),
    source.indexOf("function publicationArtifactUrl"),
  );

  assert.match(source, /activeExportPublicationSnapshot/);
  assert.match(
    submit,
    /activeExportPublicationSnapshot\.value = mergeLayoutPublicationSnapshot\(\s*activeExportPublicationSnapshot\.value,\s*result\.exportRevision/,
  );
  assert.match(source, /api\.getLayoutPublication/);
  assert.match(submit, /publicationRetryAfter = Date\.now\(\) \+ 3_000/);
  assert.match(submit, /exportDialogStage\.value = "publishing"/);
  assert.match(dialogSource, /正在确认导出状态/);
});

test("visible empty text preflight is presented with a Chinese label", async () => {
  const source = await readFile(exportDialogUrl, "utf8");

  assert.match(source, /VISIBLE_TEXT_EMPTY:\s*"可见文字内容为空"/);
  assert.match(source, /CUSTOM_TEXT_PRESENT:\s*"你添加了自定义文字"/);
  assert.match(source, /UNOWNED_TEXT_PRESENT:\s*"发现无来源文字"/);
});

test("the export dialog compares source and current text and never offers force export for blockers", async () => {
  const source = await readFile(exportDialogUrl, "utf8");

  assert.match(source, />原文</);
  assert.match(source, /issue\.details\.sourceText/);
  assert.match(source, />当前文字</);
  assert.match(source, /issue\.details\.currentText/);
  assert.match(source, /props\.catalogItems\.find\(\(item\) => item\.source\.shotId === issue\.shotId\)/);
  assert.match(source, /canvas\?\.name/);
  assert.match(source, /exportIssueBlockingText\(issue\)/);
  assert.match(source, /bound_balloon_outside_canvas[\s\S]*对白气泡完全在画布外/);
  assert.match(source, /bound_balloon_not_visible[\s\S]*对白气泡已隐藏或完全透明/);
  assert.match(source, />返回修改</);
  assert.match(source, />按当前文字导出</);
  const blocked = source.slice(
    source.indexOf("stage === 'blocked'"),
    source.indexOf("stage === 'review'"),
  );
  assert.doesNotMatch(blocked, /按当前文字导出/);
  assert.doesNotMatch(source, /缺少智能成稿规划证据/);
});

test("V1/V2 API unions and session release/source-sync requests carry the correct digests", async () => {
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
});

test("the editor session keeps only bounded local undo snapshots and no redo or pending AI proposal state", async () => {
  const source = await readFile(sessionUrl, "utf8");
  assert.match(source, /function undo\(/);
  assert.match(source, /LAYOUT_UNDO_STACK_LIMIT/);
  assert.doesNotMatch(source, /function redo\(/);
  assert.doesNotMatch(source, /pushSnapshotHistory/);
  assert.doesNotMatch(source, /pendingCommand/);
  assert.doesNotMatch(source, /previewPendingCommand/);
});

test("automatic composition runs only for a missing working copy and exposes no later reflow entry", async () => {
  const [workspaceSource, compositionSource] = await Promise.all([
    readFile(workspaceUrl, "utf8"),
    readFile(compositionSessionUrl, "utf8"),
  ]);

  assert.match(workspaceSource, /session\.saveState\.value !== "missing"/);
  assert.match(workspaceSource, /autoCompositionKey === key/);
  assert.match(workspaceSource, /composition\.busy\.value/);
  assert.match(workspaceSource, /void generateInitialComposition\(\)/);
  assert.match(compositionSource, /async function startInitial/);
  assert.doesNotMatch(compositionSource, /startFullReflow/);
  assert.doesNotMatch(compositionSource, /startScopedReflow/);
  assert.doesNotMatch(workspaceSource, /retryInitialComposition/);
  assert.doesNotMatch(workspaceSource, />按镜头排版</);
});

test("removing a bound formal balloon keeps a hidden recoverable element", async () => {
  const source = await readFile(sessionUrl, "utf8");

  assert.match(source, /type:\s*"balloon\.suppress_bound"[\s\S]*mode:\s*"hide"/);
  assert.doesNotMatch(source, /mode:\s*command\.type === "element\.delete" \? "delete"/);
});

test("a selected hidden object offers a real restore action instead of hiding it twice", async () => {
  const source = await readFile(workspaceUrl, "utf8");

  assert.match(source, /@click="setSelectedHidden\(!primaryElement\.hidden\)"/);
  assert.match(source, /\{\{ primaryElement\.hidden \? '显示对象' : '隐藏对象' \}\}/);
});
