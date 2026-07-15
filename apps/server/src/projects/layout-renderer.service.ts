import { Injectable } from "@nestjs/common";
import { chromium, type BrowserContext, type Page, type Route } from "@playwright/test";
import {
  buildVerticalSlicePlanV1,
  digestCanonicalJson,
  type LayoutCanvasV1,
  type LayoutPublicationProfileV1,
  type LayoutRendererCapabilitiesV1,
  type LayoutRendererIdentityV1,
  type PublicationOutputRoleV1,
  type RenderPlanV1,
} from "@airoaming/shared";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { inspectLayoutImageNormalizationV1 } from "./layout-image-normalization.util.js";

interface PngImage {
  width: number;
  height: number;
  data: Buffer;
}

const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as {
  PNG: {
    new(options: { width: number; height: number }): PngImage;
    sync: {
      read(bytes: Buffer): PngImage;
      write(image: PngImage): Buffer;
    };
  };
};

export interface ResolvedRenderAssetV1 {
  assetId: string;
  mimeType: string;
  sha256: `sha256:${string}`;
  bytes: Buffer;
}

export interface RenderedPublicationArtifactV1 {
  role: PublicationOutputRoleV1;
  order: number;
  fileName: string;
  mimeType: "image/png" | "application/pdf";
  bytes: Buffer;
  sha256: `sha256:${string}`;
  width: number | null;
  height: number | null;
  pageCount: number | null;
}

export interface RenderedLayoutPublicationV1 {
  renderer: LayoutRendererIdentityV1;
  artifacts: RenderedPublicationArtifactV1[];
}

export const LAYOUT_RENDERER_CAPABILITIES_V1: LayoutRendererCapabilitiesV1 = {
  maxCanvasWidthPx: 8_192,
  maxCanvasHeightPx: 8_192,
  maxRasterPixels: 80_000_000,
  maxPdfPages: 200,
  maxLongPngHeightPx: 65_535,
  supportsPagedPdf: true,
  supportsLongPng: true,
  supportedImageMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  supportedFontMimeTypes: ["font/woff2", "font/otf", "font/ttf"],
};

const RENDERER_BUILD_DIGEST = digestCanonicalJson({
  rendererId: "airoaming_layout_renderer",
  rendererPolicyVersion: "layout_render_policy_v1",
  geometryPolicyVersion: "layout_geometry_v1",
  textPolicyVersion: "layout_text_v1",
  balloonPolicyVersion: "balloon_shape_v1",
  browserPackage: "@playwright/test@1.61.1",
  sceneVersion: "layout_render_scene_v1",
});

function browserLaunchOptions(): { headless: true; executablePath?: string } {
  const executablePath = process.env.AIROAMING_LAYOUT_RENDERER_EXECUTABLE_PATH?.trim();
  return executablePath ? { headless: true, executablePath } : { headless: true };
}

function sha256(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function pngDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.byteLength < 24 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.subarray(4, 8).toString("hex") !== "0d0a1a0a") {
    throw new Error("LAYOUT_RENDER_OUTPUT_INVALID:PNG_MAGIC");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function stitchVerticalPngSlices(
  slices: readonly RenderedPublicationArtifactV1[],
  width: number,
  height: number,
): Buffer {
  const output = new PNG({ width, height });
  let rowOffset = 0;
  for (const slice of slices) {
    const decoded = PNG.sync.read(slice.bytes);
    if (decoded.width !== width || rowOffset + decoded.height > height) {
      throw new Error("LAYOUT_RENDER_OUTPUT_INVALID:SLICE_STITCH_DIMENSIONS");
    }
    decoded.data.copy(output.data, rowOffset * width * 4);
    rowOffset += decoded.height;
  }
  if (rowOffset !== height) throw new Error("LAYOUT_RENDER_OUTPUT_INVALID:SLICE_STITCH_HEIGHT");
  return PNG.sync.write(output);
}

function normalizePdf(bytes: Buffer): Buffer {
  let value = bytes.toString("latin1");
  value = value.replace(/\/(CreationDate|ModDate)\s*\(([^)]*)\)/g, (match: string, _key: string, content: string) => {
    const fixed = "D:19700101000000+00'00'".padEnd(content.length, "0").slice(0, content.length);
    return match.replace(content, fixed);
  });
  value = value.replace(/\/ID\s*\[<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\]/g, (match: string) =>
    match.replace(/<([0-9A-Fa-f]+)>/g, (_hexMatch, hex: string) => `<${"0".repeat(hex.length)}>`));
  return Buffer.from(value, "latin1");
}

