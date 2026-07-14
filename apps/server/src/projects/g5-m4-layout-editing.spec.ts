import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("G5-M4 panel, image, preset and crop contract", () => {
  it("serves a DB-current source catalog instead of reconstructing old lock IDs in Web", async () => {
    const [controller, service, api] = await Promise.all([
      readFile(new URL("./projects.controller.ts", import.meta.url), "utf8"),
      readFile(new URL("./layout-working-copy.service.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../web/src/services/api.ts", import.meta.url), "utf8"),
    ]);
    expect(controller).toContain('layout/source-catalog');
    expect(service).toContain("currentCandidateLockRevision");
    expect(service).toContain("digestCandidateImageSourceV1");
    expect(api).toContain("getLayoutSourceCatalog");
  });

  it("wires formal commands for Shot tray, crop, templates, reading order and batch initialization", async () => {
    const workspace = await readFile(new URL("../../../web/src/components/workbench/LayoutExportWorkspace.vue", import.meta.url), "utf8");
    expect(workspace).toContain('data-testid="shot-tray"');
    expect(workspace).toContain('data-testid="layout-preset-picker"');
    expect(workspace).toContain('data-testid="crop-controls"');
    expect(workspace).toContain("panel.detach_image_to_free");
    expect(workspace).toContain("panel.attach_image");
    expect(workspace).toContain("image.replace_source");
    expect(workspace).toContain("layout.apply_preset");
    expect(workspace).toContain("layout.resize_profile");
    expect(workspace).toContain("panelReadingOrder");
    expect(workspace).not.toContain("M4 接入画格");
    expect(workspace).not.toContain("M4 接入图片");
  });
});
