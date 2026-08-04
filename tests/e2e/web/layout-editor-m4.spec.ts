import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import type { LayoutSourceCatalogResponseV1, LayoutWorkingCopyResponseV1 } from "@airoaming/shared";

import { expect, test } from "../support/e2e-fixture.ts";
import {
  lockCandidate,
  prepareG4CandidateFixture,
} from "../support/g4-candidate-fixture.ts";

const { DatabaseSync } = createRequire(path.join(process.cwd(), "package.json"))("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

test("G5-M4：当前定稿素材、镜头放入画格与 DB-only 保存形成真实闭环", async ({
  api,
  page,
  rainSmokeProject,
  runtime,
}) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject);
  await lockCandidate(api, fixture, fixture.candidateIds[0]!);
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);

  const database = new DatabaseSync(runtime.databasePath);
  const sourceBefore = await api.get<LayoutSourceCatalogResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/source-catalog`,
  );
  expect(sourceBefore.data.items).toHaveLength(1);
  expect(sourceBefore.data.items[0]!.source.candidateLockRevisionId).toBe(
    (database.prepare("SELECT current_candidate_lock_revision_id AS id FROM shots WHERE id = ?").get(fixture.shotId) as { id: string }).id,
  );
  const sourceAssetId = sourceBefore.data.items[0]!.source.assetId;
  const sourceAssetSha = (database.prepare("SELECT sha256 FROM assets WHERE id = ?").get(sourceAssetId) as { sha256: string }).sha256;

  try {
    await page.goto(`/projects/${fixture.projectId}/layout`);
    await expect(page.getByRole("region", { name: "成稿编辑器", exact: true })).toBeVisible();
    await expect(page.locator(".document-canvas")).toBeVisible({ timeout: 45_000 });

    // 左栏默认收起:展开后才能看到镜头素材栏
    await page.getByLabel("展开页面与素材栏").click();
    const shotTray = page.getByTestId("shot-tray");
    await expect(shotTray).toBeVisible();
    await expect(shotTray).toContainText("镜头 1");
    await expect(shotTray).toContainText("已放置 1 处");
    await expect(page.locator(".canvas-navigation .canvas-nav-item")).toHaveCount(0);

    // 点击镜头素材 → 只定位不选中(无工具条浮出)
    await shotTray.locator("article").first().click();
    await expect(page.locator(".canvas-element.type-panel_frame.is-selected")).toHaveCount(0);

    // 左键选中画格 → 右键画布空白处 → 取消选中
    const canvasBox = await page.locator(".document-canvas").boundingBox();
    if (!canvasBox) throw new Error("CANVAS_BOX_MISSING");
    await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await expect(page.locator(".canvas-element.type-panel_frame.is-selected")).toHaveCount(1);
    await page.mouse.click(canvasBox.x + 16, canvasBox.y + 16, { button: "right" });
    await expect(page.locator(".canvas-element.type-panel_frame.is-selected")).toHaveCount(0);

    // 重新选中,点击画布外留白 → 取消选中
    await page.mouse.click(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
    await expect(page.locator(".canvas-element.type-panel_frame.is-selected")).toHaveCount(1);
    await page.mouse.click(canvasBox.x + canvasBox.width + 12, canvasBox.y + 12);
    await expect(page.locator(".canvas-element.type-panel_frame.is-selected")).toHaveCount(0);

    // 高级能力默认隐藏:画布设置抽屉只有画布尺寸,没有画格模板
    await page.getByLabel("画布设置").click();
    await expect(page.getByTestId("layout-canvas-settings")).toBeVisible();
    await expect(page.getByTestId("layout-preset-picker")).not.toBeVisible();
    await page.getByLabel("关闭画布设置").click();

    // 自由图:从镜头素材栏添加(自动选中),再打开属性浮层
    const freeImageButton = shotTray.getByRole("button", { name: "自由图" });
    await freeImageButton.click();
    await expect(page.locator(".canvas-element.type-free_image")).toHaveCount(1);
    await expect(shotTray).toContainText("已放置 2 处");

    // 属性浮层入口已隐藏:无「属性」按钮,无裁切/精确调整/图层
    await expect(page.getByLabel("对象设置面板")).not.toBeVisible();
    await expect(page.getByTestId("crop-controls")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "精确调整" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "图层", exact: true })).not.toBeVisible();

    // 右键锁定/解锁
    const freeImageElement = page.locator(".canvas-element.type-free_image");
    const freeImageBox = await freeImageElement.boundingBox();
    if (!freeImageBox) throw new Error("FREE_IMAGE_BOX_MISSING");
    await page.mouse.click(freeImageBox.x + freeImageBox.width / 2, freeImageBox.y + freeImageBox.height / 2, { button: "right" });
    const contextMenu = page.getByTestId("layout-context-menu");
    await expect(contextMenu).toBeVisible();
    await contextMenu.getByRole("menuitem", { name: "锁定对象" }).click();
    await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });
    const workingCopyUrl = `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`;
    let contextDraft = (await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl)).data;
    expect(contextDraft.document.canvases[0]!.elements.find((element) => element.type === "free_image")?.locked).toBe(true);

    await page.mouse.click(freeImageBox.x + freeImageBox.width / 2, freeImageBox.y + freeImageBox.height / 2, { button: "right" });
    await expect(contextMenu).toBeVisible();
    await contextMenu.getByRole("menuitem", { name: "解锁对象" }).click();
    await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });
    contextDraft = (await api.get<LayoutWorkingCopyResponseV1>(workingCopyUrl)).data;
    expect(contextDraft.document.canvases[0]!.elements.find((element) => element.type === "free_image")?.locked).toBe(false);

    // 删除二次确认是自定义弹窗,不是浏览器原生 alert
    await page.mouse.click(freeImageBox.x + freeImageBox.width / 2, freeImageBox.y + freeImageBox.height / 2, { button: "right" });
    await expect(contextMenu).toBeVisible();
    await contextMenu.getByRole("menuitem", { name: "删除对象" }).click();
    const confirmDialog = page.getByRole("dialog", { name: /删除/ });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "取消" }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(page.locator(".canvas-element.type-free_image")).toHaveCount(1);
    await page.mouse.click(freeImageBox.x + freeImageBox.width / 2, freeImageBox.y + freeImageBox.height / 2, { button: "right" });
    await expect(contextMenu).toBeVisible();
    await contextMenu.getByRole("menuitem", { name: "删除对象" }).click();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "删除" }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(page.locator(".canvas-element.type-free_image")).toHaveCount(0);
    // 重新添加自由图,保持后续断言一致
    await shotTray.getByRole("button", { name: "自由图" }).click();
    await expect(page.locator(".canvas-element.type-free_image")).toHaveCount(1);

    // 段落列表已移除:左栏只有镜头素材栏,无段落导航/新增段落
    await expect(page.locator(".canvas-navigation .canvas-nav-item")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "新增段落", exact: true })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "新增页面", exact: true })).not.toBeVisible();

    await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 5_000 });
    const saved = await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    );
    expect(saved.data.rowVersion).toBeGreaterThanOrEqual(1);
    expect(saved.data.document.canvases).toHaveLength(1);
    expect(saved.data.document.canvases[0]!.elements.filter((element) => element.type === "free_image")).toHaveLength(1);
    expect((database.prepare("SELECT sha256 FROM assets WHERE id = ?").get(sourceAssetId) as { sha256: string }).sha256).toBe(sourceAssetSha);
    expect(pageErrors).toEqual([]);

    const evidenceRoot = path.resolve(
      "文档/05_执行与记录/任务记录/2026-07-26_漫画成稿体验评估与P0修复/evidence",
    );
    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({ path: path.join(evidenceRoot, "g5_m4_layout_editor.png"), fullPage: true });
  } finally {
    database.close();
  }
});