function pdfPageCount(bytes: Buffer): number {
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) || !bytes.toString("latin1").includes("%%EOF")) {
    throw new Error("LAYOUT_RENDER_OUTPUT_INVALID:PDF_MAGIC");
  }
  const count = bytes.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
  if (count < 1) throw new Error("LAYOUT_RENDER_OUTPUT_INVALID:PDF_PAGES");
  return count;
}

function assertOutputLimits(plan: RenderPlanV1, profile: LayoutPublicationProfileV1): void {
  const scale = profile.outputScale;
  for (const canvas of plan.canvases) {
    const width = canvas.width * scale;
    const height = canvas.height * scale;
    if (width > LAYOUT_RENDERER_CAPABILITIES_V1.maxCanvasWidthPx || height > LAYOUT_RENDERER_CAPABILITIES_V1.maxCanvasHeightPx) {
      throw new Error("LAYOUT_RENDER_OUTPUT_LIMIT_EXCEEDED:DIMENSION");
    }
    if (width * height > LAYOUT_RENDERER_CAPABILITIES_V1.maxRasterPixels) {
      throw new Error("LAYOUT_RENDER_OUTPUT_LIMIT_EXCEEDED:PIXELS");
    }
  }
  if (profile.kind === "paged_publication" && plan.canvases.length > LAYOUT_RENDERER_CAPABILITIES_V1.maxPdfPages) {
    throw new Error("LAYOUT_RENDER_OUTPUT_LIMIT_EXCEEDED:PDF_PAGES");
  }
  if (profile.kind === "vertical_publication" && profile.includeLongPng) {
    const width = plan.canvases[0]?.width ?? 0;
    const height = plan.canvases.reduce((sum, canvas) => sum + canvas.height, 0) * scale;
    if (height > LAYOUT_RENDERER_CAPABILITIES_V1.maxLongPngHeightPx || width * scale * height > LAYOUT_RENDERER_CAPABILITIES_V1.maxRasterPixels) {
      throw new Error("LAYOUT_RENDER_OUTPUT_LIMIT_EXCEEDED:LONG_PNG");
    }
  }
}

