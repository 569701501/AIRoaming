import type {
  ApiResponse,
  AIRuntimeModelItem,
  AIRuntimeModelSelection,
  AppSettings,
  CompleteChapterRequest,
  CompleteChapterResponse,
  ConfirmChapterPendingSourceResponse,
  ConfirmCharacterPreviewRequest,
  ConfirmCharacterPreviewResponse,
  ConfirmCharacterReferenceRequest,
  ConfirmChapterImagePreflightRequest,
  ConfirmChapterStoryStructureRequest,
  ConfirmChapterStoryboardRequest,
  CreateProjectRequest,
  ClearChapterScriptResponse,
  DeleteProjectResponse,
  DiscardChapterPendingSourceResponse,
  DialogueStreamEvent,
  DialogueThread,
  ExtractProjectCharactersRequest,
  ExtractProjectCharactersResponse,
  GenerateCharacterReferenceRequest,
  GenerateSceneReferenceRequest,
  BuildChapterLayoutResponse,
  CandidateGenerationPreviewResponse,
  CompleteChapterImagesResponse,
  CreateGenerationTaskRequest,
  ExportAssetPackageResponse,
  ExportChapterLayoutResponse,
  GenerationTaskItem,
  GetChapterResponse,
  HealthResponse,
  ListChaptersResponse,
  LockChapterCandidateResponse,
  ProjectCharactersResponse,
  ProjectListItem,
  QueueCharacterReferenceResponse,
  QueueSceneReferenceResponse,
  ResolveImagePreflightCharacterRequest,
  ResolveImagePreflightCharacterResponse,
  ResetProjectScriptResponse,
  SaveChapterDraftRequest,
  SaveChapterDraftResponse,
  SaveChapterImagePreflightResponse,
  SaveProjectCharacterResponse,
  SaveChapterStoryStructureResponse,
  SaveChapterStoryboardResponse,
  SendDialogueMessageRequest,
  SendDialogueMessageResponse,
  UpdateProjectCharacterRequest,
  UpdateChapterStoryStructureRequest,
  UpdateChapterStoryboardRequest,
  UpdateAppSettingsRequest,
  UpdateProjectDraftRequest,
  WorkspaceInfo,
  WorkbenchSnapshot,
  ScriptWorkingCopyDto,
  ScriptWorkingCopyUpdateRequest,
  ScriptWorkingCopyClearRequest,
  ScriptPublishRequest,
  ScriptPublishResponse,
  ScriptPendingSuggestionDto,
  ScriptPendingAdoptRequest,
  ScriptPendingDiscardRequest,
  ScriptMutationResult,
} from "@airoaming/shared";

const API_BASE = import.meta.env?.VITE_API_BASE_URL || "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiResponse<T> | Record<string, unknown>;
  if (!response.ok || !isApiSuccess<T>(payload)) {
    throw parseApiClientError(payload, response.status, response.statusText || "API request failed");
  }

  return payload.data;
}

