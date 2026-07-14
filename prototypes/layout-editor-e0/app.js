const params = new URLSearchParams(location.search);
const route = params.get("route") ?? "A";
const mode = params.get("mode") ?? "page";
const sliceIndex = Number(params.get("slice") ?? 0);
const SCALE = 0.25;
const MAX_SLICE_HEIGHT = 8192;
const assetPaths = {
  asset_fixture_candidate_a: "/assets/candidate-a.png",
  asset_fixture_candidate_b: "/assets/candidate-b.png",
  asset_fixture_candidate_wide: "/assets/candidate-wide.png",
};

const fixtureNames = [
  "paged-four-panel-rich-text",
  "crop-rotate-flip",
  "balloons-all-kinds",
  "vertical-rich-text-mixed",
  "vertical-long-20-sections",
  "stale-source-a-to-b",
];

const fixtures = Object.fromEntries(await Promise.all(fixtureNames.map(async (name) => {
  const response = await fetch(`/fixture/${name}.json`);
  if (!response.ok) throw new Error(`fixture ${name} failed: ${response.status}`);
  return [name, await response.json()];
})));

const pageDocument = buildPageDocument();
const stripDocument = fixtures["vertical-long-20-sections"].document;
document.body.dataset.mode = mode;
await document.fonts.ready;
await Promise.all(Object.values(assetPaths).map(loadImage));

if (mode === "page") {
  renderInteraction(route, pageDocument);
  renderFormalPage(route, pageDocument, document.querySelector("#formal-scene"));
  renderFormalPage(route, pageDocument, document.querySelector("#semantic-working"));
} else if (mode === "strip") {
  renderStripSlice(route, stripDocument, sliceIndex, document.querySelector("#formal-scene"));
  document.querySelector("#interaction").remove();
  document.querySelector("#semantic-working").remove();
} else if (mode === "strip-full") {
  renderFullStrip(route, stripDocument, document.querySelector("#formal-scene"));
  document.querySelector("#interaction").remove();
  document.querySelector("#semantic-working").remove();
} else if (mode === "pdf40") {
  renderPdfPages(route, pageDocument, 40, document.querySelector("#formal-scene"));
  document.querySelector("#interaction").remove();
  document.querySelector("#semantic-working").remove();
}

document.querySelector("#status").textContent = `route ${route} / ${mode}${mode === "strip" ? ` / slice ${sliceIndex}` : ""}`;
window.prototypeReady = true;
window.prototypeState = { route, mode, sliceIndex, pageDocument, stripDocument };
window.runRoundtripProbe = () => roundtripProbe(route, pageDocument);
window.runImeProbe = runImeProbe;
window.runCommandProbe = runCommandProbe;
window.runReplacementProbe = runReplacementProbe;
window.runPerformanceProbe = () => runPerformanceProbe(route);
window.runSemanticProbe = () => semanticProbe(route);
window.runGeometryProbe = () => geometryProbe(route);
window.runFontProbe = async () => {
  let missingRejected = false;
  try { await new FontFace("AIR Missing E0", "url(/font/not-found.otf)").load(); } catch { missingRejected = true; }
  return {
    cjk: document.fonts.check('48px "Noto Sans CJK SC"', "雨の夜"),
    latin: document.fonts.check('48px "Inter"', "Rain 12:30"),
    missingRejected,
  };
};
window.getPageSvgForResvg = () => svgDocument(pageDocument, true);
window.getStripSvgForResvg = (index) => svgStripSlice(stripDocument, index, true);
window.getFullStripSvgForResvg = () => svgFullStrip(stripDocument, true);
window.getStripCanvasSvgForResvg = (index) => svgCanvas(stripDocument.canvases[index], true);
window.getStripSlicePlan = () => stripSlicePlan(stripDocument);

