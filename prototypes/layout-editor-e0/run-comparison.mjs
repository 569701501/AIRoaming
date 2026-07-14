import { chromium } from "@playwright/test";
import * as fontkit from "fontkit";
import { PNG } from "pngjs";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, realpath, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const prototypeRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(prototypeRoot, "../..");
const runtimeRoot = path.join(prototypeRoot, ".runtime");
const resultRoot = path.join(runtimeRoot, "results");
const markerPath = path.join(runtimeRoot, ".e0-prototype-root");
const cjkFontPath = path.join(runtimeRoot, "fonts/NotoSansCJKsc-Regular.otf");
const interFontPath = path.join(repoRoot, "tests/fixtures/layout/assets/inter-latin-400.woff2");
const expectedCjkSha = "sha256:2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b";
const expectedInterSha = "sha256:27ae72daf88c7431896929273087c99910d019ae82dc0af7d86505c0f5ef5dbf";
const expectedPageGoldenSha = {
  A: "sha256:26c7029eda5af46cea0c1a4b66310ee2472a136f64e28e1a0788a8a2fde3aec4",
  B: "sha256:0d32211b9c045f9e5d4c934610c9969c1eca1db74c724dfa49daf2b398441149",
};
const fixedAssetPaths = {
  asset_fixture_candidate_a: path.join(repoRoot, "tests/fixtures/layout/assets/candidate-a.png"),
  asset_fixture_candidate_b: path.join(repoRoot, "tests/fixtures/layout/assets/candidate-b.png"),
  asset_fixture_candidate_wide: path.join(repoRoot, "tests/fixtures/layout/assets/candidate-wide.png"),
};

await prepareRuntime();
const [cjkBytes, interBytes] = await Promise.all([readFile(cjkFontPath), readFile(interFontPath)]);
assert(sha256(cjkBytes) === expectedCjkSha, "E0_CJK_FONT_SHA_MISMATCH");
assert(sha256(interBytes) === expectedInterSha, "E0_INTER_FONT_SHA_MISMATCH");
const fontCoverage = {
  cjk: inspectCmapCoverage(cjkBytes, ["雨", "の", "夜", "A", "1", "。", "😀"]),
  inter: inspectCmapCoverage(interBytes, ["R", "a", "i", "n", "1", "2", "😀"]),
  policy: "font_cmap_preflight_v1",
};

const python = findPython();
const server = await startServer();
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const browserVersion = browser.version();
const browserExecutable = chromium.executablePath();
const networkAudit = { loopback: 0, blockedExternal: 0, urls: new Set() };
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, serviceWorkers: "block" });
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.hostname === "127.0.0.1" && url.port === String(address.port)) {
    networkAudit.loopback += 1;
    networkAudit.urls.add(`${url.origin}${url.pathname}`);
    await route.continue();
  } else {
    networkAudit.blockedExternal += 1;
    await route.abort("blockedbyclient");
  }
});