function isApiSuccess<T>(payload: ApiResponse<T> | Record<string, unknown>): payload is Extract<ApiResponse<T>, { success: true }> {
  return payload.success === true;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export function parseApiClientError(payload: ApiResponse<unknown> | Record<string, unknown>, status: number, fallback: string): ApiClientError {
  if (!isRecord(payload)) {
    return new ApiClientError(fallback, status, "API_REQUEST_FAILED");
  }

  const envelopeError = payload.success === false ? payload.error : null;
  if (isRecord(envelopeError)) {
    return new ApiClientError(
      typeof envelopeError.message === "string" ? envelopeError.message : fallback,
      status,
      typeof envelopeError.code === "string" ? envelopeError.code : "API_REQUEST_FAILED",
      envelopeError.details,
    );
  }

  const defaultMessage = payload.message;
  if (typeof defaultMessage === "string") {
    return new ApiClientError(defaultMessage, status, "API_REQUEST_FAILED");
  }

  if (Array.isArray(defaultMessage)) {
    return new ApiClientError(
      defaultMessage.filter((item): item is string => typeof item === "string").join("，") || fallback,
      status,
      "API_REQUEST_FAILED",
    );
  }

  if (typeof payload.error === "string") {
    return new ApiClientError(payload.error, status, "API_REQUEST_FAILED");
  }

  return new ApiClientError(fallback, status, "API_REQUEST_FAILED");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function requestStream(path: string, init: RequestInit, onEvent: (event: DialogueStreamEvent) => void): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(response.statusText || "Stream request failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parsed = takeSseBlocks(buffer);
    buffer = parsed.remaining;
    for (const block of parsed.items) {
      const event = parseSseBlock(block);
      if (event) {
        onEvent(event);
      }
    }
  }
}

function takeSseBlocks(buffer: string): {
  items: string[];
  remaining: string;
} {
  const items: string[] = [];
  let remaining = buffer;
  let boundary = remaining.indexOf("\n\n");

  while (boundary >= 0) {
    items.push(remaining.slice(0, boundary));
    remaining = remaining.slice(boundary + 2);
    boundary = remaining.indexOf("\n\n");
  }

  return {
    items,
    remaining,
  };
}

function parseSseBlock(block: string): DialogueStreamEvent | null {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .join("\n");

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as DialogueStreamEvent;
  } catch {
    return null;
  }
}

