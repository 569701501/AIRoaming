import { describe, expect, it, vi } from "vitest";

import {
  CHAPTER_VERSION_QUERY_INCLUDE,
  ChapterVersionQueryRepository,
} from "./chapter-version-query.repository.js";

describe("ChapterVersionQueryRepository", () => {
  it("uses one scoped Chapter read with the complete version graph include", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = {
      database: () => ({ chapter: { findFirst } }),
    } as never;
    const repository = new ChapterVersionQueryRepository(service);

    await expect(
      repository.findByScope({ projectId: "project-1", chapterId: "chapter-1" }),
    ).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "chapter-1", projectId: "project-1" },
      include: CHAPTER_VERSION_QUERY_INCLUDE,
    });
  });
});
