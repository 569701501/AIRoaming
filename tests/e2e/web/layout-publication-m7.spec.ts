import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import {
  applyLayoutCommandBatchV2,
  buildTaskSourceProjection,
  LAYOUT_PUBLICATION_SOURCE_POLICY_V2,
  LayoutDocumentCodecV1,
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  taskSourceProjectionDigest,
  type CandidateImageSourceV1,
  type GenerationTaskItem,
  type LayoutPublicationHistoryResponseV2,
  type LayoutPreflightReportV2,
  type LayoutRevisionHistoryResponseV2,
  type LayoutDocumentV2,
  type LayoutWorkingCopyResponseV1,
  type RestoreLayoutRevisionResponseV2,
  type SaveLayoutWorkingCopyResponseV1,
} from "@airoaming/shared";

import { expect, test } from "../support/e2e-fixture.ts";
import { completeSimpleExportFlow } from "../support/layout-export-flow.ts";
import {
  lockCandidate,
  prepareG4CandidateFixture,
  replaceCandidate,
} from "../support/g4-candidate-fixture.ts";

const { DatabaseSync } = createRequire(path.join(process.cwd(), "package.json"))("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

const evidenceRoot = path.resolve(
  "文档/05_执行与记录/任务记录/2026-07-26_漫画成稿体验评估与P0修复/evidence",
);

test("G5-M7 基础版：首次自动排版后一次导出形成 DB-only 闭环", async ({
  api,
  page,
  rainSmokeProject,
  runtime,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject);
  await lockCandidate(api, fixture, fixture.candidateIds[0]!);
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);

  await page.goto(`/projects/${fixture.projectId}/layout`);
  await expect(page.getByTestId("shot-tray")).toBeVisible({ timeout: 45_000 });

  // E2E 图片服务返回真实 1×1 PNG；把画格同步成 1×1，避免伪造来源尺寸，仍由渲染器读取原始字节。
  const workingCopyUrl = `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`;
  const workingCopy = (await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl)).data;
  expect(workingCopy.document.schemaVersion).toBe(2);
  const document = structuredClone(workingCopy.document) as LayoutDocumentV2;
  const panel = document.canvases[0]?.elements[0];
  if (panel?.type !== "panel_frame" || !panel.contentImage) throw new Error("G5_M7_E2E_PANEL_MISSING");
  panel.transform = { ...panel.transform, x: 64, y: 64, width: 1, height: 1 };
  panel.shape.cornerRadius = 0;
  panel.contentImage.crop = { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false };
  const encoded = LayoutDocumentCodecV2.encode(document);
  await api.put<SaveLayoutWorkingCopyResponseV1>(workingCopyUrl, {
    schemaVersion: 1,
    expectedRowVersion: workingCopy.rowVersion,
    baseDocumentDigest: workingCopy.documentDigest,
    documentDigest: encoded.digest,
    document: encoded.value,
  });
  await page.reload();
  await expect(page.getByTestId("shot-tray")).toBeVisible();

  await page.getByTestId("layout-simple-export").click();
  const exportDialog = page.getByTestId("layout-export-dialog");
  await expect(exportDialog).toBeVisible();
  await completeSimpleExportFlow(exportDialog);

  const sliceLink = exportDialog.getByRole("link", { name: "条漫切片 1" });
  await expect(sliceLink).toBeVisible();
  const sliceHref = await sliceLink.getAttribute("href");
  if (!sliceHref) throw new Error("G5_M7_E2E_SLICE_HREF_MISSING");
  const sliceResponse = await page.request.get(sliceHref);
  expect(sliceResponse.status()).toBe(200);
  expect(sliceResponse.headers()["content-type"]).toContain("image/png");
  expect((await sliceResponse.body()).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

  const history = (await api.get<LayoutPublicationHistoryResponseV2>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/exports/layout-publications`,
  )).data;
  expect(history.currentExportRevisionId).toBe(history.items[0]?.id);
  expect(history.items[0]).toMatchObject({
    status: "ready",
    completionApplicability: "current",
    revisionPosition: "current",
  });
  expect(history.items[0]?.artifacts.map((artifact) => artifact.role).sort()).toEqual([
    "long_png",
    "publication_manifest",
    "strip_slice_png",
  ]);

  const database = new DatabaseSync(runtime.databasePath);
  try {
    const exportRow = database.prepare("SELECT status, task_id, manifest_digest FROM export_revisions WHERE id = ?").get(history.items[0]!.id) as {
      status: string;
      task_id: string;
      manifest_digest: string;
    };
    expect(exportRow.status).toBe("ready");
    expect(exportRow.manifest_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const task = database.prepare("SELECT type, status, applicability FROM generation_tasks WHERE id = ?").get(exportRow.task_id) as {
      type: string;
      status: string;
      applicability: string;
    };
    expect(task).toEqual({ type: "layout_export", status: "succeeded", applicability: "current" });
    const artifactCount = database.prepare(`
      SELECT COUNT(*) AS count
      FROM export_artifacts artifact
      JOIN assets asset ON asset.id = artifact.asset_id
      WHERE artifact.export_revision_id = ? AND asset.status = 'ready'
    `).get(history.items[0]!.id) as { count: number };
    expect(artifactCount.count).toBe(3);
  } finally {
    database.close();
  }

  expect(pageErrors).toEqual([]);
  await mkdir(evidenceRoot, { recursive: true });
  await page.screenshot({ path: path.join(evidenceRoot, "g5_m7_publication_ready.png"), fullPage: true });
});

test("专业成稿 V2 基础版：来源同步、并发冲突、导出、API 恢复与手机预览闭环", async ({
  api,
  page,
  rainSmokeProject,
  runtime,
}) => {
  test.setTimeout(150_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject);
  const originalLock = await lockCandidate(api, fixture, fixture.candidateIds[0]!);
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);

  await page.goto(`/projects/${fixture.projectId}/layout`);
  await expect(page.getByTestId("shot-tray")).toBeVisible({ timeout: 35_000 });

  const workingCopyUrl = `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`;
  const initial = (await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl)).data;
  expect(initial.document.schemaVersion).toBe(2);
  const initialDocument = initial.document as LayoutDocumentV2;
  const canvas = initialDocument.canvases[0];
  const panel = canvas?.elements.find((element) => element.type === "panel_frame");
  if (!canvas || panel?.type !== "panel_frame" || !panel.contentImage) {
    throw new Error("LAYOUT_V2_E2E_PANEL_MISSING");
  }

  // E2E 图片服务返回真实 1×1 PNG；通过正式 V2 user commands 缩小画格，
  // 同时验证几何/裁切保护会随命令进入 LayoutDocument，而不是写入 Konva 私有状态。
  const tunedDocument = applyLayoutCommandBatchV2(initialDocument, {
    schemaVersion: 2,
    batchId: `e2e_tune_${randomUUID()}`,
    label: "为真实出版校准 E2E 画格",
    commands: [
      {
        schemaVersion: 2,
        commandId: `e2e_transform_${randomUUID()}`,
        type: "element.set_transform",
        label: "校准画格尺寸",
        actor: "user",
        payload: {
          canvasId: canvas.id,
          elementId: panel.id,
          transform: {
            ...panel.transform,
            x: 64,
            y: 64,
            width: 1,
            height: 1,
            rotation: 0,
          },
        },
      },
      {
        schemaVersion: 2,
        commandId: `e2e_shape_${randomUUID()}`,
        type: "panel.set_shape",
        label: "校准画格圆角",
        actor: "user",
        payload: {
          canvasId: canvas.id,
          elementId: panel.id,
          shape: { ...panel.shape, cornerRadius: 0 },
        },
      },
      {
        schemaVersion: 2,
        commandId: `e2e_crop_${randomUUID()}`,
        type: "image.set_crop",
        label: "校准图片裁切",
        actor: "user",
        payload: {
          canvasId: canvas.id,
          elementId: panel.id,
          crop: {
            zoom: 1,
            offsetX: 0,
            offsetY: 0,
            rotation: 0,
            flipX: false,
            flipY: false,
          },
        },
      },
    ],
  }).document;
  const tuned = LayoutDocumentCodecV2.encode(tunedDocument);
  await api.put<SaveLayoutWorkingCopyResponseV1>(workingCopyUrl, {
    schemaVersion: 1,
    expectedRowVersion: initial.rowVersion,
    baseDocumentDigest: initial.documentDigest,
    documentDigest: tuned.digest,
    document: tuned.value,
  });

  const replacementLock = await replaceCandidate(api, fixture, fixture.candidateIds[1]!);
  expect(replacementLock.revision.previousRevisionId).toBe(originalLock.revision.id);
  await page.reload();
  const sourceBanner = page.getByTestId("candidate-source-status");
  await expect(sourceBanner).toContainText("候选定稿已变化");
  await sourceBanner.getByRole("button", { name: "同步最新镜头" }).click();
  await expect(page.getByTestId("candidate-source-status")).toHaveCount(0, { timeout: 15_000 });

  const replaced = (await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl)).data;
  expect(replaced.document.schemaVersion).toBe(2);
  const replacedDocument = replaced.document as LayoutDocumentV2;
  expect(replacedDocument.automation.composition).toEqual(tuned.value.automation.composition);
  const replacedImages = replacedDocument.canvases
    .flatMap((item) => item.elements)
    .flatMap<{
      id: string;
      targetKind: "panel_image" | "element";
      source: CandidateImageSourceV1;
    }>((element) => {
    if (element.type === "panel_frame" && element.contentImage) {
      return [{
        id: element.contentImage.id,
        targetKind: "panel_image" as const,
        source: element.contentImage.source,
      }];
    }
    if (element.type === "free_image") {
      return [{
        id: element.id,
        targetKind: "element" as const,
        source: element.source,
      }];
    }
    return [];
    })
    .filter((image) => image.source.shotId === fixture.shotId);
  expect(replacedImages.length).toBeGreaterThan(0);
  expect(replacedImages.every((image) => (
    image.source.candidateLockRevisionId === replacementLock.revision.id
  ))).toBe(true);
  for (const image of replacedImages) {
    expect(replacedDocument.automation.protections).toContainEqual(expect.objectContaining({
      targetKind: image.targetKind,
      targetId: image.id,
      reason: "user_edit",
      scopes: expect.arrayContaining(["crop", "source"]),
    }));
  }

  // 基础版没有撤销：来源同步由自动保存直接落库，服务端草稿必须与提交结果一致。
  await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });
  const finalWorkingCopy = (await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl)).data;
  expect(finalWorkingCopy.documentDigest).toBe(replaced.documentDigest);
  const finalDocument = finalWorkingCopy.document as LayoutDocumentV2;
  const finalRevisionDigest = LayoutDocumentCodecV2.encode(finalDocument).digest;
  const finalVisibleDigest = LayoutDocumentCodecV1.encode(
    projectLayoutDocumentV2ToV1(finalDocument),
  ).digest;

  const concurrencyPreflight = (await api.post<LayoutPreflightReportV2>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/preflight`,
    {
      schemaVersion: 2,
      target: {
        kind: "working_copy",
        expectedRowVersion: finalWorkingCopy.rowVersion,
        expectedRevisionDocumentDigest: finalRevisionDigest,
        expectedVisibleDocumentDigest: finalVisibleDigest,
      },
      profile: null,
    },
  )).data;
  const concurrentlyChangedDocument = structuredClone(finalDocument);
  concurrentlyChangedDocument.canvases[0]!.name = "预检后并发摘要变化";
  const concurrentlyChanged = LayoutDocumentCodecV2.encode(concurrentlyChangedDocument);
  const concurrentlyChangedSave = (await api.put<SaveLayoutWorkingCopyResponseV1>(workingCopyUrl, {
    schemaVersion: 1,
    expectedRowVersion: finalWorkingCopy.rowVersion,
    baseDocumentDigest: finalWorkingCopy.documentDigest,
    documentDigest: concurrentlyChanged.digest,
    document: concurrentlyChanged.value,
  })).data.value;
  await expect(api.post(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/revisions`,
    {
      schemaVersion: 2,
      expectedWorkingCopyRowVersion: finalWorkingCopy.rowVersion,
      expectedRevisionDocumentDigest: finalRevisionDigest,
      expectedVisibleDocumentDigest: finalVisibleDigest,
      expectedCurrentRevisionId: null,
      saveReason: "user_checkpoint",
      acknowledgedIssueKeys: concurrencyPreflight.issues
        .filter((issue) => issue.requiresAcknowledgement)
        .map((issue) => issue.issueKey),
    },
  )).rejects.toThrow(/LAYOUT_WORKING_COPY_CONFLICT/);
  expect((await api.get<LayoutRevisionHistoryResponseV2>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/revisions`,
  )).data.items).toHaveLength(0);
  await api.put<SaveLayoutWorkingCopyResponseV1>(workingCopyUrl, {
    schemaVersion: 1,
    expectedRowVersion: concurrentlyChangedSave.rowVersion,
    baseDocumentDigest: concurrentlyChangedSave.documentDigest,
    documentDigest: finalRevisionDigest,
    document: finalDocument,
  });

  await page.reload();
  await expect(page.getByTestId("shot-tray")).toBeVisible();
  await page.getByTestId("layout-simple-export").click();
  const exportDialog = page.getByTestId("layout-export-dialog");
  await expect(exportDialog).toBeVisible();
  await completeSimpleExportFlow(exportDialog, async () => {
    await expect(exportDialog).toContainText("首次排版沿用了人工确认的镜头更换");
  });

  const revisionHistory = (await api.get<LayoutRevisionHistoryResponseV2>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/revisions`,
  )).data;
  expect(revisionHistory.schemaVersion).toBe(2);
  const currentRevision = revisionHistory.items.find(
    (item) => item.id === revisionHistory.currentLayoutRevisionId,
  );
  if (!currentRevision || currentRevision.documentSchemaVersion !== 2) {
    throw new Error("LAYOUT_V2_E2E_REVISION_MISSING");
  }
  expect(currentRevision.revisionDocumentDigest).toBe(finalRevisionDigest);
  expect(currentRevision.visibleDocumentDigest).toBe(finalVisibleDigest);

  const publicationHistory = (await api.get<LayoutPublicationHistoryResponseV2>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/exports/layout-publications`,
  )).data;
  expect(publicationHistory.schemaVersion).toBe(2);
  const publication = publicationHistory.items[0];
  if (!publication || publication.documentSchemaVersion !== 2) {
    throw new Error("LAYOUT_V2_E2E_PUBLICATION_MISSING");
  }
  expect(publication).toMatchObject({
    status: "ready",
    revisionDocumentDigest: finalRevisionDigest,
    visibleDocumentDigest: finalVisibleDigest,
    manifest: {
      schemaVersion: 2,
      kind: "layout_publication_manifest_v2",
      revisionDocumentDigest: finalRevisionDigest,
      visibleDocumentDigest: finalVisibleDigest,
    },
  });
  expect(publication.artifacts.map((artifact) => artifact.role).sort()).toEqual([
    "long_png",
    "publication_manifest",
    "strip_slice_png",
  ]);
  await expect(exportDialog.getByRole("link", { name: "条漫切片 1" })).toBeVisible();

  const database = new DatabaseSync(runtime.databasePath);
  try {
    const revisionRow = database.prepare(`
      SELECT schema_version, document_digest, visible_document_digest
      FROM layout_revisions
      WHERE id = ?
    `).get(currentRevision.id) as {
      schema_version: number;
      document_digest: string;
      visible_document_digest: string;
    };
    expect(revisionRow).toEqual({
      schema_version: 2,
      document_digest: finalRevisionDigest,
      visible_document_digest: finalVisibleDigest,
    });
    const exportRow = database.prepare(`
      SELECT revision_document_digest, visible_document_digest, manifest_schema_version
      FROM export_revisions
      WHERE id = ?
    `).get(publication.id) as {
      revision_document_digest: string;
      visible_document_digest: string;
      manifest_schema_version: number;
    };
    expect(exportRow).toEqual({
      revision_document_digest: finalRevisionDigest,
      visible_document_digest: finalVisibleDigest,
      manifest_schema_version: 2,
    });
    const taskRow = database.prepare(`
      SELECT input_schema_version, source_digest, source_set_sealed_at
      FROM generation_tasks
      WHERE id = ?
    `).get(publication.taskId) as {
      input_schema_version: number;
      source_digest: string;
      source_set_sealed_at: string | number | null;
    };
    expect(taskRow).toMatchObject({
      input_schema_version: 2,
      source_digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
    });
    expect(taskRow.source_set_sealed_at).not.toBeNull();
    expect(["string", "number"]).toContain(typeof taskRow.source_set_sealed_at);
    const taskSources = database.prepare(`
      SELECT role, "order", source_type, source_id, source_digest
      FROM generation_task_sources
      WHERE task_id = ?
      ORDER BY role, "order"
    `).all(publication.taskId) as Array<{
      role: string;
      order: number;
      source_type: string;
      source_id: string;
      source_digest: `sha256:${string}`;
    }>;
    expect([...new Set(taskSources.map((source) => source.role))]).toEqual(expect.arrayContaining([
      "layout_revision",
      "lock_set",
      "candidate_lock",
      "image_asset",
    ]));
    expect(taskSources.every((source) => /^sha256:[0-9a-f]{64}$/.test(source.source_digest))).toBe(true);
    const rebuiltTaskProjection = buildTaskSourceProjection({
      policyVersion: LAYOUT_PUBLICATION_SOURCE_POLICY_V2,
      projectId: fixture.projectId,
      chapterId: fixture.chapterId,
      consumerType: "layout_export",
      sources: taskSources.map((source) => ({
        role: source.role,
        sourceType: source.source_type,
        sourceId: source.source_id,
        sourceDigest: source.source_digest,
      })),
    });
    expect(taskSourceProjectionDigest(rebuiltTaskProjection)).toBe(taskRow.source_digest);
  } finally {
    database.close();
  }

  expect(pageErrors).toEqual([]);
  await mkdir(evidenceRoot, { recursive: true });
  await page.screenshot({
    path: path.join(evidenceRoot, "v2来源同步与正式导出.png"),
    fullPage: true,
  });

  // V2 历史恢复必须走真实服务事务：先保存一份不同草稿，再经 API 恢复
  // 当前不可变版本；相同旧期望重试应精确 replay，且不移动正式版本指针。
  const beforeRestore = (await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl)).data;
  const changedBeforeRestore = structuredClone(beforeRestore.document as LayoutDocumentV2);
  changedBeforeRestore.canvases[0]!.name = "V2 历史恢复事务验证";
  const changedBeforeRestoreEncoded = LayoutDocumentCodecV2.encode(changedBeforeRestore);
  const changedBeforeRestoreVisibleDigest = LayoutDocumentCodecV1.encode(
    projectLayoutDocumentV2ToV1(changedBeforeRestoreEncoded.value),
  ).digest;
  const changedWorkingCopy = (await api.put<SaveLayoutWorkingCopyResponseV1>(workingCopyUrl, {
    schemaVersion: 1,
    expectedRowVersion: beforeRestore.rowVersion,
    baseDocumentDigest: beforeRestore.documentDigest,
    documentDigest: changedBeforeRestoreEncoded.digest,
    document: changedBeforeRestoreEncoded.value,
  })).data.value;
  expect(changedWorkingCopy.documentDigest).not.toBe(finalRevisionDigest);

  const restoreBody = {
    schemaVersion: 2 as const,
    expectedWorkingCopyRowVersion: changedWorkingCopy.rowVersion,
    expectedWorkingCopyRevisionDocumentDigest: changedBeforeRestoreEncoded.digest,
    expectedWorkingCopyVisibleDocumentDigest: changedBeforeRestoreVisibleDigest,
  };
  const restored = (await api.post<RestoreLayoutRevisionResponseV2>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/revisions/${currentRevision.id}/restore-to-working-copy`,
    restoreBody,
  )).data;
  expect(restored).toMatchObject({
    schemaVersion: 2,
    result: "restored",
    restoredFromRevisionId: currentRevision.id,
    workingCopy: {
      basedOnRevisionId: currentRevision.id,
      documentDigest: finalRevisionDigest,
      document: { schemaVersion: 2 },
    },
  });
  const replayedRestore = (await api.post<RestoreLayoutRevisionResponseV2>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/revisions/${currentRevision.id}/restore-to-working-copy`,
    restoreBody,
  )).data;
  expect(replayedRestore).toMatchObject({
    schemaVersion: 2,
    result: "replayed",
    restoredFromRevisionId: currentRevision.id,
    workingCopy: {
      basedOnRevisionId: currentRevision.id,
      documentDigest: finalRevisionDigest,
      document: { schemaVersion: 2 },
    },
  });
  expect((await api.get<LayoutRevisionHistoryResponseV2>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/revisions`,
  )).data.currentLayoutRevisionId).toBe(currentRevision.id);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `/projects/${fixture.projectId}/layout/preview`
      + `?chapterId=${fixture.chapterId}&source=publication&id=${publication.id}`,
  );
  const mobilePreview = page.getByTestId("layout-mobile-preview");
  await expect(mobilePreview).toBeVisible();
  await expect(mobilePreview).toContainText("出版 1 · 已完成 · 当前");
  await expect(mobilePreview.locator(".layout-visual-canvas")).toHaveCount(
    finalDocument.canvases.length,
  );
  await expect(mobilePreview.locator(".layout-visual-canvas img").first()).toBeVisible();
  await expect(mobilePreview.getByRole("button")).toHaveCount(0);
  await page.screenshot({
    path: path.join(evidenceRoot, "v2手机出版预览.png"),
    fullPage: true,
  });
});
