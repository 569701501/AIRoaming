import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import {
  LayoutDocumentCodecV1,
  LayoutDocumentCodecV2,
  projectLayoutDocumentV2ToV1,
  type LayoutDocumentV2,
  type LayoutRevisionHistoryResponseV2,
  type LayoutWorkingCopyResponseV1,
  type RestoreLayoutRevisionResponseV2,
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

test("G5-M6 基础版：来源同步、正式版本与 API 历史恢复形成 DB-only 闭环", async ({
  api,
  page,
  rainSmokeProject,
  runtime,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const evidenceRoot = path.resolve("文档/05_执行与记录/任务记录/2026-07-26_漫画成稿体验评估与P0修复/evidence");
  await mkdir(evidenceRoot, { recursive: true });

  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject);
  const firstLock = await lockCandidate(api, fixture, fixture.candidateIds[0]!);
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);

  const workingCopyUrl = `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`;
  await page.goto(`/projects/${fixture.projectId}/layout`);
  await expect(page.getByTestId("shot-tray")).toBeVisible({ timeout: 45_000 });
  const initialWorkingCopy = await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl);
  const initialSource = initialWorkingCopy.data.document.canvases[0]!.elements[0];
  if (initialSource?.type !== "panel_frame" || !initialSource.contentImage) throw new Error("G5_M6_INITIAL_SOURCE_MISSING");

  const replacement = await replaceCandidate(api, fixture, fixture.candidateIds[1]!);
  expect(replacement.revision.previousRevisionId).toBe(firstLock.revision.id);
  await page.reload();
  const sourceBanner = page.getByTestId("candidate-source-status");
  await expect(sourceBanner).toContainText("候选定稿已变化");
  await page.screenshot({ path: path.join(evidenceRoot, "g5_m6_source_attention.png"), fullPage: true });
  await sourceBanner.getByRole("button", { name: "同步最新镜头" }).click();
  await expect(page.getByTestId("candidate-source-status")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });

  // E2E 图片服务返回真实 1×1 PNG；导出前把画格校准为 1×1，避免有效分辨率阻断。
  const synced = (await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl)).data;
  const syncedDocument = structuredClone(synced.document) as LayoutDocumentV2;
  const syncedPanel = syncedDocument.canvases[0]?.elements.find((element) => element.type === "panel_frame");
  if (syncedPanel?.type !== "panel_frame" || !syncedPanel.contentImage) throw new Error("G5_M6_SYNCED_PANEL_MISSING");
  syncedPanel.transform = { ...syncedPanel.transform, x: 64, y: 64, width: 1, height: 1 };
  syncedPanel.shape.cornerRadius = 0;
  syncedPanel.contentImage.crop = { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false };
  const syncedEncoded = LayoutDocumentCodecV2.encode(syncedDocument);
  await api.put(workingCopyUrl, {
    schemaVersion: 1,
    expectedRowVersion: synced.rowVersion,
    baseDocumentDigest: synced.documentDigest,
    documentDigest: syncedEncoded.digest,
    document: syncedEncoded.value,
  });
  await page.reload();
  await expect(page.getByTestId("shot-tray")).toBeVisible();

  await page.getByTestId("layout-simple-export").click();
  const exportDialog = page.getByTestId("layout-export-dialog");
  await expect(exportDialog).toBeVisible();
  await completeSimpleExportFlow(exportDialog, async () => {
    await expect(exportDialog).toContainText("首次排版沿用了人工确认的镜头更换");
  });
  await exportDialog.getByRole("button", { name: "完成" }).click();
  await expect(exportDialog).toBeHidden();

  const createdHistory = await api.get<LayoutRevisionHistoryResponseV2>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/revisions`,
  );
  expect(createdHistory.data.items).toHaveLength(1);
  expect(createdHistory.data.items[0]).toMatchObject({ revision: 1, sourceResolution: "current" });
  const currentRevisionId = createdHistory.data.currentLayoutRevisionId;
  if (!currentRevisionId) throw new Error("G5_M6_CURRENT_REVISION_MISSING");

  await page.getByRole("button", { name: "新增段落", exact: true }).click();
  await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });
  const changed = (await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl)).data;
  expect(changed.document.canvases).toHaveLength(2);

  const changedRevisionDigest = LayoutDocumentCodecV2.encode(changed.document as LayoutDocumentV2).digest;
  const changedVisibleDigest = LayoutDocumentCodecV1.encode(
    projectLayoutDocumentV2ToV1(changed.document as LayoutDocumentV2),
  ).digest;
  const restored = (await api.post<RestoreLayoutRevisionResponseV2>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/revisions/${currentRevisionId}/restore-to-working-copy`,
    {
      schemaVersion: 2,
      expectedWorkingCopyRowVersion: changed.rowVersion,
      expectedWorkingCopyRevisionDocumentDigest: changedRevisionDigest,
      expectedWorkingCopyVisibleDocumentDigest: changedVisibleDigest,
    },
  )).data;
  expect(restored).toMatchObject({
    result: "restored",
    restoredFromRevisionId: currentRevisionId,
  });
  const afterRestore = (await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl)).data;
  expect(afterRestore.document.canvases).toHaveLength(1);
  expect(afterRestore.basedOnRevisionId).toBe(currentRevisionId);
  expect((await api.get<LayoutRevisionHistoryResponseV2>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/revisions`,
  )).data.currentLayoutRevisionId).toBe(currentRevisionId);

  const database = new DatabaseSync(runtime.databasePath);
  try {
    const chapter = database.prepare("SELECT current_layout_revision_id AS id FROM chapters WHERE id = ?").get(fixture.chapterId) as { id: string };
    expect(chapter.id).toBe(createdHistory.data.currentLayoutRevisionId);
    const revisions = database.prepare("SELECT id, previous_revision_id, binding_set_sealed_at FROM layout_revisions WHERE chapter_id = ? ORDER BY revision").all(fixture.chapterId) as Array<{ id: string; previous_revision_id: string | null; binding_set_sealed_at: string | null }>;
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ previous_revision_id: null });
    expect(revisions[0]!.binding_set_sealed_at).not.toBeNull();
    const binding = database.prepare("SELECT source_digest, asset_id FROM layout_source_bindings WHERE layout_revision_id = ?").get(revisions[0]!.id) as { source_digest: string; asset_id: string };
    const asset = database.prepare("SELECT sha256 FROM assets WHERE id = ?").get(binding.asset_id) as { sha256: string };
    expect(binding.source_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(binding.source_digest).not.toBe(asset.sha256);
  } finally {
    database.close();
  }

  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: path.join(evidenceRoot, "g5_m6_repair_revision_history.png"), fullPage: true });
});
