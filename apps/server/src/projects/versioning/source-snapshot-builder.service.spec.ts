import { describe, expect, it } from "vitest";
import { digestCanonicalJson } from "@airoaming/shared";
import { SourceSnapshotBuilderService } from "./source-snapshot-builder.service.js";

const projectId = "project-policy-v2";
const chapterId = "chapter-policy-v2";
const sceneId = "scene-1";

function shot(order: number, characterIds: string[]) {
  return {
    id: `shot-${order}`,
    order,
    beatId: null,
    sceneId,
    characterIds,
    coreAction: "站在场景中",
    emotion: "警觉",
    shotType: "medium",
    cameraAngle: "eye_level",
    comic: { panelDescription: "主体出镜", composition: "居中", dialogue: "", caption: "", panelRhythm: "normal" },
    motion: { visualDescription: "主体出镜", compositionDesign: "居中", cameraMovement: "static", frameType: "atmosphere", durationMs: 1000, durationHint: "1s", voiceLines: [] },
    promptDraft: "",
  };
}

function previewVisual(id: string) {
  return {
    id: `visual-${id}`,
    kind: "preview_front",
    asset: { id: `asset-${id}`, sha256: digestCanonicalJson({ id }), status: "ready" },
  };
}

function character(
  id: string,
  level: string,
  entityType: string,
  options: { preview?: boolean } = {},
) {
  const preview = options.preview ? previewVisual(id) : null;
  return {
    id,
    name: id,
    level,
    entityType,
    appearance: "稳定外观",
    personality: "",
    promptFragment: "",
    previewVisualId: preview?.id ?? null,
    previewVisual: preview,
    primaryVisualId: null,
    primaryVisual: null,
    rowVersion: 1,
  };
}

describe("Preflight v2 character visual policy", () => {
  it("uses level + entityType and never upgrades requirements from appearanceCount", async () => {
    const storyboard = {
      schemaVersion: 2,
      chapterId,
      shots: [
        shot(1, ["minor-human", "creature", "group", "voice", "chapter-human"]),
        shot(2, ["minor-human"]),
      ],
      notes: "",
    };
    const row = {
      id: chapterId,
      projectId,
      currentStoryVersionId: "story-current",
      currentStoryVersion: { id: "story-current", status: "confirmed" },
      currentStoryboardVersionId: "board-current",
      currentStoryboardVersion: {
        id: "board-current",
        status: "confirmed",
        schemaVersion: 2,
        documentJson: storyboard,
        documentDigest: digestCanonicalJson(storyboard),
      },
    };
    const reader = {
      project: { findUnique: async () => ({ id: projectId, comicFormat: "vertical_scroll", artStyle: "comic_style" }) },
      character: {
        findMany: async () => [
          character("minor-human", "minor", "human", { preview: true }),
          character("creature", "chapter", "creature", { preview: true }),
          character("group", "chapter", "group", { preview: true }),
          character("voice", "chapter", "voice"),
          character("chapter-human", "chapter", "human", { preview: true }),
        ],
      },
      chapterScene: {
        findMany: async () => [{
          id: "chapter-scene-1",
          sceneKey: sceneId,
          currentVisualId: "scene-visual-1",
          currentVisual: {
            id: "scene-visual-1",
            asset: { id: "scene-asset-1", sha256: digestCanonicalJson({ scene: 1 }), status: "ready" },
          },
        }],
      },
    };
    const service = new SourceSnapshotBuilderService(
      { database: () => reader } as never,
      { findByScope: async () => row } as never,
    );

    const result = await service.build({ projectId, chapterId }, "policy-v2", reader as never);
    const checks = new Map(result.document.characterChecks.map((item) => [item.characterId, item]));

    expect(result.document.policyVersion).toBe("preflight-source-v2");
    expect(checks.get("minor-human")).toMatchObject({ appearanceCount: 2, requiredReference: true, referenceReady: true, status: "ok" });
    expect(checks.get("creature")).toMatchObject({ requiredReference: true, referenceReady: true, status: "ok" });
    expect(checks.get("group")).toMatchObject({ requiredReference: true, referenceReady: true, status: "ok" });
    expect(checks.get("voice")).toMatchObject({ requiredReference: false, referenceReady: true, status: "ok" });
    expect(checks.get("chapter-human")).toMatchObject({ requiredReference: true, referenceReady: false, status: "blocked" });
    expect(result.document.issues.filter((item) => item.type === "missing_reference")).toHaveLength(1);
    expect(result.document.sceneChecks[0]).toMatchObject({ referenceAssetId: "scene-asset-1", referenceReady: true, status: "ok" });
    expect(result.sourceSnapshot.scenes[0]).toMatchObject({ visualId: "scene-visual-1", assetId: "scene-asset-1" });
  });
});