function buildPageDocument() {
  const base = structuredClone(fixtures["paged-four-panel-rich-text"].document);
  const cropElements = fixtures["crop-rotate-flip"].document.canvases[0].elements;
  const balloons = fixtures["balloons-all-kinds"].document.canvases[0].elements.filter((item) => item.type === "balloon");
  const verticalText = fixtures["vertical-rich-text-mixed"].document.canvases[0].elements.find((item) => item.id === "text_vertical");
  const canvas = base.canvases[0];
  const freeImage = structuredClone(cropElements.find((item) => item.type === "free_image"));
  freeImage.id = "free_image_e0";
  freeImage.name = "E0 floating crop";
  freeImage.transform = { x: 1110, y: 840, width: 520, height: 680, rotation: 18, opacity: 0.86 };
  const balloonTransforms = {
    speech: { x: 100, y: 1580, width: 520, height: 300, rotation: -4, opacity: 1 },
    thought: { x: 1120, y: 160, width: 520, height: 300, rotation: 3, opacity: 1 },
    shout: { x: 110, y: 1880, width: 480, height: 320, rotation: 2, opacity: 1 },
    caption: { x: 1040, y: 1980, width: 620, height: 220, rotation: 0, opacity: 1 },
  };
  const e0Balloons = balloons.map((source) => {
    const balloon = structuredClone(source);
    balloon.id = `balloon_e0_${balloon.balloonKind}`;
    balloon.transform = balloonTransforms[balloon.balloonKind];
    return balloon;
  });
  const vertical = structuredClone(verticalText);
  vertical.id = "text_vertical_e0";
  vertical.transform = { x: 1500, y: 1380, width: 160, height: 820, rotation: 0, opacity: 1 };
  vertical.richText.paragraphs[0].runs[0].fontAssetId = "asset_font_cjk_e0";
  canvas.elements.find((item) => item.id === "text_title").richText.paragraphs[0].runs = [
    { text: "RAIN ", fontAssetId: "asset_font_inter_latin_400", fontSize: 54, fontWeight: 400, fontStyle: "normal", color: "#111827FF", letterSpacing: 0, stroke: null },
    { text: "雨", fontAssetId: "asset_font_cjk_e0", fontSize: 64, fontWeight: 700, fontStyle: "italic", color: "#DC2626FF", letterSpacing: 2, stroke: { color: "#7F1D1DFF", width: 1 } },
    { text: " STATION", fontAssetId: "asset_font_inter_latin_400", fontSize: 48, fontWeight: 700, fontStyle: "normal", color: "#1D4ED8FF", letterSpacing: 1, stroke: null },
  ];
  canvas.elements.push(freeImage, ...e0Balloons, vertical);
  base.fontPolicy = { defaultFontAssetId: "asset_font_inter_latin_400", fallbackFontAssetIds: ["asset_font_cjk_e0"] };
  return base;
}

function renderInteraction(candidate, layoutDocument) {
  const container = document.querySelector("#interaction");
  container.replaceChildren();
  const canvas = layoutDocument.canvases[0];
  if (candidate === "A") {
    const stage = new Konva.Stage({ container, width: canvas.width * SCALE, height: canvas.height * SCALE });
    const layer = new Konva.Layer();
    stage.add(layer);
    for (const element of canvas.elements) {
      const node = new Konva.Rect({
        id: element.id,
        x: element.transform.x * SCALE,
        y: element.transform.y * SCALE,
        width: element.transform.width * SCALE,
        height: element.transform.height * SCALE,
        rotation: element.transform.rotation,
        opacity: element.transform.opacity,
        fill: colorFor(element.type),
        stroke: "#111827",
        strokeWidth: 1,
        draggable: true,
      });
      node.setAttr("layoutPayload", JSON.stringify({ ...element, transform: undefined }));
      layer.add(node);
    }
    layer.draw();
    window.interactionAdapter = { candidate, stage, layer };
    return;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(canvas.width * SCALE));
  svg.setAttribute("height", String(canvas.height * SCALE));
  for (const element of canvas.elements) {
    const rect = document.createElementNS(svg.namespaceURI, "rect");
    rect.dataset.elementId = element.id;
    rect.dataset.layoutPayload = JSON.stringify({ ...element, transform: undefined });
    rect.setAttribute("x", String(element.transform.x * SCALE));
    rect.setAttribute("y", String(element.transform.y * SCALE));
    rect.setAttribute("width", String(element.transform.width * SCALE));
    rect.setAttribute("height", String(element.transform.height * SCALE));
    rect.setAttribute("transform", `rotate(${element.transform.rotation} ${(element.transform.x + element.transform.width / 2) * SCALE} ${(element.transform.y + element.transform.height / 2) * SCALE})`);
    rect.setAttribute("opacity", String(element.transform.opacity));
    rect.setAttribute("fill", colorFor(element.type));
    svg.append(rect);
  }
  container.append(svg);
  window.interactionAdapter = { candidate, svg };
}

