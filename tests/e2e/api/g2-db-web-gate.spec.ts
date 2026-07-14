import { digestCanonicalJson, type ApiEnvelope, type ScriptWorkingCopyDto, type StoryWorkingCopyDto, type StoryboardWorkingCopyDto } from "@airoaming/shared";
import { expect, test } from "../support/e2e-fixture.ts";

test.describe("W1 DB-only Web/API gate", () => {
  test("W1-API-01～07：Story→Storyboard→Preflight 全程只走 DB Working Copy/Revision", async ({ api, page, rainSmokeProject }) => {
    const projectId = rainSmokeProject.id;
    const workbench = await api.get<{ snapshot: { versioningCapability: { mode: string }; currentChapter: { id: string } | null } }>(`/projects/${projectId}/workbench`);
    expect(workbench.data.snapshot.versioningCapability.mode).toBe("g2_db");
    const chapterId = workbench.data.snapshot.currentChapter?.id;
    expect(chapterId).toBeTruthy();

    const script = await api.get<ScriptWorkingCopyDto>(`/projects/${projectId}/chapters/${chapterId}/script/working-copy`);
    const scriptUpdated = await api.patch<{ value: ScriptWorkingCopyDto }>(`/projects/${projectId}/chapters/${chapterId}/script/working-copy`, {
      sourceText: "林夏在雨夜站台等末班车，广播异常，空车进站。",
      expectedChapterRowVersion: script.data.chapterRowVersion,
    });
    const published = await api.post<{ scriptVersion: { id: string; sourceDigest: `sha256:${string}` }; workingCopy: ScriptWorkingCopyDto }>(`/projects/${projectId}/chapters/${chapterId}/script/publish`, {
      expectedCurrentScriptVersionId: scriptUpdated.data.value.currentVersion?.id ?? null,
      expectedWorkingDigest: scriptUpdated.data.value.digest,
      expectedChapterRowVersion: scriptUpdated.data.value.chapterRowVersion,
      createNextChapter: false,
    });
    expect(published.data.scriptVersion.id).toBeTruthy();

    const storyDoc = {
      schemaVersion: 2,
      chapterId,
      synopsis: "雨夜站台的异常广播。",
      direction: { logline: "末班车带来未知转折。", chapterGoal: "建立悬念。", coreConflict: "等待与异常。", emotionalArc: "不安到决心。", endingHook: "空车进站。" },
      characters: [],
      scenes: [],
      beats: [],
      notes: "",
    } as const;
    const story = await api.get<StoryWorkingCopyDto>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy`);
    const storyCreated = await api.post<{ value: StoryWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy`, {
      mode: "empty",
      expectedCurrentVersionId: story.data.current?.id ?? null,
      expectedSourceScriptVersionId: published.data.scriptVersion.id,
      expectedChapterRowVersion: published.data.workingCopy.chapterRowVersion,
    });
    const storyUpdated = await api.patch<{ value: StoryWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy`, {
      pendingVersionId: storyCreated.data.value.pending?.id,
      document: storyDoc,
      expectedPendingRowVersion: storyCreated.data.value.pending?.rowVersion ?? 0,
      expectedChapterRowVersion: storyCreated.data.chapterRowVersion,
    });
    await api.post(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy/confirm`, {
      pendingVersionId: storyUpdated.data.value.pending?.id,
      expectedPendingDocumentDigest: digestCanonicalJson(storyDoc),
      expectedPendingRowVersion: storyUpdated.data.value.pending?.rowVersion ?? 0,
      expectedCurrentVersionId: story.data.current?.id ?? null,
      expectedSourceScriptVersionId: published.data.scriptVersion.id,
      expectedSourceDigest: published.data.scriptVersion.sourceDigest,
      expectedChapterRowVersion: storyUpdated.data.chapterRowVersion,
    });
    const scriptAfterStory = await api.get<ScriptWorkingCopyDto>(`/projects/${projectId}/chapters/${chapterId}/script/working-copy`);

    const board = await api.get<StoryboardWorkingCopyDto>(`/projects/${projectId}/chapters/${chapterId}/storyboard/working-copy`);
    const boardCreated = await api.post<{ value: StoryboardWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/storyboard/working-copy`, {
      mode: "empty",
      expectedCurrentVersionId: board.data.current?.id ?? null,
      expectedSourceStoryVersionId: storyUpdated.data.value.pending?.id,
      expectedChapterRowVersion: scriptAfterStory.data.chapterRowVersion,
    });
    const boardDoc = { schemaVersion: 2, chapterId, shots: [], notes: "" } as const;
    const boardUpdated = await api.patch<{ value: StoryboardWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/storyboard/working-copy`, {
      pendingVersionId: boardCreated.data.value.pending?.id,
      document: boardDoc,
      expectedPendingRowVersion: boardCreated.data.value.pending?.rowVersion ?? 0,
      expectedChapterRowVersion: boardCreated.data.chapterRowVersion,
    });
    await api.post(`/projects/${projectId}/chapters/${chapterId}/storyboard/working-copy/confirm`, {
      pendingVersionId: boardUpdated.data.value.pending?.id,
      expectedPendingDocumentDigest: digestCanonicalJson(boardDoc),
      expectedPendingRowVersion: boardUpdated.data.value.pending?.rowVersion ?? 0,
      expectedCurrentVersionId: board.data.current?.id ?? null,
      expectedSourceStoryVersionId: storyUpdated.data.value.pending?.id,
      expectedSourceDigest: digestCanonicalJson(storyDoc),
      expectedChapterRowVersion: boardUpdated.data.chapterRowVersion,
    });

    const preview = await api.get<{ preview: { notes: string }; sourceDigest: `sha256:${string}`; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/image-preflight/preview`);
    await api.post(`/projects/${projectId}/chapters/${chapterId}/image-preflight/confirm`, {
      expectedSourceStoryboardVersionId: boardUpdated.data.value.pending?.id,
      expectedSourceDigest: preview.data.sourceDigest,
      expectedChapterRowVersion: preview.data.chapterRowVersion,
      notes: preview.data.preview.notes,
    });

    await page.goto(`/projects/${projectId}/structure`);
    await expect(page.getByTestId("story-db-versioning-status")).toContainText("DB Working Copy");
    await page.goto(`/projects/${projectId}/storyboard`);
    await expect(page.getByTestId("storyboard-db-versioning-status")).toContainText("DB Working Copy");
    await page.goto(`/projects/${projectId}/preflight`);
    await expect(page.getByTestId("preflight-db-versioning-status")).toContainText("DB Revision");

    const legacy = await api.patch<Record<string, unknown>>(`/projects/${projectId}/chapters/${chapterId}/story-structure`, { structureJson: {} }).catch((error: Error) => error.message);
    expect(String(legacy)).toContain("E2E_API_REQUEST_FAILED");
  });
});
