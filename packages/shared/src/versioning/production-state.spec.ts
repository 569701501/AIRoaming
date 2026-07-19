import { describe, expect, it } from "vitest";
import { digestCanonicalJson, sha256Text } from "./canonical-json.js";
import { resolveChapterProductionState, type ChapterVersionGraphInput, type VersionGraphArtifact } from "./production-state.js";
import { sourceSnapshotDigest } from "./source-snapshot.js";

const d1 = sha256Text("one");
const d2 = sha256Text("two");

function artifact(id: string, sourceId: string | null, sourceDigest: typeof d1 | null, policy: string, status: VersionGraphArtifact["status"] = "confirmed"): VersionGraphArtifact {
  return { id, projectId: "project_001", chapterId: "chapter_001", status, sourceId, sourceDigest, documentDigest: d1, sourcePolicyVersion: policy };
}

function baseInput(): ChapterVersionGraphInput {
  const snapshot = {
    schemaVersion: 1 as const, policyVersion: "preflight-source-v2" as const, projectId: "project_001", chapterId: "chapter_001", consumerType: "preflight_revision" as const,
    storyboard: { id: "board_001", digest: d1 }, style: { comicFormat: "vertical_scroll" as const, artStyle: "comic_style", styleDigest: d1 },
    characters: [], scenes: [],
  };
  const script = { id: "script_001", projectId: "project_001", chapterId: "chapter_001", status: "confirmed" as const, sourceDigest: d1 };
  const story = artifact("story_001", script.id, script.sourceDigest, "story-source-v1");
  const board = artifact("board_001", story.id, story.documentDigest!, "storyboard-source-v1");
  const preflight = artifact("preflight_001", board.id, sourceSnapshotDigest(snapshot), "preflight-source-v2");
  return {
    chapter: { id: "chapter_001", projectId: "project_001", rowVersion: 8, milestoneStatus: "storyboard_done", scriptWorkingText: "正文", scriptWorkingDigest: d1, currentScriptVersionId: script.id, currentStoryVersionId: story.id, pendingStoryVersionId: null, currentStoryboardVersionId: board.id, pendingStoryboardVersionId: null, currentPreflightRevisionId: preflight.id },
    currentScript: script, currentStory: story, pendingStory: null, currentStoryboard: board, pendingStoryboard: null, currentPreflight: preflight, currentPreflightSourceSnapshot: snapshot, historyCounts: { script: 1, story: 1, storyboard: 1, preflight: 1 },
  };
}

