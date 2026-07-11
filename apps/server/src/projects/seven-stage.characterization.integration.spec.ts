import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildStoryStructure,
  SevenStageFixture,
} from "./test-support/seven-stage-fixture.js";

describe("七阶段 Service 行为刻画", () => {
  let fixture: SevenStageFixture;

  beforeEach(async () => {
    fixture = await new SevenStageFixture().start();
  });

  afterEach(async () => {
    await fixture.dispose();
  });

  it("显式选择竖滑条漫创建项目后生成默认章节且只有剧本步骤激活", async () => {
    const ref = await fixture.createProject();
    const snapshot = await fixture.snapshot(ref);

    expect(snapshot.project.comicFormat).toBe("vertical_scroll");
    expect(snapshot.chapters).toHaveLength(1);
    expect(snapshot.currentChapter).toMatchObject({
      id: ref.chapterId,
      order: 1,
      status: "draft",
    });
    expect(snapshot.workflow.currentStepKey).toBe("project_story");
    expect(snapshot.workflow.steps.map(({ key, status }) => ({ key, status }))).toEqual([
      { key: "project_story", status: "active" },
      { key: "story_structure", status: "waiting" },
      { key: "storyboard", status: "waiting" },
      { key: "image_preflight", status: "waiting" },
      { key: "image_candidates", status: "waiting" },
      { key: "layout_export", status: "waiting" },
      { key: "asset_package", status: "waiting" },
    ]);
  });

  it("未完成剧本不能确认结构，完成后写入当前版本并激活剧情结构", async () => {
    const ref = await fixture.createProject();

    expect(await businessErrorCode(() => fixture.projects.confirmChapterStoryStructure(
      ref.projectId,
      ref.chapterId,
      { structureJson: buildStoryStructure(ref.chapterId, false) },
    ))).toBe("CHAPTER_SCRIPT_REQUIRED");
    expect((await fixture.snapshot(ref)).storyStructure).toBeNull();

    await fixture.projects.saveChapterDraft(ref.projectId, ref.chapterId, {
      sourceText: "# 第一章：雨夜来信\n\n阿澈在雨夜收到一封没有署名的信。",
      title: "第一章：雨夜来信",
      summary: "匿名信引导阿澈前往旧站",
    });
    const draft = await fixture.projects.getChapter(ref.projectId, ref.chapterId);
    expect(draft.chapter).toMatchObject({
      title: "第一章：雨夜来信",
      summary: "匿名信引导阿澈前往旧站",
      status: "draft",
    });
    expect(draft.chapter.sourceText).toContain("阿澈在雨夜收到一封没有署名的信。");
    expect(await businessErrorCode(() => fixture.projects.confirmChapterStoryStructure(
      ref.projectId,
      ref.chapterId,
      { structureJson: buildStoryStructure(ref.chapterId, false) },
    ))).toBe("CHAPTER_SCRIPT_NOT_COMPLETED");

    const completed = await fixture.completeScript(ref);
    const snapshot = await fixture.snapshot(ref);

    expect(snapshot.currentChapter).toMatchObject({
      status: "script_done",
      currentScriptVersionId: expect.stringMatching(/_script_v001$/),
    });
    expect(completed.scriptVersion.id).toBe(snapshot.currentChapter?.currentScriptVersionId);
    expect(completed.completedChapter.currentScriptVersionId).toBe(completed.scriptVersion.id);
    expect(snapshot.workflow.currentStepKey).toBe("story_structure");
    expect(snapshot.workflow.steps.map(({ key, status }) => ({ key, status }))).toEqual([
      { key: "project_story", status: "done" },
      { key: "story_structure", status: "active" },
      { key: "storyboard", status: "waiting" },
      { key: "image_preflight", status: "waiting" },
      { key: "image_candidates", status: "waiting" },
      { key: "layout_export", status: "waiting" },
      { key: "asset_package", status: "waiting" },
    ]);
  });

  it("确认结构后保存 pending 分镜不推进，确认分镜后才激活出图准备", async () => {
    const ref = await fixture.createProject();
    await fixture.completeScript(ref);

    expect(await businessErrorCode(() => fixture.savePendingStoryboard(ref))).toBe("STORY_STRUCTURE_REQUIRED");
    expect(await businessErrorCode(() => fixture.confirmStoryboard(ref))).toBe("STORY_STRUCTURE_REQUIRED");
    const beforeStructure = await fixture.snapshot(ref);
    expect(beforeStructure.storyboard).toBeNull();
    expect(beforeStructure.pendingStoryboard).toBeNull();

    await fixture.confirmStructure(ref);
    let snapshot = await fixture.snapshot(ref);
    expect(snapshot.currentChapter).toMatchObject({
      status: "structured",
      currentStoryVersionId: expect.stringMatching(/_story_v001$/),
    });
    expect(snapshot.storyStructure?.structureJson).toMatchObject({
      synopsis: "阿澈循着匿名信寻找雨夜里的真相。",
      sourceScriptVersionId: snapshot.currentChapter?.currentScriptVersionId,
    });
    expect(snapshot.workflow.currentStepKey).toBe("storyboard");

    await fixture.savePendingStoryboard(ref, { shotCount: 2, shotOrder: [2, 1] });
    snapshot = await fixture.snapshot(ref);
    expect(snapshot.currentChapter?.status).toBe("structured");
    expect(snapshot.storyboard).toBeNull();
    expect(snapshot.pendingStoryboard).toMatchObject({
      status: "pending_confirmation",
      confirmedAt: null,
    });
    expect(Object.fromEntries(
      (snapshot.pendingStoryboard?.storyboardJson.shots ?? []).map((shot) => [shot.id, shot.order]),
    )).toEqual({ shot_001: 2, shot_002: 1 });
    expect(snapshot.workflow.currentStepKey).toBe("storyboard");

    await fixture.savePendingStoryboard(ref, { shotCount: 2, shotOrder: [1, 2] });
    await fixture.confirmPendingStoryboard(ref);
    snapshot = await fixture.snapshot(ref);
    expect(snapshot.currentChapter?.status).toBe("storyboard_done");
    expect(snapshot.pendingStoryboard).toBeNull();
    expect(snapshot.storyboard).toMatchObject({
      status: "storyboard_done",
      confirmedAt: expect.any(String),
    });
    expect(snapshot.storyboard?.storyboardJson.shots.map((shot) => shot.order)).toEqual([1, 2]);
    expect(snapshot.workflow.currentStepKey).toBe("image_preflight");
  });

  it("缺少主角定稿图时阻断 preflight 和图片任务，无角色缺口时确认并激活候选阶段", async () => {
    const blockedRef = await fixture.createProject("出图准备阻断项目");
    expect(await businessErrorCode(() => fixture.projects.confirmChapterImagePreflight(
      blockedRef.projectId,
      blockedRef.chapterId,
    ))).toBe("STORYBOARD_NOT_CONFIRMED");
    expect((await fixture.snapshot(blockedRef)).imagePreflight).toBeNull();

    await fixture.completeScript(blockedRef);
    await fixture.confirmStructure(blockedRef, { withLeadCharacter: true });
    await fixture.confirmStoryboard(blockedRef, { withLeadCharacter: true });

    expect(await businessErrorCode(() => fixture.projects.confirmChapterImagePreflight(
      blockedRef.projectId,
      blockedRef.chapterId,
      { notes: "主角缺少定稿图时不得放行" },
    ))).toBe("IMAGE_PREFLIGHT_BLOCKED");
    let blockedSnapshot = await fixture.snapshot(blockedRef);
    expect(blockedSnapshot.characters).toEqual([
      expect.objectContaining({ name: "阿澈", level: "lead", status: "needs_reference" }),
    ]);
    expect(blockedSnapshot.imagePreflight).toBeNull();
    expect(blockedSnapshot.workflow.currentStepKey).toBe("image_preflight");
    expect(await businessErrorCode(() => fixture.generateCandidate(blockedRef, "shot_001")))
      .toBe("IMAGE_PREFLIGHT_NOT_CONFIRMED");
    blockedSnapshot = await fixture.snapshot(blockedRef);
    expect(blockedSnapshot.candidates).toEqual([]);
    expect(blockedSnapshot.assets).toEqual([]);
    expect(fixture.tasks.list()).toEqual([]);

    const readyRef = await fixture.createProject("出图准备放行项目");
    await fixture.completeScript(readyRef);
    await fixture.confirmStructure(readyRef);
    await fixture.confirmStoryboard(readyRef);
    const beforeConfirm = await fixture.snapshot(readyRef);
    await fixture.projects.confirmChapterImagePreflight(readyRef.projectId, readyRef.chapterId, {
      notes: "无阻断项，允许进入候选图阶段",
    });

    const readySnapshot = await fixture.snapshot(readyRef);
    expect(readySnapshot.imagePreflight).toMatchObject({
      status: "confirmed",
      sourceStoryboardId: beforeConfirm.storyboard?.id,
      sourceStoryboardUpdatedAt: beforeConfirm.storyboard?.updatedAt,
      preflightJson: {
        ready: true,
        shotCount: 1,
      },
    });
    expect(readySnapshot.workflow.currentStepKey).toBe("image_candidates");
    expect(readySnapshot.workflow.steps.find((step) => step.key === "image_preflight")?.status).toBe("done");
    expect(readySnapshot.workflow.steps.find((step) => step.key === "image_candidates")?.status).toBe("active");
  });

  it("图片任务只接受已确认分镜镜头，全镜候选锁定后才进入排版", async () => {
    const ref = await fixture.createProject("候选锁定门禁项目");
    await fixture.completeScript(ref);
    await fixture.confirmStructure(ref);
    await fixture.confirmStoryboard(ref, { shotCount: 2 });
    await fixture.projects.confirmChapterImagePreflight(ref.projectId, ref.chapterId);

    expect(await businessErrorCode(() => fixture.generateCandidate(ref, "shot_not_confirmed")))
      .toBe("GENERATION_TASK_SHOT_NOT_IN_CONFIRMED_STORYBOARD");
    expect(fixture.tasks.list()).toEqual([]);

    const firstTask = await fixture.generateCandidate(ref, "shot_001");
    const secondTask = await fixture.generateCandidate(ref, "shot_002");
    expect([firstTask.status, secondTask.status]).toEqual(["succeeded", "succeeded"]);

    let snapshot = await fixture.snapshot(ref);
    expect(snapshot.candidates).toHaveLength(2);
    expect(snapshot.assets.filter((asset) => asset.sourceTaskId)).toHaveLength(2);
    expect(snapshot.currentChapter?.status).toBe("storyboard_done");

    let response = await businessErrorResponse(() => fixture.projects.completeChapterImages(
      ref.projectId,
      ref.chapterId,
    ));
    expect(response).toMatchObject({
      code: "CHAPTER_CANDIDATES_NOT_FULLY_LOCKED",
      details: { unlockedShotIds: ["shot_001", "shot_002"] },
    });
    expect((await fixture.snapshot(ref)).currentChapter?.status).toBe("storyboard_done");

    const firstCandidate = snapshot.candidates.find((candidate) => candidate.shotId === "shot_001");
    const secondCandidate = snapshot.candidates.find((candidate) => candidate.shotId === "shot_002");
    expect(firstCandidate).toBeDefined();
    expect(secondCandidate).toBeDefined();
    await fixture.projects.lockChapterCandidate(ref.projectId, ref.chapterId, {
      candidateId: firstCandidate!.id,
    });

    response = await businessErrorResponse(() => fixture.projects.completeChapterImages(
      ref.projectId,
      ref.chapterId,
    ));
    expect(response).toMatchObject({
      code: "CHAPTER_CANDIDATES_NOT_FULLY_LOCKED",
      details: { unlockedShotIds: ["shot_002"] },
    });

    await fixture.projects.lockChapterCandidate(ref.projectId, ref.chapterId, {
      candidateId: secondCandidate!.id,
    });
    await fixture.projects.completeChapterImages(ref.projectId, ref.chapterId);

    snapshot = await fixture.snapshot(ref);
    expect(snapshot.currentChapter?.status).toBe("images_done");
    expect(snapshot.workflow.currentStepKey).toBe("layout_export");
    expect(snapshot.workflow.steps.map(({ key, status }) => ({ key, status }))).toEqual([
      { key: "project_story", status: "done" },
      { key: "story_structure", status: "done" },
      { key: "storyboard", status: "done" },
      { key: "image_preflight", status: "done" },
      { key: "image_candidates", status: "done" },
      { key: "layout_export", status: "active" },
      { key: "asset_package", status: "waiting" },
    ]);
    expect(snapshot.shots.map((shot) => ({ id: shot.id, lockedCandidateId: shot.lockedCandidateId })))
      .toEqual([
        { id: "shot_001", lockedCandidateId: firstCandidate!.id },
        { id: "shot_002", lockedCandidateId: secondCandidate!.id },
      ]);
    expect(snapshot.candidates.every((candidate) => candidate.status === "locked")).toBe(true);
  });

  it("图片阶段未完成时排版与素材包入口都拒绝且不产生成功事实", async () => {
    const ref = await fixture.createProject("排版与素材包门禁项目");
    await fixture.completeScript(ref);
    await fixture.confirmStructure(ref);
    await fixture.confirmStoryboard(ref);
    await fixture.projects.confirmChapterImagePreflight(ref.projectId, ref.chapterId);
    const before = await fixture.snapshot(ref);

    expect(await businessErrorCode(() => fixture.projects.buildChapterLayout(ref.projectId, ref.chapterId)))
      .toBe("CHAPTER_IMAGES_NOT_DONE");
    expect(await businessErrorCode(() => fixture.projects.exportChapterLayout(ref.projectId, ref.chapterId)))
      .toBe("CHAPTER_IMAGES_NOT_DONE");
    expect(await businessErrorCode(() => fixture.projects.exportAssetPackage(ref.projectId, ref.chapterId)))
      .toBe("CHAPTER_LAYOUT_NOT_DONE");

    const after = await fixture.snapshot(ref);
    expect(after.currentChapter?.status).toBe("storyboard_done");
    expect(after.chapterLayout).toBeNull();
    expect(after.assets).toEqual(before.assets);
    expect(after.workflow.currentStepKey).toBe("image_candidates");
  });

  it("确认 preflight 后修改正式分镜会让图片任务重新受门禁保护", async () => {
    const ref = await fixture.createProject("分镜变更失效项目");
    await fixture.completeScript(ref);
    await fixture.confirmStructure(ref);
    await fixture.confirmStoryboard(ref);
    await fixture.projects.confirmChapterImagePreflight(ref.projectId, ref.chapterId);
    const confirmed = await fixture.snapshot(ref);
    expect(confirmed.workflow.currentStepKey).toBe("image_candidates");
    expect(confirmed.storyboard).not.toBeNull();

    await fixture.projects.updateChapterStoryboard(ref.projectId, ref.chapterId, {
      storyboardJson: {
        ...confirmed.storyboard!.storyboardJson,
        shots: confirmed.storyboard!.storyboardJson.shots.map((shot) => ({
          ...shot,
          coreAction: `${shot.coreAction}，随后看向站台尽头`,
        })),
      },
    });

    const revised = await fixture.snapshot(ref);
    expect(revised.workflow.currentStepKey).toBe("image_preflight");
    expect(revised.imagePreflight).toBeNull();
    expect(await businessErrorCode(() => fixture.generateCandidate(ref, "shot_001")))
      .toBe("IMAGE_PREFLIGHT_NOT_CONFIRMED");
    const afterRejectedTask = await fixture.snapshot(ref);
    expect(afterRejectedTask.candidates).toEqual([]);
    expect(afterRejectedTask.assets).toEqual([]);
    expect(fixture.tasks.list()).toEqual([]);
  });

  it("在剧本、pending 分镜和 preflight checkpoint 重建 Nest context 后正式语义仍可读", async () => {
    const ref = await fixture.createProject("重开迁移见证项目");
    await fixture.projects.saveChapterDraft(ref.projectId, ref.chapterId, {
      sourceText: "# 第一章：雨夜来信\n\n阿澈在雨夜收到一封没有署名的信。",
      title: "第一章：雨夜来信",
      summary: "匿名信引导阿澈前往旧站",
    });

    await fixture.reopen();
    let reopened = await fixture.snapshot(ref);
    expect(reopened.currentChapter).toMatchObject({
      id: ref.chapterId,
      title: "第一章：雨夜来信",
      status: "draft",
      summary: "匿名信引导阿澈前往旧站",
    });
    expect(reopened.story.sourceText).toContain("阿澈在雨夜收到一封没有署名的信");
    expect(reopened.workflow.currentStepKey).toBe("project_story");

    await fixture.completeScript(ref);
    await fixture.confirmStructure(ref);
    await fixture.savePendingStoryboard(ref, { shotCount: 2, shotOrder: [2, 1] });
    const beforePendingReopen = await fixture.snapshot(ref);
    const scriptVersionId = beforePendingReopen.currentChapter?.currentScriptVersionId;
    const storyVersionId = beforePendingReopen.currentChapter?.currentStoryVersionId;
    const pendingStoryboardId = beforePendingReopen.pendingStoryboard?.id;

    await fixture.reopen();
    reopened = await fixture.snapshot(ref);
    expect(reopened.currentChapter).toMatchObject({
      status: "structured",
      currentScriptVersionId: scriptVersionId,
      currentStoryVersionId: storyVersionId,
    });
    expect(reopened.storyboard).toBeNull();
    expect(reopened.pendingStoryboard).toMatchObject({
      id: pendingStoryboardId,
      status: "pending_confirmation",
      confirmedAt: null,
    });
    expect(Object.fromEntries(
      (reopened.pendingStoryboard?.storyboardJson.shots ?? []).map((shot) => [shot.id, shot.order]),
    )).toEqual({ shot_001: 2, shot_002: 1 });
    expect(reopened.workflow.currentStepKey).toBe("storyboard");

    await fixture.confirmPendingStoryboard(ref);
    await fixture.projects.confirmChapterImagePreflight(ref.projectId, ref.chapterId, {
      notes: "migration witness",
    });
    const beforePreflightReopen = await fixture.snapshot(ref);
    const storyboardId = beforePreflightReopen.storyboard?.id;
    const storyboardUpdatedAt = beforePreflightReopen.storyboard?.updatedAt;
    const preflightId = beforePreflightReopen.imagePreflight?.id;

    await fixture.reopen();
    reopened = await fixture.snapshot(ref);
    expect(reopened.currentChapter).toMatchObject({
      status: "storyboard_done",
      currentScriptVersionId: scriptVersionId,
      currentStoryVersionId: storyVersionId,
    });
    expect(reopened.pendingStoryboard).toBeNull();
    expect(reopened.storyboard?.id).toBe(storyboardId);
    expect(reopened.imagePreflight).toMatchObject({
      id: preflightId,
      status: "confirmed",
      sourceStoryboardId: storyboardId,
      sourceStoryboardUpdatedAt: storyboardUpdatedAt,
      preflightJson: {
        ready: true,
        notes: "migration witness",
      },
    });
    expect(reopened.workflow.currentStepKey).toBe("image_candidates");
  });
});

async function businessErrorCode(action: () => Promise<unknown>): Promise<string> {
  const response = await businessErrorResponse(action);
  if (typeof response.code === "string") {
    return response.code;
  }
  if (typeof response.message === "string") {
    return response.message;
  }
  throw new Error(`BUSINESS_ERROR_CODE_MISSING:${JSON.stringify(response)}`);
}

async function businessErrorResponse(action: () => Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await action();
  } catch (error) {
    const response = typeof (error as { getResponse?: unknown })?.getResponse === "function"
      ? (error as { getResponse(): unknown }).getResponse()
      : null;
    if (typeof response === "string") {
      return { message: response };
    }
    if (response && typeof response === "object") {
      return response as Record<string, unknown>;
    }
    throw error;
  }
  throw new Error("EXPECTED_BUSINESS_ERROR");
}