function roundtripProbe(candidate, layoutDocument) {
  const recovered = structuredClone(layoutDocument);
  const byId = new Map(recovered.canvases[0].elements.map((item) => [item.id, item]));
  if (candidate === "A") {
    for (const node of window.interactionAdapter.layer.getChildren()) {
      const element = byId.get(node.id());
      element.transform = {
        x: round(node.x() / SCALE), y: round(node.y() / SCALE),
        width: round(node.width() / SCALE), height: round(node.height() / SCALE),
        rotation: round(node.rotation()), opacity: round(node.opacity()),
      };
    }
  } else {
    for (const node of window.interactionAdapter.svg.querySelectorAll("[data-element-id]")) {
      const element = byId.get(node.dataset.elementId);
      element.transform = {
        x: round(Number(node.getAttribute("x")) / SCALE), y: round(Number(node.getAttribute("y")) / SCALE),
        width: round(Number(node.getAttribute("width")) / SCALE), height: round(Number(node.getAttribute("height")) / SCALE),
        rotation: element.transform.rotation, opacity: round(Number(node.getAttribute("opacity"))),
      };
    }
  }
  return {
    equal: JSON.stringify(recovered) === JSON.stringify(layoutDocument),
    panelCount: recovered.canvases[0].elements.filter((item) => item.type === "panel_frame").length,
    hasFreeImage: recovered.canvases[0].elements.some((item) => item.type === "free_image"),
    hasCropFlipRotation: recovered.canvases[0].elements.some((item) => item.type === "free_image" && item.display?.crop?.flipY && item.transform.rotation !== 0),
    hasBalloon: recovered.canvases[0].elements.some((item) => item.type === "balloon"),
    balloonKinds: [...new Set(recovered.canvases[0].elements.filter((item) => item.type === "balloon").map((item) => item.balloonKind))].sort(),
    richTextStyles: recovered.canvases[0].elements.flatMap((item) => item.richText?.paragraphs?.flatMap((paragraph) => paragraph.runs) ?? []).map((run) => ({
      fontSize: run.fontSize, fontWeight: run.fontWeight, fontStyle: run.fontStyle, color: run.color, stroke: run.stroke, letterSpacing: run.letterSpacing,
    })),
    layerOrder: recovered.canvases[0].elements.map((item) => item.id),
  };
}

function renderFormalPage(candidate, layoutDocument, host) {
  host.replaceChildren();
  if (candidate === "B") {
    host.innerHTML = svgDocument(layoutDocument, false);
    host.style.width = `${layoutDocument.canvases[0].width}px`;
    host.style.height = `${layoutDocument.canvases[0].height}px`;
    return;
  }
  host.append(domCanvas(layoutDocument.canvases[0]));
  host.style.width = `${layoutDocument.canvases[0].width}px`;
  host.style.height = `${layoutDocument.canvases[0].height}px`;
}

function domCanvas(canvas) {
  const root = document.createElement("div");
  root.className = "layout-canvas";
  root.style.width = `${canvas.width}px`;
  root.style.height = `${canvas.height}px`;
  root.style.background = canvas.backgroundColor.slice(0, 7);
  root.dataset.canvasId = canvas.id;
  for (const element of canvas.elements) root.append(domElement(element));
  return root;
}

function domElement(element) {
  const node = document.createElement("div");
  node.className = `layout-element ${element.type.replaceAll("_", "-")}`;
  node.dataset.elementId = element.id;
  applyTransform(node, element.transform);
  if (element.type === "panel_frame") {
    if (element.contentImage && !element.contentImage.hidden) {
      const image = document.createElement("img");
      image.src = assetPaths[element.contentImage.source.assetId];
      applyCrop(image, element.contentImage.crop);
      node.append(image);
    }
    node.style.borderRadius = `${element.shape.cornerRadius}px`;
    const border = document.createElement("div");
    border.className = "panel-border";
    border.style.border = element.border.visible ? `${element.border.width}px solid ${element.border.color.slice(0, 7)}` : "0";
    border.style.borderRadius = `${element.shape.cornerRadius}px`;
    node.append(border);
  } else if (element.type === "free_image") {
    const image = document.createElement("img");
    image.src = assetPaths[element.source.assetId];
    image.style.objectFit = element.display.mode;
    if (element.display.mode === "cover") applyCrop(image, element.display.crop);
    node.append(image);
  } else if (element.type === "text") {
    node.append(domRichText(element.richText));
  } else if (element.type === "balloon") {
    node.classList.add(element.balloonKind);
    node.style.background = element.fillColor.slice(0, 7);
    node.style.border = `${element.strokeWidth}px solid ${element.strokeColor.slice(0, 7)}`;
    node.style.padding = `${element.padding.top}px ${element.padding.right}px ${element.padding.bottom}px ${element.padding.left}px`;
    node.append(domRichText(element.richText));
    if (element.tail.enabled) {
      const tail = document.createElement("div");
      tail.className = "balloon-tail";
      node.append(tail);
    }
  }
  return node;
}

