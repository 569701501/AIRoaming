import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { ProjectsController } from "./projects.controller.js";

describe("W1 DB-only Web route gate", () => {
  it("keeps exactly one public preflight confirm decorator", async () => {
    const source = await readFile(new URL("./projects.controller.ts", import.meta.url), "utf8");
    expect(source.match(/@Post\(\":projectId\/chapters\/:chapterId\/image-preflight\/confirm\"\)/g)).toHaveLength(1);
  });

  it("dispatches the single route by persistence mode without fallback", async () => {
    const dbConfirm = vi.fn().mockResolvedValue({ mode: "db" });
    const fileConfirm = vi.fn().mockResolvedValue({ mode: "file" });
    const controller = new ProjectsController(
      { usesDatabasePersistence: () => true, confirmChapterImagePreflight: fileConfirm } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { confirm: dbConfirm } as never,
    );
    await expect(controller.confirmChapterPreflight("p", "c", {} as never)).resolves.toEqual({ success: true, data: { mode: "db" } });
    expect(dbConfirm).toHaveBeenCalledOnce();
    expect(fileConfirm).not.toHaveBeenCalled();

    const fileController = new ProjectsController(
      { usesDatabasePersistence: () => false, confirmChapterImagePreflight: fileConfirm } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { confirm: dbConfirm } as never,
    );
    await expect(fileController.confirmChapterPreflight("p", "c", {} as never)).resolves.toEqual({ success: true, data: { mode: "file" } });
    expect(fileConfirm).toHaveBeenCalledOnce();
  });
});
