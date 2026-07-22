import { digestCanonicalJson, type ScriptWorkingCopyDto, type StoryWorkingCopyDto, type StoryboardWorkingCopyDto } from "@airoaming/shared";
import { E2EApiClient, expect, test } from "../support/e2e-fixture.ts";

type StorySummary = { id: string; documentDigest: `sha256:${string}`; rowVersion: number | null };
type PublishedScript = { id: string; sourceDigest: `sha256:${string}`; chapterRowVersion: number };

function storyDocument(chapterId: string, synopsis: string) {
  return {
    schemaVersion: 2 as const,
    chapterId,
    synopsis,
    direction: { logline: "末班车带来未知转折。", chapterGoal: "建立悬念。", coreConflict: "等待与异常。", emotionalArc: "不安到决心。", endingHook: "空车进站。" },
    characters: [],
    scenes: [],
    beats: [],
    notes: "",
  };
}

async function publishScript(api: E2EApiClient, projectId: string, chapterId: string): Promise<PublishedScript> {
  const script = await api.get<ScriptWorkingCopyDto>(`/projects/${projectId}/chapters/${chapterId}/script/working-copy`);
  const updated = await api.patch<{ value: ScriptWorkingCopyDto }>(`/projects/${projectId}/chapters/${chapterId}/script/working-copy`, {
    sourceText: "林夏在雨夜站台等末班车，广播异常，空车进站。",
    expectedChapterRowVersion: script.data.chapterRowVersion,
  });
  const published = await api.post<{ scriptVersion: { id: string; sourceDigest: `sha256:${string}` }; workingCopy: ScriptWorkingCopyDto }>(`/projects/${projectId}/chapters/${chapterId}/script/publish`, {
    expectedCurrentScriptVersionId: updated.data.value.currentVersion?.id ?? null,
    expectedWorkingDigest: updated.data.value.digest,
    expectedChapterRowVersion: updated.data.value.chapterRowVersion,
    createNextChapter: false,
  });
  return { id: published.data.scriptVersion.id, sourceDigest: published.data.scriptVersion.sourceDigest, chapterRowVersion: published.data.workingCopy.chapterRowVersion };
}

async function confirmStory(api: E2EApiClient, projectId: string, chapterId: string, script: PublishedScript, current: StorySummary | null, synopsis: string) {
  const working = await api.get<StoryWorkingCopyDto>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy`);
  const created = await api.post<{ value: StoryWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy`, {
    mode: current ? "clone_current" : "empty",
    expectedCurrentVersionId: current?.id ?? working.data.current?.id ?? null,
    expectedSourceScriptVersionId: script.id,
    expectedChapterRowVersion: script.chapterRowVersion,
  });
  const document = storyDocument(chapterId, synopsis);
  const updated = await api.patch<{ value: StoryWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy`, {
    pendingVersionId: created.data.value.pending?.id,
    document,
    expectedPendingRowVersion: created.data.value.pending?.rowVersion ?? 0,
    expectedChapterRowVersion: created.data.chapterRowVersion,
  });
  const confirmed = await api.post<{ value: { current: StorySummary }; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy/confirm`, {
    pendingVersionId: updated.data.value.pending?.id,
    expectedPendingDocumentDigest: digestCanonicalJson(document),
    expectedPendingRowVersion: updated.data.value.pending?.rowVersion ?? 0,
    expectedCurrentVersionId: current?.id ?? null,
    expectedSourceScriptVersionId: script.id,
    expectedSourceDigest: script.sourceDigest,
    expectedChapterRowVersion: updated.data.chapterRowVersion,
  });
  return { current: confirmed.data.value.current, chapterRowVersion: confirmed.data.chapterRowVersion, document };
}

