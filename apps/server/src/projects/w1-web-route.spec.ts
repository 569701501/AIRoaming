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
      {} as never,
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
      {} as never,
    );
    await expect(fileController.confirmChapterPreflight("p", "c", {} as never)).resolves.toEqual({ success: true, data: { mode: "file" } });
    expect(fileConfirm).toHaveBeenCalledOnce();
  });

  it("G4-C exposes only the two-phase candidate lock authority routes", async () => {
    const source = await readFile(new URL("./projects.controller.ts", import.meta.url), "utf8");
    expect(source).not.toContain('@Post(":projectId/chapters/:chapterId/candidates/:candidateId/lock")');
    expect(source.match(/candidate-lock\/preview/g)).toHaveLength(1);
    expect(source.match(/@Put\(":projectId\/chapters\/:chapterId\/shots\/:shotId\/candidate-lock"\)/g)).toHaveLength(1);
    expect(source.match(/candidate-lock\/history/g)).toHaveLength(1);
    expect(source.match(/candidates\/:candidateId\/favorite/g)).toHaveLength(2);
    expect(source.match(/candidates\/:candidateId\/rejection/g)).toHaveLength(2);
  });
});
