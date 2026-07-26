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

  await page.setViewportSize({ width: 1180, height: 900 });
  await page.goto(`/projects/${fixture.projectId}/layout`);
  await expect(page.getByTestId("shot-tray")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "手机预览" })).toBeVisible();
  await expect(page.getByTestId("layout-simple-export")).toBeVisible();
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

  await page.getByTitle("添加文字").click();
  const editor = page.getByRole("textbox", { name: "画布富文本内容" });
  await expect(editor).toBeVisible();
  await editor.evaluate((element) => {
    element.replaceChildren(document.createTextNode("整段替换"));
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "整段替换",
      inputType: "insertText",
    }));
  });
  await saveNow(page);
  const replacedWholeDocument = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  const replacedWholeText = replacedWholeDocument.data.document.canvases[0]!.elements.find(
    (element): element is TextElementV1 => element.type === "text",
  )!;
  expect(replacedWholeText.richText.paragraphs.flatMap((paragraph) => paragraph.runs).map((run) => run.text).join("")).toBe("整段替换");
  await editor.evaluate((element) => {
    const span = element.querySelector(".editor-paragraph span");
    if (!span) throw new Error("RICH_TEXT_SPAN_MISSING");
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    span.textContent = "中文输入";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "中文输入", isComposing: true }));
    element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "中文输入" }));
  });
  await expect(editor).toContainText("中文输入");
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await editor.type("连续输入");
  await expect(editor).toHaveText("连续输入");

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
  await expect(page.getByRole("button", { name: "斜体", exact: true })).toBeDisabled();
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
    fontStyle: "normal",
    color: "#D92D20FF",
    letterSpacing: 4,
    stroke: { color: "#FFFFFFFF", width: 2 },
  });
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

  const balloonEditor = page.getByRole("textbox", { name: "画布富文本内容" });
  await kind.selectOption("thought");
  await pastePlainText(balloonEditor, "你听见雨里有人点名了吗？");
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

  await balloonEditor.click();
  await balloonEditor.press("ControlOrMeta+A");
  await balloonEditor.type("叔叔，我真的赶时间。");
  await saveNow(page);
  const state2 = await readCurrentBalloonState();
  expect(state2).toMatchObject({
    balloonKind: "shout",
    text: "叔叔，我真的赶时间。",
    writingMode: "horizontal-tb",
  });
  await expect(balloon.locator(".rich-text-preview")).toHaveText("叔叔，我真的赶时间。");

  await page.getByRole("button", { name: "竖排", exact: true }).click();
  await saveNow(page);
  const state3 = await readCurrentBalloonState();
  expect(state3).toMatchObject({
    balloonKind: "shout",
    text: "叔叔，我真的赶时间。",
    writingMode: "vertical-rl",
  });
  await expect(balloon.locator(".rich-text-preview")).toHaveCSS("writing-mode", "vertical-rl");

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
  const afterSelectMode = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  const selectModeBalloon = afterSelectMode.data.document.canvases[0]!.elements.find((element): element is BalloonElementV1 => element.type === "balloon")!;
  expect(selectModeBalloon.transform.x).not.toBe(beforeBalloon.transform.x);

  await page.getByRole("button", { name: "精确调整" }).click();
  await page.getByLabel("宽", { exact: true }).fill("160");
  await page.getByLabel("宽", { exact: true }).press("Tab");
  await page.getByLabel("高", { exact: true }).fill("120");
  await page.getByLabel("高", { exact: true }).press("Tab");
  await pastePlainText(balloonEditor, "这是一个会明确溢出的很长很长的受控气泡文本");
  await expect(page.getByTestId("text-preflight-summary")).toContainText("文字溢出");
  await saveNow(page);
  await page.getByTestId("layout-simple-export").click();
  const exportDialog = page.getByTestId("layout-export-dialog");
  await expect(exportDialog).toContainText("文字发生溢出", { timeout: 30_000 });
  await expect(exportDialog).toContainText("这不是可以忽略的提醒");
  await exportDialog.getByRole("button", { name: "返回修改" }).click();
  await expect(exportDialog).toBeHidden();

  const beforeElementSwitch = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  const previousTextElementIds = new Set(
    beforeElementSwitch.data.document.canvases[0]!.elements
      .filter((element): element is TextElementV1 => element.type === "text")
      .map((element) => element.id),
  );
  await balloonEditor.evaluate((element) => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  });
  await page.getByTitle("添加文字").click();
  const switchedEditor = page.getByRole("textbox", { name: "画布富文本内容" });
  await expect(switchedEditor).toHaveText("输入文字");
  await switchedEditor.evaluate((element) => {
    const span = element.querySelector(".editor-paragraph span");
    if (!span) throw new Error("SWITCHED_RICH_TEXT_SPAN_MISSING");
    span.textContent = "轰——";
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "轰——",
      inputType: "insertText",
    }));
  });
  await saveNow(page);
  const afterElementSwitch = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  const switchedText = afterElementSwitch.data.document.canvases[0]!.elements.find(
    (element): element is TextElementV1 => element.type === "text" && !previousTextElementIds.has(element.id),
  )!;
  expect(switchedText.richText.paragraphs.flatMap((paragraph) => paragraph.runs).map((run) => run.text).join("")).toBe("轰——");
  await expect(page.locator(".canvas-element.type-text.is-selected .rich-text-preview")).toHaveText("轰——");

  await switchedEditor.click();
  await switchedEditor.press("ControlOrMeta+A");
  await switchedEditor.type("轰隆——");
  const mobilePreviewPagePromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "手机预览" }).click();
  const mobilePreviewPage = await mobilePreviewPagePromise;
  await mobilePreviewPage.waitForURL(/\/layout\/preview\?.*source=working_copy/, { timeout: 8_000 });
  await expect(page.getByTestId("mobile-preview-feedback")).toContainText("当前成稿已保存");
  await expect(mobilePreviewPage.getByText("轰隆——", { exact: true })).toBeVisible();
  await mobilePreviewPage.close();

  await switchedEditor.press("End");
  await switchedEditor.press("Enter");
  await switchedEditor.type("第二声");
  await saveNow(page);
  const multilineWorkingCopy = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  const multilineText = multilineWorkingCopy.data.document.canvases[0]!.elements.find(
    (element): element is TextElementV1 => element.type === "text" && element.id === switchedText.id,
  )!;
  expect(multilineText.richText.paragraphs
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(""))
    .join("\n")).toBe("轰隆——\n第二声");

  await switchedEditor.evaluate((element) => {
    const unexpectedLine = document.createElement("div");
    unexpectedLine.textContent = "第三声";
    element.append(unexpectedLine);
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "第三声",
      inputType: "insertParagraph",
    }));
  });
  await saveNow(page);
  const crossBrowserRootWorkingCopy = await api.get<LayoutWorkingCopyResponseV1>(
    `/projects/${fixture.projectId}/chapters/${fixture.chapterId}/layout/working-copy`,
  );
  const crossBrowserRootText = crossBrowserRootWorkingCopy.data.document.canvases[0]!.elements.find(
    (element): element is TextElementV1 => element.type === "text" && element.id === switchedText.id,
  )!;
  expect(crossBrowserRootText.richText.paragraphs
    .map((paragraph) => paragraph.runs.map((run) => run.text).join(""))
    .join("\n")).toBe("轰隆——\n第二声\n第三声");

  const isolatedFamilies = await page.locator(".canvas-element.type-text .rich-text-preview span").first().evaluate((element) => getComputedStyle(element).fontFamily);
  expect(isolatedFamilies).toMatch(/^AIR_/);
  expect(isolatedFamilies).not.toMatch(/Arial|Helvetica|Times|system-ui/i);
  const selectorText = await page.getByTestId("rich-text-controls").getByLabel("字体").locator("option").allTextContents();
  expect(selectorText.join(" ")).not.toMatch(/Arial|Helvetica|Times|system-ui/i);

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
