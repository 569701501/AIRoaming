import { randomUUID } from "node:crypto";
import {
  digestCanonicalJson,
  type CandidateLockCommitResponse,
  type CandidateLockImpactPreviewResponse,
  type CreatePendingShotResponse,
  type GenerationTaskItem,
  type ProjectListItem,
  type ScriptWorkingCopyDto,
  type StoryDocumentV2,
  type StoryWorkingCopyDto,
  type StoryboardWorkingCopyDto,
  type WorkbenchSnapshot,
} from "@airoaming/shared";
import type { E2EApiClient } from "./e2e-fixture.ts";

export interface G4CandidateFixture {
  projectId: string;
  chapterId: string;
  shotId: string;
  candidateIds: string[];
}

export async function prepareG4CandidateFixture(
  api: E2EApiClient,
  project: ProjectListItem,
): Promise<G4CandidateFixture> {
  const projectId = project.id;
  const chapterId = project.currentChapterId!;
  await api.patch("/settings", {
    activeImageProvider: "openai",
    openaiImageProvider: {
      providerId: "openai_image",
      providerName: "E2E Image Provider",
      modelId: "e2e-image",
      baseUrl: api.runtime.imageBaseUrl,
      apiKey: "e2e-local-only-key",
    },
  });

  const script = await api.get<ScriptWorkingCopyDto>(`/projects/${projectId}/chapters/${chapterId}/script/working-copy`);
  const scriptUpdated = await api.patch<{ value: ScriptWorkingCopyDto }>(`/projects/${projectId}/chapters/${chapterId}/script/working-copy`, {
    sourceText: "林夏在雨夜站台看见一辆空车缓缓进站。",
    expectedChapterRowVersion: script.data.chapterRowVersion,
  });
  const published = await api.post<{ scriptVersion: { id: string; sourceDigest: `sha256:${string}` }; workingCopy: ScriptWorkingCopyDto }>(`/projects/${projectId}/chapters/${chapterId}/script/publish`, {
    expectedCurrentScriptVersionId: null,
    expectedWorkingDigest: scriptUpdated.data.value.digest,
    expectedChapterRowVersion: scriptUpdated.data.value.chapterRowVersion,
    createNextChapter: false,
  });

  const storyDocument: StoryDocumentV2 = {
    schemaVersion: 2,
    chapterId,
    synopsis: "雨夜空车进站。",
    direction: { logline: "异常末班车抵达。", chapterGoal: "建立悬念。", coreConflict: "等待与异常。", emotionalArc: "不安。", endingHook: "车门打开。" },
    characters: [],
    scenes: [],
    beats: [],
    notes: "",
  };
  const story = await api.get<StoryWorkingCopyDto>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy`);
  const storyCreated = await api.post<{ value: StoryWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy`, {
    mode: "empty",
    expectedCurrentVersionId: null,
    expectedSourceScriptVersionId: published.data.scriptVersion.id,
    expectedChapterRowVersion: published.data.workingCopy.chapterRowVersion,
  });
  const storyUpdated = await api.patch<{ value: StoryWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy`, {
    pendingVersionId: storyCreated.data.value.pending!.id,
    document: storyDocument,
    expectedPendingRowVersion: storyCreated.data.value.pending!.rowVersion ?? 0,
    expectedChapterRowVersion: storyCreated.data.chapterRowVersion,
  });
  const storyConfirmed = await api.post<{ value: { current: { id: string; documentDigest: `sha256:${string}` } }; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/story-structure/working-copy/confirm`, {
    pendingVersionId: storyUpdated.data.value.pending!.id,
    expectedPendingDocumentDigest: digestCanonicalJson(storyDocument),
    expectedPendingRowVersion: storyUpdated.data.value.pending!.rowVersion ?? 0,
    expectedCurrentVersionId: null,
    expectedSourceScriptVersionId: published.data.scriptVersion.id,
    expectedSourceDigest: published.data.scriptVersion.sourceDigest,
    expectedChapterRowVersion: storyUpdated.data.chapterRowVersion,
  });

  const storyboard = await api.get<StoryboardWorkingCopyDto>(`/projects/${projectId}/chapters/${chapterId}/storyboard/working-copy`);
  const boardCreated = await api.post<{ value: StoryboardWorkingCopyDto; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/storyboard/working-copy`, {
    mode: "empty",
    expectedCurrentVersionId: storyboard.data.current?.id ?? null,
    expectedSourceStoryVersionId: storyConfirmed.data.value.current.id,
    expectedChapterRowVersion: storyConfirmed.data.chapterRowVersion,
  });
  const shotCreated = await api.post<CreatePendingShotResponse>(`/projects/${projectId}/chapters/${chapterId}/storyboard/working-copy/shots`, {
    pendingVersionId: boardCreated.data.value.pending!.id,
    requestId: randomUUID(),
    afterShotId: null,
    expectedPendingRowVersion: boardCreated.data.value.pending!.rowVersion ?? 0,
    expectedChapterRowVersion: boardCreated.data.chapterRowVersion,
    initial: {
      beatId: null,
      sceneId: null,
      characterIds: [],
      coreAction: "空车进站",
      emotion: "紧张",
      shotType: "medium",
      cameraAngle: "eye_level",
      comic: { panelDescription: "雨夜站台与缓缓进站的空车", composition: "站台中景", dialogue: "", caption: "", panelRhythm: "normal" },
      motion: { visualDescription: "列车停靠", compositionDesign: "居中", cameraMovement: "static", frameType: "action", durationMs: 0, durationHint: "", voiceLines: [] },
      promptDraft: "",
    },
  });
  const pendingBoard = shotCreated.data.workingCopy.pending!;
  const boardConfirmed = await api.post<{ value: { current: { id: string; documentDigest: `sha256:${string}` } }; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/storyboard/working-copy/confirm`, {
    pendingVersionId: pendingBoard.id,
    expectedPendingDocumentDigest: pendingBoard.documentDigest,
    expectedPendingRowVersion: pendingBoard.rowVersion ?? 0,
    expectedCurrentVersionId: null,
    expectedSourceStoryVersionId: storyConfirmed.data.value.current.id,
    expectedSourceDigest: storyConfirmed.data.value.current.documentDigest,
    expectedChapterRowVersion: shotCreated.data.workingCopy.productionState.chapterRowVersion,
  });

  const preflight = await api.get<{ preview: { notes: string }; sourceDigest: `sha256:${string}`; chapterRowVersion: number }>(`/projects/${projectId}/chapters/${chapterId}/image-preflight/preview`);
  await api.post(`/projects/${projectId}/chapters/${chapterId}/image-preflight/confirm`, {
    expectedSourceStoryboardVersionId: boardConfirmed.data.value.current.id,
    expectedSourceDigest: preflight.data.sourceDigest,
    expectedChapterRowVersion: preflight.data.chapterRowVersion,
    notes: preflight.data.preview.notes,
  });

  const task = await api.post<{ task: GenerationTaskItem }>("/tasks", {
    projectId,
    type: "image_generate",
    target: { type: "shot", id: shotCreated.data.shotId, chapterId },
    input: { chapterId, shotId: shotCreated.data.shotId, requestId: randomUUID(), candidateCount: 3 },
    options: { candidateCount: 3, provider: "default" },
  });
  await waitForTask(api, task.data.task.id);
  const workbench = await api.get<{ snapshot: WorkbenchSnapshot }>(`/projects/${projectId}/workbench?chapterId=${chapterId}`);
  const candidates = workbench.data.snapshot.candidates
    .filter((candidate) => candidate.shotId === shotCreated.data.shotId)
    .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  if (candidates.length < 3) throw new Error(`G4_E2E_CANDIDATES_MISSING:${candidates.length}`);
  return { projectId, chapterId, shotId: shotCreated.data.shotId, candidateIds: candidates.map((candidate) => candidate.id) };
}