function domRichText(value) {
  const node = document.createElement("div");
  node.className = "rich-text";
  node.dataset.writingMode = value.writingMode;
  node.style.writingMode = value.writingMode;
  node.style.textOrientation = value.textOrientation;
  const paragraph = value.paragraphs[0];
  node.style.lineHeight = String(paragraph.lineHeight);
  node.style.textAlign = paragraph.align;
  for (const run of paragraph.runs) {
    const span = document.createElement("span");
    span.textContent = run.text;
    span.style.fontFamily = run.fontAssetId.includes("inter") ? "Inter" : "Noto Sans CJK SC";
    span.style.fontSize = `${run.fontSize}px`;
    span.style.fontWeight = String(run.fontWeight);
    span.style.fontStyle = run.fontStyle;
    span.style.color = run.color.slice(0, 7);
    span.style.letterSpacing = `${run.letterSpacing}px`;
    if (run.stroke) span.style.webkitTextStroke = `${run.stroke.width}px ${run.stroke.color.slice(0, 7)}`;
    node.append(span);
  }
  return node;
}

function svgDocument(layoutDocument, embedded) {
  return svgCanvas(layoutDocument.canvases[0], embedded);
}

function svgCanvas(canvas, embedded, offsetY = 0, forceFragment = false) {
  const standalone = offsetY === 0 && !forceFragment;
  const children = canvas.elements.map((element) => svgElement(element, embedded)).join("");
  const body = `<g data-canvas-id="${xml(canvas.id)}" transform="translate(0 ${offsetY})"><rect width="${canvas.width}" height="${canvas.height}" fill="${canvas.backgroundColor.slice(0, 7)}"/>${children}</g>`;
  return standalone ? `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}">${body}</svg>` : body;
}

function svgElement(element, embedded) {
  const t = element.transform;
  const cx = t.x + t.width / 2;
  const cy = t.y + t.height / 2;
  const common = `data-element-id="${xml(element.id)}" opacity="${t.opacity}" transform="rotate(${t.rotation} ${cx} ${cy})"`;
  if (element.type === "panel_frame") {
    const clipId = `clip_${element.id}`;
    const radius = element.shape.cornerRadius;
    const source = element.contentImage?.source;
    const crop = element.contentImage?.crop;
    const image = source ? `<image href="${assetHref(source.assetId, embedded)}" x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" preserveAspectRatio="xMidYMid slice" transform="${svgCropTransform(crop, cx, cy)}"/>` : "";
    return `<g ${common}><defs><clipPath id="${clipId}"><rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" rx="${radius}"/></clipPath></defs><g clip-path="url(#${clipId})">${image}</g><rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" rx="${radius}" fill="none" stroke="${element.border.color.slice(0, 7)}" stroke-width="${element.border.width}"/></g>`;
  }
  if (element.type === "free_image") {
    const clipId = `clip_${element.id}`;
    return `<g ${common}><defs><clipPath id="${clipId}"><rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}"/></clipPath></defs><g clip-path="url(#${clipId})"><image href="${assetHref(element.source.assetId, embedded)}" x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" preserveAspectRatio="xMidYMid ${element.display.mode === "contain" ? "meet" : "slice"}" transform="${svgCropTransform(element.display.crop, cx, cy)}"/></g></g>`;
  }
  if (element.type === "text") return `<g ${common}>${svgRichText(element.richText, t, element.id)}</g>`;
  const shape = svgBalloonShape(element, t, cx, cy);
  const tail = element.tail.enabled
    ? `<path d="M ${round(cx - element.tail.baseWidth)} ${round(t.y + t.height * 0.82)} L ${round(t.x + element.tail.targetX)} ${round(t.y + element.tail.targetY)} L ${round(cx + element.tail.baseWidth)} ${round(t.y + t.height * 0.82)} Z"/>`
    : "";
  return `<g ${common} fill="${element.fillColor.slice(0, 7)}" stroke="${element.strokeColor.slice(0, 7)}" stroke-width="${element.strokeWidth}">${tail}${shape}</g><g data-element-id="${xml(element.id)}_text">${svgRichText(element.richText, { x: t.x + element.padding.left, y: t.y + element.padding.top, width: t.width - element.padding.left - element.padding.right, height: t.height - element.padding.top - element.padding.bottom }, element.id)}</g>`;
}

