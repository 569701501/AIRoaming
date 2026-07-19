import { describe, expect, it, vi } from "vitest";
import type { StoryDocumentV2 } from "@airoaming/shared";
import { StoryVersionRepository } from "./story-version.repository.js";
import { UNRESOLVED_STORY_CHARACTER_PREFIX } from "./story-document-adapter.util.js";

function groupCard(id: string, name: string): StoryDocumentV2["characters"][number] {
  return {
    id,
    projectCharacterId: `${UNRESOLVED_STORY_CHARACTER_PREFIX}${id}`,
    name,
    role: "受困商队",
    level: "chapter",
    entityType: "group",
    motivation: "逃离险境",
    relationship: "同一商队",
    visualTraits: "统一灰褐斗篷",
    notes: "",
  };
}

describe("StoryVersion character resolution", () => {
  it("maps conservative aliases of one group to a single project Character", async () => {
    const rows: Array<Record<string, unknown>> = [];
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { ...data, createdAt: new Date(), updatedAt: new Date(), finalizedAt: null, rowVersion: 0 };
      rows.push(row);
      return row;
    });
    const tx = {
      character: {
        findMany: async () => rows,
        create,
      },
    };
    const repository = Object.create(StoryVersionRepository.prototype) as StoryVersionRepository;
    const resolveCharacters = (repository as unknown as {
      resolveCharacters(tx: unknown, projectId: string, document: StoryDocumentV2): Promise<StoryDocumentV2>;
    }).resolveCharacters.bind(repository);
    const document: StoryDocumentV2 = {
      schemaVersion: 2,
      chapterId: "chapter-1",
      synopsis: "",
      direction: { logline: "", chapterGoal: "", coreConflict: "", emotionalArc: "", endingHook: "" },
      characters: [groupCard("group-a", "商队众人"), groupCard("group-b", "商队多人")],
      scenes: [],
      beats: [],
      notes: "",
    };

    const resolved = await resolveCharacters(tx, "project-1", document);
    expect(create).toHaveBeenCalledTimes(1);
    expect(resolved.characters[0]?.projectCharacterId).toBe(resolved.characters[1]?.projectCharacterId);
  });

  it("repairs already-resolved legacy group aliases on the next confirmation", async () => {
    const rows = [
      { id: "legacy-group-a", projectId: "project-1", name: "商队众人", normalizedName: "商队众人", entityType: "group", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"), finalizedAt: null, rowVersion: 0 },
      { id: "legacy-group-b", projectId: "project-1", name: "商队多人", normalizedName: "商队多人", entityType: "group", createdAt: new Date("2026-01-02"), updatedAt: new Date("2026-01-02"), finalizedAt: null, rowVersion: 0 },
    ];
    const tx = {
      character: {
        findMany: async () => rows,
        create: vi.fn(),
      },
    };
    const repository = Object.create(StoryVersionRepository.prototype) as StoryVersionRepository;
    const resolveCharacters = (repository as unknown as {
      resolveCharacters(tx: unknown, projectId: string, document: StoryDocumentV2): Promise<StoryDocumentV2>;
    }).resolveCharacters.bind(repository);
    const first = { ...groupCard("group-a", "商队众人"), projectCharacterId: "legacy-group-a" };
    const second = { ...groupCard("group-b", "商队多人"), projectCharacterId: "legacy-group-b" };
    const document: StoryDocumentV2 = {
      schemaVersion: 2,
      chapterId: "chapter-1",
      synopsis: "",
      direction: { logline: "", chapterGoal: "", coreConflict: "", emotionalArc: "", endingHook: "" },
      characters: [first, second],
      scenes: [],
      beats: [],
      notes: "",
    };

    const resolved = await resolveCharacters(tx, "project-1", document);
    expect(resolved.characters.map((character) => character.projectCharacterId)).toEqual(["legacy-group-a", "legacy-group-a"]);
    expect(tx.character.create).not.toHaveBeenCalled();
  });
});
