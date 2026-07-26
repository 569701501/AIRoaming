import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("G5-M5 font, rich text, and balloon authority", () => {
  it("keeps provision, catalog, and verified font bytes on explicit DB-only routes", async () => {
    const [controller, service, api] = await Promise.all([
      readFile(new URL("./projects.controller.ts", import.meta.url), "utf8"),
      readFile(new URL("./layout-font.service.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../web/src/services/api.ts", import.meta.url), "utf8"),
    ]);
    expect(controller).toContain("layout/fonts/provision");
    expect(controller).toContain("layout/fonts/:assetId/file");
    expect(service).toContain('eventType: "asset.promote"');
    expect(service).toContain('status: "staged"');
    expect(service).toContain("LAYOUT_FONT_ASSET_DIGEST_MISMATCH");
    expect(service).toContain("LAYOUT_FONT_CMAP_MISMATCH");
    expect(service).toContain("LAYOUT_FONT_FACE_MISMATCH");
    expect(api).toContain("layoutFontFileUrl");
    expect(service).not.toMatch(/data:font|toString\(["']base64["']\)/);
  });

  it("uses contenteditable composition and plain-text paste without a system font selector", async () => {
    const [editor, workspace, preview, renderer] = await Promise.all([
      readFile(new URL("../../../web/src/components/workbench/LayoutRichTextEditor.vue", import.meta.url), "utf8"),
      readFile(new URL("../../../web/src/components/workbench/LayoutExportWorkspace.vue", import.meta.url), "utf8"),
      readFile(new URL("../../../web/src/components/workbench/LayoutElementTextPreview.vue", import.meta.url), "utf8"),
      readFile(new URL("./layout-renderer.service.ts", import.meta.url), "utf8"),
    ]);
    expect(editor).toContain(':contenteditable="disabled ? \'false\' : \'true\'"');
    expect(editor).toContain('@compositionstart="compositionActive = true"');
    expect(editor).toContain('@compositionend="handleCompositionEnd"');
    expect(editor).toContain('@paste="handlePaste"');
    expect(editor).toContain('getData("text/plain")');
    expect(editor).toContain("layoutGraphemes");
    expect(editor).not.toMatch(/<option[^>]*>\s*(Arial|Helvetica|Times|system-ui)/i);
    expect(editor.indexOf("props.modelValue.paragraphs[0]?.runs[0]?.fontAssetId"))
      .toBeLessThan(editor.indexOf("props.fontCatalog[0]?.assetId"));
    expect(editor).toContain('fontSynthesis: "none"');
    expect(editor).toContain("fontWeight: font.metadata.face.weight");
    expect(editor).toContain("fontStyle: font.metadata.face.style");
    expect(editor).toContain(':disabled="disabled || !canToggleItalic"');
    expect(editor).not.toContain('fontStyle: italic.value ? "italic" : "normal"');
    expect(preview).toContain("layoutFontFamilyNameV1");
    expect(preview).toContain("resolveLayoutBalloonVisualRoleV1");
    expect(preview).toContain('stroke-linejoin="round"');
    expect(preview).not.toContain("fillColor.slice(0, 7)");
    expect(preview).not.toContain("local(");
    expect(renderer).toContain('format("${font.format}")');
    expect(renderer).toContain("font-weight:${font.weight}");
    expect(renderer).toContain("font-style:${font.style}");
    expect(renderer).toContain("font-synthesis:none");
    expect(renderer).toContain("resolveLayoutBalloonVisualRoleV1");
    expect(workspace).toContain("collectLayoutTextIssuesV1");
    expect(workspace).toContain("balloon.set_tail");
    expect(workspace).toContain("在画布上直接拖动即可移动气泡");
  });
});