function sceneShell(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://airoaming.invalid; font-src https://airoaming.invalid; style-src 'unsafe-inline'"><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;background:transparent}body{overflow:visible}.scene{position:relative;margin:0;padding:0}.layout-canvas{position:relative;overflow:hidden;break-after:page;page-break-after:always}.layout-canvas:last-child{break-after:auto;page-break-after:auto}.layout-element{position:absolute;transform-origin:center center}.layout-image{position:absolute;width:100%;height:100%;max-width:none;max-height:none}.rich-text{position:absolute;inset:0;white-space:pre-wrap;overflow:visible}.balloon-body{position:absolute;inset:0}.balloon-tail{position:absolute;width:0;height:0;border-left:18px solid transparent;border-right:18px solid transparent;border-top:44px solid currentColor;left:50%;bottom:-32px}.panel-border{position:absolute;inset:0;pointer-events:none}
  </style></head><body><main id="scene" class="scene"></main></body></html>`;
}

async function installScene(page: Page, canvases: LayoutCanvasV1[], mode: "paged" | "strip", fontAssetIds: string[]): Promise<void> {
  await page.setContent(sceneShell(), { waitUntil: "load" });
  // tsx/esbuild 在源码直跑环境会为序列化函数注入 __name；隔离页面只提供无副作用命名兼容层。
  await page.evaluate("globalThis.__name = (target) => target");
  await page.evaluate(({ inputCanvases, inputMode, fonts }) => {
    const scene = document.querySelector<HTMLElement>("#scene");
    if (!scene) throw new Error("LAYOUT_RENDER_SCENE_MISSING");
    const assetUrl = (assetId: string) => `https://airoaming.invalid/assets/${encodeURIComponent(assetId)}`;
    const fontFamily = (assetId: string) => `AIRFont_${fonts.indexOf(assetId)}`;
    const rgba = (value: string) => value.length === 9
      ? `rgba(${Number.parseInt(value.slice(1, 3), 16)},${Number.parseInt(value.slice(3, 5), 16)},${Number.parseInt(value.slice(5, 7), 16)},${Number.parseInt(value.slice(7, 9), 16) / 255})`
      : value;
    const setTransform = (node: HTMLElement, transform: LayoutCanvasV1["elements"][number]["transform"]) => {
      Object.assign(node.style, {
        left: `${transform.x}px`, top: `${transform.y}px`, width: `${transform.width}px`, height: `${transform.height}px`,
        opacity: String(transform.opacity), transform: `rotate(${transform.rotation}deg)`,
      });
    };
    const setCrop = (image: HTMLImageElement, crop: { zoom: number; offsetX: number; offsetY: number; rotation: number; flipX: boolean; flipY: boolean }) => {
      image.style.objectFit = "cover";
      image.style.transformOrigin = "center center";
      image.style.transform = `translate(${crop.offsetX}px,${crop.offsetY}px) rotate(${crop.rotation}deg) scale(${crop.zoom * (crop.flipX ? -1 : 1)},${crop.zoom * (crop.flipY ? -1 : 1)})`;
    };
    const richText = (value: any) => {
      const root = document.createElement("div");
      root.className = "rich-text";
      root.style.writingMode = value.writingMode;
      root.style.textOrientation = value.textOrientation;
      for (const paragraph of value.paragraphs) {
        const paragraphNode = document.createElement("div");
        paragraphNode.style.textAlign = paragraph.align;
        paragraphNode.style.lineHeight = String(paragraph.lineHeight);
        for (const run of paragraph.runs) {
          const span = document.createElement("span");
          span.textContent = run.text;
          span.style.fontFamily = `"${fontFamily(run.fontAssetId)}"`;
          span.style.fontSize = `${run.fontSize}px`;
          span.style.fontWeight = String(run.fontWeight);
          span.style.fontStyle = run.fontStyle;
          span.style.color = rgba(run.color);
          span.style.letterSpacing = `${run.letterSpacing}px`;
          if (run.stroke) span.style.webkitTextStroke = `${run.stroke.width}px ${rgba(run.stroke.color)}`;
          paragraphNode.append(span);
        }
        root.append(paragraphNode);
      }
      return root;
    };
    const renderElement = (element: any) => {
      const node = document.createElement("div");
      node.className = "layout-element";
      node.dataset.elementId = element.id;
      setTransform(node, element.transform);
      if (element.hidden) node.style.display = "none";
      if (element.type === "panel_frame") {
        node.style.overflow = "hidden";
        node.style.borderRadius = `${element.shape.cornerRadius}px`;
        if (element.contentImage && !element.contentImage.hidden) {
          const image = document.createElement("img");
          image.className = "layout-image";
          image.src = assetUrl(element.contentImage.source.assetId);
          setCrop(image, element.contentImage.crop);
          node.append(image);
        }
        const border = document.createElement("div");
        border.className = "panel-border";
        border.style.border = element.border.visible ? `${element.border.width}px solid ${rgba(element.border.color)}` : "none";
        border.style.borderRadius = `${element.shape.cornerRadius}px`;
        node.append(border);
      } else if (element.type === "free_image") {
        node.style.overflow = "hidden";
        const image = document.createElement("img");
        image.className = "layout-image";
        image.src = assetUrl(element.source.assetId);
        image.style.objectFit = element.display.mode;
        if (element.display.mode === "cover") setCrop(image, element.display.crop);
        node.append(image);
      } else if (element.type === "text") {
        node.append(richText(element.richText));
      } else {
        const body = document.createElement("div");
        body.className = "balloon-body";
        body.style.background = rgba(element.fillColor);
        body.style.border = `${element.strokeWidth}px solid ${rgba(element.strokeColor)}`;
        body.style.borderRadius = element.balloonKind === "caption" ? "18px" : element.balloonKind === "shout" ? "22%" : "50%";
        body.style.padding = `${element.padding.top}px ${element.padding.right}px ${element.padding.bottom}px ${element.padding.left}px`;
        body.append(richText(element.richText));
        node.append(body);
        if (element.tail.enabled) {
          const tail = document.createElement("div");
          tail.className = "balloon-tail";
          tail.style.color = rgba(element.fillColor);
          tail.style.left = `${element.tail.rootRatio * 100}%`;
          node.append(tail);
        }
      }
      return node;
    };
    const style = document.createElement("style");
    style.textContent = fonts.map((assetId, index) => `@font-face{font-family:"AIRFont_${index}";src:url("${assetUrl(assetId)}");font-display:block}`).join("\n");
    document.head.append(style);
    for (const canvas of inputCanvases) {
      const node = document.createElement("section");
      node.className = "layout-canvas";
      node.dataset.canvasId = canvas.id;
      node.style.width = `${canvas.width}px`;
      node.style.height = `${canvas.height}px`;
      node.style.background = rgba(canvas.backgroundColor);
      for (const element of canvas.elements) node.append(renderElement(element));
      scene.append(node);
    }
    scene.style.width = `${inputCanvases[0]?.width ?? 0}px`;
    scene.style.height = inputMode === "strip" ? `${inputCanvases.reduce((sum, canvas) => sum + canvas.height, 0)}px` : "auto";
  }, { inputCanvases: canvases, inputMode: mode, fonts: fontAssetIds });
  await page.waitForFunction(async () => {
    await document.fonts.ready;
    const images = Array.from(document.images);
    await Promise.all(images.map((image) => image.decode()));
    return images.every((image) => image.complete && image.naturalWidth > 0);
  });
}

