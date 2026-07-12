import { describe, expect, it, vi } from "vitest";

import { ScriptVersionService } from "./script-version.service.js";

describe("ScriptVersionService request boundary", () => {
  it("rejects unknown fields before reaching the repository", async () => {
    const repository = { updateWorkingCopy: vi.fn() } as never;
    const service = new ScriptVersionService(repository);
    await expect(service.updateWorkingCopy(
      { projectId: "p", chapterId: "c" },
      { sourceText: "正文", expectedChapterRowVersion: 0, unexpected: true } as never,
    )).rejects.toMatchObject({
      status: 400,
      response: { success: false, error: { code: "VERSION_DOCUMENT_INVALID" } },
    });
    expect((repository as { updateWorkingCopy: ReturnType<typeof vi.fn> }).updateWorkingCopy).not.toHaveBeenCalled();
  });

  it("rejects an invalid digest at the API boundary", async () => {
    const repository = { clearWorkingCopy: vi.fn() } as never;
    const service = new ScriptVersionService(repository);
    await expect(service.clearWorkingCopy(
      { projectId: "p", chapterId: "c" },
      { expectedWorkingDigest: "not-a-digest", expectedChapterRowVersion: 0 } as never,
    )).rejects.toMatchObject({
      status: 400,
      response: { success: false, error: { code: "VERSION_DOCUMENT_INVALID" } },
    });
    expect((repository as { clearWorkingCopy: ReturnType<typeof vi.fn> }).clearWorkingCopy).not.toHaveBeenCalled();
  });
});

