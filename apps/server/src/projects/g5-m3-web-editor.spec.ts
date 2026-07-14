import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("G5-M3 Web editor shell contract", () => {
  it("exposes only the V1 Working Copy HTTP surface", async () => {
    const [controller, api] = await Promise.all([
      readFile(new URL("./projects.controller.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../web/src/services/api.ts", import.meta.url), "utf8"),
    ]);
    expect(controller).toContain('@Get(":projectId/chapters/:chapterId/layout/working-copy")');
    expect(controller).toContain('@Post(":projectId/chapters/:chapterId/layout/working-copy/initialize")');
    expect(controller).toContain('@Put(":projectId/chapters/:chapterId/layout/working-copy")');
    expect(api).toContain("getLayoutWorkingCopy");
    expect(api).toContain("initializeLayoutWorkingCopy");
    expect(api).toContain("saveLayoutWorkingCopy");
  });

  it("has full-width editor, bounded autosave and explicit conflict recovery without browser storage fallback", async () => {
    const [workspace, session, workbench] = await Promise.all([
      readFile(new URL("../../../web/src/components/workbench/LayoutExportWorkspace.vue", import.meta.url), "utf8"),
      readFile(new URL("../../../web/src/composables/layout-editor-session.ts", import.meta.url), "utf8"),
      readFile(new URL("../../../web/src/components/workbench/ProjectWorkbenchView.vue", import.meta.url), "utf8"),
    ]);
    expect(workbench).toContain("is-layout-step");
    expect(workspace).toContain("data-testid=\"layout-editor-shell\"");
    expect(workspace).toContain("下载本地恢复副本");
    expect(workspace).toContain("重新加载服务端");
    expect(workspace).toContain("明确保留本地");
    expect(workspace).toContain("手机端只读");
    expect(session).toContain("AUTOSAVE_IDLE_MS = 800");
    expect(session).toContain("AUTOSAVE_MAX_DIRTY_MS = 5_000");
    expect(`${workspace}\n${session}`).not.toMatch(/localStorage|indexedDB/i);
  });
});