const candidates = [];
try {
  for (const routeName of ["A", "B"]) {
    try {
      candidates.push(await evaluateCandidate(routeName));
    } catch (error) {
      candidates.push({ route: routeName, status: "failed", error: serializeError(error), gates: {} });
    }
  }
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

const dependencies = await dependencyReport();
const report = {
  schemaVersion: 1,
  kind: "g5_e0_renderer_comparison_v1",
  question: "Konva+DOM+pinned Chromium or SVG-native+explicit text+resvg for deterministic G5 publication",
  environment: {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    playwrightChromium: browserVersion,
    playwrightBinary: { acquisition: "@playwright/test@1.61.1 managed Chromium", executableName: path.basename(browserExecutable), executableBytes: (await stat(browserExecutable)).size },
    cjkFontSha256: expectedCjkSha,
    interFontSha256: expectedInterSha,
    systemFontsAllowed: false,
    externalNetworkRequests: networkAudit.blockedExternal,
    loopbackRequests: networkAudit.loopback,
  },
  dependencies,
  candidates,
  verdict: decideVerdict(candidates),
};
await writeFile(path.join(resultRoot, "comparison-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!candidates.some((candidate) => candidate.status === "passed")) process.exitCode = 1;

async function evaluateCandidate(routeName) {
  const outputDir = path.join(resultRoot, routeName.toLowerCase());
  await mkdir(outputDir, { recursive: true });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${baseUrl}/?route=${routeName}&mode=page`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.prototypeReady === true);
  await installEmbeddedAssets(page);

  const roundtrip = await page.evaluate(() => window.runRoundtripProbe());
  const ime = await page.evaluate(() => window.runImeProbe());
  const commandHistory = await page.evaluate(() => window.runCommandProbe());
  const replacement = await page.evaluate(() => window.runReplacementProbe());
  const semantic = await page.evaluate(() => window.runSemanticProbe());
  const geometry = await page.evaluate(() => window.runGeometryProbe());
  const browserFont = await page.evaluate(() => window.runFontProbe());
  const font = { ...browserFont, cmap: fontCoverage };
  const performance = await page.evaluate(() => window.runPerformanceProbe());
  performance.browserJsHeapBytes = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);

  const pagePngs = [];
  if (routeName === "A") {
    for (let run = 1; run <= 3; run += 1) {
      const filePath = path.join(outputDir, `page-${run}.png`);
      await page.locator("#formal-scene").screenshot({ path: filePath, animations: "disabled" });
      pagePngs.push(await inspectPng(filePath));
    }
  } else {
    const svg = await page.evaluate(() => window.getPageSvgForResvg());
    await writeFile(path.join(outputDir, "page.svg"), svg, "utf8");
    for (let run = 1; run <= 3; run += 1) {
      const filePath = path.join(outputDir, `page-${run}.png`);
      await writeFile(filePath, renderResvg(svg, `page-${run}`));
      pagePngs.push(await inspectPng(filePath));
    }
  }

  const pdfRuns = [];
  for (let run = 1; run <= 3; run += 1) {
    const rawPath = path.join(outputDir, `page-${run}.raw.pdf`);
    const normalizedPath = path.join(outputDir, `page-${run}.pdf`);
    await page.pdf({ path: rawPath, printBackground: true, width: "1800px", height: "2400px", margin: { top: "0", right: "0", bottom: "0", left: "0" }, preferCSSPageSize: true });
    const normalized = normalizePdf(python, rawPath, normalizedPath);
    const bytes = await readFile(normalizedPath);
    pdfRuns.push({ ...normalized, sha256: sha256(bytes), bytes: bytes.length });
  }

  await page.goto(`${baseUrl}/?route=${routeName}&mode=pdf40`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.prototypeReady === true);
  const capabilityPdfRawPath = path.join(outputDir, "capability-40-pages.raw.pdf");
  const capabilityPdfPath = path.join(outputDir, "capability-40-pages.pdf");
  await page.pdf({ path: capabilityPdfRawPath, printBackground: true, width: "1800px", height: "2400px", margin: { top: "0", right: "0", bottom: "0", left: "0" }, preferCSSPageSize: true });
  const capabilityPdf = normalizePdf(python, capabilityPdfRawPath, capabilityPdfPath);
  capabilityPdf.sha256 = sha256(await readFile(capabilityPdfPath));
  capabilityPdf.bytes = (await stat(capabilityPdfPath)).size;

  const slices = [];
  let slicePlans = [];
  if (routeName === "A") {
    await page.goto(`${baseUrl}/?route=A&mode=strip-full`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.prototypeReady === true);
    slicePlans = await page.evaluate(() => window.getStripSlicePlan());
    for (let index = 0; index < slicePlans.length; index += 1) {
      const filePath = path.join(outputDir, `strip-slice-${index + 1}.png`);
      await page.setViewportSize({ width: 1080, height: slicePlans[index].height });
      await page.evaluate((startY) => scrollTo(0, startY), slicePlans[index].startY);
      await page.screenshot({ path: filePath, animations: "disabled", scale: "css" });
      slices.push(await inspectPng(filePath));
    }
  } else {
    await page.goto(`${baseUrl}/?route=B&mode=page`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.prototypeReady === true);
    await installEmbeddedAssets(page);
    slicePlans = await page.evaluate(() => window.getStripSlicePlan());
    for (let index = 0; index < slicePlans.length; index += 1) {
      const svg = await page.evaluate((value) => window.getStripSvgForResvg(value), index);
      const filePath = path.join(outputDir, `strip-slice-${index + 1}.png`);
      await writeFile(filePath, renderResvg(svg, `strip-slice-${index + 1}`));
      slices.push(await inspectPng(filePath));
    }
  }

  const stitched = await stitchedPixelDigest(outputDir, slices.length);
  const canvasReferences = [];
  if (routeName === "A") {
    await page.goto(`${baseUrl}/?route=A&mode=strip-full`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.prototypeReady === true);
    const canvases = page.locator("#formal-scene > .layout-canvas");
    const canvasCount = await canvases.count();
    for (let index = 0; index < canvasCount; index += 1) {
      const filePath = path.join(outputDir, `strip-canvas-${index + 1}.png`);
      await canvases.nth(index).screenshot({ path: filePath, animations: "disabled" });
      canvasReferences.push(await inspectPng(filePath));
    }
  } else {
    await page.goto(`${baseUrl}/?route=B&mode=page`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.prototypeReady === true);
    await installEmbeddedAssets(page);
    for (let index = 0; index < 20; index += 1) {
      const svg = await page.evaluate((value) => window.getStripCanvasSvgForResvg(value), index);
      const filePath = path.join(outputDir, `strip-canvas-${index + 1}.png`);
      await writeFile(filePath, renderResvg(svg, `strip-canvas-${index + 1}`));
      canvasReferences.push(await inspectPng(filePath));
    }
  }
  const canvasReference = await orderedPixelDigest(outputDir, "strip-canvas", canvasReferences.length);
  performance.nodeRssBytesAfterOutputs = process.memoryUsage().rss;
  await page.close();

  const pngDeterministic = new Set(pagePngs.map((item) => item.sha256)).size === 1;
  const pdfDeterministic = new Set(pdfRuns.map((item) => item.sha256)).size === 1;
  const fontPreflight = font.cmap.cjk.coverage["雨"] && font.cmap.cjk.coverage["の"] && font.cmap.cjk.coverage.A && !font.cmap.cjk.coverage["😀"] && font.cmap.inter.coverage.R && !font.cmap.inter.coverage["😀"];
  const pdfFontsEmbedded = (value) => value.fonts.length > 0 && value.fonts.every((fontRecord) => fontRecord.embedded);
  const gates = {
    roundtrip: roundtrip.equal && roundtrip.panelCount === 4 && roundtrip.hasFreeImage && roundtrip.hasCropFlipRotation && roundtrip.hasBalloon && roundtrip.balloonKinds.join(",") === "caption,shout,speech,thought",
    richTextRangeStyles: roundtrip.richTextStyles.some((item) => item.fontStyle === "italic" && item.fontWeight === 700 && item.stroke?.width === 1 && item.letterSpacing === 2),
    imeUndo: ime.passed,
    commandHistory: commandHistory.commandCount === 100 && commandHistory.undoToStart && commandHistory.redoToEnd,
    staleReplacement: replacement.preserveCrop && replacement.resetCrop && replacement.strategies.join(",") === "preserve_crop,reset_crop",
    browserSemantic: semantic.equal,
    geometry: geometry.withinHalfUnit,
    deterministicPng: pngDeterministic && pagePngs.every((item) => item.width === 1800 && item.height === 2400),
    goldenPixelDiffZero: expectedPageGoldenSha[routeName] !== null && pagePngs.every((item) => item.sha256 === expectedPageGoldenSha[routeName]),
    deterministicPdf: pdfDeterministic && pdfRuns.every((item) => item.pageCount === 1 && item.widthPt === 1350 && item.heightPt === 1800 && item.allMediaBoxesEqual && pdfFontsEmbedded(item)),
    rendererCapabilities: capabilityPdf.pageCount >= 40 && capabilityPdf.widthPt === 1350 && capabilityPdf.heightPt === 1800 && capabilityPdf.allMediaBoxesEqual && pdfFontsEmbedded(capabilityPdf) && slicePlans.some((item) => item.height === 8192),
    stripSlices: slices.length === slicePlans.length && slices.every((item, index) => item.width === 1080 && item.height === slicePlans[index].height) && stitched.width === 1080 && stitched.height === 38400 && canvasReference.width === 1080 && canvasReference.height === 38400 && stitched.pixelDigest === canvasReference.pixelDigest,
    controlledFonts: font.cjk && font.latin && font.missingRejected && fontPreflight,
    performance: performance.canvasCount === 20 && performance.elementCount === 200 && performance.frameP95Ms <= 32 && performance.pointerupCommandMs <= 100,
    noPageErrors: pageErrors.length === 0,
  };
  return {
    route: routeName,
    status: Object.values(gates).every(Boolean) ? "passed" : "failed",
    architecture: routeName === "A"
      ? "Konva interaction adapter + DOM rich text + dedicated HTML RenderScene + pinned Chromium PNG/PDF"
      : "SVG-native adapter + explicit glyph positions + resvg PNG + pinned Chromium PDF comparison",
    roundtrip,
    ime,
    commandHistory,
    replacement,
    semantic: { equal: semantic.equal, itemCount: semantic.formal.length },
    geometry,
    font,
    performance,
    outputs: { pagePngs, pdfRuns, capabilityPdf, slicePlans, slices, stitched, canvasReference, canvasReferences },
    pageErrors,
    gates,
  };
}

function renderResvg(svg, label) {
  const result = spawnSync(process.execPath, [path.join(prototypeRoot, "render-resvg-worker.mjs")], {
    input: svg,
    maxBuffer: 256 * 1024 * 1024,
    encoding: null,
  });
  if (result.status !== 0) {
    const stderr = result.stderr?.toString("utf8").trim().split("\n").slice(0, 4).join(" | ") || `status=${result.status} signal=${result.signal}`;
    throw new Error(`E0_RESVG_RENDER_FAILED:${label}:${stderr}`);
  }
  return result.stdout;
}

async function installEmbeddedAssets(page) {
  const urls = Object.fromEntries(Object.keys(fixedAssetPaths).map((assetId) => [assetId, `${baseUrl}/assets/${path.basename(fixedAssetPaths[assetId])}`]));
  await page.evaluate(async (input) => {
    const embedded = {};
    for (const [assetId, url] of Object.entries(input)) {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      embedded[assetId] = `data:image/png;base64,${btoa(binary)}`;
    }
    window.embeddedAssets = embedded;
  }, urls);
}

async function inspectPng(filePath) {
  const bytes = await readFile(filePath);
  const png = PNG.sync.read(bytes);
  return { file: path.basename(filePath), sha256: sha256(bytes), pixelDigest: sha256(png.data), bytes: bytes.length, width: png.width, height: png.height };
}

async function stitchedPixelDigest(outputDir, count) {
  return orderedPixelDigest(outputDir, "strip-slice", count);
}

async function orderedPixelDigest(outputDir, prefix, count) {
  let width = null;
  let height = 0;
  const hash = createHash("sha256");
  for (let index = 1; index <= count; index += 1) {
    const png = PNG.sync.read(await readFile(path.join(outputDir, `${prefix}-${index}.png`)));
    if (width === null) width = png.width;
    assert(width === png.width, "E0_SLICE_WIDTH_MISMATCH");
    height += png.height;
    hash.update(png.data);
  }
  return { width, height, overlapPx: 0, gapPx: 0, pixelDigest: `sha256:${hash.digest("hex")}` };
}

function normalizePdf(pythonPath, source, target) {
  const result = spawnSync(pythonPath, [path.join(prototypeRoot, "normalize_pdf.py"), source, target], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`E0_PDF_NORMALIZE_FAILED:${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout.trim());
}

function findPython() {
  const candidates = [
    process.env.AIROAMING_E0_PYTHON,
    path.join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"),
    "python3",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["-c", "import pypdf"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("E0_PYTHON_WITH_PYPDF_NOT_FOUND");
}

async function prepareRuntime() {
  await mkdir(runtimeRoot, { recursive: true });
  if (!existsSync(markerPath)) await writeFile(markerPath, "AIROAMING_G5_E0_RUNTIME_V1\n", { flag: "wx", mode: 0o600 });
  assert((await readFile(markerPath, "utf8")) === "AIROAMING_G5_E0_RUNTIME_V1\n", "E0_RUNTIME_MARKER_MISMATCH");
  assert(existsSync(cjkFontPath), "E0_CJK_FONT_MISSING: run the pinned Noto Sans CJK preparation step");
  if (existsSync(resultRoot)) await rm(resultRoot, { recursive: true, force: false });
  await mkdir(resultRoot, { recursive: false });
}

async function startServer() {
  const konvaPath = await realpath(path.join(prototypeRoot, "node_modules/konva/konva.min.js"));
  const roots = {
    "/": path.join(prototypeRoot, "index.html"),
    "/index.html": path.join(prototypeRoot, "index.html"),
    "/app.js": path.join(prototypeRoot, "app.js"),
    "/vendor/konva.min.js": konvaPath,
    "/font/inter.woff2": interFontPath,
    "/font/cjk.otf": cjkFontPath,
  };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://127.0.0.1").pathname;
      let target = roots[pathname];
      if (pathname.startsWith("/fixture/")) target = safeJoin(path.join(repoRoot, "tests/fixtures/layout"), pathname.slice("/fixture/".length));
      if (pathname.startsWith("/assets/")) target = safeJoin(path.join(repoRoot, "tests/fixtures/layout/assets"), pathname.slice("/assets/".length));
      if (!target || !existsSync(target)) { response.writeHead(404); response.end("not found"); return; }
      response.writeHead(200, { "content-type": mimeType(target), "cache-control": "no-store" });
      createReadStream(target).pipe(response);
    } catch (error) {
      response.writeHead(500); response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
}

function safeJoin(root, relative) {
  const resolved = path.resolve(root, relative);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("E0_STATIC_PATH_ESCAPE");
  return resolved;
}

function mimeType(target) {
  const ext = path.extname(target);
  return ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".otf": "font/otf" })[ext] ?? "application/octet-stream";
}

async function dependencyReport() {
  const packages = [];
  for (const name of ["konva", "@resvg/resvg-js", "fontkit", "pngjs", "@playwright/test"]) {
    const packagePath = await locatePackageJson(name);
    const value = JSON.parse(await readFile(packagePath, "utf8"));
    const packageRoot = path.dirname(packagePath);
    const licenseFiles = (await readdir(packageRoot)).filter((file) => /^licen[cs]e/i.test(file));
    const packageBytes = await sumFiles(packageRoot);
    packages.push({ name, version: value.version, license: value.license ?? "unknown", installedBytes: packageBytes, licenseFiles });
  }
  const nativeResvgRoot = (await readdir(path.join(repoRoot, "node_modules/.pnpm"), { withFileTypes: true }))
    .find((entry) => entry.isDirectory() && entry.name.startsWith(`@resvg+resvg-js-${process.platform}-${process.arch}@2.6.2`));
  if (nativeResvgRoot) {
    const root = path.join(repoRoot, "node_modules/.pnpm", nativeResvgRoot.name);
    packages.push({ name: `@resvg/resvg-js-${process.platform}-${process.arch}`, version: "2.6.2", license: "MPL-2.0", installedBytes: await sumFiles(root), licenseFiles: ["inherited from @resvg/resvg-js"] });
  }
  packages.push({ name: "Noto Sans CJK SC", version: "main@sha256-pinned", license: "OFL-1.1", installedBytes: (await stat(cjkFontPath)).size, licenseSource: "https://github.com/notofonts/noto-cjk" });
  return packages;
}

async function locatePackageJson(name) {
  const packageRoot = path.join(prototypeRoot, "node_modules", ...name.split("/"));
  return path.join(await realpath(packageRoot), "package.json");
}

async function sumFiles(root) {
  let total = 0;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) total += await sumFiles(target);
    else if (entry.isFile()) total += (await stat(target)).size;
  }
  return total;
}

function decideVerdict(values) {
  const passed = values.filter((item) => item.status === "passed").map((item) => item.route);
  if (passed.includes("A")) return { status: "candidate_available", recommendedRoute: "A", reason: "A passes all E0 gates and keeps complex CJK layout in pinned Chromium; B remains comparison evidence." };
  if (passed.includes("B")) return { status: "candidate_available", recommendedRoute: "B", reason: "B passes all E0 gates while A does not." };
  return { status: "blocked", recommendedRoute: null, reason: "No candidate passes all hard gates." };
}

function inspectCmapCoverage(bytes, characters) {
  const font = fontkit.create(bytes);
  const codePoints = new Set(font.characterSet);
  const coverage = Object.fromEntries(characters.map((character) => [character, codePoints.has(character.codePointAt(0))]));
  return { parser: "fontkit@2.0.4", postscriptName: font.postscriptName, glyphCount: font.numGlyphs, coverage };
}

function sha256(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function assert(condition, code) { if (!condition) throw new Error(code); }
function serializeError(error) { return error instanceof Error ? { name: error.name, message: error.message, stack: error.stack?.split("\n").slice(0, 5) } : { message: String(error) }; }
