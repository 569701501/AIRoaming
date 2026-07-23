import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceRoot = path.join(
  repoRoot,
  "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m3-human-review-v2",
);
const transparentPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("V2 A/B pages teach the standard, isolate rounds, highlight one object, and export 158 decisions", async () => {
  const [roundA, roundB, manifestText] = await Promise.all([
    readFile(path.join(evidenceRoot, "m3-human-review-v2-round-a.html"), "utf8"),
    readFile(path.join(evidenceRoot, "m3-human-review-v2-round-b.html"), "utf8"),
    readFile(path.join(evidenceRoot, "m3-human-review-v2.manifest.json"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  await page.route("https://review-v2.invalid/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/a.html") {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: roundA });
    } else if (pathname === "/b.html") {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: roundB });
    } else if (/\.(?:png|jpe?g)$/u.test(pathname)) {
      await route.fulfill({ status: 200, contentType: "image/png", body: transparentPng });
    } else {
      await route.abort();
    }
  });

  try {
    await page.goto("https://review-v2.invalid/a.html");
    assert.equal((await page.locator(".badge").textContent())?.trim(), "A 轮");
    assert.equal(await page.locator("#review").isHidden(), true);
    assert.equal(await page.locator("#intro").isVisible(), true);
    assert.ok((await page.locator("#intro").innerText()).includes("“可以直接用”只有一个含义"));
    assert.ok((await page.locator("#intro").innerText()).includes("不合格：气泡遮挡重点"));
    assert.equal(await page.locator("#export").isDisabled(), true);

    await page.locator("#start-review").click();
    await assertProgress(page, "进度 0/158");
    await assertProgress(page, "画格 0/69");
    await assertProgress(page, "气泡 0/59");
    await assertProgress(page, "整页 0/30");
    assert.equal(await page.locator(".group").count(), 30);
    assert.equal(await page.locator("#focus-box").isVisible(), true);
    assert.ok((await page.locator("#focus-box").getAttribute("style"))?.includes("width"));
    assert.equal((await page.locator("#item-panel").getAttribute("data-item-type")), "panel");
    assert.ok((await page.getByText("查看未裁切原图").getAttribute("href"))?.includes("real-art-assets/"));

    const firstItemId = await page.locator("#item-panel").getAttribute("data-item-id");
    await page.locator("#read-page-from-start").click();
    assert.equal(await page.locator("#focus-box").isHidden(), true);
    assert.equal(await page.locator("#image-stage").evaluate((element) => element.scrollTop), 0);
    await page.locator('[data-action="item-pass"]').click();
    await assertProgress(page, "进度 1/158");
    assert.notEqual(await page.locator("#item-panel").getAttribute("data-item-id"), firstItemId);
    assert.equal(await page.locator("#focus-box").isVisible(), true);

    await page.locator("#reset").click();
    await assertProgress(page, "进度 0/158");
    const completeState = {
      reviewerId: "reviewer-a",
      independent: true,
      calibrated: true,
      currentPage: 0,
      currentItem: 0,
      itemDecisions: Object.fromEntries(
        manifest.items.map((item: Record<string, unknown>) => [
          item.itemId,
          { state: "pass", failed: [], notes: "" },
        ]),
      ),
      pageDecisions: Object.fromEntries(
        manifest.pages.map((reviewPage: Record<string, unknown>) => [
          reviewPage.pageId,
          { state: "pass", failed: [], notes: "" },
        ]),
      ),
    };
    await page.evaluate(({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      location.reload();
    }, {
      key: `m3-human-review-v2:${manifest.outputManifestDigest}:A`,
      value: completeState,
    });
    await page.locator("#review").waitFor();
    await assertProgress(page, "进度 158/158");
    await assertProgress(page, "画格 69/69");
    await assertProgress(page, "气泡 59/59");
    await assertProgress(page, "整页 30/30");
    assert.equal(await page.locator(".group.done").count(), 30);
    assert.equal(await page.locator("#export").isEnabled(), true);

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export").click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "m3-human-review-v2-round-a.json");
    const downloadPath = await download.path();
    assert.ok(downloadPath);
    const exported = JSON.parse(await readFile(downloadPath!, "utf8"));
    assert.equal(exported.reviewStandardId, "AIR-QA-COMIC-FINAL-001-v1");
    assert.equal(exported.reviewerId, "reviewer-a");
    assert.equal(exported.round, "A");
    assert.equal(exported.independent, true);
    assert.equal(exported.calibrated, true);
    assert.equal(exported.itemDecisions.length, 128);
    assert.equal(exported.pageDecisions.length, 30);
    assert.ok(!Number.isNaN(Date.parse(exported.completedAt)));
    assert.ok(exported.itemDecisions.every((decision: Record<string, unknown>) => decision.state === "pass"));

    await page.goto("https://review-v2.invalid/b.html");
    assert.equal((await page.locator(".badge").textContent())?.trim(), "B 轮");
    assert.equal(await page.locator("#intro").isVisible(), true);
    await page.locator("#start-review").click();
    await assertProgress(page, "进度 0/158");
    assert.equal(await page.locator("#reviewer-id").inputValue(), "");
    assert.equal(await page.locator("#independent").isChecked(), false);
  } finally {
    await context.close();
    await browser.close();
  }
  assert.deepEqual(errors, []);
});

async function assertProgress(page: import("@playwright/test").Page, expected: string): Promise<void> {
  const text = (await page.locator("#progress").textContent()) ?? "";
  assert.ok(text.includes(expected), `${expected} not found in ${JSON.stringify(text)}`);
}