@Injectable()
export class LayoutRendererService {
  async identity(): Promise<LayoutRendererIdentityV1> {
    const browser = await chromium.launch(browserLaunchOptions());
    try {
      const rasterEngineVersion = browser.version();
      return {
        rendererId: "airoaming_layout_renderer",
        rendererVersion: `chromium-${rasterEngineVersion.split(".")[0]}-layout-v1`,
        rendererPolicyVersion: "layout_render_policy_v1",
        geometryPolicyVersion: "layout_geometry_v1",
        textPolicyVersion: "layout_text_v1",
        balloonPolicyVersion: "balloon_shape_v1",
        rasterEngine: "chromium",
        rasterEngineVersion,
        buildDigest: RENDERER_BUILD_DIGEST,
      };
    } finally {
      await browser.close();
    }
  }

  async render(
    plan: RenderPlanV1,
    profile: LayoutPublicationProfileV1,
    resolvedAssets: readonly ResolvedRenderAssetV1[],
  ): Promise<RenderedLayoutPublicationV1> {
    const { renderPlanDigest, ...unsignedPlan } = plan;
    if (digestCanonicalJson(unsignedPlan) !== renderPlanDigest) throw new Error("LAYOUT_RENDER_PLAN_DIGEST_MISMATCH");
    if (digestCanonicalJson(profile) !== plan.profileDigest) throw new Error("LAYOUT_EXPORT_PROFILE_DIGEST_MISMATCH");
    assertOutputLimits(plan, profile);
    const assetById = new Map(resolvedAssets.map((asset) => [asset.assetId, asset]));
    for (const asset of [...plan.assets.images, ...plan.assets.fonts]) {
      const resolved = assetById.get(asset.assetId);
      if (!resolved || resolved.mimeType !== asset.mimeType || resolved.sha256 !== asset.sha256 || sha256(resolved.bytes) !== asset.sha256) {
        throw new Error(`LAYOUT_RENDER_ASSET_INVALID:${asset.assetId}`);
      }
    }
    for (const asset of plan.assets.images) {
      const resolved = assetById.get(asset.assetId)!;
      const issue = inspectLayoutImageNormalizationV1(resolved.bytes, resolved.mimeType).issueCodes[0];
      if (issue) throw new Error(`${issue}:${asset.assetId}`);
    }
    const browser = await chromium.launch(browserLaunchOptions());
    const renderer: LayoutRendererIdentityV1 = {
      rendererId: "airoaming_layout_renderer",
      rendererVersion: `chromium-${browser.version().split(".")[0]}-layout-v1`,
      rendererPolicyVersion: "layout_render_policy_v1",
      geometryPolicyVersion: "layout_geometry_v1",
      textPolicyVersion: "layout_text_v1",
      balloonPolicyVersion: "balloon_shape_v1",
      rasterEngine: "chromium",
      rasterEngineVersion: browser.version(),
      buildDigest: RENDERER_BUILD_DIGEST,
    };
    const context = await browser.newContext({
      viewport: { width: Math.max(320, plan.canvases[0]?.width ?? 320), height: 800 },
      deviceScaleFactor: profile.outputScale,
      serviceWorkers: "block",
    });
    await context.route("**/*", (route) => this.routeAsset(route, assetById));
    try {
      const artifacts = profile.kind === "paged_publication"
        ? await this.renderPaged(context, plan, profile)
        : await this.renderVertical(context, plan, profile);
      return { renderer, artifacts };
    } finally {
      await context.close();
      await browser.close();
    }
  }

