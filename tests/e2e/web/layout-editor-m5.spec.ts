import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import type {
  BalloonElementV1,
  LayoutFontCatalogResponseV1,
  LayoutWorkingCopyResponseV1,
  TextElementV1,
} from "@airoaming/shared";

import { expect, test } from "../support/e2e-fixture.ts";
import { lockCandidate, prepareG4CandidateFixture } from "../support/g4-candidate-fixture.ts";

const { DatabaseSync } = createRequire(path.join(process.cwd(), "package.json"))("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

async function saveNow(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator(".editor-status")).toContainText("已保存", { timeout: 8_000 });
}

function balloonState(element: BalloonElementV1) {
  return {
    id: element.id,
    balloonKind: element.balloonKind,
    fillColor: element.fillColor,
    strokeColor: element.strokeColor,
    strokeWidth: element.strokeWidth,
    padding: element.padding,
    verticalAlign: element.verticalAlign,
    tail: element.tail,
    writingMode: element.richText.writingMode,
    text: element.richText.paragraphs
      .flatMap((paragraph) => paragraph.runs)
      .map((run) => run.text)
      .join(""),
  };
}

test("G5-M5：受控字体、就地改字、简单样式与导出门禁形成 DB-only 闭环", async ({
  api,
  page,
  rainSmokeProject,
  runtime,
}) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  const fontResponses: Array<{ url: string; status: number }> = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (/\/layout\/fonts\/[^/]+\/file$/.test(new URL(response.url()).pathname)) {
      fontResponses.push({ url: response.url(), status: response.status() });
    }
  });

  const fixture = await prepareG4CandidateFixture(api, rainSmokeProject);
  await lockCandidate(api, fixture, fixture.candidateIds[0]!);
  await api.post(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/images/complete`);

  await page.setViewportSize({ width: 1180, height: 900 });
  await page.goto(`/projects/${fixture.projectId}/layout`);
  await expect(page.locator(".document-canvas")).toBeVisible({ timeout: 45_000 });
  // 左栏默认收起:展开左栏看镜头素材
  await page.getByLabel("展开页面与素材栏").click();
  await expect(page.getByTestId("shot-tray")).toBeVisible();
  await expect(page.getByTestId("layout-simple-export")).toBeVisible();
  await expect(page.getByRole("button", { name: "手机预览" })).toBeVisible();
  const textStateEvidenceRoot = path.resolve(
    "文档/05_执行与记录/任务记录/2026-07-26_漫画成稿体验评估与P0修复/evidence",
  );
  await mkdir(textStateEvidenceRoot, { recursive: true });
  await page.screenshot({
    path: path.join(textStateEvidenceRoot, "1180px关键入口.png"),
  });

  const fonts = await api.get<LayoutFontCatalogResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/fonts`,
  );
  expect(fonts.data.items).toHaveLength(4);
  expect(fonts.data.items
    .map((item) => [item.metadata.face.weight, item.metadata.face.style] as const)
    .sort((left, right) => left[0] - right[0])).toEqual([
    [400, "normal"],
    [500, "normal"],
    [700, "normal"],
    [900, "normal"],
  ]);
  expect(fonts.data.items.every((item) => item.metadata.license.embeddingAllowed)).toBe(true);
  await expect.poll(() => fontResponses.filter((item) => item.status === 200).length).toBeGreaterThanOrEqual(4);

  // 添加文字 → 选中工具条给字号/颜色/粗体,双击画布就地改字
  await page.getByTitle("添加文字").click();
  const textElement = page.locator(".canvas-element.type-text").last();
  await expect(textElement).toBeVisible();
  await page.getByRole("button", { name: "放大文字" }).click();
  await page.getByRole("button", { name: "放大文字" }).click();
  await page.getByRole("button", { name: "粗体" }).click();
  await page.getByRole("button", { name: "文字颜色 红色" }).click();
  await saveNow(page);

  let saved = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  let text = saved.data.document.canvases[0]!.elements.find((element): element is TextElementV1 => element.type === "text")!;
  expect(text.richText.paragraphs[0]!.runs[0]).toMatchObject({
    text: "输入文字",
    fontSize: 72,
    fontWeight: 700,
    fontStyle: "normal",
    color: "#DC2626FF",
  });

  // 双击文字就地编辑
  const textBox = await textElement.boundingBox();
  if (!textBox) throw new Error("TEXT_BOX_MISSING");
  await page.mouse.dblclick(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
  const inlineEditor = page.getByTestId("layout-inline-text-editor");
  await expect(inlineEditor).toBeVisible();
  const textarea = inlineEditor.locator("textarea");
  await textarea.selectText();
  await textarea.pressSequentially("轰隆——", { delay: 20 });
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(inlineEditor).toBeHidden();
  await saveNow(page);
  saved = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  text = saved.data.document.canvases[0]!.elements.find((element): element is TextElementV1 => element.type === "text")!;
  expect(text.richText.paragraphs.flatMap((paragraph) => paragraph.runs).map((run) => run.text).join("")).toBe("轰隆——");

  // 添加气泡:就地改字 + 工具条气泡类型四态切换
  await page.getByTitle("添加气泡").click();
  const balloon = page.locator(".canvas-element.type-balloon").last();
  await expect(balloon).toBeVisible();
  const kind = page.getByLabel("气泡类型");
  // 工具条必须在可视区内完整显示(不被画布边缘裁切)
  const toolbar = page.getByTestId("layout-selection-toolbar");
  await expect(toolbar).toBeVisible();
  const toolbarBox = await toolbar.boundingBox();
  if (!toolbarBox) throw new Error("TOOLBAR_BOX_MISSING");
  expect(toolbarBox.x).toBeGreaterThanOrEqual(0);
  expect(toolbarBox.y).toBeGreaterThanOrEqual(0);
  expect(toolbarBox.x + toolbarBox.width).toBeLessThanOrEqual(1180);
  expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(900);
  const paths: string[] = [];
  for (const value of ["speech", "thought", "shout", "caption"] as const) {
    await kind.selectOption(value);
    paths.push((await balloon.locator("path").getAttribute("d")) ?? "");
  }
  expect(new Set(paths).size).toBe(4);
  await kind.selectOption("thought");
  await expect(balloon.locator(".rich-text-preview")).toHaveText("对白");

  const balloonBox = await balloon.boundingBox();
  if (!balloonBox) throw new Error("BALLOON_BOX_MISSING");
  await page.mouse.dblclick(balloonBox.x + balloonBox.width / 2, balloonBox.y + balloonBox.height / 2);
  await expect(inlineEditor).toBeVisible();
  await textarea.selectText();
  await textarea.pressSequentially("你听见雨里有人点名了吗？", { delay: 20 });
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(inlineEditor).toBeHidden();
  await saveNow(page);
  const readCurrentBalloonState = async () => {
    const response = await api.get<LayoutWorkingCopyResponseV1>(
      `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
    );
    const element = response.data.document.canvases[0]!.elements.find(
      (candidate): candidate is BalloonElementV1 => candidate.type === "balloon",
    );
    if (!element) throw new Error("BALLOON_ELEMENT_MISSING");
    return balloonState(element);
  };
  const state0 = await readCurrentBalloonState();
  expect(state0).toMatchObject({
    balloonKind: "thought",
    text: "你听见雨里有人点名了吗？",
    writingMode: "horizontal-tb",
  });

  await kind.selectOption("shout");
  await saveNow(page);
  const state1 = await readCurrentBalloonState();
  expect(state1).toMatchObject({
    balloonKind: "shout",
    text: state0.text,
    writingMode: "horizontal-tb",
  });

  // 拖动气泡位置(松手提交)
  const preDragWorkingCopy = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  const beforeDragBalloon = preDragWorkingCopy.data.document.canvases[0]!.elements.find(
    (element): element is BalloonElementV1 => element.type === "balloon",
  )!;
  const balloonId = beforeDragBalloon.id;
  await page.mouse.move(balloonBox.x + balloonBox.width / 2, balloonBox.y + balloonBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(balloonBox.x + balloonBox.width / 2 + 40, balloonBox.y + balloonBox.height / 2 + 30);
  await page.mouse.up();
  await saveNow(page);
  const afterDragWorkingCopy = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  const afterDragBalloon = afterDragWorkingCopy.data.document.canvases[0]!.elements.find(
    (element): element is BalloonElementV1 => element.type === "balloon" && element.id === balloonId,
  )!;
  expect(afterDragBalloon.transform.x).not.toBe(beforeDragBalloon.transform.x);

  // 放大字号制造溢出 → 画布红色溢出标记 + 导出阻断(返回修改)
  for (let step = 0; step < 40; step += 1) {
    await page.getByRole("button", { name: "放大文字" }).click();
  }
  await expect(page.locator(".canvas-element.has-text-overflow")).not.toHaveCount(0, { timeout: 8_000 });
  await saveNow(page);
  await page.getByTestId("layout-simple-export").click();
  const exportDialog = page.getByTestId("layout-export-dialog");
  await expect(exportDialog).toContainText("文字发生溢出", { timeout: 30_000 });
  await expect(exportDialog).toContainText("这不是可以忽略的提醒");
  await exportDialog.getByRole("button", { name: "返回修改" }).click();
  await expect(exportDialog).toBeHidden();

  // 手机预览展示最近保存版本
  const mobilePreviewPagePromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "手机预览" }).click();
  const mobilePreviewPage = await mobilePreviewPagePromise;
  await mobilePreviewPage.waitForURL(/\/layout\/preview\?.*source=working_copy/, { timeout: 8_000 });
  await expect(page.getByTestId("mobile-preview-feedback")).toContainText("当前成稿已保存");
  await mobilePreviewPage.close();

  // 受控字体渲染:画布预览字体是 AIR_ 受控字体
  const isolatedFamilies = await page.locator(".canvas-element.type-text .rich-text-preview span").first().evaluate((element) => getComputedStyle(element).fontFamily);
  expect(isolatedFamilies).toMatch(/^AIR_/);
  expect(isolatedFamilies).not.toMatch(/Arial|Helvetica|Times|system-ui/i);

  const database = new DatabaseSync(runtime.databasePath);
  try {
    const rows = database.prepare("SELECT status, sha256, bytes, metadata_json FROM assets WHERE project_id = ? AND type = 'font' AND role = 'layout_font' ORDER BY created_at").all(fixture.projectId) as Array<{ status: string; sha256: string; bytes: number; metadata_json: string }>;
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.status === "ready" && /^sha256:[0-9a-f]{64}$/.test(row.sha256) && row.bytes > 1_000_000)).toBe(true);
    expect(rows.map((row) => row.metadata_json).join("\n")).not.toMatch(/base64|data:font/i);
    const outbox = database.prepare("SELECT status FROM outbox_events WHERE aggregate_id IN (SELECT id FROM assets WHERE project_id = ? AND type = 'font')").all(fixture.projectId) as Array<{ status: string }>;
    expect(outbox).toHaveLength(4);
    expect(outbox.every((row) => row.status === "processed")).toBe(true);
  } finally {
    database.close();
  }

  expect(pageErrors).toEqual([]);
  const evidenceRoot = path.resolve("文档/05_执行与记录/任务记录/2026-07-26_漫画成稿体验评估与P0修复/evidence");
  await mkdir(evidenceRoot, { recursive: true });
  await page.screenshot({ path: path.join(evidenceRoot, "g5_m5_text_balloon_fonts.png"), fullPage: true });
});