function svgRichText(value, box, elementId) {
  const vertical = value.writingMode === "vertical-rl";
  let cursor = 0;
  const glyphs = [];
  for (const [paragraphIndex, paragraph] of value.paragraphs.entries()) {
    for (const [runIndex, run] of paragraph.runs.entries()) {
      for (const [graphemeIndex, grapheme] of splitGraphemes(run.text).entries()) {
        const advance = run.fontSize * (vertical ? paragraph.lineHeight : 0.62) + run.letterSpacing;
        const x = vertical ? box.x + box.width - run.fontSize * 0.6 : box.x + cursor;
        const y = vertical ? box.y + cursor + run.fontSize : box.y + run.fontSize * paragraph.lineHeight;
        const family = run.fontAssetId.includes("inter") ? "Inter" : "Noto Sans CJK SC";
        glyphs.push(`<text data-glyph="${xml(elementId)}:${paragraphIndex}:${runIndex}:${graphemeIndex}" data-run="${paragraphIndex}:${runIndex}" x="${round(x)}" y="${round(y)}" font-family="${family}" font-size="${run.fontSize}" font-weight="${run.fontWeight}" font-style="${run.fontStyle}" fill="${run.color.slice(0, 7)}"${run.stroke ? ` stroke="${run.stroke.color.slice(0, 7)}" stroke-width="${run.stroke.width}"` : ""}>${xml(grapheme)}</text>`);
        cursor += advance;
      }
    }
  }
  return glyphs.join("");
}

function renderStripSlice(candidate, layoutDocument, index, host) {
  const plan = stripSlicePlan(layoutDocument)[index];
  host.replaceChildren();
  host.style.width = "1080px";
  host.style.height = `${plan.height}px`;
  if (candidate === "B") {
    host.innerHTML = svgStripSlice(layoutDocument, index, false);
    return;
  }
  let canvasY = 0;
  for (const canvas of layoutDocument.canvases) {
    const node = domCanvas(canvas);
    node.style.position = "absolute";
    node.style.left = "0";
    node.style.top = `${canvasY - plan.startY}px`;
    host.append(node);
    canvasY += canvas.height;
  }
}

