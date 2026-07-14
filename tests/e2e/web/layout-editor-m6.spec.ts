import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import type {
  LayoutRevisionHistoryResponseV1,
  LayoutWorkingCopyResponseV1,
} from "@airoaming/shared";

import { expect, test } from "../support/e2e-fixture.ts";
import {
  lockCandidate,
  prepareG4CandidateFixture,
  replaceCandidate,
} from "../support/g4-candidate-fixture.ts";

const { DatabaseSync } = createRequire(path.join(process.cwd(), "package.json"))("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

test("G5-M6：来源返修、不可变版本、预检确认与历史恢复形成 DB-only 闭环", async ({
  api,
  page,
  rainSmokeProject,
  runtime,
}) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const evidenceRoot = path.resolve("文档/05_执行与记录/任务记录/2026-07-14_G0至G5剩余连续施工/evidence");
  await mkdir(evidenceRoot, { recursive: true });

  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject);
  const firstLock = await lockCandidate(api, fixture, fixture.candidateIds[0]!);
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);

  await page.goto(`/projects/${fixture.projectId}/layout`);
  await page.getByRole("button", { name: "创建数据库草稿" }).click();
  await expect(page.getByTestId("layout-m6-control-center")).toBeVisible();
  const initialWorkingCopy = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  const initialSource = initialWorkingCopy.data.document.canvases[0]!.elements[0];
  if (initialSource?.type !== "panel_frame" || !initialSource.contentImage) throw new Error("G5_M6_INITIAL_SOURCE_MISSING");

  const replacement = await replaceCandidate(api, fixture, fixture.candidateIds[1]!);
  expect(replacement.revision.previousRevisionId).toBe(firstLock.revision.id);
  await page.reload();
  await expect(page.getByTestId("candidate-source-status")).toContainText("候选定稿已变化");
  const controls = page.getByTestId("layout-m6-control-center");
  await controls.getByLabel("裁切处理").selectOption("preserve_normalized_crop");
  await controls.getByRole("button", { name: "预览全部", exact: true }).click();
  const preview = page.getByTestId("source-replacement-preview");
  await expect(preview).toContainText("不会改写旧版本");
  await expect(preview).toContainText(initialSource.contentImage.id);
  await page.screenshot({ path: path.join(evidenceRoot, "g5_m6_source_replacement_preview.png"), fullPage: true });
  await preview.getByRole("button", { name: "确认提交替换" }).click();
  await expect(controls).toContainText("当前定稿");

  await expect(page.getByTitle("撤销")).toBeEnabled();
  await page.getByTitle("撤销").click();
  const saveNow = page.getByRole("button", { name: "立即保存" });
  await expect(saveNow).toBeEnabled();
  await saveNow.click();
  await expect(page.locator(".editor-status")).toContainText("已保存到数据库", { timeout: 8_000 });
  await expect(page.getByTestId("candidate-source-status")).toContainText("候选定稿已变化");
  await expect(page.getByTitle("重做")).toBeEnabled();
  await page.getByTitle("重做").click();
  await expect(saveNow).toBeEnabled();
  await saveNow.click();
  await expect(page.locator(".editor-status")).toContainText("已保存到数据库", { timeout: 8_000 });
  await expect(controls).toContainText("当前定稿");

  await controls.getByRole("button", { name: "重新预检" }).click();
  const preflight = page.getByTestId("layout-preflight-result");
  await expect(preflight).toBeVisible();
  const acknowledgementBoxes = preflight.locator('input[type="checkbox"]');
  for (let index = 0; index < await acknowledgementBoxes.count(); index += 1) {
    await acknowledgementBoxes.nth(index).check();
  }
  const saveRevision = preflight.getByRole("button", { name: "保存不可变版本" });
  await expect(saveRevision).toBeEnabled();
  await saveRevision.click();
  const history = page.getByTestId("layout-revision-history");
  await expect(history).toContainText("版本 1");
  await expect(history).toContainText("当前正式");

  const createdHistory = await api.get<LayoutRevisionHistoryResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/revisions`,
  );
  expect(createdHistory.data.items).toHaveLength(1);
  expect(createdHistory.data.items[0]).toMatchObject({ revision: 1, sourceResolution: "current" });

  await page.getByRole("button", { name: "新增段落", exact: true }).click();
  if (await saveNow.isEnabled()) await saveNow.click();
  await expect(page.locator(".editor-status")).toContainText("已保存到数据库", { timeout: 8_000 });
  let changed = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  expect(changed.data.document.canvases).toHaveLength(2);

  page.once("dialog", (dialog) => dialog.accept());
  await history.getByRole("button", { name: "恢复到草稿" }).click();
  await expect(page.locator(".editor-status")).toContainText("已保存到数据库", { timeout: 8_000 });
  changed = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  expect(changed.data.document.canvases).toHaveLength(1);

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