export async function lockCandidate(
  api: E2EApiClient,
  fixture: G4CandidateFixture,
  candidateId: string,
): Promise<CandidateLockCommitResponse> {
  const preview = await api.post<CandidateLockImpactPreviewResponse>(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/shots/${fixture.shotId}/candidate-lock/preview`, {
    action: "lock",
    candidateId,
  });
  return (await api.put<CandidateLockCommitResponse>(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/shots/${fixture.shotId}/candidate-lock`, {
    action: "lock",
    candidateId,
    expectedCurrentRevisionId: preview.data.expectedCurrentRevisionId,
    impactDigest: preview.data.impactDigest,
    reason: "G4-E browser fixture",
  })).data;
}

export async function replaceCandidate(
  api: E2EApiClient,
  fixture: G4CandidateFixture,
  candidateId: string,
): Promise<CandidateLockCommitResponse> {
  const preview = await api.post<CandidateLockImpactPreviewResponse>(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/shots/${fixture.shotId}/candidate-lock/preview`, {
    action: "replace",
    candidateId,
  });
  return (await api.put<CandidateLockCommitResponse>(`/projects/${fixture.projectId}/chapters/${fixture.chapterId}/shots/${fixture.shotId}/candidate-lock`, {
    action: "replace",
    candidateId,
    expectedCurrentRevisionId: preview.data.expectedCurrentRevisionId,
    impactDigest: preview.data.impactDigest,
    reason: "G4-E concurrent browser fixture",
  })).data;
}

async function waitForTask(api: E2EApiClient, taskId: string): Promise<void> {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const tasks = await api.get<{ items: GenerationTaskItem[] }>("/tasks");
    const task = tasks.data.items.find((item) => item.id === taskId);
    if (task?.status === "succeeded") return;
    if (task?.status === "failed" || task?.status === "cancelled") {
      throw new Error(`G4_E2E_TASK_FAILED:${task.status}:${task.error?.message ?? "unknown"}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("G4_E2E_TASK_TIMEOUT");
}
