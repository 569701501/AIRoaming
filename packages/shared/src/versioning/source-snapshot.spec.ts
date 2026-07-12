import { describe, expect, it } from "vitest";
import { sha256Text } from "./canonical-json.js";
import { buildPreflightSourceSnapshot, buildSourceSnapshot, sourceSnapshotDigest } from "./source-snapshot.js";

const digest = sha256Text("source");

describe("SourceSnapshot", () => {
  it("sorts generic sources by unsigned UTF-8 role/entity/id and digests canonically", () => {
    const snapshot = buildSourceSnapshot({ projectId: "p", chapterId: "c", policyVersion: "story-source-v1", consumerType: "story_version", sources: [
      { role: "story", entityType: "z", entityId: "2", digest },
      { role: "script", entityType: "chapter_script_version", entityId: "s2", digest },
      { role: "script", entityType: "chapter_script_version", entityId: "s1", digest },
    ] });
    expect(snapshot.sources.map((item) => item.entityId)).toEqual(["s1", "s2", "2"]);
    expect(sourceSnapshotDigest(snapshot)).toMatch(/^sha256:[0-9a-f]{64}$/);
    const rebuilt = buildSourceSnapshot({ ...snapshot, sources: [...snapshot.sources].reverse() });
    expect(sourceSnapshotDigest(snapshot)).toBe(sourceSnapshotDigest(rebuilt));
  });

  it("rejects duplicate source identity and invalid digest", () => {
    expect(() => buildSourceSnapshot({ projectId: "p", chapterId: "c", policyVersion: "x", consumerType: "x", sources: [
      { role: "r", entityType: "e", entityId: "1", digest }, { role: "r", entityType: "e", entityId: "1", digest },
    ] })).toThrow(/duplicate/);
    expect(() => buildSourceSnapshot({ projectId: "p", chapterId: "c", policyVersion: "x", consumerType: "x", sources: [{ role: "r", entityType: "e", entityId: "1", digest: "sha256:bad" as typeof digest }] })).toThrow(/sha256/);
  });

  it("sorts preflight character/scene inputs and enforces asset triple atomicity", () => {
    const snapshot = buildPreflightSourceSnapshot({
      policyVersion: "preflight-source-v1", projectId: "p", chapterId: "c", consumerType: "preflight_revision",
      storyboard: { id: "board", digest }, style: { comicFormat: "paged_comic", artStyle: "comic_style", styleDigest: digest },
      characters: [
        { characterId: "b", required: false, generationInputDigest: digest, visualId: null, assetId: null, assetSha256: null },
        { characterId: "a", required: true, generationInputDigest: digest, visualId: "visual_a", assetId: "asset_a", assetSha256: digest },
      ],
      scenes: [
        { chapterSceneId: "scene_b", sceneKey: "b", visualId: null, assetId: null, assetSha256: null },
        { chapterSceneId: "scene_a", sceneKey: "a", visualId: null, assetId: null, assetSha256: null },
      ],
    });
    expect(snapshot.characters.map((item) => item.characterId)).toEqual(["a", "b"]);
    expect(snapshot.scenes.map((item) => item.chapterSceneId)).toEqual(["scene_a", "scene_b"]);
    expect(() => buildPreflightSourceSnapshot({ ...snapshot, characters: [{ ...snapshot.characters[0], assetId: null }] })).toThrow(/all null or all filled/);
  });
});