describe("ChapterProductionState resolver", () => {
  it("returns current for a fully confirmed chain", () => {
    const state = resolveChapterProductionState(baseInput(), "2026-07-12T00:00:00.000Z");
    expect(state.script.freshness).toBe("current");
    expect(state.story.freshness).toBe("current");
    expect(state.storyboard.freshness).toBe("current");
    expect(state.preflight.freshness).toBe("current");
    expect(state.earliestAttentionStep).toBe("image_preflight");
  });

  it("marks preflight stale when the live scene visual input changes", () => {
    const input = baseInput();
    const liveInput = {
      ...input,
      livePreflightSourceSnapshot: {
        ...input.currentPreflightSourceSnapshot!,
        scenes: [
          {
            chapterSceneId: "chapter_scene_001",
            sceneKey: "scene_001",
            visualId: "scene_visual_002",
            assetId: "asset_002",
            assetSha256: d2,
          },
        ],
      },
    };

    const state = resolveChapterProductionState(liveInput);

    expect(state.story.freshness).toBe("current");
    expect(state.storyboard.freshness).toBe("current");
    expect(state.preflight.freshness).toBe("stale");
    expect(state.preflight.reasonCodes).toContain("PREFLIGHT_SCENE_INPUT_CHANGED");
  });

  it("classifies live character and style changes with dedicated preflight reasons", () => {
    const characterInput = baseInput();
    const characterState = resolveChapterProductionState({
      ...characterInput,
      livePreflightSourceSnapshot: {
        ...characterInput.currentPreflightSourceSnapshot!,
        characters: [{
          characterId: "character_001",
          required: true,
          generationInputDigest: d2,
          visualId: null,
          assetId: null,
          assetSha256: null,
        }],
      },
    });
    expect(characterState.preflight).toMatchObject({
      freshness: "stale",
      reasonCodes: ["PREFLIGHT_CHARACTER_INPUT_CHANGED"],
    });

    const styleInput = baseInput();
    const styleState = resolveChapterProductionState({
      ...styleInput,
      livePreflightSourceSnapshot: {
        ...styleInput.currentPreflightSourceSnapshot!,
        style: {
          ...styleInput.currentPreflightSourceSnapshot!.style,
          artStyle: "watercolor",
          styleDigest: d2,
        },
      },
    });
    expect(styleState.preflight).toMatchObject({
      freshness: "stale",
      reasonCodes: ["PREFLIGHT_STYLE_INPUT_CHANGED"],
    });
  });

  it("surfaces pending before current and does not erase the current id", () => {
    const input = baseInput();
    const pending = artifact("story_pending_002", "script_001", d1, "story-source-v1", "pending_confirmation");
    input.chapter.pendingStoryVersionId = pending.id;
    input.pendingStory = { ...pending, pendingReadiness: "ready" };
    const state = resolveChapterProductionState(input);
    expect(state.story.currentVersionId).toBe("story_001");
    expect(state.story.pendingVersionId).toBe(pending.id);
    expect(state.story.freshness).toBe("pending");
    expect(state.story.pendingReadiness).toBe("ready");
    expect(state.story.reasonCodes).toContain("STORY_PENDING_CONFIRMATION");
  });

  it("distinguishes an import pending and blocks the derived chain", () => {
    const input = baseInput();
    input.chapter.hasAiPending = false;
    input.chapter.hasScriptPending = true;
    input.chapter.pendingKind = "import";
    const state = resolveChapterProductionState(input);
    expect(state.script).toMatchObject({
      hasAiPending: false,
      hasScriptPending: true,
      pendingKind: "import",
    });
    expect(state.script.reasonCodes).toContain("SCRIPT_IMPORT_PENDING");
    expect(state.story.freshness).toBe("stale");
    expect(state.earliestAttentionStep).toBe("project_story");
  });

  it("marks source changes stale and propagates upstream stale", () => {
    const input = baseInput();
    input.currentStory = { ...input.currentStory!, sourceDigest: d2 };
    const state = resolveChapterProductionState(input);
    expect(state.story.freshness).toBe("stale");
    expect(state.story.reasonCodes).toContain("STORY_SOURCE_SCRIPT_CHANGED");
    expect(state.storyboard.freshness).toBe("stale");
    expect(state.storyboard.reasonCodes).toContain("UPSTREAM_STALE");
    expect(state.preflight.freshness).toBe("stale");
  });

  it("distinguishes missing, dirty and unresolved states", () => {
    const input = baseInput();
    input.chapter.currentScriptVersionId = null;
    input.currentScript = null;
    input.chapter.scriptWorkingText = "";
    input.chapter.scriptWorkingDigest = null;
    const state = resolveChapterProductionState(input);
    expect(state.script.freshness).toBeNull();
    expect(state.script.reasonCodes).toEqual(expect.arrayContaining(["SCRIPT_VERSION_MISSING", "SCRIPT_WORKING_EMPTY"]));
    expect(state.story.reasonCodes).toContain("STORY_SOURCE_UNRESOLVED");

    const dirtyInput = baseInput();
    dirtyInput.chapter.scriptWorkingDigest = d2;
    const dirtyState = resolveChapterProductionState(dirtyInput);
    expect(dirtyState.script.workingState).toBe("dirty");
    expect(dirtyState.story.freshness).toBe("stale");

    const unresolvedInput = baseInput();
    unresolvedInput.currentStory = { ...unresolvedInput.currentStory!, sourceId: null, sourceDigest: null };
    const unresolvedState = resolveChapterProductionState(unresolvedInput);
    expect(unresolvedState.story.reasonCodes).toContain("STORY_SOURCE_UNRESOLVED");
  });

  it("rejects unsupported source policies as stale", () => {
    const input = baseInput();
    input.currentStory = { ...input.currentStory!, sourcePolicyVersion: "story-source-v0" };
    const state = resolveChapterProductionState(input);
    expect(state.story.freshness).toBe("stale");
    expect(state.story.reasonCodes).toContain("SOURCE_POLICY_UNSUPPORTED");
  });

  it("keeps a readable v1 preflight historical but marks it stale under v2", () => {
    const input = baseInput();
    input.currentPreflight = { ...input.currentPreflight!, sourcePolicyVersion: "preflight-source-v1" };
    input.currentPreflightSourceSnapshot = {
      ...input.currentPreflightSourceSnapshot!,
      policyVersion: "preflight-source-v1",
    };
    const state = resolveChapterProductionState(input);
    expect(state.preflight.freshness).toBe("stale");
    expect(state.preflight.reasonCodes).toContain("SOURCE_POLICY_UNSUPPORTED");
  });
});
