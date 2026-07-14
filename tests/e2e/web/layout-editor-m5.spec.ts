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
  const button = page.getByRole("button", { name: "立即保存" });
  if (await button.isEnabled()) await button.click();
  await expect(page.locator(".editor-status")).toContainText("已保存到数据库", { timeout: 8_000 });
}

async function pastePlainText(
  editor: import("@playwright/test").Locator,
  text: string,
  html = `<strong>${text}</strong>`,
): Promise<void> {
  await editor.evaluate((element, payload) => {
    const paragraph = element.querySelector(".editor-paragraph");
    if (!paragraph) throw new Error("RICH_TEXT_PARAGRAPH_MISSING");
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", payload.text);
    clipboard.setData("text/html", payload.html);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  }, { text, html });
}

test("G5-M5：受控字体、IME 富文本、溢出和四类气泡形成 DB-only 闭环", async ({
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

  await page.goto(`/projects/${fixture.projectId}/layout`);
  await page.getByRole("button", { name: "创建数据库草稿" }).click();
  await expect(page.getByTestId("shot-tray")).toBeVisible();

  const fonts = await api.get<LayoutFontCatalogResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/fonts`,
  );
  expect(fonts.data.items).toHaveLength(2);
  expect(fonts.data.items.map((item) => [item.metadata.face.weight, item.metadata.face.style])).toEqual([
    [400, "normal"],
    [700, "normal"],
  ]);
  expect(fonts.data.items.every((item) => item.metadata.license.embeddingAllowed)).toBe(true);
  await expect.poll(() => fontResponses.filter((item) => item.status === 200).length).toBeGreaterThanOrEqual(2);

  await page.getByTitle("添加文字").click();
  const editor = page.getByRole("textbox", { name: "画布富文本内容" });
  await expect(editor).toBeVisible();
  await editor.evaluate((element) => {
    const span = element.querySelector(".editor-paragraph span");
    if (!span) throw new Error("RICH_TEXT_SPAN_MISSING");
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    span.textContent = "中文输入";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "中文输入", isComposing: true }));
    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "中文输入" }));
  });
  await expect(editor).toContainText("中文输入");
  await page.getByTitle("撤销").click();
  await expect(editor).toContainText("输入文字");
  await page.getByTitle("重做").click();
  await expect(editor).toContainText("中文输入");

  await pastePlainText(editor, "你好世界", `<a href="https://example.invalid"><script>bad()</script>你好世界</a>`);
  await expect(editor).toContainText("你好世界");
  await expect(editor).not.toContainText("bad()");

  await editor.evaluate((element) => {
    const node = element.querySelector(".editor-paragraph span")?.firstChild;
    if (!(node instanceof Text)) throw new Error("RICH_TEXT_NODE_MISSING");
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 2);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByLabel("字号").fill("72");
  await page.getByLabel("字距").fill("4");
  await page.getByLabel("颜色").fill("#D92D20");
  await page.getByLabel("描边", { exact: true }).fill("2");
  await page.getByLabel("描边色").fill("#FFFFFF");
  await page.getByRole("button", { name: "粗体", exact: true }).click();
  await page.getByRole("button", { name: "斜体", exact: true }).click();
  await page.getByRole("button", { name: "应用到选区" }).click();
  await saveNow(page);

  let saved = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  let text = saved.data.document.canvases[0]!.elements.find((element): element is TextElementV1 => element.type === "text")!;
  expect(text.richText.paragraphs[0]!.runs).toHaveLength(2);
  expect(text.richText.paragraphs[0]!.runs[0]).toMatchObject({
    text: "你好",
    fontSize: 72,
    fontWeight: 700,
    fontStyle: "italic",
    color: "#D92D20FF",
    letterSpacing: 4,
    stroke: { color: "#FFFFFFFF", width: 2 },
  });
  await page.getByTitle("撤销").click();
  await saveNow(page);
  saved = await api.get(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`);
  text = (saved.data as LayoutWorkingCopyResponseV1).document.canvases[0]!.elements.find((element): element is TextElementV1 => element.type === "text")!;
  expect(text.richText.paragraphs[0]!.runs).toHaveLength(1);
  await page.getByTitle("重做").click();
  await page.getByRole("button", { name: "竖排", exact: true }).click();
  await saveNow(page);

  await page.getByTitle("添加气泡").click();
  const balloon = page.locator(".canvas-element.type-balloon").last();
  await expect(page.getByTestId("balloon-controls")).toBeVisible();
  const kind = page.getByTestId("balloon-controls").getByLabel("类型");
  const paths: string[] = [];
  for (const value of ["speech", "thought", "shout", "caption"] as const) {
    await kind.selectOption(value);
    paths.push((await balloon.locator("path").getAttribute("d")) ?? "");
  }
  expect(new Set(paths).size).toBe(4);
  await kind.selectOption("shout");
  await page.getByTestId("balloon-controls").getByLabel("目标 X").fill("180");
  await page.getByTestId("balloon-controls").getByLabel("目标 X").press("Tab");
  await saveNow(page);

  const beforeTextMode = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  const beforeBalloon = beforeTextMode.data.document.canvases[0]!.elements.find((element): element is BalloonElementV1 => element.type === "balloon")!;
  const box = await balloon.boundingBox();
  if (!box) throw new Error("BALLOON_BOX_MISSING");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30);
  await page.mouse.up();
  await saveNow(page);
  const afterTextMode = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  const textModeBalloon = afterTextMode.data.document.canvases[0]!.elements.find((element): element is BalloonElementV1 => element.type === "balloon")!;
  expect(textModeBalloon.transform).toEqual(beforeBalloon.transform);

  await page.getByTitle("选择").click();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30);
  await page.mouse.up();
  await saveNow(page);
  const afterSelectMode = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  const selectModeBalloon = afterSelectMode.data.document.canvases[0]!.elements.find((element): element is BalloonElementV1 => element.type === "balloon")!;
  expect(selectModeBalloon.transform.x).not.toBe(beforeBalloon.transform.x);

  await page.getByLabel("宽", { exact: true }).fill("160");
  await page.getByLabel("宽", { exact: true }).press("Tab");
  await page.getByLabel("高", { exact: true }).fill("120");
  await page.getByLabel("高", { exact: true }).press("Tab");
  const balloonEditor = page.getByRole("textbox", { name: "画布富文本内容" });
  await pastePlainText(balloonEditor, "这是一个会明确溢出的很长很长的受控气泡文本");
  await expect(page.getByTestId("text-preflight-summary")).toContainText("文字溢出");
  await expect(page.getByRole("button", { name: "保存版本" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "导出 PNG 序列" })).toBeDisabled();
  await saveNow(page);

  const isolatedFamilies = await page.locator(".canvas-element.type-text .rich-text-preview span").first().evaluate((element) => getComputedStyle(element).fontFamily);
  expect(isolatedFamilies).toMatch(/^AIR_/);
  expect(isolatedFamilies).not.toMatch(/Arial|Helvetica|Times|system-ui/i);
  const selectorText = await page.getByTestId("rich-text-controls").getByLabel("字体").locator("option").allTextContents();
  expect(selectorText.join(" ")).not.toMatch(/Arial|Helvetica|Times|system-ui/i);

  const database = new DatabaseSync(runtime.databasePath);
  try {
    const rows = database.prepare("SELECT status, sha256, bytes, metadata_json FROM assets WHERE project_id = ? AND type = 'font' AND role = 'layout_font' ORDER BY created_at").all(fixture.projectId) as Array<{ status: string; sha256: string; bytes: number; metadata_json: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.status === "ready" && /^sha256:[0-9a-f]{64}$/.test(row.sha256) && row.bytes > 1_000_000)).toBe(true);
    expect(rows.map((row) => row.metadata_json).join("\n")).not.toMatch(/base64|data:font/i);
    const outbox = database.prepare("SELECT status FROM outbox_events WHERE aggregate_id IN (SELECT id FROM assets WHERE project_id = ? AND type = 'font')").all(fixture.projectId) as Array<{ status: string }>;
    expect(outbox).toHaveLength(2);
    expect(outbox.every((row) => row.status === "processed")).toBe(true);
  } finally {
    database.close();
  }

  expect(pageErrors).toEqual([]);
  const evidenceRoot = path.resolve("文档/05_执行与记录/任务记录/2026-07-14_G0至G5剩余连续施工/evidence");
  await mkdir(evidenceRoot, { recursive: true });
  await page.screenshot({ path: path.join(evidenceRoot, "g5_m5_text_balloon_fonts.png"), fullPage: true });
});
