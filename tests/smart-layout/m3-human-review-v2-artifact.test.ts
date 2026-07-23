import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { validateM3HumanReviewManifestV2 } from "./m3-human-review-v2-contract.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceRoot = path.join(
  repoRoot,
  "文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m3-human-review-v2",
);

function sha256(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

test("V2 review artifacts are real, frozen, complete, and ordinary-reader oriented", async () => {
  const [manifestText, roundAHtml, roundBHtml] = await Promise.all([
    readFile(path.join(evidenceRoot, "m3-human-review-v2.manifest.json"), "utf8"),
    readFile(path.join(evidenceRoot, "m3-human-review-v2-round-a.html"), "utf8"),
    readFile(path.join(evidenceRoot, "m3-human-review-v2-round-b.html"), "utf8"),
  ]);
  const checked = validateM3HumanReviewManifestV2(manifestText);
  assert.deepEqual(checked.errors, []);
  assert.ok(checked.manifest);
  const manifest = checked.manifest;

  for (const source of manifest.sourceAssets) {
    const absolutePath = path.join(evidenceRoot, source.relativePath);
    const bytes = await readFile(absolutePath);
    assert.equal(sha256(bytes), source.sha256, source.relativePath);
    assert.ok((await stat(absolutePath)).isFile());
  }
  for (const artifact of manifest.artifacts) {
    const absolutePath = path.join(evidenceRoot, artifact.relativePath);
    const bytes = await readFile(absolutePath);
    assert.equal(bytes.byteLength, artifact.bytes, artifact.relativePath);
    assert.equal(sha256(bytes), artifact.sha256, artifact.relativePath);
  }

  assert.equal(new Set(manifest.items.map((item) => item.itemId)).size, 128);
  assert.equal(new Set(manifest.pages.map((page) => page.pageId)).size, 30);
  assert.ok(manifest.pages.every((page) => page.evidencePath.endsWith(".png")));
  assert.ok(manifest.items.every((item) => item.sourceImagePath.startsWith("real-art-assets/")));
  assert.ok(manifest.sourceStatement.includes("真实"));
  assert.ok(!manifestText.includes("synthetic"));

  for (const [round, html] of [["A", roundAHtml], ["B", roundBHtml]] as const) {
    assert.match(html, new RegExp(`data-review-round="${round}"`, "u"));
    assert.ok(html.includes("AIR-QA-COMIC-FINAL-001-v1"));
    assert.ok(html.includes("合格：重点人物和动作完整"));
    assert.ok(html.includes("不合格：裁切破坏主体"));
    assert.ok(html.includes("合格：气泡使用留白"));
    assert.ok(html.includes("不合格：气泡遮挡重点"));
    assert.ok(html.includes("查看未裁切原图"));
    assert.ok(html.includes("从页首阅读（暂时隐藏黄色框）"));
    assert.ok(html.includes("对白与原文一致"));
    assert.ok(!html.includes("group-pass"));
    assert.ok(!html.includes('"state":"pass"'));
  }
});