  private async routeAsset(route: Route, assetById: ReadonlyMap<string, ResolvedRenderAssetV1>): Promise<void> {
    const url = new URL(route.request().url());
    if (url.origin !== "https://airoaming.invalid" || !url.pathname.startsWith("/assets/")) {
      await route.abort("blockedbyclient");
      return;
    }
    const assetId = decodeURIComponent(url.pathname.slice("/assets/".length));
    const asset = assetById.get(assetId);
    if (!asset) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.fulfill({ status: 200, contentType: asset.mimeType, body: asset.bytes });
  }

  private artifact(
    role: PublicationOutputRoleV1,
    order: number,
    fileName: string,
    mimeType: RenderedPublicationArtifactV1["mimeType"],
    bytes: Buffer,
    dimensions: { width: number | null; height: number | null; pageCount: number | null },
  ): RenderedPublicationArtifactV1 {
    return { role, order, fileName, mimeType, bytes, sha256: sha256(bytes), ...dimensions };
  }

  private async renderPaged(
    context: BrowserContext,
    plan: RenderPlanV1,
    profile: Extract<LayoutPublicationProfileV1, { kind: "paged_publication" }>,
  ): Promise<RenderedPublicationArtifactV1[]> {
    const page = await context.newPage();
    const artifacts: RenderedPublicationArtifactV1[] = [];
    try {
      await installScene(page, plan.canvases.map((item) => item.canvas), "paged", plan.assets.fonts.map((font) => font.assetId));
      const canvases = page.locator(".layout-canvas");
      for (let index = 0; index < plan.canvases.length; index += 1) {
        const bytes = await canvases.nth(index).screenshot({ animations: "disabled", scale: "device" });
        const dimensions = pngDimensions(bytes);
        const expected = plan.canvases[index]!;
        if (dimensions.width !== expected.width * profile.outputScale || dimensions.height !== expected.height * profile.outputScale) {
          throw new Error("LAYOUT_RENDER_OUTPUT_INVALID:PAGE_DIMENSIONS");
        }
        artifacts.push(this.artifact("page_png", index + 1, `page-${String(index + 1).padStart(4, "0")}.png`, "image/png", bytes, { ...dimensions, pageCount: null }));
      }
      if (profile.includePdf) {
        const first = plan.canvases[0];
        if (!first || plan.canvases.some((canvas) => canvas.width !== first.width || canvas.height !== first.height)) {
          throw new Error("LAYOUT_RENDER_OUTPUT_INVALID:PDF_PAGE_SIZE_MISMATCH");
        }
        await page.addStyleTag({ content: `@page{size:${first.width}px ${first.height}px;margin:0}html,body{width:${first.width}px}` });
        const rawPdf = await page.pdf({
          printBackground: true,
          preferCSSPageSize: true,
          width: `${first.width}px`,
          height: `${first.height}px`,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });
        const bytes = normalizePdf(rawPdf);
        const pageCount = pdfPageCount(bytes);
        if (pageCount !== plan.canvases.length) throw new Error("LAYOUT_RENDER_OUTPUT_INVALID:PDF_PAGE_COUNT");
        artifacts.push(this.artifact("document_pdf", 1, "comic.pdf", "application/pdf", bytes, { width: null, height: null, pageCount }));
      }
      return artifacts;
    } finally {
      await page.close();
    }
  }

