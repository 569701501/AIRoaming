import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { parseM3ReviewCsvV1 } from "./m3-human-review-contract.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceRoot = path.join(
  repoRoot,
  "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m3-visual-composition",
);

test("M3 A/B blind-review pages start empty, isolate rounds, and export all 128 decisions", async () => {
  const [roundA, roundB] = await Promise.all([
    readFile(path.join(evidenceRoot, "m3-human-review-round-a.html"), "utf8"),
    readFile(path.join(evidenceRoot, "m3-human-review-round-b.html"), "utf8"),
  ]);
  assert.match(roundA, /data-review-round="A"/u);
  assert.match(roundB, /data-review-round="B"/u);
  assert.ok(!roundA.includes('"state":"pass"'));
  assert.ok(!roundB.includes('"state":"pass"'));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => void dialog.accept());
  const transparentPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("https://review.invalid/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/a.html") {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: roundA });
    } else if (pathname === "/b.html") {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: roundB });
    } else if (pathname.endsWith(".png")) {
      await route.fulfill({ status: 200, contentType: "image/png", body: transparentPng });
    } else {
      await route.abort();
    }
  });

  try {
    await page.goto("https://review.invalid/a.html");
    await assertInitialRound(page, "A");
    await page.locator("#reviewer-id").fill("reviewer-a");
    await page.locator("#independent").check();
    assert.equal(await page.locator("#export").isDisabled(), true);

    const groupCount = await page.locator("[data-group-index]").count();
    assert.equal(groupCount, 24);
    for (let index = 0; index < groupCount; index += 1) {
      await page.locator("[data-group-index]").nth(index).click();
      await page.locator('[data-action="group-pass"]').click();
    }
    await assertStat(page, "进度 128/128");
    await assertStat(page, "画格 69/69（100%）");
    await assertStat(page, "气泡 59/59（100%）");
    assert.equal(await page.locator(".group.done").count(), 24);
    assert.equal(await page.locator("#export").isEnabled(), true);

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export").click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "m3-human-review-round-a.csv");
    const downloadPath = await download.path();
    assert.ok(downloadPath);
    const exported = parseM3ReviewCsvV1(await readFile(downloadPath!, "utf8"));
    assert.equal(exported.length, 129);
    const header = exported[0]!;
    assert.equal(header.length, 19);
    const indexByName = new Map(header.map((name, index) => [name, index]));
    const identities = new Set<string>();
    for (const row of exported.slice(1)) {
      assert.equal(row.length, 19);
      assert.equal(row[indexByName.get("reviewer_id")!], "reviewer-a");
      assert.equal(row[indexByName.get("review_round")!], "A");
      assert.equal(row[indexByName.get("adjustment_notes")!], "");
      const itemType = row[indexByName.get("item_type")!];
      const itemId = row[indexByName.get("item_id")!]!;
      assert.ok(!identities.has(itemId));
      identities.add(itemId);
      const applicable = itemType === "panel"
        ? ["layout_ok", "crop_ok", "reading_order_ok", "subject_occlusion_ok"]
        : [
            "balloon_geometry_ok", "balloon_type_ok", "reading_order_ok", "subject_occlusion_ok",
            "text_fit_ok", "tail_ok", "shape_safe_ok",
          ];
      for (const field of applicable) assert.equal(row[indexByName.get(field)!], "true", `${itemId}:${field}`);
    }
    assert.equal(identities.size, 128);

    await page.goto("https://review.invalid/b.html");
    await assertInitialRound(page, "B");
    assert.equal(await page.locator("#reviewer-id").inputValue(), "");
    assert.equal(await page.locator("#independent").isChecked(), false);
  } finally {
    await context.close();
    await browser.close();
  }
  assert.deepEqual(errors, []);
});

async function assertInitialRound(page: import("@playwright/test").Page, round: "A" | "B"): Promise<void> {
  await page.locator(".badge").waitFor();
  assert.equal((await page.locator(".badge").textContent())?.trim(), `${round} 轮`);
  await assertStat(page, "进度 0/128");
  await assertStat(page, "画格 0/69（0%）");
  await assertStat(page, "气泡 0/59（0%）");
  assert.equal(await page.locator("#export").isDisabled(), true);
}

async function assertStat(page: import("@playwright/test").Page, expected: string): Promise<void> {
  const values = await page.locator("#stats .stat").allTextContents();
  assert.ok(values.includes(expected), `${expected} not found in ${JSON.stringify(values)}`);
}
