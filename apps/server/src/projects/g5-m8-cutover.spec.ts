import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("G5-M8 mobile, AI and legacy cutover contract", () => {
  it("registers a lazy mobile preview before the editable layout route and keeps it GET-only", async () => {
    const [router, app, preview] = await Promise.all([
      readFile(new URL("../../../web/src/router/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../web/src/App.vue", import.meta.url), "utf8"),
      readFile(new URL("../../../web/src/views/LayoutReadOnlyPreviewView.vue", import.meta.url), "utf8"),
    ]);
    expect(router.indexOf('/projects/:projectId/layout/preview')).toBeLessThan(router.indexOf('/projects/:projectId/:step'));
    expect(router).toContain('component: () => import("../views/LayoutReadOnlyPreviewView.vue")');
    expect(app).toContain('defineAsyncComponent(() => import("./components/layout/AppShell.vue"))');
    expect(preview).toContain('data-testid="layout-mobile-preview"');
    expect(preview).toContain('aria-label="手机成稿只读预览"');
    expect(preview).toContain("prefers-reduced-motion: reduce");
    expect(preview).not.toMatch(/\.post\(|\.put\(|\.patch\(|method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
    expect(preview).not.toContain("useLayoutEditorSession");
    expect(preview).not.toContain("workbench-store");
  });

  it("keeps AI closed by default and applies only strict server-side command batches", async () => {
    const [workspace, service, shared] = await Promise.all([
      readFile(new URL("../../../web/src/components/workbench/LayoutExportWorkspace.vue", import.meta.url), "utf8"),
      readFile(new URL("./layout-pending-command.service.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../../packages/shared/src/layout/pending.ts", import.meta.url), "utf8"),
    ]);
    expect(workspace).toContain("const aiDrawerOpen = ref(false)");
    expect(workspace).toContain('data-testid="layout-ai-command-preview"');
    expect(workspace).toContain("session.currentCanvas.value");
    expect(workspace).toContain('data-testid="layout-profile-resize-preview"');
    expect(workspace).toContain("previewLayoutProfileResizeV1");
    expect(workspace).toContain('aria-label="选择工具"');
    expect(workspace).toContain("prefers-reduced-motion: reduce");
    expect(service).toContain("applyLayoutCommandBatch");
    expect(service).toContain("LAYOUT_PENDING_COMMAND_EXPIRED");
    expect(service).toContain("LAYOUT_PENDING_SOURCE_REPLACEMENT_REQUIRED");
    expect(shared).toContain("parseEditorCommandBatchV1");
    expect(shared).not.toMatch(/JSON\s*Patch|eval\(|new Function/);
  });

  it("removes the legacy build/copy-export HTTP path and exposes evidence-preserving conversion", async () => {
    const [controller, webApi, workingCopy, projectsService, projectsModule, sharedDto] = await Promise.all([
      readFile(new URL("./projects.controller.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../web/src/services/api.ts", import.meta.url), "utf8"),
      readFile(new URL("./layout-working-copy.service.ts", import.meta.url), "utf8"),
      readFile(new URL("./projects.service.ts", import.meta.url), "utf8"),
      readFile(new URL("./projects.module.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../../packages/shared/src/dto.ts", import.meta.url), "utf8"),
    ]);
    expect(controller).not.toContain('layout/build");');
    expect(controller).not.toContain('layout/export");');
    expect(webApi).not.toContain("buildChapterLayout:");
    expect(webApi).not.toContain("exportChapterLayout:");
    expect(projectsService).not.toContain("buildChapterLayout(");
    expect(projectsService).not.toContain("exportChapterLayout(");
    expect(projectsModule).not.toContain("LayoutExportService");
    expect(sharedDto).not.toContain("BuildChapterLayoutResponse");
    expect(sharedDto).not.toContain("ExportChapterLayoutResponse");
    await expect(readFile(new URL("./layout-export.service.ts", import.meta.url), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(workingCopy).toContain("convertLegacyChapterLayoutV1");
    expect(workingCopy).toContain("LAYOUT_LEGACY_REBUILD_REQUIRED");
    expect(workingCopy).toContain('entityType: "LayoutWorkingCopy"');
  });

  it("keeps the renderer local-only and enforces explicit output resource limits", async () => {
    const renderer = await readFile(new URL("./layout-renderer.service.ts", import.meta.url), "utf8");
    expect(renderer).toContain('default-src \'none\'');
    expect(renderer).toContain('await route.abort("blockedbyclient")');
    expect(renderer).toContain("maxRasterPixels: 80_000_000");
    expect(renderer).toContain("maxLongPngHeightPx: 65_535");
    expect(renderer).toContain("LAYOUT_RENDER_OUTPUT_LIMIT_EXCEEDED");
    expect(renderer).toContain("stitchVerticalPngSlices");
    expect(renderer).toContain("inspectLayoutImageNormalizationV1");
  });
});