  private async renderVertical(
    context: BrowserContext,
    plan: RenderPlanV1,
    profile: Extract<LayoutPublicationProfileV1, { kind: "vertical_publication" }>,
  ): Promise<RenderedPublicationArtifactV1[]> {
    const page = await context.newPage();
    try {
      await installScene(page, plan.canvases.map((item) => item.canvas), "strip", plan.assets.fonts.map((font) => font.assetId));
      const width = plan.canvases[0]?.width;
      if (!width || plan.canvases.some((canvas) => canvas.width !== width)) throw new Error("LAYOUT_RENDER_OUTPUT_INVALID:STRIP_WIDTH");
      const slices = buildVerticalSlicePlanV1(plan.canvases, profile.maxSliceHeightPx, profile.outputScale);
      const artifacts: RenderedPublicationArtifactV1[] = [];
      for (const slice of slices) {
        const logicalStartY = slice.startY / profile.outputScale;
        const logicalHeight = slice.height / profile.outputScale;
        await page.setViewportSize({ width, height: logicalHeight });
        await page.evaluate(({ startY, height }) => {
          const scene = document.querySelector<HTMLElement>("#scene");
          if (!scene) throw new Error("LAYOUT_RENDER_SCENE_MISSING");
          scene.style.transform = `translateY(-${startY}px)`;
          document.body.style.height = `${height}px`;
          document.body.style.overflow = "hidden";
        }, { startY: logicalStartY, height: logicalHeight });
        const bytes = await page.screenshot({
          animations: "disabled",
          scale: "device",
          clip: { x: 0, y: 0, width, height: logicalHeight },
        });
        const dimensions = pngDimensions(bytes);
        if (dimensions.width !== width * profile.outputScale || dimensions.height !== slice.height) {
          throw new Error(`LAYOUT_RENDER_OUTPUT_INVALID:SLICE_DIMENSIONS:${dimensions.width}x${dimensions.height}:expected:${width * profile.outputScale}x${slice.height}`);
        }
        artifacts.push(this.artifact("strip_slice_png", slice.order, `strip-${String(slice.order).padStart(4, "0")}.png`, "image/png", bytes, { ...dimensions, pageCount: null }));
      }
      if (profile.includeLongPng) {
        const logicalHeight = plan.canvases.reduce((sum, canvas) => sum + canvas.height, 0);
        const bytes = stitchVerticalPngSlices(
          artifacts.filter((artifact) => artifact.role === "strip_slice_png"),
          width * profile.outputScale,
          logicalHeight * profile.outputScale,
        );
        const dimensions = pngDimensions(bytes);
        if (dimensions.width !== width * profile.outputScale || dimensions.height !== logicalHeight * profile.outputScale) {
          throw new Error(`LAYOUT_RENDER_OUTPUT_INVALID:LONG_DIMENSIONS:${dimensions.width}x${dimensions.height}:expected:${width * profile.outputScale}x${logicalHeight * profile.outputScale}`);
        }
        artifacts.push(this.artifact("long_png", 1, "long.png", "image/png", bytes, { ...dimensions, pageCount: null }));
      }
      return artifacts;
    } finally {
      await page.close();
    }
  }
}
