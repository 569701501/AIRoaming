import { describe, expect, it } from "vitest";
import type { ProjectCandidate, StoryboardShot } from "@airoaming/shared";

/**
 * 纯函数级锁定规则测试（与 ImageCandidateService.lockCandidate 对齐）：
 * 同一 shot 只能有一个 locked 候选。
 */
function applyLock(
  candidates: ProjectCandidate[],
  shots: StoryboardShot[],
  candidateId: string,
  now: string,
): { candidates: ProjectCandidate[]; shots: StoryboardShot[] } {
  const target = candidates.find((item) => item.id === candidateId);
  if (!target) {
    throw new Error("CANDIDATE_NOT_FOUND");
  }
  const nextCandidates = candidates.map((item) => {
    if (item.id === target.id) {
      return { ...item, status: "locked" as const, updatedAt: now };
    }
    if (item.shotId === target.shotId && item.status === "locked") {
      return { ...item, status: "generated" as const, updatedAt: now };
    }
    return item;
  });
  const nextShots = shots.map((shot) => {
    if (shot.id !== target.shotId) {
      return shot;
    }
    return {
      ...shot,
      lockedCandidateId: target.id,
      status: "locked" as const,
    };
  });
  return { candidates: nextCandidates, shots: nextShots };
}

function canCompleteImages(shots: StoryboardShot[]): boolean {
  return shots.length > 0 && shots.every((shot) => Boolean(shot.lockedCandidateId));
}

function makeCandidate(id: string, shotId: string, status: ProjectCandidate["status"] = "generated"): ProjectCandidate {
  return {
    id,
    projectId: "p1",
    chapterId: "c1",
    shotId,
    taskId: "t1",
    assetId: `asset_${id}`,
    index: 1,
    status,
    label: id,
    promptDigest: "abc",
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  };
}

function makeShot(id: string, lockedCandidateId: string | null = null): StoryboardShot {
  return {
    id,
    order: 1,
    beatId: null,
    sceneId: null,
    characterIds: [],
    coreAction: "action",
    emotion: "",
    shotType: "medium",
    cameraAngle: "eye_level",
    comic: {
      panelDescription: "",
      composition: "",
      dialogue: "",
      caption: "",
      panelRhythm: "normal",
    },
    motion: {
      visualDescription: "",
      compositionDesign: "",
      cameraMovement: "static",
      frameType: "atmosphere",
      durationMs: 2000,
      durationHint: "2s",
      voiceLines: [],
    },
    promptDraft: "",
    lockedCandidateId,
    status: lockedCandidateId ? "locked" : "image_generated",
  };
}

describe("candidate lock rules", () => {
  it("同一镜头只能保留一个锁定候选", () => {
    const candidates = [
      makeCandidate("a", "shot_1", "locked"),
      makeCandidate("b", "shot_1", "generated"),
      makeCandidate("c", "shot_2", "locked"),
    ];
    const shots = [
      makeShot("shot_1", "a"),
      makeShot("shot_2", "c"),
    ];
    const result = applyLock(candidates, shots, "b", "2026-07-09T01:00:00.000Z");
    expect(result.candidates.find((item) => item.id === "b")?.status).toBe("locked");
    expect(result.candidates.find((item) => item.id === "a")?.status).toBe("generated");
    expect(result.candidates.find((item) => item.id === "c")?.status).toBe("locked");
    expect(result.shots.find((item) => item.id === "shot_1")?.lockedCandidateId).toBe("b");
  });

  it("全镜锁定后才能完成本章候选图", () => {
    expect(canCompleteImages([makeShot("s1", "a"), makeShot("s2", null)])).toBe(false);
    expect(canCompleteImages([makeShot("s1", "a"), makeShot("s2", "b")])).toBe(true);
    expect(canCompleteImages([])).toBe(false);
  });
});
