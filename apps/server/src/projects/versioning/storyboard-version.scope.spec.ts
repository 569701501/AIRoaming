import { describe, expect, it } from "vitest";
import type { StoryboardDocumentV2 } from "@airoaming/shared";
import { StoryboardVersionRepository } from "./storyboard-version.repository.js";

describe("Storyboard current-structure scope", () => {
  it("rejects a project character that is not registered by the current StoryStructure", async () => {
    const repository = Object.create(StoryboardVersionRepository.prototype) as StoryboardVersionRepository;
    const assertShotScope = (repository as unknown as {
      assertShotScope(tx: unknown, chapter: unknown, document: StoryboardDocumentV2): Promise<void>;
    }).assertShotScope.bind(repository);
    const tx = {
      shot: { findMany: async () => [{ id: "shot-1", lifecycleStatus: "draft" }] },
      character: { findMany: async () => [{ id: "character-outside" }] },
    };
    const chapter = {
      id: "chapter-1",
      projectId: "project-1",
      currentStoryVersion: {
        documentJson: {
          schemaVersion: 2,
          chapterId: "chapter-1",
          synopsis: "",
          direction: { logline: "", chapterGoal: "", coreConflict: "", emotionalArc: "", endingHook: "" },
          characters: [{ id: "card-1", projectCharacterId: "character-inside", name: "结构内角色", role: "", level: "chapter", entityType: "human", motivation: "", relationship: "", visualTraits: "", notes: "" }],
          scenes: [], beats: [], notes: "",
        },
      },
    };
    const document = {
      schemaVersion: 2,
      chapterId: "chapter-1",
      shots: [{ id: "shot-1", characterIds: ["character-outside"] }],
      notes: "",
    } as StoryboardDocumentV2;

    await expect(assertShotScope(tx, chapter, document)).rejects.toMatchObject({
      code: "SOURCE_UNRESOLVED",
      details: expect.objectContaining({ reason: "STORYBOARD_CHARACTER_OUTSIDE_CURRENT_STORY_STRUCTURE" }),
    });
  });
});
