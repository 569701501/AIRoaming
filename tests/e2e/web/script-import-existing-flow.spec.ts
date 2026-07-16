import type { WorkbenchSnapshot } from "@airoaming/shared";
import { expect, test } from "../support/e2e-fixture.ts";

const SOURCE = `第一章 雨夜站台
林夏在雨夜站台等车。关闭的广播叫出她的名字，一辆没有司机的末班车进站。她在车内发现姐姐的红色钥匙扣和一段录音：不要让车辆进入隧道。林夏握住钥匙扣冲向控制面板。

第二章 封闭总站
林夏用钥匙扣解锁控制面板，在封闭总站找到被困的姐姐。运营方试图销毁事故证据，姐妹二人把负责人承认掩盖事故的监控画面直播出去，最终获救。`;

test("B1-B5：整体确认拆章后生成全部只读待确认稿，并逐章直接形成正式版本", async ({
  api,
  page,
  rainSmokeProject,
}) => {
  test.setTimeout(90_000);
  const projectId = rainSmokeProject.id;
  const initialChapterId = rainSmokeProject.currentChapterId;
  if (!initialChapterId) throw new Error("B1_B5_CURRENT_CHAPTER_MISSING");

  await page.goto(`/projects/${projectId}/script/${initialChapterId}`);
  await page.locator(".file-input").setInputFiles({
    name: "雨夜末班车完整剧本.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(SOURCE),
  });
  await expect(page.getByText("雨夜末班车完整剧本.txt", { exact: true })).toBeVisible();
  await page.getByLabel("输入对话内容").fill("请忠实分析并拆成项目章节");
  await page.getByTitle("发送").click();

  await page.locator(".tool-event-trigger").last().click();
  await expect(page.getByText("原稿分析与拆章目录", { exact: true })).toBeVisible();
  await expect(page.getByText("章节候选：2 章", { exact: true })).toBeVisible();
  await expect(page.getByText("1. 雨夜站台", { exact: true })).toBeVisible();
  await expect(page.getByText("2. 封闭总站", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "确认拆章目录" })).toBeVisible();

  await page.getByRole("button", { name: "确认拆章目录" }).click();
  await expect(page.locator(".tool-event-trigger")).toHaveCount(2, { timeout: 30_000 });
  await page.locator(".tool-event-trigger").last().click();
  await expect(page.getByText("整批结果：可逐章检查", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("待确认", { exact: true }).first()).toBeVisible();

  const firstPending = page.getByLabel("待确认章节草稿全文");
  await expect(firstPending).toBeVisible();
  await expect(firstPending).toContainText("## 第 1 章：雨夜站台");
  await expect(page.getByRole("button", { name: "确认章节" })).toBeVisible();
  await expect(page.getByRole("button", { name: "采用草稿" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "丢弃" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "保存草稿" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "完成本章" })).toBeDisabled();

  await page.getByRole("button", { name: "确认章节" }).click();
  await expect(firstPending).not.toBeVisible();
  await expect(page.getByText("本章剧本已完成", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "进入本章剧情结构" })).toBeVisible();

  const confirmed = await api.get<{ snapshot: WorkbenchSnapshot }>(
    `/projects/${projectId}/workbench?chapterId=${initialChapterId}`,
  );
  expect(confirmed.data.snapshot.currentChapter).toMatchObject({
    id: initialChapterId,
    status: "script_done",
    currentScriptVersionId: expect.any(String),
  });
  expect(confirmed.data.snapshot.chapters).toHaveLength(2);
  const secondChapter = confirmed.data.snapshot.chapters.find((chapter) => chapter.order === 2);
  if (!secondChapter) throw new Error("B1_B5_SECOND_CHAPTER_MISSING");

  await page.locator(".chapter-dropdown-btn").click();
  await page.locator(".dropdown-item").filter({ hasText: "封闭总站" }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/script/${secondChapter.id}$`));
  await expect(page.getByLabel("待确认章节草稿全文")).toContainText("## 第 2 章：封闭总站");
  await expect(page.getByRole("button", { name: "确认章节" })).toBeVisible();

  const secondPendingSnapshot = await api.get<{ snapshot: WorkbenchSnapshot }>(
    `/projects/${projectId}/workbench?chapterId=${secondChapter.id}`,
  );
  expect(secondPendingSnapshot.data.snapshot.currentChapter).toMatchObject({
    status: "draft",
    currentScriptVersionId: null,
  });
});
