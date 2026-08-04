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

test("智能成稿基础版：自动生成与直接编辑形成同一条路径", async ({
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
    "文档/05_执行与记录/任务记录/2026-07-26_漫画成稿体验评估与P0修复/evidence",
  );
  await mkdir(evidenceRoot, { recursive: true });

  await page.goto(`/projects/${fixture.projectId}/layout`);
  await expect(page.locator(".document-canvas")).toBeVisible({ timeout: 45_000 });
  await page.getByLabel("展开页面与素材栏").click();
  await expect(page.getByTestId("shot-tray")).toBeVisible();

  const initial = (await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  )).data;
  expect(initial.document.schemaVersion).toBe(2);
  const initialDocument = initial.document as LayoutDocumentV2;
  expect(initialDocument.canvases).toHaveLength(1);
  expect(initialDocument.canvases[0]!.elements.some((element) => element.type === "panel_frame")).toBe(true);
  expect(initialDocument.automation.composition?.mode).toBe("rule_fallback");

  await page.getByTitle("添加气泡").click();
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
  await page.screenshot({
    path: path.join(evidenceRoot, "自动成稿直接编辑.png"),
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test("智能成稿基础版：页漫零设置生成后再次进入不会重复生成", async ({
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
    await expect(page.locator(".document-canvas")).toBeVisible({ timeout: 45_000 });
    await page.getByLabel("展开页面与素材栏").click();
    await expect(page.getByTestId("shot-tray")).toBeVisible();

    const initial = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    expect(initial.document.schemaVersion).toBe(2);
    const initialDocument = initial.document as LayoutDocumentV2;
    expect(initialDocument.canvases).toHaveLength(1);
    expect(initialDocument.canvases[0]!.kind).toBe("page");
    expect(initialDocument.canvases[0]!.elements.some((element) => element.type === "panel_frame")).toBe(true);

    await page.reload();
    await expect(page.locator(".document-canvas")).toBeVisible({ timeout: 45_000 });
    await page.getByLabel("展开页面与素材栏").click();
    await expect(page.getByTestId("shot-tray")).toBeVisible({ timeout: 15_000 });
    const restored = (await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    )).data;
    expect(restored.documentDigest).toBe(initial.documentDigest);
    expect(restored.rowVersion).toBe(initial.rowVersion);

    const evidenceRoot = path.resolve(
      "文档/05_执行与记录/任务记录/2026-07-26_漫画成稿体验评估与P0修复/evidence",
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
