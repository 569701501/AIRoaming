import type { SendDialogueMessageResponse, WorkbenchSnapshot } from "@airoaming/shared";
import { expect, test } from "../support/e2e-fixture.ts";

const MODEL = { providerId: "e2e", modelId: "deterministic" } as const;

test("A3-A5：大纲确认不偷跑，显式生成后完整查看、采用并完成当前章", async ({
  api,
  page,
  provider,
  rainSmokeProject,
}) => {
  test.setTimeout(60_000);
  const projectId = rainSmokeProject.id;
  const chapterId = rainSmokeProject.currentChapterId;
  if (!chapterId) throw new Error("A3_A5_CURRENT_CHAPTER_MISSING");

  const outlineTurn = await api.post<SendDialogueMessageResponse>(
    `/projects/${projectId}/dialogue/threads/project_story/messages`,
    {
      content: "写一个 2 章都市悬疑故事：女记者在雨夜末班车上寻找失踪姐姐",
      chapterId,
      model: MODEL,
    },
  );
  expect(outlineTurn.data.toolResults?.[0]).toMatchObject({
    tool: "generate_script_outline_from_topic",
    status: "needs_user_confirmation",
    scriptOutline: { title: "雨夜末班车", status: "draft" },
  });
  expect(modelMessageCount(await provider.listRequests())).toBe(1);

  const confirmationOnly = await api.post<SendDialogueMessageResponse>(
    `/projects/${projectId}/dialogue/threads/project_story/messages`,
    { content: "继续", chapterId, model: MODEL },
  );
  expect(confirmationOnly.data.toolResults?.[0]).toMatchObject({
    status: "succeeded",
    scriptOutline: { title: "雨夜末班车", status: "confirmed" },
  });
  expect(confirmationOnly.data.toolResults?.[0]?.summary).toContain("本次没有生成章节");
  expect(modelMessageCount(await provider.listRequests())).toBe(1);

  const beforeGeneration = await api.get<{ snapshot: WorkbenchSnapshot }>(
    `/projects/${projectId}/workbench?chapterId=${chapterId}`,
  );
  expect(beforeGeneration.data.snapshot.currentChapter?.pendingSourceText).toBeNull();

  const generated = await api.post<SendDialogueMessageResponse>(
    `/projects/${projectId}/dialogue/threads/project_story/messages`,
    {
      content: "生成当前章节",
      intent: "generate_script_from_outline",
      chapterId,
      model: MODEL,
    },
  );
  expect(generated.data.toolResults?.[0]).toMatchObject({
    tool: "generate_script_from_outline",
    status: "succeeded",
    currentChapterId: chapterId,
  });
  expect(modelMessageCount(await provider.listRequests())).toBe(2);

  await page.goto(`/projects/${projectId}/script/${chapterId}`);
  const pendingDocument = page.getByLabel("待确认章节草稿全文");
  await expect(pendingDocument).toBeVisible();
  await expect(pendingDocument).toContainText("#### 场景 1：空站台");
  await expect(pendingDocument).toContainText("控制面板需要姐姐的钥匙扣才能解锁");
  await expect(page.getByRole("button", { name: "采用草稿" })).toBeVisible();
  await expect(page.getByRole("button", { name: "丢弃" })).toBeVisible();
  await expect(page.getByRole("button", { name: "完成本章" })).toBeDisabled();

  await page.getByRole("button", { name: "采用草稿" }).click();
  await expect(pendingDocument).not.toBeVisible();
  await expect(page.getByRole("button", { name: "完成本章" })).toBeEnabled();

  await page.getByRole("button", { name: "完成本章" }).click();
  await expect(page.getByText("本章剧本已完成", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "进入本章剧情结构" })).toBeVisible();
  await expect(page.getByRole("button", { name: /继续下一章/ })).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/script/${chapterId}$`));

  await page.locator(".chapter-dropdown-btn").click();
  await expect(page.getByText("共 2 个章节", { exact: true })).toBeVisible();
  await expect(page.getByText("封闭总站", { exact: true })).toBeVisible();
  const completedSnapshot = await api.get<{ snapshot: WorkbenchSnapshot }>(
    `/projects/${projectId}/workbench?chapterId=${chapterId}`,
  );
  const secondChapter = completedSnapshot.data.snapshot.chapters.find((chapter) => chapter.order === 2);
  if (!secondChapter) throw new Error("A3_A5_SECOND_CHAPTER_MISSING");
  await page.locator(".dropdown-item").filter({ hasText: "封闭总站" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/script/${secondChapter.id}$`));
  await expect(page.getByLabel("待确认章节草稿全文")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "完成本章" })).toBeDisabled();
  expect(modelMessageCount(await provider.listRequests())).toBe(2);
});

function modelMessageCount(requests: readonly { path: string; method: string }[]): number {
  return requests.filter((request) => request.method === "POST" && /^\/opencode\/session\/[^/]+\/message$/.test(request.path)).length;
}