export const api = {
  health: () => request<HealthResponse>("/health"),
  workspace: () => request<WorkspaceInfo>("/workspace"),
  settings: () => request<AppSettings>("/settings"),
  updateSettings: (input: UpdateAppSettingsRequest) => request<AppSettings>("/settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  }),
  listRuntimeModels: () => request<{
    defaultModel: AIRuntimeModelSelection;
    items: AIRuntimeModelItem[];
  }>("/ai-runtime/models"),
  listProjects: () => request<{ items: ProjectListItem[] }>("/projects"),
  createProject: (input: CreateProjectRequest) => request<{ project: ProjectListItem }>("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  }),
  deleteProject: (projectId: string) => request<DeleteProjectResponse>(`/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  }),
  updateProjectDraft: (projectId: string, input: UpdateProjectDraftRequest) => request<{
    project: ProjectListItem;
    snapshot: WorkbenchSnapshot;
  }>(`/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }),
  workbench: (projectId: string, chapterId?: string | null) => {
    const query = chapterId ? `?chapterId=${encodeURIComponent(chapterId)}` : "";
    return request<{ snapshot: WorkbenchSnapshot }>(`/projects/${encodeURIComponent(projectId)}/workbench${query}`);
  },
  listChapters: (projectId: string) => request<ListChaptersResponse>(`/projects/${encodeURIComponent(projectId)}/chapters`),
  getChapter: (projectId: string, chapterId: string) => request<GetChapterResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}`,
  ),
  listProjectCharacters: (projectId: string) => request<ProjectCharactersResponse>(
    `/projects/${encodeURIComponent(projectId)}/characters`,
  ),
  ensureProjectCharacterPreviewTasks: (projectId: string) => request<QueueCharacterReferenceResponse>(
    `/projects/${encodeURIComponent(projectId)}/characters/previews/ensure`,
    {
      method: "POST",
    },
  ),
  extractProjectCharacters: (projectId: string, input: ExtractProjectCharactersRequest) => request<ExtractProjectCharactersResponse>(
    `/projects/${encodeURIComponent(projectId)}/characters/extract`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  ),
  updateProjectCharacter: (
    projectId: string,
    characterId: string,
    input: UpdateProjectCharacterRequest,
  ) => request<SaveProjectCharacterResponse>(
    `/projects/${encodeURIComponent(projectId)}/characters/${encodeURIComponent(characterId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  ),
  generateCharacterReference: (
    projectId: string,
    characterId: string,
    input: GenerateCharacterReferenceRequest,
  ) => request<QueueCharacterReferenceResponse>(
    `/projects/${encodeURIComponent(projectId)}/characters/${encodeURIComponent(characterId)}/reference`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  ),
  generateSceneReference: (
    projectId: string,
    chapterId: string,
    sceneId: string,
    input: GenerateSceneReferenceRequest,
  ) => request<QueueSceneReferenceResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/scenes/${encodeURIComponent(sceneId)}/reference`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  ),
  confirmCharacterPreview: (
    projectId: string,
    characterId: string,
    input: ConfirmCharacterPreviewRequest,
  ) => request<ConfirmCharacterPreviewResponse>(
    `/projects/${encodeURIComponent(projectId)}/characters/${encodeURIComponent(characterId)}/preview/confirm`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  ),
  confirmCharacterReference: (
    projectId: string,
    characterId: string,
    input: ConfirmCharacterReferenceRequest,
  ) => request<SaveProjectCharacterResponse>(
    `/projects/${encodeURIComponent(projectId)}/characters/${encodeURIComponent(characterId)}/reference/confirm`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  ),
  deleteCharacterReference: (
    projectId: string,
    characterId: string,
    assetId: string,
  ) => request<SaveProjectCharacterResponse & { deletedAssetId: string }>(
    `/projects/${encodeURIComponent(projectId)}/characters/${encodeURIComponent(characterId)}/references/${encodeURIComponent(assetId)}`,
    {
      method: "DELETE",
    },
  ),
  projectAssetFileUrl: (projectId: string, assetId: string) =>
    `${API_BASE}/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/file`,
  saveChapterDraft: (projectId: string, chapterId: string, input: SaveChapterDraftRequest) => request<SaveChapterDraftResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/draft`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  ),
  completeChapter: (projectId: string, chapterId: string, input: CompleteChapterRequest) => request<CompleteChapterResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/complete`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  ),
  confirmChapterPendingSource: (projectId: string, chapterId: string) => request<ConfirmChapterPendingSourceResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/source-pending/confirm`,
    {
      method: "POST",
    },
  ),
  discardChapterPendingSource: (projectId: string, chapterId: string) => request<DiscardChapterPendingSourceResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/source-pending`,
    {
      method: "DELETE",
    },
  ),
  getScriptWorkingCopy: (projectId: string, chapterId: string) => request<ScriptWorkingCopyDto>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/script/working-copy`,
  ),
  updateScriptWorkingCopy: (projectId: string, chapterId: string, input: ScriptWorkingCopyUpdateRequest) => request<ScriptMutationResult<ScriptWorkingCopyDto>>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/script/working-copy`, { method: "PATCH", body: JSON.stringify(input) },
  ),
  clearScriptWorkingCopy: (projectId: string, chapterId: string, input: ScriptWorkingCopyClearRequest) => request<ScriptMutationResult<ScriptWorkingCopyDto>>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/script/working-copy`, { method: "DELETE", body: JSON.stringify(input) },
  ),
  publishScript: (projectId: string, chapterId: string, input: ScriptPublishRequest) => request<ScriptPublishResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/script/publish`, { method: "POST", body: JSON.stringify(input) },
  ),
  getScriptPendingSuggestion: (projectId: string, chapterId: string) => request<ScriptPendingSuggestionDto | null>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/script/pending-suggestion`,
  ),
  adoptScriptPendingSuggestion: (projectId: string, chapterId: string, input: ScriptPendingAdoptRequest) => request<ScriptMutationResult<ScriptWorkingCopyDto>>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/script/pending-suggestion/adopt`, { method: "POST", body: JSON.stringify(input) },
  ),
  discardScriptPendingSuggestion: (projectId: string, chapterId: string, input: ScriptPendingDiscardRequest) => request<ScriptMutationResult<null>>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/script/pending-suggestion`, { method: "DELETE", body: JSON.stringify(input) },
  ),
  confirmChapterStoryStructure: (
    projectId: string,
    chapterId: string,
    input: ConfirmChapterStoryStructureRequest,
  ) => request<SaveChapterStoryStructureResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/story-structure/confirm`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  ),
  updateChapterStoryStructure: (
    projectId: string,
    chapterId: string,
    input: UpdateChapterStoryStructureRequest,
  ) => request<SaveChapterStoryStructureResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/story-structure`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  ),
  confirmChapterStoryboard: (
    projectId: string,
    chapterId: string,
    input: ConfirmChapterStoryboardRequest,
  ) => request<SaveChapterStoryboardResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/storyboard/confirm`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  ),
  confirmChapterImagePreflight: (
    projectId: string,
    chapterId: string,
    input: ConfirmChapterImagePreflightRequest,
  ) => request<SaveChapterImagePreflightResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/image-preflight/confirm`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  ),
  resolveImagePreflightCharacter: (
    projectId: string,
    chapterId: string,
    input: ResolveImagePreflightCharacterRequest,
  ) => request<ResolveImagePreflightCharacterResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/image-preflight/characters/resolve`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  ),
  savePendingChapterStoryboard: (
    projectId: string,
    chapterId: string,
    input: UpdateChapterStoryboardRequest,
  ) => request<SaveChapterStoryboardResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/storyboard/pending`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  ),
  updateChapterStoryboard: (
    projectId: string,
    chapterId: string,
    input: UpdateChapterStoryboardRequest,
  ) => request<SaveChapterStoryboardResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/storyboard`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  ),
  clearChapterScript: (projectId: string, chapterId: string) => request<ClearChapterScriptResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/script/clear`,
    {
      method: "POST",
    },
  ),
  resetProjectScript: (projectId: string) => request<ResetProjectScriptResponse>(
    `/projects/${encodeURIComponent(projectId)}/script/reset`,
    {
      method: "POST",
    },
  ),
  dialogueThread: (projectId: string, stepKey: string, chapterId?: string | null) => {
    const query = chapterId ? `?chapterId=${encodeURIComponent(chapterId)}` : "";
    return request<{ thread: DialogueThread }>(
      `/projects/${encodeURIComponent(projectId)}/dialogue/threads/${encodeURIComponent(stepKey)}${query}`,
    );
  },
  sendDialogueMessage: (projectId: string, stepKey: string, input: SendDialogueMessageRequest) => request<SendDialogueMessageResponse>(
    `/projects/${encodeURIComponent(projectId)}/dialogue/threads/${encodeURIComponent(stepKey)}/messages`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  ),
  sendDialogueMessageStream: (
    projectId: string,
    stepKey: string,
    input: SendDialogueMessageRequest,
    onEvent: (event: DialogueStreamEvent) => void,
  ) => requestStream(
    `/projects/${encodeURIComponent(projectId)}/dialogue/threads/${encodeURIComponent(stepKey)}/messages/stream`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    onEvent,
  ),
  lockChapterCandidate: (projectId: string, chapterId: string, candidateId: string) => request<LockChapterCandidateResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/candidates/${encodeURIComponent(candidateId)}/lock`,
    {
      method: "POST",
    },
  ),
  completeChapterImages: (projectId: string, chapterId: string) => request<CompleteChapterImagesResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/images/complete`,
    {
      method: "POST",
    },
  ),
  candidateGenerationPreview: (projectId: string, chapterId: string, shotId: string) => request<CandidateGenerationPreviewResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/shots/${encodeURIComponent(shotId)}/candidate-generation-preview`,
  ),
  buildChapterLayout: (projectId: string, chapterId: string) => request<BuildChapterLayoutResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/layout/build`,
    {
      method: "POST",
    },
  ),
  exportChapterLayout: (projectId: string, chapterId: string) => request<ExportChapterLayoutResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/layout/export`,
    {
      method: "POST",
    },
  ),
  exportAssetPackage: (projectId: string, chapterId: string) => request<ExportAssetPackageResponse>(
    `/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/asset-package/export`,
    {
      method: "POST",
    },
  ),
  listTasks: () => request<{ items: GenerationTaskItem[] }>("/tasks"),
  createTask: (input: CreateGenerationTaskRequest) => request<{ task: GenerationTaskItem }>("/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  }),
  cancelTask: (taskId: string) => request<{ task: GenerationTaskItem }>(`/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
  }),
};
