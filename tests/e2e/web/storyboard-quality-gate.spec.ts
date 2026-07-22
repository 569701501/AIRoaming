import type { SendDialogueMessageResponse, WorkbenchSnapshot } from "@airoaming/shared";
import { expect, test } from "../support/e2e-fixture.ts";

const MODEL = { providerId: "e2e", modelId: "deterministic" } as const;

test("S2：新项目分镜首次未过固定质量门时只修复一次，并只形成待确认分镜", async ({
  api,
  page,
  provider,
  rainSmokeProject,
}) => {
  test.setTimeout(90_000);
  const projectId = rainSmokeProject.id;
  const chapterId = rainSmokeProject.currentChapterId;
  if (!chapterId) throw new Error("S2_CURRENT_CHAPTER_MISSING");

  await api.post<SendDialogueMessageResponse>(
    `/projects/${projectId}/dialogue/threads/project_story/messages`,
    {
      content: "写一个 2 章都市悬疑故事：女记者在雨夜末班车上寻找失踪姐姐",
      chapterId,
      model: MODEL,
    },
  );
  await api.post<SendDialogueMessageResponse>(
    `/projects/${projectId}/dialogue/threads/project_story/messages`,
    { content: "继续", chapterId, model: MODEL },
  );
  const chapterTurn = await api.post<SendDialogueMessageResponse>(
    `/projects/${projectId}/dialogue/threads/project_story/messages`,
    {
      content: "生成当前章节",
      intent: "generate_script_from_outline",
      chapterId,
      model: MODEL,
    },
  );
  expect(chapterTurn.data.toolResults?.[0]).toMatchObject({
    tool: "generate_script_from_outline",
    status: "succeeded",
  });

  await page.goto(`/projects/${projectId}/script/${chapterId}`);
  await expect(page.getByLabel("待确认章节草稿全文")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "采用草稿" }).click();
  await page.getByRole("button", { name: "完成本章" }).click();
  await expect(page.getByText("本章剧本已完成", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "进入本章剧情结构" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/structure$`));

  await page.locator(".structure-workspace").getByRole("button", { name: "生成剧情结构" }).click();
  await expect(page.getByRole("button", { name: "确认结构" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "确认结构" }).click();
  await expect.poll(async () => {
    const current = await api.get<{ snapshot: WorkbenchSnapshot }>(
      `/projects/${projectId}/workbench?chapterId=${chapterId}`,
    );
    return current.data.snapshot.currentChapter?.status;
  }).toBe("structured");

  await page.goto(`/projects/${projectId}/storyboard`);
  await expect(page.getByRole("region", { name: "分镜工作台", exact: true })).toBeVisible();
  await provider.setFailureMode("storyboard_quality_once");
  const beforeStoryboard = modelMessageCount(await provider.listRequests());
  await page.getByLabel("输入对话内容").fill("生成分镜");
  await page.getByTitle("发送").click();

  await expect(page.getByText("待确认预览", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/· 3 镜$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "确认分镜" })).toBeVisible();
  expect(modelMessageCount(await provider.listRequests())).toBe(beforeStoryboard + 3);

  const pending = await api.get<{ snapshot: WorkbenchSnapshot }>(
    `/projects/${projectId}/workbench?chapterId=${chapterId}`,
  );
  expect(pending.data.snapshot.pendingStoryboard).toMatchObject({
    status: "pending_confirmation",
    storyboardJson: {
      shots: [
        { order: 1, comic: { panelDescription: expect.stringContaining("决定性瞬间") } },
        { order: 2, comic: { panelDescription: expect.stringContaining("决定性瞬间") } },
        { order: 3, comic: { panelDescription: expect.stringContaining("决定性瞬间") } },
      ],
    },
  });
  expect(pending.data.snapshot.storyboard).toBeNull();
  expect(pending.data.snapshot.currentChapter?.status).toBe("structured");
});

function modelMessageCount(requests: readonly { path: string; method: string }[]): number {
  return requests.filter((request) => request.method === "POST" && /^\/opencode\/session\/[^/]+\/message$/.test(request.path)).length;
}
