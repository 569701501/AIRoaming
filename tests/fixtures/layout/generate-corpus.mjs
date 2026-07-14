import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const assetRoot = path.join(fixtureRoot, "assets");
const repoRoot = path.resolve(fixtureRoot, "../../..");
const require = createRequire(path.join(repoRoot, "apps/server/package.json"));

const SOURCE_DATE = "2026-07-15T00:00:00.000Z";
const FONT_ID = "asset_font_inter_latin_400";
const FALLBACK_FONT_ID = "asset_font_cjk_pending_e0";
const INTER_SHA256 = "sha256:27ae72daf88c7431896929273087c99910d019ae82dc0af7d86505c0f5ef5dbf";

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function digest(value) {
  return sha256(Buffer.from(canonical(value), "utf8"));
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function makePng(width, height, pixel) {
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const offset = 1 + x * 4;
      row[offset] = r;
      row[offset + 1] = g;
      row[offset + 2] = b;
      row[offset + 3] = a;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function transform(x, y, width, height, rotation = 0, opacity = 1) {
  return { x, y, width, height, rotation, opacity };
}

function source(shotNumber, assetName = "candidate-a") {
  const suffix = String(shotNumber).padStart(3, "0");
  const asset = generatedAssets.get(assetName);
  const unsigned = {
    schemaVersion: 1,
    role: "candidate_image",
    shotId: `shot_${suffix}`,
    candidateId: `candidate_${suffix}_${assetName.at(-1)}`,
    candidateLockRevisionId: `lockrev_${suffix}_${assetName.at(-1)}`,
    assetId: asset.id,
    assetSha256: asset.sha256,
  };
  return {
    shotId: unsigned.shotId,
    candidateId: unsigned.candidateId,
    candidateLockRevisionId: unsigned.candidateLockRevisionId,
    assetId: unsigned.assetId,
    sourceDigest: digest(unsigned),
  };
}

function crop(overrides = {}) {
  return { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false, ...overrides };
}

function panel(id, shotNumber, frame, options = {}) {
  return {
    id,
    type: "panel_frame",
    name: options.name ?? `Panel ${shotNumber}`,
    transform: frame,
    locked: false,
    hidden: false,
    shape: { kind: options.cornerRadius ? "rounded_rect" : "rect", cornerRadius: options.cornerRadius ?? 0 },
    border: { visible: true, color: "#111827FF", width: options.borderWidth ?? 8 },
    contentImage: {
      id: `${id}_image`,
      type: "image",
      placement: "panel_content",
      name: `${id} source`,
      locked: false,
      hidden: false,
      source: source(shotNumber, options.assetName ?? "candidate-a"),
      crop: crop(options.crop),
    },
  };
}

function richText(text, options = {}) {
  return {
    schemaVersion: 1,
    writingMode: options.writingMode ?? "horizontal-tb",
    textOrientation: options.textOrientation ?? "mixed",
    paragraphs: [{
      align: options.align ?? "center",
      lineHeight: options.lineHeight ?? 1.35,
      runs: [{
        text,
        fontAssetId: options.fontAssetId ?? FONT_ID,
        fontSize: options.fontSize ?? 48,
        fontWeight: options.fontWeight ?? 400,
        fontStyle: options.fontStyle ?? "normal",
        color: options.color ?? "#111827FF",
        letterSpacing: options.letterSpacing ?? 0,
        stroke: options.stroke ?? null,
      }],
    }],
  };
}

function textElement(id, value, frame, options = {}) {
  return {
    id,
    type: "text",
    name: options.name ?? id,
    transform: frame,
    locked: false,
    hidden: false,
    semantic: options.semantic ?? "custom",
    verticalAlign: options.verticalAlign ?? "center",
    richText: richText(value, options),
  };
}

function balloon(id, kind, value, frame, options = {}) {
  return {
    id,
    type: "balloon",
    name: `${kind} balloon`,
    transform: frame,
    locked: false,
    hidden: false,
    balloonKind: kind,
    sourceShotId: options.sourceShotId ?? null,
    speakerCharacterId: options.speakerCharacterId ?? null,
    fillColor: "#FFFFFFFF",
    strokeColor: "#111827FF",
    strokeWidth: 6,
    padding: { top: 28, right: 32, bottom: 28, left: 32 },
    verticalAlign: "center",
    tail: {
      enabled: kind !== "caption",
      rootRatio: options.rootRatio ?? 0.55,
      targetX: options.targetX ?? frame.width * 0.2,
      targetY: options.targetY ?? frame.height + 80,
      baseWidth: 30,
    },
    richText: richText(value, options),
  };
}

function pageDocument(id, canvases, direction = "ltr_ttb") {
  return {
    schemaVersion: 1,
    kind: "layout_document_v1",
    projectId: `project_${id}`,
    chapterId: `chapter_${id}`,
    comicFormat: "paged_comic",
    profile: {
      kind: "paged",
      presetId: "portrait_3_4",
      width: 1800,
      height: 2400,
      safeArea: { top: 72, right: 72, bottom: 72, left: 72 },
      panelReadingDirection: direction,
    },
    fontPolicy: { defaultFontAssetId: FONT_ID, fallbackFontAssetIds: [FALLBACK_FONT_ID] },
    canvases,
  };
}

function stripDocument(id, canvases) {
  return {
    schemaVersion: 1,
    kind: "layout_document_v1",
    projectId: `project_${id}`,
    chapterId: `chapter_${id}`,
    comicFormat: "vertical_scroll",
    profile: {
      kind: "vertical_strip",
      presetId: "webtoon_1080",
      width: 1080,
      defaultSectionHeight: 1920,
      safeInsetX: 54,
    },
    fontPolicy: { defaultFontAssetId: FONT_ID, fallbackFontAssetIds: [FALLBACK_FONT_ID] },
    canvases,
  };
}

function publicationProfile(document) {
  return document.comicFormat === "paged_comic"
    ? { schemaVersion: 1, kind: "paged_publication", outputScale: 1, includePdf: true, pdfPixelDpi: 96 }
    : { schemaVersion: 1, kind: "vertical_publication", outputScale: 1, maxSliceHeightPx: 8192, cutPolicy: "prefer_section_boundary_then_exact", includeLongPng: false };
}

function collectSources(document) {
  const values = [];
  for (const canvas of document.canvases) {
    for (const element of canvas.elements) {
      if (element.type === "panel_frame" && element.contentImage) values.push(element.contentImage.source);
      if (element.type === "free_image") values.push(element.source);
    }
  }
  return values;
}

function buildFixture(fixtureId, document, options = {}) {
  const sources = collectSources(document);
  const documentDigest = digest(document);
  const sourceLocks = [...new Map(sources.map((item) => [item.shotId, {
    shotId: item.shotId,
    candidateLockRevisionId: item.candidateLockRevisionId,
  }])).values()].sort((left, right) => left.shotId.localeCompare(right.shotId));
  const sourceLockSetDigest = digest(sourceLocks);
  const profile = publicationProfile(document);
  const profileDigest = digest(profile);
  const usedImageIds = new Set(sources.map((item) => item.assetId));
  const assetManifest = {
    schemaVersion: 1,
    images: [...generatedAssets.values()].filter((asset) => usedImageIds.has(asset.id)).map((asset) => ({
      assetId: asset.id,
      role: "candidate_image",
      relativePath: `assets/${asset.fileName}`,
      mimeType: "image/png",
      sha256: asset.sha256,
      bytes: asset.bytes,
      width: asset.width,
      height: asset.height,
    })),
    fonts: [fontAsset, pendingCjkFont],
  };
  const assetManifestDigest = digest(assetManifest);
  const unsignedRenderPlan = {
    schemaVersion: 1,
    documentDigest,
    sourceLockSetDigest,
    profileDigest,
    rendererPolicyVersion: "layout_render_policy_v1",
    canvases: document.canvases.map((canvas, index) => ({
      canvasId: canvas.id,
      order: index + 1,
      width: canvas.width,
      height: canvas.height,
      elementIds: canvas.elements.map((element) => element.id),
    })),
    assets: assetManifest,
    diagnostics: options.expectedPreflightIssues ?? [],
  };
  const renderPlan = { ...unsignedRenderPlan, renderPlanDigest: digest(unsignedRenderPlan) };
  return {
    fixtureSchemaVersion: 1,
    fixtureId,
    sourceDate: SOURCE_DATE,
    document,
    expected: {
      documentDigest,
      sourceLockSetDigest,
      profile,
      profileDigest,
      assetManifest,
      assetManifestDigest,
      renderPlan,
      renderPlanDigest: renderPlan.renderPlanDigest,
      browserSemanticSnapshot: {
        status: "red",
        reasonCode: "G5_PRODUCTION_BROWSER_SEMANTICS_NOT_IMPLEMENTED",
        expectedCoverage: options.semanticCoverage ?? [],
      },
      outputs: {
        status: "red",
        reasonCode: "G5_PRODUCTION_RENDERER_NOT_IMPLEMENTED",
        artifacts: [],
      },
      preflightIssues: options.expectedPreflightIssues ?? [],
    },
  };
}

await mkdir(assetRoot, { recursive: true });

const imageDefinitions = [
  ["candidate-a", "asset_fixture_candidate_a", "candidate-a.png", 96, 96, (x, y) => ((x + y) % 16 < 8 ? [36, 99, 235, 255] : [191, 219, 254, 255])],
  ["candidate-b", "asset_fixture_candidate_b", "candidate-b.png", 96, 96, (x, y) => (x < y ? [244, 63, 94, 255] : [254, 205, 211, 255])],
  ["candidate-wide", "asset_fixture_candidate_wide", "candidate-wide.png", 144, 96, (x, y) => (x % 24 < 12 ? [5, 150, 105, 255] : [167, 243, 208, 255])],
];

const generatedAssets = new Map();
for (const [name, id, fileName, width, height, pixel] of imageDefinitions) {
  const bytes = makePng(width, height, pixel);
  await writeFile(path.join(assetRoot, fileName), bytes);
  generatedAssets.set(name, { name, id, fileName, width, height, bytes: bytes.length, sha256: sha256(bytes) });
}

const prismaPackagePath = require.resolve("prisma/package.json");
const prismaPackage = JSON.parse(await readFile(prismaPackagePath, "utf8"));
const interSource = path.join(path.dirname(prismaPackagePath), "build/public/assets/inter-latin-400-normal.27ae72da.woff2");
const interBytes = await readFile(interSource);
if (sha256(interBytes) !== INTER_SHA256) throw new Error("G5_FIXTURE_INTER_SHA_MISMATCH");
await writeFile(path.join(assetRoot, "inter-latin-400.woff2"), interBytes);

const fontAsset = {
  assetId: FONT_ID,
  role: "font",
  relativePath: "assets/inter-latin-400.woff2",
  mimeType: "font/woff2",
  sha256: INTER_SHA256,
  bytes: interBytes.length,
  metadata: {
    schemaVersion: 1,
    kind: "layout_font_asset_v1",
    familyName: "Inter",
    postScriptName: "Inter-Regular",
    faceName: "Regular",
    format: "woff2",
    weightMin: 400,
    weightMax: 400,
    style: "normal",
    cmapDigest: digest({ unicodeRanges: ["U+0000-00FF", "U+0100-024F"] }),
    license: {
      spdxId: "OFL-1.1",
      source: "https://github.com/rsms/inter/blob/master/LICENSE.txt",
      embeddingAllowed: true,
    },
    fixtureSource: { package: "prisma", version: prismaPackage.version, expectedSha256: INTER_SHA256 },
  },
};

const pendingCjkFont = {
  assetId: FALLBACK_FONT_ID,
  role: "font",
  status: "red",
  reasonCode: "G5_PRODUCTION_CJK_FONT_ASSET_NOT_PROVISIONED",
  selectedFamilyName: "Noto Sans CJK SC",
  selectedPostScriptName: "NotoSansCJKsc-Regular",
  e0Sha256: "sha256:2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b",
  license: { spdxId: "OFL-1.1", source: "https://github.com/notofonts/noto-cjk", embeddingAllowed: true },
  requiredCoverage: ["simplified_chinese", "japanese", "emoji_missing_glyph_case"],
};

const fourPanels = [
  panel("panel_001", 1, transform(72, 72, 792, 1000), { assetName: "candidate-a" }),
  panel("panel_002", 2, transform(936, 72, 792, 1000), { assetName: "candidate-b" }),
  panel("panel_003", 3, transform(72, 1144, 792, 1000), { assetName: "candidate-wide" }),
  panel("panel_004", 4, transform(936, 1144, 792, 1000), { assetName: "candidate-a" }),
];
const fixtures = [];
fixtures.push(buildFixture("paged-four-panel-rich-text", pageDocument("paged_four_panel_rich_text", [{
  id: "canvas_page_001", kind: "page", name: "Page 1", width: 1800, height: 2400,
  backgroundColor: "#FFFFFFFF", panelReadingOrder: fourPanels.map((item) => item.id),
  elements: [...fourPanels, textElement("text_title", "RAIN STATION", transform(300, 1040, 1200, 140), { semantic: "title", fontSize: 54, fontWeight: 700 })],
}]), { semanticCoverage: ["four_panels", "horizontal_rich_text", "layer_order"] }));

fixtures.push(buildFixture("paged-rtl-reading-order", pageDocument("paged_rtl_reading_order", [{
  id: "canvas_page_rtl", kind: "page", name: "RTL Page", width: 1800, height: 2400,
  backgroundColor: "#FFFFFFFF", panelReadingOrder: ["panel_rtl_004", "panel_rtl_003", "panel_rtl_002", "panel_rtl_001"],
  elements: [
    panel("panel_rtl_001", 1, transform(72, 72, 792, 1000), { assetName: "candidate-a" }),
    panel("panel_rtl_002", 2, transform(936, 72, 792, 1000), { assetName: "candidate-b" }),
    panel("panel_rtl_003", 3, transform(72, 1144, 792, 1000), { assetName: "candidate-wide" }),
    panel("panel_rtl_004", 4, transform(936, 1144, 792, 1000), { assetName: "candidate-a" }),
  ],
}], "rtl_ttb"), { semanticCoverage: ["rtl_panel_reading_order", "visual_order_independence"] }));

const longSections = Array.from({ length: 20 }, (_, canvasIndex) => {
  const sectionNumber = canvasIndex + 1;
  const elements = Array.from({ length: 10 }, (_, elementIndex) => {
    const column = elementIndex % 2;
    const row = Math.floor(elementIndex / 2);
    return panel(`panel_long_${String(sectionNumber).padStart(2, "0")}_${String(elementIndex + 1).padStart(2, "0")}`, sectionNumber * 10 + elementIndex, transform(54 + column * 498, 54 + row * 360, 474, 324), { assetName: elementIndex % 3 === 0 ? "candidate-wide" : elementIndex % 2 === 0 ? "candidate-b" : "candidate-a", borderWidth: 4 });
  });
  return {
    id: `canvas_strip_${String(sectionNumber).padStart(2, "0")}`,
    kind: "strip_section", name: `Section ${sectionNumber}`, width: 1080, height: 1920,
    backgroundColor: "#FFFFFFFF", panelReadingOrder: elements.map((item) => item.id), elements,
  };
});
fixtures.push(buildFixture("vertical-long-20-sections", stripDocument("vertical_long_20_sections", longSections), { semanticCoverage: ["20_canvases", "200_elements", "slice_boundaries", "performance_scale"] }));

fixtures.push(buildFixture("vertical-rich-text-mixed", stripDocument("vertical_rich_text_mixed", [{
  id: "canvas_vertical_text", kind: "strip_section", name: "Mixed text", width: 1080, height: 1920,
  backgroundColor: "#FFFFFFFF", panelReadingOrder: ["panel_vertical_text"], elements: [
    panel("panel_vertical_text", 1, transform(54, 54, 972, 1812), { assetName: "candidate-wide" }),
    textElement("text_horizontal", "Rain 12:30", transform(100, 120, 700, 160), { fontSize: 52 }),
    textElement("text_vertical", "雨の夜 A12", transform(820, 180, 160, 960), { writingMode: "vertical-rl", textOrientation: "mixed", fontAssetId: FALLBACK_FONT_ID, fontSize: 48 }),
  ],
}]), { semanticCoverage: ["horizontal_text", "vertical_rl_text", "mixed_orientation", "cjk_missing_glyph_red"], expectedPreflightIssues: [{ code: "FONT_ASSET_PENDING", severity: "error", targetId: FALLBACK_FONT_ID }] }));

fixtures.push(buildFixture("balloons-all-kinds", pageDocument("balloons_all_kinds", [{
  id: "canvas_balloons", kind: "page", name: "Balloons", width: 1800, height: 2400,
  backgroundColor: "#FFFFFFFF", panelReadingOrder: ["panel_balloons"], elements: [
    panel("panel_balloons", 1, transform(72, 72, 1656, 2256), { assetName: "candidate-a" }),
    balloon("balloon_speech", "speech", "Stay close.", transform(160, 180, 600, 360), { sourceShotId: "shot_001" }),
    balloon("balloon_thought", "thought", "Too quiet...", transform(980, 180, 600, 360)),
    balloon("balloon_shout", "shout", "RUN!", transform(180, 1440, 600, 420), { fontWeight: 700, fontSize: 64 }),
    balloon("balloon_caption", "caption", "Earlier that night", transform(920, 1640, 650, 280)),
  ],
}]), { semanticCoverage: ["speech", "thought", "shout", "caption", "single_tail"] }));

fixtures.push(buildFixture("crop-rotate-flip", pageDocument("crop_rotate_flip", [{
  id: "canvas_crop", kind: "page", name: "Crop and transform", width: 1800, height: 2400,
  backgroundColor: "#FFFFFFFF", panelReadingOrder: ["panel_crop"], elements: [
    panel("panel_crop", 1, transform(120, 160, 1100, 1500, -7), { assetName: "candidate-wide", cornerRadius: 48, crop: { zoom: 1.35, offsetX: 42, offsetY: -18, rotation: 12, flipX: true } }),
    {
      id: "free_image_crop", type: "free_image", name: "Floating source",
      transform: transform(980, 1240, 650, 820, 18, 0.85), locked: false, hidden: false,
      source: source(2, "candidate-b"), display: { mode: "cover", crop: crop({ zoom: 1.2, offsetX: -24, offsetY: 16, rotation: -9, flipY: true }) },
    },
  ],
}]), { semanticCoverage: ["panel_crop", "free_image", "rotation", "flip_x", "flip_y", "layer_overlap"] }));

const staleDocumentA = stripDocument("stale_source_a_to_b", [{
  id: "canvas_stale", kind: "strip_section", name: "Stale replacement", width: 1080, height: 1920,
  backgroundColor: "#FFFFFFFF", panelReadingOrder: ["panel_stale"], elements: [panel("panel_stale", 1, transform(54, 54, 972, 1812), { assetName: "candidate-a", crop: { zoom: 1.1, offsetX: 10 } })],
}]);
fixtures.push(buildFixture("stale-source-a-to-b", staleDocumentA, {
  semanticCoverage: ["source_a_current", "source_b_replacement", "preserve_normalized_crop", "reset_cover"],
  expectedPreflightIssues: [{ code: "LAYOUT_SOURCE_STALE", severity: "error", targetId: "panel_stale_image", replacementAssetId: generatedAssets.get("candidate-b").id }],
}));

fixtures.push(buildFixture("preflight-errors", pageDocument("preflight_errors", [{
  id: "canvas_preflight", kind: "page", name: "Preflight errors", width: 1800, height: 2400,
  backgroundColor: "#FFFFFFFF", panelReadingOrder: ["panel_preflight"], elements: [
    panel("panel_preflight", 1, transform(-220, 80, 900, 1600), { assetName: "candidate-a" }),
    textElement("text_overflow", "This deliberately long line must overflow the small box.", transform(1500, 2200, 120, 80), { fontSize: 72 }),
    textElement("text_missing_cjk_font", "字体缺失", transform(200, 1900, 600, 300), { fontAssetId: FALLBACK_FONT_ID, fontSize: 64 }),
  ],
}]), {
  semanticCoverage: ["text_overflow", "object_outside_canvas", "font_missing", "low_resolution"],
  expectedPreflightIssues: [
    { code: "TEXT_OVERFLOW", severity: "warning", targetId: "text_overflow" },
    { code: "ELEMENT_OUTSIDE_CANVAS", severity: "warning", targetId: "panel_preflight" },
    { code: "FONT_ASSET_PENDING", severity: "error", targetId: FALLBACK_FONT_ID },
    { code: "IMAGE_EFFECTIVE_RESOLUTION_LOW", severity: "warning", targetId: "panel_preflight_image" },
  ],
}));

for (const fixture of fixtures) {
  await writeFile(path.join(fixtureRoot, `${fixture.fixtureId}.json`), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
}

const corpusManifestUnsigned = {
  schemaVersion: 1,
  kind: "g5_layout_fixture_corpus_v1",
  sourceDate: SOURCE_DATE,
  fixtures: fixtures.map((fixture) => ({
    fixtureId: fixture.fixtureId,
    path: `${fixture.fixtureId}.json`,
    documentDigest: fixture.expected.documentDigest,
    sourceLockSetDigest: fixture.expected.sourceLockSetDigest,
    profileDigest: fixture.expected.profileDigest,
    renderPlanDigest: fixture.expected.renderPlanDigest,
    assetManifestDigest: fixture.expected.assetManifestDigest,
    outputStatus: fixture.expected.outputs.status,
  })),
  assets: {
    images: [...generatedAssets.values()].map(({ name, ...asset }) => ({ fixtureName: name, ...asset, bytes: asset.bytes })),
    fonts: [fontAsset, pendingCjkFont],
  },
  redGates: [
    { id: "G5-M0-RED-001", scope: "render", code: "G5_PRODUCTION_RENDERER_NOT_IMPLEMENTED", ownerMilestone: "G5-M7" },
    { id: "G5-M0-RED-002", scope: "render", code: "G5_PRODUCTION_BROWSER_SEMANTICS_NOT_IMPLEMENTED", ownerMilestone: "G5-M7" },
    { id: "G5-M0-RED-004", scope: "migration", code: "G5_LEGACY_LAYOUT_MIGRATION_NOT_IMPLEMENTED", ownerMilestone: "G5-M8" },
    { id: "G5-M0-RED-005", scope: "e2e", code: "G5_EDITOR_VERTICAL_SLICES_NOT_IMPLEMENTED", ownerMilestone: "G5-M3_TO_M8" },
  ],
};
const corpusManifest = { ...corpusManifestUnsigned, corpusDigest: digest(corpusManifestUnsigned) };
await writeFile(path.join(fixtureRoot, "corpus.manifest.json"), `${JSON.stringify(corpusManifest, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({ fixtures: fixtures.length, corpusDigest: corpusManifest.corpusDigest })}\n`);
