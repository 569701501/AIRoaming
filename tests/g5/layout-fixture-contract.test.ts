import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { digestCanonicalJson } from "../../packages/shared/src/versioning/canonical-json.ts";
import { G5_E2E_VERTICAL_SLICES } from "../e2e/g5/g5-e2e-contract.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = path.join(repoRoot, "tests/fixtures/layout");

async function json(relativePath: string): Promise<any> {
  return JSON.parse(await readFile(path.join(fixtureRoot, relativePath), "utf8"));
}

function sha256(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

test("G5-M0 corpus has eight named fixtures and immutable known-answer digests", async () => {
  const manifest = await json("corpus.manifest.json");
  const expectedNames = [
    "paged-four-panel-rich-text",
    "paged-rtl-reading-order",
    "vertical-long-20-sections",
    "vertical-rich-text-mixed",
    "balloons-all-kinds",
    "crop-rotate-flip",
    "stale-source-a-to-b",
    "preflight-errors",
  ];
  assert.deepEqual(manifest.fixtures.map((item: any) => item.fixtureId), expectedNames);
  for (const entry of manifest.fixtures) {
    const fixture = await json(entry.path);
    assert.equal(fixture.fixtureId, entry.fixtureId);
    assert.equal(digestCanonicalJson(fixture.document), entry.documentDigest);
    assert.equal(digestCanonicalJson(fixture.expected.profile), entry.profileDigest);
    assert.equal(digestCanonicalJson(fixture.expected.assetManifest), entry.assetManifestDigest);
    const { renderPlanDigest, ...unsignedRenderPlan } = fixture.expected.renderPlan;
    assert.equal(digestCanonicalJson(unsignedRenderPlan), entry.renderPlanDigest);
    assert.equal(renderPlanDigest, entry.renderPlanDigest);
    assert.deepEqual(fixture.expected.outputs, {
      status: "red",
      reasonCode: "G5_PRODUCTION_RENDERER_NOT_IMPLEMENTED",
      artifacts: [],
    });
  }
});

test("G5-M0 fixture bytes are local, hashed, decodable PNG or pinned WOFF2", async () => {
  const manifest = await json("corpus.manifest.json");
  for (const asset of manifest.assets.images) {
    const bytes = await readFile(path.join(fixtureRoot, "assets", asset.fileName));
    assert.equal(sha256(bytes), asset.sha256);
    assert.equal(bytes.readUInt32BE(0), 0x89504e47);
    assert.equal(bytes.readUInt32BE(16), asset.width);
    assert.equal(bytes.readUInt32BE(20), asset.height);
  }
  const readyFonts = manifest.assets.fonts.filter((font: any) => !font.status);
  assert.equal(readyFonts.length, 1);
  for (const font of readyFonts) {
    const bytes = await readFile(path.join(fixtureRoot, font.relativePath));
    assert.equal(sha256(bytes), font.sha256);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "wOF2");
    assert.equal(font.metadata.license.spdxId, "OFL-1.1");
    assert.equal(font.metadata.license.embeddingAllowed, true);
  }
});

test("G5-M0 performance and E2E vertical-slice contracts are explicit, never skipped", async () => {
  const fixture = await json("vertical-long-20-sections.json");
  assert.equal(fixture.document.canvases.length, 20);
  assert.equal(fixture.document.canvases.reduce((sum: number, canvas: any) => sum + canvas.elements.length, 0), 200);
  assert.deepEqual(G5_E2E_VERTICAL_SLICES.map((item) => item.specFile), [
    "g5-page-editor.spec.ts",
    "g5-strip-editor.spec.ts",
    "g5-repair-and-recovery.spec.ts",
    "g5-mobile-and-ai.spec.ts",
  ]);
  assert.ok(G5_E2E_VERTICAL_SLICES.every((item) => item.status === "red"));
});
