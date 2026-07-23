import { mkdir } from "node:fs/promises";
import path from "node:path";
import type {
  LayoutDocumentV2,
  LayoutWorkingCopyResponseV1,
  ProjectListItem,
} from "@airoaming/shared";

import {
  cleanupE2EProject,
  expect,
  test,
} from "../support/e2e-fixture.ts";
import { lockCandidate, prepareG4CandidateFixture } from "../support/g4-candidate-fixture.ts";

test("智能成稿：自动生成、直接编辑与整章新排法预览形成同一条路径", async ({
  api,
  page,
  rainSmokeProject,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject);
  await lockCandidate(api, fixture, fixture.candidateIds[0]!);
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);
  const evidenceRoot = path.resolve(
    "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m5-workspace",
  );
  await mkdir(evidenceRoot, { recursive: true });

  await page.goto(`/projects/${fixture.projectId}/layout`);
  await expect(page.getByTestId("layout-smart-compose-state")).toBeVisible();
  await expect(page.getByTestId("shot-tray")).toBeVisible({ timeout: 35_000 });
  await expect(page.getByRole("button", { name: "创建数据库草稿" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "重新排一版" })).toBeEnabled();

  const initial = (await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  )).data;
  expect(initial.document.schemaVersion).toBe(2);
  const initialDocument = initial.document as LayoutDocumentV2;
  expect(initialDocument.canvases).toHaveLength(1);
  expect(initialDocument.canvases[0]!.elements.some((element) => element.type === "panel_frame")).toBe(true);
  expect(initialDocument.automation.composition?.mode).toBe("rule_fallback");

  await page.getByRole("button", { name: "重新排一版" }).click();
  const drawer = page.getByTestId("layout-ai-drawer");
  await expect(drawer).toBeVisible();
  const comparison = page.getByTestId("layout-ai-command-preview");
  await expect(comparison).toBeVisible({ timeout: 35_000 });
  await expect(comparison).toContainText("当前排法");
  await expect(comparison).toContainText("新排法");
  await page.screenshot({
    path: path.join(evidenceRoot, "整章新排法对比.png"),
    fullPage: true,
  });

  await comparison.getByRole("button", { name: "使用这版新排法" }).click();
  await expect(drawer).not.toBeVisible();

  const undo = page.getByTitle("撤销");
  await expect(undo).toBeEnabled();
  await undo.click();
  const save = page.getByRole("button", { name: "立即保存" });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });
  const reverted = (await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  )).data;
  expect(reverted.documentDigest).toBe(initial.documentDigest);

  const scopedEvidenceRoot = path.resolve(
    "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m6-workspace",
  );
  await mkdir(scopedEvidenceRoot, { recursive: true });
  await page.locator(".canvas-element.type-panel_frame").first().click();
  await page.getByRole("button", { name: "智能调整" }).click();
  await expect(drawer).toContainText("选中内容智能调整");
  await drawer.getByRole("button", { name: "更舒展" }).click();
  await drawer.getByRole("button", { name: "生成调整预览" }).click();
  await expect(comparison).toBeVisible({ timeout: 35_000 });
  await expect(comparison).toContainText("选中范围");
  const scopedPreviewBase = (await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  )).data;
  expect(scopedPreviewBase.documentDigest).toBe(initial.documentDigest);
  await page.screenshot({
    path: path.join(scopedEvidenceRoot, "条漫选中画格智能调整预览.png"),
    fullPage: true,
  });
  await comparison.getByRole("button", { name: "使用这版新排法" }).click();
  const scopedApplied = (await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  )).data;
  expect(scopedApplied.documentDigest).not.toBe(initial.documentDigest);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });
  const scopedReverted = (await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  )).data;
  expect(scopedReverted.documentDigest).toBe(initial.documentDigest);

  await page.getByTitle("添加气泡").click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });

  const edited = (await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  )).data;
  expect(edited.document.schemaVersion).toBe(2);
  const editedDocument = edited.document as LayoutDocumentV2;
  const addedBalloon = editedDocument.canvases
    .flatMap((canvas) => canvas.elements)
    .find((element) => element.type === "balloon" && element.sourceShotId === null);
  expect(addedBalloon).toBeTruthy();
  expect(editedDocument.automation.protections.some((entry) => (
    entry.targetKind === "element"
    && entry.targetId === addedBalloon!.id
    && entry.reason === "user_edit"
  ))).toBe(true);
  await expect(page.getByTestId("allow-smart-adjustment")).toBeVisible();
  await page.getByTestId("allow-smart-adjustment").click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });
  const released = (await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  )).data;
  expect(released.document.schemaVersion).toBe(2);
  expect((released.document as LayoutDocumentV2).automation.protections.some((entry) => (
    entry.targetId === addedBalloon!.id
  ))).toBe(false);
  await page.screenshot({
    path: path.join(evidenceRoot, "自动成稿直接编辑.png"),
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("智能成稿：页漫零设置生成后再次进入不会重复生成", async ({
  api,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const created = await api.post<{ project: ProjectListItem }>("/projects", {
    name: `页漫智能成稿 · ${api.runtime.runId}`,
    type: "comic",
    comicFormat: "paged_comic",
    storyTitle: "雨夜末班车",
    description: "页漫零设置成稿验证。",
  });
  const project = created.data.project;
  let primaryTestFailed = false;

  try {
    const fixture = await prepareG4CandidateFixture(api, project);
    await lockCandidate(api, fixture, fixture.candidateIds[0]!);
    await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);

    await page.goto(`/projects/${fixture.projectId}/layout`);
    await expect(page.getByTestId("shot-tray")).toBeVisible({ timeout: 35_000 });

    const initial = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    expect(initial.document.schemaVersion).toBe(2);
    const initialDocument = initial.document as LayoutDocumentV2;
    expect(initialDocument.canvases).toHaveLength(1);
    expect(initialDocument.canvases[0]!.kind).toBe("page");
    expect(initialDocument.canvases[0]!.elements.some((element) => element.type === "panel_frame")).toBe(true);

    await page.reload();
    await expect(page.getByTestId("shot-tray")).toBeVisible({ timeout: 15_000 });
    const restored = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    expect(restored.documentDigest).toBe(initial.documentDigest);
    expect(restored.rowVersion).toBe(initial.rowVersion);

    await page.getByRole("button", { name: "智能调整" }).click();
    const scopedDrawer = page.getByTestId("layout-ai-drawer");
    await expect(scopedDrawer).toContainText("当前页智能调整");
    await scopedDrawer.getByRole("button", { name: "更舒展" }).click();
    await scopedDrawer.getByRole("button", { name: "生成调整预览" }).click();
    const scopedComparison = page.getByTestId("layout-ai-command-preview");
    await expect(scopedComparison).toBeVisible({ timeout: 35_000 });
    await scopedComparison.getByRole("button", { name: "保留当前排法" }).click();
    const afterScopedDiscard = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    expect(afterScopedDiscard.documentDigest).toBe(initial.documentDigest);
    expect(afterScopedDiscard.rowVersion).toBe(initial.rowVersion);

    await page.getByRole("button", { name: "重新排一版" }).click();
    const comparison = page.getByTestId("layout-ai-command-preview");
    await expect(comparison).toBeVisible({ timeout: 35_000 });
    await comparison.getByRole("button", { name: "保留当前排法" }).click();
    await expect(page.getByTestId("layout-ai-drawer")).not.toBeVisible();
    const afterDiscard = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    expect(afterDiscard.documentDigest).toBe(initial.documentDigest);
    expect(afterDiscard.rowVersion).toBe(initial.rowVersion);

    const evidenceRoot = path.resolve(
      "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m5-workspace",
    );
    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({
      path: path.join(evidenceRoot, "页漫自动成稿.png"),
      fullPage: true,
    });
  } catch (error) {
    primaryTestFailed = true;
    throw error;
  } finally {
    await cleanupE2EProject(api, project.id, testInfo, { primaryTestFailed });
  }
});
