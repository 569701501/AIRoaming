import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { ProjectListItem } from "@airoaming/shared";

import {
  cleanupE2EProject,
  expect,
  test,
} from "../support/e2e-fixture.ts";

const DOCUMENT_SOURCE = `第一章 雨夜站台
林夏在雨夜站台等车。一辆没有司机的末班车进站。

第二章 封闭总站
林夏在封闭总站找到被困的姐姐。

第三章 隧道尽头
姐妹二人直播了掩盖事故的监控画面，最终获救。`;

test("文稿库：上传拆章→阅读器→创建项目导入章节壳", async ({
  api,
  page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const evidenceRoot = path.resolve(
    "文档/05_执行与记录/任务记录/2026-08-04_文稿库实施/evidence",
  );
  await mkdir(evidenceRoot, { recursive: true });

  // 1. 文稿库列表空态 → 新增弹窗 → 上传
  await page.goto("/documents");
  await expect(page.locator(".document-library")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".empty-state")).toBeVisible();
  await page.getByRole("button", { name: "新增文稿" }).click();
  await page.waitForSelector(".dialog-panel");
  await page.locator(".upload-zone input").setInputFiles({
    name: "雨夜末班车完整剧本.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(DOCUMENT_SOURCE),
  });
  await page.getByRole("button", { name: "确定上传" }).click();

  // 2. 自动跳详情：3 章、第一组展开、第一章默认显示
  await page.waitForURL(/\/documents\/[^/]+$/, { timeout: 30_000 });
  await page.waitForSelector(".reader-content", { timeout: 15_000 });
  await expect(page.locator(".detail-title strong")).toHaveText("雨夜末班车完整剧本");
  await expect(page.locator(".chapter-list li")).toHaveCount(3);
  await expect(page.locator(".reader-head strong")).toHaveText("第一章 雨夜站台");
  await expect(page.locator(".reader-content")).toContainText("林夏在雨夜站台等车");

  // 3. 点击第二章切换正文
  await page.locator(".chapter-list li").nth(1).click();
  await expect(page.locator(".reader-head strong")).toHaveText("第二章 封闭总站", { timeout: 10_000 });
  await expect(page.locator(".reader-content")).toContainText("林夏在封闭总站找到被困的姐姐");

  // 4. 回文稿库 → 创建项目选文稿 → 章节壳建立
  await page.getByLabel("返回文稿库").click();
  await page.waitForURL(/\/documents$/, { timeout: 10_000 });
  await expect(page.locator(".document-card")).toHaveCount(1);

  await page.goto("/projects");
  await page.waitForSelector(".project-library", { timeout: 15_000 });
  await page.getByRole("button", { name: /创建|新建/ }).first().click();
  await page.waitForSelector(".create-modal");
  await page.locator("#create-form input[type='text']").fill("文稿导入e2e");
  await page.locator(".format-card").first().click();
  await page.locator(".document-select").selectOption({ index: 1 });
  await page.getByRole("button", { name: "创建项目" }).click();
  await page.waitForURL(/\/projects\/[^/]+\/script/, { timeout: 30_000 });

  // 5. 验证章节壳（API 投影）
  const projectId = page.url().match(/\/projects\/([^/]+)/)?.[1];
  if (!projectId) throw new Error("PROJECT_ID_MISSING");
  const chapters = (await api.get<{ chapters: Array<{ title: string; order: number }> }>(
    `/projects/${projectId}/chapters`,
  )).data.chapters;
  expect(chapters).toHaveLength(3);
  expect(chapters.map((chapter) => chapter.title)).toEqual([
    "第一章 雨夜站台",
    "第二章 封闭总站",
    "第三章 隧道尽头",
  ]);

  // 5.1 剧本页正文按需从文稿原文加载（API 投影，避免 CodeMirror 虚拟滚动影响 DOM 断言）
  const workbench = (await api.get<{ snapshot: { currentChapter: { sourceText: string; title: string } } }>(
    `/projects/${projectId}/workbench`,
  )).data.snapshot.currentChapter;
  expect(workbench.title).toBe("第一章 雨夜站台");
  expect(workbench.sourceText).toContain("林夏在雨夜站台等车");
  expect(workbench.sourceText).not.toContain("第二章");

  // 6. 清理：删除项目 + 文稿
  await cleanupE2EProject(api, projectId, test.info(), {});
  const documents = (await api.get<{ items: Array<{ id: string }> }>("/documents")).data.items;
  for (const document of documents) {
    await api.delete(`/documents/${document.id}`);
  }

  await page.screenshot({
    path: path.join(evidenceRoot, "document-library-e2e.png"),
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});