async function confirmEmptyStoryboard(api: E2EApiClient, projectId: string, chapterId: string, story: StorySummary, chapterRowVersion: number) {
  const working = await api.get<StoryboardWorkingCopyDto>(`/projects/${projectId}/chapters/${chapterId}/storyboard/working-copy`);
  const created = await api.post<{ value: StoryboardWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/storyboard/working-copy`, {
    mode: "empty",
    expectedCurrentVersionId: working.data.current?.id ?? null,
    expectedSourceStoryVersionId: story.id,
    expectedChapterRowVersion: chapterRowVersion,
  });
  const document = { schemaVersion: 2 as const, chapterId, shots: [], notes: "" };
  const updated = await api.patch<{ value: StoryboardWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/storyboard/working-copy`, {
    pendingVersionId: created.data.value.pending?.id,
    document,
    expectedPendingRowVersion: created.data.value.pending?.rowVersion ?? 0,
    expectedChapterRowVersion: created.data.chapterRowVersion,
  });
  const confirmed = await api.post<{ value: { current: { id: string; documentDigest: `sha256:${string}` } }; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/storyboard/working-copy/confirm`, {
    pendingVersionId: updated.data.value.pending?.id,
    expectedPendingDocumentDigest: digestCanonicalJson(document),
    expectedPendingRowVersion: updated.data.value.pending?.rowVersion ?? 0,
    expectedCurrentVersionId: working.data.current?.id ?? null,
    expectedSourceStoryVersionId: story.id,
    expectedSourceDigest: story.documentDigest,
    expectedChapterRowVersion: updated.data.chapterRowVersion,
  });
  return { current: confirmed.data.value.current, chapterRowVersion: confirmed.data.chapterRowVersion };
}

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

    await page.goto(`/projects/${projectId}/structure`);
    const pendingStoryboardStage = page.getByRole("button", { name: "3 分镜工作台", exact: true });
    await expect(pendingStoryboardStage).toBeVisible();
    await expect(pendingStoryboardStage).toBeEnabled();
    await pendingStoryboardStage.click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/storyboard$`));
    await expect(page.getByRole("region", { name: "分镜工作台", exact: true })).toBeVisible();
    await expect(page.getByText("待确认预览", { exact: true })).toBeVisible();

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
    await expect(page.getByTestId("story-db-versioning-status")).toHaveCount(0);
    await page.goto(`/projects/${projectId}/storyboard`);
    await expect(page.getByTestId("storyboard-db-versioning-status")).toHaveCount(0);
    await page.goto(`/projects/${projectId}/preflight`);
    await expect(page.getByTestId("preflight-db-versioning-status")).toHaveCount(0);

    const legacy = await api.patch<Record<string, unknown>>(`/projects/${projectId}/chapters/${chapterId}/story-structure`, { structureJson: {} }).catch((error: Error) => error.message);
    expect(String(legacy)).toContain("E2E_API_REQUEST_FAILED");
  });

  test("W1-E2E-01～04：dirty gate、双页签 CAS 冲突、stale 与历史复制", async ({ api, page, rainSmokeProject }) => {
    const projectId = rainSmokeProject.id;
    const workbench = await api.get<{ snapshot: { currentChapter: { id: string } | null } }>(`/projects/${projectId}/workbench`);
    const chapterId = workbench.data.snapshot.currentChapter?.id;
    expect(chapterId).toBeTruthy();

    const script = await publishScript(api, projectId, chapterId!);
    const storyV1 = await confirmStory(api, projectId, chapterId!, script, null, "第一版结构");

    const scriptAfterV1 = await api.get<ScriptWorkingCopyDto>(`/projects/${projectId}/chapters/${chapterId}/script/working-copy`);
    const pending = await api.post<{ value: StoryWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy`, {
      mode: "clone_current",
      expectedCurrentVersionId: storyV1.current.id,
      expectedSourceScriptVersionId: script.id,
      expectedChapterRowVersion: scriptAfterV1.data.chapterRowVersion,
    });
    const pendingDocument = storyDocument(chapterId!, "双页签草稿 A");
    const competingDocument = storyDocument(chapterId!, "双页签草稿 B");
    const pendingRowVersion = pending.data.value.pending?.rowVersion ?? 0;
    const pendingChapterRowVersion = pending.data.chapterRowVersion;
    const pendingState = await api.get<{ productionState: { story: { freshness: string }; }; workflow: { steps: Array<{ key: string; canStartTask: boolean; status: string }> } }>(`/projects/${projectId}/chapters/${chapterId}/production-state`);
    expect(pendingState.data.productionState.story.freshness).toBe("pending");
    expect(pendingState.data.workflow.steps.find((step) => step.key === "storyboard")?.canStartTask).toBe(false);

    const attemptUpdate = (document: ReturnType<typeof storyDocument>) => api.patch<{ value: StoryWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy`, {
          pendingVersionId: pending.data.value.pending?.id,
          document,
          expectedPendingRowVersion: pendingRowVersion,
          expectedChapterRowVersion: pendingChapterRowVersion,
        });
    const [left, right] = await Promise.all([
      attemptUpdate(pendingDocument).then((result) => ({ status: 200 as const, result, document: pendingDocument })).catch((error: unknown) => ({ status: 409 as const, error: String(error), document: pendingDocument })),
      attemptUpdate(competingDocument).then((result) => ({ status: 200 as const, result, document: competingDocument })).catch((error: unknown) => ({ status: 409 as const, error: String(error), document: competingDocument })),
    ]);
    expect([left.status, right.status].sort()).toEqual([200, 409]);
    const winner = left.status === 200 ? left.document : right.document;
    const loser = left.status === 409 ? left : right;
    expect("error" in loser ? loser.error : "").toContain("CHAPTER_VERSION_CONFLICT");
    const afterConflict = await api.get<StoryWorkingCopyDto>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy`);
    expect(afterConflict.data.document).toEqual(winner);

    const confirmedV2 = await api.post<{ value: { current: StorySummary }; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy/confirm`, {
      pendingVersionId: afterConflict.data.pending?.id,
      expectedPendingDocumentDigest: afterConflict.data.pending?.documentDigest,
      expectedPendingRowVersion: afterConflict.data.pending?.rowVersion,
      expectedCurrentVersionId: storyV1.current.id,
      expectedSourceScriptVersionId: script.id,
      expectedSourceDigest: script.sourceDigest,
      expectedChapterRowVersion: afterConflict.data.productionState.chapterRowVersion,
    });

    const boardV1 = await confirmEmptyStoryboard(api, projectId, chapterId!, confirmedV2.data.value.current, confirmedV2.data.chapterRowVersion);
    const preview = await api.get<{ preview: { notes: string }; sourceDigest: `sha256:${string}`; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/image-preflight/preview`);
    const preflight = await api.post<{ preflight: { id: string }; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/image-preflight/confirm`, {
      expectedSourceStoryboardVersionId: boardV1.current.id,
      expectedSourceDigest: preview.data.sourceDigest,
      expectedChapterRowVersion: preview.data.chapterRowVersion,
      notes: preview.data.preview.notes,
    });

    const scriptAfterV2 = await api.get<ScriptWorkingCopyDto>(`/projects/${projectId}/chapters/${chapterId}/script/working-copy`);
    const storyV3 = await confirmStory(api, projectId, chapterId!, { ...script, chapterRowVersion: scriptAfterV2.data.chapterRowVersion }, confirmedV2.data.value.current, "第三版结构触发下游 stale");
    const staleState = await api.get<{ productionState: { storyboard: { freshness: string; reasonCodes: string[] }; preflight: { freshness: string; reasonCodes: string[] } }; workflow: { steps: Array<{ key: string; status: string; attention: string | null }> } }>(`/projects/${projectId}/chapters/${chapterId}/production-state`);
    expect(staleState.data.productionState.storyboard.freshness).toBe("stale");
    expect(staleState.data.productionState.storyboard.reasonCodes).toContain("STORYBOARD_SOURCE_STORY_CHANGED");
    expect(staleState.data.productionState.preflight.freshness).toBe("stale");
    expect(staleState.data.workflow.steps.find((step) => step.key === "storyboard")?.status).toBe("needs_update");
    expect(staleState.data.workflow.steps.find((step) => step.key === "image_preflight")?.status).toBe("needs_update");
    await page.goto(`/projects/${projectId}/storyboard`);
    await expect(page.getByTestId("storyboard-db-versioning-status")).toContainText("来源已变化");
    await page.goto(`/projects/${projectId}/preflight`);
    await expect(page.getByTestId("preflight-db-versioning-status")).toContainText("来源已变化");

    const copied = await api.post<{ value: StoryWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/story-structure/versions/${confirmedV2.data.value.current.id}/copy-to-working-copy`, {
      expectedCurrentVersionId: storyV3.current.id,
      expectedChapterRowVersion: storyV3.chapterRowVersion,
    });
    expect(copied.data.value.pending?.id).not.toBe(confirmedV2.data.value.current.id);
    expect(copied.data.value.document?.synopsis).toBe(winner.synopsis);
    expect(copied.data.value.current?.id).toBe(storyV3.current.id);
    const discarded = await api.delete<{ value: StoryWorkingCopyDto }>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy`, {
      pendingVersionId: copied.data.value.pending?.id,
      expectedPendingRowVersion: copied.data.value.pending?.rowVersion ?? 0,
      expectedChapterRowVersion: copied.data.chapterRowVersion,
    });
    expect(discarded.data.value.pending).toBeNull();
    expect(preflight.data.preflight.id).toBeTruthy();
  });

  test("W1-E2E-05：页面生成并确认剧情结构时自动同步新角色", async ({ api, page, rainSmokeProject }) => {
    const projectId = rainSmokeProject.id;
    const workbench = await api.get<{ snapshot: { currentChapter: { id: string } | null } }>(`/projects/${projectId}/workbench`);
    const chapterId = workbench.data.snapshot.currentChapter?.id;
    expect(chapterId).toBeTruthy();
    await publishScript(api, projectId, chapterId!);

    await page.goto(`/projects/${projectId}/structure`);
    await page.locator(".structure-workspace").getByRole("button", { name: "生成剧情结构", exact: true }).click();
    await expect(page.getByRole("button", { name: "确认结构", exact: true })).toBeVisible();
    await expect(page.getByText("林夏在雨夜站台等待末班车，异常广播后空车进站。", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "确认结构", exact: true }).click();
    await expect(page.getByTestId("story-db-versioning-status")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "3 分镜工作台", exact: true })).toBeEnabled();
    await expect(page.getByText("该预览已处理，当前状态以右侧工作区为准。", { exact: true })).toBeVisible();

    const confirmed = await api.get<{ snapshot: { characters: Array<{ id: string; name: string }>; storyStructure: { structureJson: { characters: Array<{ projectCharacterId?: string | null }> } } | null } }>(`/projects/${projectId}/workbench`);
    const character = confirmed.data.snapshot.characters.find((item) => item.name === "林夏");
    expect(character?.id).toBeTruthy();
    expect(confirmed.data.snapshot.storyStructure?.structureJson.characters[0]?.projectCharacterId).toBe(character?.id);
    const tasks = await api.get<{ items: Array<{ type: string; target?: { type: string; id: string } | null }> }>("/tasks");
    expect(tasks.data.items.some((item) => item.type === "character_reference_generate" && item.target?.type === "character" && item.target.id === character?.id)).toBe(true);
  });
});