function svgStripSlice(layoutDocument, index, embedded) {
  const plan = stripSlicePlan(layoutDocument)[index];
  let y = 0;
  const body = layoutDocument.canvases.map((canvas) => {
    const value = svgCanvas(canvas, embedded, y - plan.startY, true);
    y += canvas.height;
    return value;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${plan.height}" viewBox="0 0 1080 ${plan.height}">${body}</svg>`;
}

function renderFullStrip(candidate, layoutDocument, host) {
  host.replaceChildren();
  host.style.width = "1080px";
  host.style.height = `${stripHeight(layoutDocument)}px`;
  if (candidate === "B") host.innerHTML = svgFullStrip(layoutDocument, false);
  else for (const canvas of layoutDocument.canvases) host.append(domCanvas(canvas));
}

function svgFullStrip(layoutDocument, embedded) {
  let y = 0;
  const body = layoutDocument.canvases.map((canvas) => {
    const value = svgCanvas(canvas, embedded, y, true);
    y += canvas.height;
    return value;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${y}" viewBox="0 0 1080 ${y}">${body}</svg>`;
}

function stripSlicePlan(layoutDocument) {
  const total = stripHeight(layoutDocument);
  const slices = [];
  for (let startY = 0; startY < total; startY += MAX_SLICE_HEIGHT) {
    slices.push({ index: slices.length, startY, endY: Math.min(total, startY + MAX_SLICE_HEIGHT), height: Math.min(MAX_SLICE_HEIGHT, total - startY) });
  }
  return slices;
}

function stripHeight(layoutDocument) {
  return layoutDocument.canvases.reduce((sum, canvas) => sum + canvas.height, 0);
}

function renderPdfPages(candidate, layoutDocument, count, host) {
  host.replaceChildren();
  host.style.width = `${layoutDocument.canvases[0].width}px`;
  host.style.height = "auto";
  for (let index = 0; index < count; index += 1) {
    const page = document.createElement("div");
    page.className = "pdf-page";
    page.dataset.pageIndex = String(index + 1);
    if (candidate === "B") page.innerHTML = svgDocument(layoutDocument, false);
    else page.append(domCanvas(layoutDocument.canvases[0]));
    host.append(page);
  }
}

async function runPerformanceProbe(candidate) {
  const host = document.querySelector("#performance");
  host.replaceChildren();
  const items = [];
  if (candidate === "A") {
    for (let canvasIndex = 0; canvasIndex < 20; canvasIndex += 1) {
      const container = document.createElement("div");
      host.append(container);
      const stage = new Konva.Stage({ container, width: 270, height: 480 });
      const layer = new Konva.Layer();
      stage.add(layer);
      for (let elementIndex = 0; elementIndex < 10; elementIndex += 1) {
        const rect = new Konva.Rect({ x: (elementIndex % 2) * 125, y: Math.floor(elementIndex / 2) * 92, width: 110, height: 80, fill: "#60a5fa" });
        layer.add(rect);
        items.push(rect);
      }
      layer.draw();
    }
  } else {
    for (let canvasIndex = 0; canvasIndex < 20; canvasIndex += 1) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "270"); svg.setAttribute("height", "480");
      for (let elementIndex = 0; elementIndex < 10; elementIndex += 1) {
        const rect = document.createElementNS(svg.namespaceURI, "rect");
        rect.setAttribute("x", String((elementIndex % 2) * 125));
        rect.setAttribute("y", String(Math.floor(elementIndex / 2) * 92));
        rect.setAttribute("width", "110"); rect.setAttribute("height", "80"); rect.setAttribute("fill", "#60a5fa");
        svg.append(rect); items.push(rect);
      }
      host.append(svg);
    }
  }
  const frameTimes = [];
  for (let frame = 0; frame < 60; frame += 1) {
    const started = performance.now();
    for (const [index, item] of items.entries()) {
      if (candidate === "A") item.x(item.x() + (index % 2 ? 0.25 : -0.25));
      else item.setAttribute("transform", `translate(${frame % 2 ? 0.25 : -0.25} 0)`);
    }
    if (candidate === "A") for (const layer of new Set(items.map((item) => item.getLayer()))) layer.batchDraw();
    await new Promise(requestAnimationFrame);
    frameTimes.push(performance.now() - started);
  }
  const pointerStarted = performance.now();
  const command = items.map((item, index) => candidate === "A"
    ? { id: index, x: item.x(), y: item.y() }
    : { id: index, transform: item.getAttribute("transform") });
  const pointerupMs = performance.now() - pointerStarted;
  const sorted = [...frameTimes].sort((a, b) => a - b);
  host.replaceChildren();
  return { canvasCount: 20, elementCount: command.length, frameP95Ms: round(sorted[Math.floor(sorted.length * 0.95)]), pointerupCommandMs: round(pointerupMs) };
}

function runImeProbe() {
  const state = { value: "雨", composing: false, before: "", commands: [] };
  const editor = document.createElement("div");
  editor.contentEditable = "true";
  editor.textContent = state.value;
  editor.addEventListener("compositionstart", () => { state.composing = true; state.before = state.value; });
  editor.addEventListener("input", () => { if (!state.composing) state.value = editor.textContent; });
  editor.addEventListener("compositionend", () => {
    state.composing = false;
    const after = editor.textContent;
    state.commands.push({ before: state.before, after });
    state.value = after;
  });
  document.body.append(editor);
  editor.dispatchEvent(new CompositionEvent("compositionstart", { data: "" }));
  for (const partial of ["雨の", "雨の夜"]) {
    editor.textContent = partial;
    editor.dispatchEvent(new InputEvent("input", { data: partial, inputType: "insertCompositionText" }));
  }
  const commandsDuringComposition = state.commands.length;
  editor.dispatchEvent(new CompositionEvent("compositionend", { data: "の夜" }));
  const composed = state.value;
  const commandCount = state.commands.length;
  const last = state.commands.at(-1);
  state.value = last.before;
  editor.remove();
  return { commandsDuringComposition, commandCount, composed, undo: state.value, passed: commandsDuringComposition === 0 && commandCount === 1 && composed === "雨の夜" && state.value === "雨" };
}

async function runCommandProbe() {
  const initial = { x: 0, y: 0, rotation: 0, text: "雨", visible: true };
  let state = structuredClone(initial);
  const commands = [];
  const apply = (value, command) => ({
    x: round(value.x + command.dx),
    y: round(value.y + command.dy),
    rotation: round((value.rotation + command.dr) % 360),
    text: command.append ? `${value.text}${command.append}` : value.text,
    visible: command.toggle ? !value.visible : value.visible,
  });
  const invert = (before) => structuredClone(before);
  for (let index = 0; index < 100; index += 1) {
    const before = structuredClone(state);
    const command = { dx: (index % 5) - 2, dy: (index % 7) - 3, dr: index % 3, append: index % 25 === 0 ? String(index / 25) : "", toggle: index % 20 === 0 };
    state = apply(state, command);
    commands.push({ before: invert(before), command, after: structuredClone(state) });
  }
  const final = structuredClone(state);
  const finalDigest = await digestJson(final);
  for (const entry of [...commands].reverse()) state = structuredClone(entry.before);
  const undoDigest = await digestJson(state);
  for (const entry of commands) state = apply(state, entry.command);
  const redoDigest = await digestJson(state);
  return {
    commandCount: commands.length,
    initialDigest: await digestJson(initial),
    finalDigest,
    undoDigest,
    redoDigest,
    undoToStart: JSON.stringify(stateFromDigestTarget(commands, "start")) === JSON.stringify(initial) && undoDigest === await digestJson(initial),
    redoToEnd: JSON.stringify(state) === JSON.stringify(final) && redoDigest === finalDigest,
  };
}

function stateFromDigestTarget(commands, target) {
  return target === "start" ? structuredClone(commands[0].before) : structuredClone(commands.at(-1).after);
}

function runReplacementProbe() {
  const original = structuredClone(fixtures["stale-source-a-to-b"].document.canvases[0].elements[0].contentImage);
  const nextSource = {
    shotId: original.source.shotId,
    candidateId: "candidate_001_b",
    candidateLockRevisionId: "lockrev_001_b",
    assetId: "asset_fixture_candidate_b",
    sourceDigest: "sha256:e0-replacement-b",
  };
  const preserve = structuredClone(original);
  preserve.source = structuredClone(nextSource);
  const reset = structuredClone(original);
  reset.source = structuredClone(nextSource);
  reset.crop = { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false };
  return {
    staleFromCandidateId: original.source.candidateId,
    replacementCandidateId: nextSource.candidateId,
    preserveCrop: JSON.stringify(preserve.crop) === JSON.stringify(original.crop),
    resetCrop: JSON.stringify(reset.crop) === JSON.stringify({ zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, flipX: false, flipY: false }),
    strategies: ["preserve_crop", "reset_crop"],
  };
}

function semanticProbe(candidate) {
  const formal = document.querySelector("#formal-scene");
  const working = document.querySelector("#semantic-working");
  const snapshot = (root) => candidate === "A"
    ? [...root.querySelectorAll(".rich-text")].map((node) => ({
      elementId: node.closest("[data-element-id]")?.dataset.elementId ?? null,
      writingMode: getComputedStyle(node).writingMode,
      bounds: rectValue(node.getBoundingClientRect(), root.getBoundingClientRect()),
    }))
    : [...root.querySelectorAll("[data-glyph]")].map((node) => ({ glyph: node.dataset.glyph, bounds: rectValue(node.getBoundingClientRect(), root.getBoundingClientRect()) }));
  const left = snapshot(working);
  const right = snapshot(formal);
  return { equal: semanticSnapshotsEqual(left, right), working: left, formal: right };
}

function geometryProbe(candidate) {
  const roots = [document.querySelector("#semantic-working"), document.querySelector("#formal-scene")];
  const snapshots = roots.map((root) => {
    const rootRect = root.getBoundingClientRect();
    return new Map([...root.querySelectorAll("[data-element-id]")].filter((node) => !node.dataset.elementId.endsWith("_text")).map((node) => [node.dataset.elementId, rectValue(node.getBoundingClientRect(), rootRect)]));
  });
  let maxDelta = 0;
  const missing = [];
  for (const [id, left] of snapshots[0]) {
    const right = snapshots[1].get(id);
    if (!right) { missing.push(id); continue; }
    for (const key of ["x", "y", "width", "height"]) maxDelta = Math.max(maxDelta, Math.abs(left[key] - right[key]));
  }
  return { candidate, compared: snapshots[0].size, missing, maxDelta: round(maxDelta), withinHalfUnit: missing.length === 0 && maxDelta <= 0.5 };
}

function applyTransform(node, value) {
  Object.assign(node.style, {
    left: `${value.x}px`, top: `${value.y}px`, width: `${value.width}px`, height: `${value.height}px`,
    opacity: String(value.opacity), transform: `rotate(${value.rotation}deg)`,
  });
}

function applyCrop(image, value) {
  image.style.transform = `translate(${value.offsetX}px, ${value.offsetY}px) rotate(${value.rotation}deg) scale(${value.flipX ? -value.zoom : value.zoom}, ${value.flipY ? -value.zoom : value.zoom})`;
}

function svgCropTransform(value, cx, cy) {
  if (!value) return "";
  const scaleX = value.flipX ? -value.zoom : value.zoom;
  const scaleY = value.flipY ? -value.zoom : value.zoom;
  return `translate(${round(value.offsetX)} ${round(value.offsetY)}) translate(${round(cx)} ${round(cy)}) rotate(${round(value.rotation)}) scale(${round(scaleX)} ${round(scaleY)}) translate(${-round(cx)} ${-round(cy)})`;
}

function svgBalloonShape(element, t, cx, cy) {
  if (element.balloonKind === "caption") return `<rect x="${t.x}" y="${t.y}" width="${t.width}" height="${t.height}" rx="24"/>`;
  if (element.balloonKind === "shout") {
    const points = [];
    for (let index = 0; index < 24; index += 1) {
      const angle = (Math.PI * 2 * index) / 24;
      const radius = index % 2 === 0 ? 1 : 0.82;
      points.push(`${round(cx + Math.cos(angle) * t.width * 0.5 * radius)},${round(cy + Math.sin(angle) * t.height * 0.5 * radius)}`);
    }
    return `<polygon points="${points.join(" ")}"/>`;
  }
  if (element.balloonKind === "thought") {
    return `<ellipse cx="${cx}" cy="${cy}" rx="${t.width / 2}" ry="${t.height / 2}"/><circle cx="${round(t.x + t.width * 0.2)}" cy="${round(t.y + t.height * 0.92)}" r="18"/><circle cx="${round(t.x + t.width * 0.13)}" cy="${round(t.y + t.height * 1.04)}" r="10"/>`;
  }
  return `<ellipse cx="${cx}" cy="${cy}" rx="${t.width / 2}" ry="${t.height / 2}"/>`;
}

function assetHref(assetId, embedded) {
  if (!embedded) return assetPaths[assetId];
  return window.embeddedAssets?.[assetId] ?? assetPaths[assetId];
}

function colorFor(type) {
  return ({ panel_frame: "#bfdbfe", free_image: "#a7f3d0", text: "#fde68a", balloon: "#fecdd3" })[type] ?? "#e5e7eb";
}

function rectValue(value, root) {
  return { x: round(value.x - root.x), y: round(value.y - root.y), width: round(value.width), height: round(value.height) };
}

function semanticSnapshotsEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    const identityEqual = item.glyph ? item.glyph === other.glyph : item.elementId === other.elementId && item.writingMode === other.writingMode;
    return identityEqual && ["x", "y", "width", "height"].every((key) => Math.abs(item.bounds[key] - other.bounds[key]) <= 0.5);
  });
}

function splitGraphemes(value) {
  return [...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(value)].map((entry) => entry.segment);
}

async function digestJson(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function round(value) { return Math.round(value * 1000) / 1000; }
function xml(value) { return String(value).replace(/[<>&"']/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]); }
function loadImage(src) { return new Promise((resolve, reject) => { const image = new Image(); image.onload = resolve; image.onerror = reject; image.src = src; }); }
