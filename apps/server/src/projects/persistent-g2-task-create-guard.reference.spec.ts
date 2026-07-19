import { describe, expect, it, vi } from "vitest";
import { PersistentG2TaskCreateGuardService } from "./persistent-g2-task-create-guard.service.js";

const DIGEST = `sha256:${"a".repeat(64)}`;

describe("PersistentG2TaskCreateGuardService candidate identity source", () => {
  it("定稿图作为预检证据时，优先冻结其来源 preview_front 并把两条视觉来源都写入投影", async () => {
    const database = {
      character: {
        findMany: vi.fn().mockResolvedValue([{
          id: "character_project_a",
          name: "角色 A",
          appearance: "短发，黑色外套",
          promptFragment: "",
          previewVisual: {
            id: "visual_preview_newer_a",
            kind: "preview_front",
            asset: { id: "asset_preview_newer_a", status: "ready", sha256: `sha256:${"b".repeat(64)}` },
          },
        }]),
      },
      characterVisual: {
        findMany: vi.fn().mockResolvedValue([{
          id: "visual_final_a",
          characterId: "character_project_a",
          kind: "final_reference",
          version: 2,
          status: "available",
          asset: { id: "asset_final_a", status: "ready", sha256: DIGEST },
          sourceVisualId: "visual_preview_a",
          sourceVisual: {
            id: "visual_preview_a",
            characterId: "character_project_a",
            kind: "preview_front",
            asset: { id: "asset_preview_a", status: "ready", sha256: DIGEST },
          },
        }]),
      },
    };
    const service = new PersistentG2TaskCreateGuardService(
      { database: () => database } as never,
      {} as never,
      {} as never,
      { getActiveProviderType: () => "grok" } as never,
    );
    const shot = {
      id: "shot_001",
      order: 1,
      beatId: "beat_001",
      sceneId: "scene_001",
      characterIds: ["character_project_a"],
      coreAction: "角色 A 推开门",
      emotion: "警觉",
      shotType: "medium",
      cameraAngle: "eye_level",
      comic: { panelDescription: "角色 A 站在门口", composition: "人物居中", dialogue: "", caption: "", panelRhythm: "normal" },
      motion: { visualDescription: "推门", compositionDesign: "中景", cameraMovement: "static", frameType: "action", durationMs: 2000, durationHint: "约 2s", voiceLines: [] },
      promptDraft: "",
    };
    const preflight = {
      styleCheck: { comicFormat: "vertical_scroll", artStyle: "comic_style" },
      sourceSnapshot: {
        characters: [{
          characterId: "character_project_a",
          visualId: "visual_final_a",
          assetId: "asset_final_a",
          assetSha256: DIGEST,
        }],
        scenes: [],
      },
    };
    const story = {
      characters: [{
        id: "story_character_a",
        projectCharacterId: "character_project_a",
        name: "角色 A",
        visualTraits: "短发，黑色外套",
      }],
      scenes: [{
        id: "scene_001",
        name: "旧门厅",
        location: "仓库",
        timeOfDay: "夜",
        atmosphere: "紧张",
      }],
    };

    const build = await (service as unknown as {
      buildPromptSpec(scope: unknown, shot: unknown, preflight: unknown, story: unknown): Promise<{
        promptSpec: { referenceAssets: Array<Record<string, unknown>> };
        additionalSources: Array<Record<string, unknown>>;
      }>;
    }).buildPromptSpec(
      { projectId: "project_001", chapterId: "chapter_001" },
      shot,
      preflight,
      story,
    );

    expect(build.promptSpec.referenceAssets).toEqual([expect.objectContaining({
      assetId: "asset_preview_a",
      kind: "character_identity",
      label: "角色 A",
      sourceReferenceKind: "preview_front",
    })]);
    expect(build.additionalSources).toEqual([{
      role: "character_identity_visual",
      sourceType: "character_visual",
      sourceId: "visual_preview_a",
      sourceDigest: DIGEST,
    }]);

    const projection = (service as unknown as {
      buildShotProjection(...args: unknown[]): { sources: Array<Record<string, unknown>> };
    }).buildShotProjection(
      { projectId: "project_001", chapterId: "chapter_001" },
      "image_generate",
      "shot_001",
      "board_001",
      DIGEST,
      DIGEST,
      { id: "preflight_001", sourceDigest: DIGEST },
      preflight,
      shot,
      build.additionalSources,
    );
    expect(projection.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "character_visual", sourceId: "visual_final_a" }),
      expect.objectContaining({ role: "character_identity_visual", sourceId: "visual_preview_a" }),
    ]));

    database.characterVisual.findMany.mockResolvedValue([{
      id: "visual_final_a",
      characterId: "character_project_a",
      kind: "final_reference",
      version: 2,
      status: "available",
      asset: { id: "asset_final_a", status: "ready", sha256: DIGEST },
      sourceVisualId: null,
      sourceVisual: null,
    }, {
      id: "visual_preview_a",
      characterId: "character_project_a",
      kind: "preview_front",
      version: 1,
      status: "available",
      asset: { id: "asset_preview_a", status: "ready", sha256: DIGEST },
      sourceVisualId: null,
      sourceVisual: null,
    }]);
    const legacyBuild = await (service as unknown as {
      buildPromptSpec(scope: unknown, shot: unknown, preflight: unknown, story: unknown): Promise<{
        promptSpec: { referenceAssets: Array<Record<string, unknown>> };
        additionalSources: Array<Record<string, unknown>>;
      }>;
    }).buildPromptSpec(
      { projectId: "project_001", chapterId: "chapter_001" },
      shot,
      preflight,
      story,
    );
    expect(legacyBuild.promptSpec.referenceAssets).toEqual([expect.objectContaining({
      assetId: "asset_preview_a",
      sourceReferenceKind: "preview_front",
    })]);
    expect(legacyBuild.additionalSources).toEqual([expect.objectContaining({
      sourceId: "visual_preview_a",
      sourceDigest: DIGEST,
    })]);
  });
});
