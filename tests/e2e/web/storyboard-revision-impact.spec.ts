import type { StoryboardWorkingCopyDto, WorkbenchSnapshot } from "@airoaming/shared";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "../support/e2e-fixture.ts";
import { lockCandidate, prepareG4CandidateFixture } from "../support/g4-candidate-fixture.ts";

test("分镜返修：确认前说明下游影响，确认后保留旧图且不倒退制作进度", async ({
  api,
  page,
  rainSmokeProject,
}) => {
  test.setTimeout(90_000);
  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject);
  await lockCandidate(api, fixture, fixture.candidateIds[0]!);
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);

  const before = await api.get<{ snapshot: WorkbenchSnapshot }>(
    `/projects/${fixture.projectId}/workbench?chapterId=${fixture.chapterId}`,
  );
  expect(before.data.snapshot.currentChapter?.status).toBe("images_done");
  expect(before.data.snapshot.candidates).toHaveLength(3);
  const currentStoryboardId = before.data.snapshot.storyboard?.id;
  expect(currentStoryboardId).toBeTruthy();

  const working = await api.get<StoryboardWorkingCopyDto>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/storyboard/working-copy`,
  );
  expect(working.data.pending).toBeNull();
  expect(working.data.current?.sourceId).toBeTruthy();
  await api.post(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/storyboard/working-copy`,
    {
      mode: "clone_current",
      expectedCurrentVersionId: working.data.current!.id,
      expectedSourceStoryVersionId: working.data.current!.sourceId,
      expectedChapterRowVersion: working.data.productionState.chapterRowVersion,
    },
  );

  await page.goto(`/projects/${fixture.projectId}/storyboard`);
  await expect(page.getByText("待确认预览", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "确认分镜", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "确认新分镜影响" });
  await expect(dialog).toContainText("已有候选图");
  await expect(dialog).toContainText("3 张");
  await expect(dialog).toContainText("当前定稿图");
  await expect(dialog).toContainText("1 张");
  await expect(dialog).toContainText("旧候选图、排版和导出会保留为历史");
  const evidenceRoot = path.resolve(
    "文档/05_执行与记录/任务记录/2026-07-19_分镜返修版本冲突/evidence",
  );
  await mkdir(evidenceRoot, { recursive: true });
  await dialog.screenshot({ path: path.join(evidenceRoot, "storyboard_revision_impact.png") });

  await dialog.getByRole("button", { name: "继续使用旧分镜" }).click();
  await expect(dialog).not.toBeVisible();
  expect((await api.get<StoryboardWorkingCopyDto>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/storyboard/working-copy`,
  )).data.pending).not.toBeNull();

  await page.getByRole("button", { name: "确认分镜", exact: true }).click();
  await dialog.getByRole("button", { name: "确认切换到新分镜" }).click();
  await expect(dialog).not.toBeVisible();

  await expect.poll(async () => {
    const response = await api.get<{ snapshot: WorkbenchSnapshot }>(
      `/projects/${fixture.projectId}/workbench?chapterId=${fixture.chapterId}`,
    );
    return {
      milestone: response.data.snapshot.currentChapter?.status,
      pending: response.data.snapshot.pendingStoryboard?.id ?? null,
      storyboardChanged: response.data.snapshot.storyboard?.id !== currentStoryboardId,
      candidateCount: response.data.snapshot.candidates.length,
      preflightStatus: response.data.snapshot.workflow.steps.find((step) => step.key === "image_preflight")?.status,
    };
  }).toEqual({
    milestone: "images_done",
    pending: null,
    storyboardChanged: true,
    candidateCount: 3,
    preflightStatus: "needs_update",
  });
});
