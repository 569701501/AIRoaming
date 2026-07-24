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
import { initializeLegacyLayoutWorkingCopy } from "../support/g5-layout-fixture.ts";

const { DatabaseSync } = createRequire(path.join(process.cwd(), "package.json"))("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

test("G5-M4：当前定稿素材、模板、裁切与 DB-only 保存形成真实闭环", async ({
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
  await initializeLegacyLayoutWorkingCopy(
    api,
    rainSmokeProject,
    fixture.projectId,
    fixture.chapterId,
  );

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

    const shotTray = page.getByTestId("shot-tray");
    await expect(shotTray).toBeVisible();
    await expect(shotTray).toContainText("镜头 1");
    await expect(shotTray).toContainText("已放置 1 处");
    await expect(page.getByTestId("layout-preset-picker")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "按镜头排版", exact: true }).click();
    await expect(page.locator(".canvas-navigation .canvas-nav-item")).toHaveCount(1);

    await page.getByRole("button", { name: "左右双格 2 格" }).click();
    await page.getByRole("button", { name: "应用到当前画布" }).click();
    const panels = page.locator(".canvas-element.type-panel_frame");
    await expect(panels).toHaveCount(2);
    const panelBox = await panels.nth(0).boundingBox();
    if (!panelBox) throw new Error("PANEL_BOX_MISSING");
    await page.mouse.click(panelBox.x + panelBox.width / 2, panelBox.y + panelBox.height / 2);
    await expect(page.getByTestId("crop-controls")).toBeVisible();
    await page.getByRole("button", { name: "水平翻转" }).click();
    await expect(page.getByTestId("crop-controls")).toContainText("裁切覆盖完整");
    await page.getByRole("button", { name: "分离为自由图" }).click();
    await expect(shotTray).toContainText("已放置 1 处");

    await page.getByRole("button", { name: "放入空画格" }).click();
    await expect(page.locator(".canvas-element.type-free_image")).toHaveCount(0);
    await expect(shotTray).toContainText("已放置 1 处");

    const freeImageButton = shotTray.getByRole("button", { name: "自由图" });
    await freeImageButton.click();
    await expect(page.locator(".canvas-element.type-free_image")).toHaveCount(1);
    await expect(shotTray).toContainText("已放置 2 处");

    const canvasBox = await page.locator(".document-canvas").boundingBox();
    if (!canvasBox) throw new Error("CANVAS_BOX_MISSING");
    await page.mouse.click(canvasBox.x + 4, canvasBox.y + 4);
    const readingRows = page.locator(".reading-order article");
    await expect(readingRows).toHaveCount(2);
    const secondReadingButtons = readingRows.nth(1).locator("button");
    await expect(secondReadingButtons).toHaveCount(2);
    await secondReadingButtons.nth(0).click();

    await page.getByRole("button", { name: "新增段落", exact: true }).click();
    const canvasRows = page.locator(".canvas-navigation .canvas-nav-item");
    await expect(canvasRows).toHaveCount(2);
    await canvasRows.nth(1).getByTitle("前移").click();
    await canvasRows.nth(1).click();

    await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 5_000 });
    const saved = await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    );
    expect(saved.data.rowVersion).toBeGreaterThanOrEqual(1);
    expect(saved.data.document.canvases).toHaveLength(2);
    expect(saved.data.document.canvases[0]!.elements).toHaveLength(0);
    const composedCanvas = saved.data.document.canvases[1]!;
    expect(composedCanvas.panelReadingOrder).toHaveLength(2);
    const savedPanels = composedCanvas.elements.filter((element) => element.type === "panel_frame");
    expect(composedCanvas.panelReadingOrder[0]).toBe(savedPanels[1]!.id);
    expect(composedCanvas.elements.filter((element) => element.type === "free_image")).toHaveLength(1);
    expect((database.prepare("SELECT sha256 FROM assets WHERE id = ?").get(sourceAssetId) as { sha256: string }).sha256).toBe(sourceAssetSha);
    expect(pageErrors).toEqual([]);

    const evidenceRoot = path.resolve(
      "文档/05_执行与记录/任务记录/2026-07-14_G0至G5剩余连续施工/evidence",
    );
    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({ path: path.join(evidenceRoot, "g5_m4_layout_editor.png"), fullPage: true });
  } finally {
    database.close();
  }
});
