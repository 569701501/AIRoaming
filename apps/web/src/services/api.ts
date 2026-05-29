import type {
  ApiResponse,
  AIRuntimeModelItem,
  AIRuntimeModelSelection,
  CompleteChapterRequest,
  CompleteChapterResponse,
  CreateProjectRequest,
  ClearChapterScriptResponse,
  DeleteProjectResponse,
  DialogueStreamEvent,
  DialogueThread,
  CreateGenerationTaskRequest,
  GenerationTaskItem,
  GetChapterResponse,
  HealthResponse,
  ListChaptersResponse,
  ProjectListItem,
  ResetProjectScriptResponse,
  SaveChapterDraftRequest,
  SaveChapterDraftResponse,
  SendDialogueMessageRequest,
  SendDialogueMessageResponse,
  UpdateProjectDraftRequest,
  WorkspaceInfo,
  WorkbenchSnapshot,
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
    const message = getApiErrorMessage(payload, response.statusText);
    throw new Error(message || "API request failed");
  }

  return payload.data;
}

function isApiSuccess<T>(payload: ApiResponse<T> | Record<string, unknown>): payload is Extract<ApiResponse<T>, { success: true }> {
  return payload.success === true;
}

function getApiErrorMessage(payload: ApiResponse<unknown> | Record<string, unknown>, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }

  const envelopeError = payload.success === false ? payload.error : null;
  if (isRecord(envelopeError) && typeof envelopeError.message === "string") {
    return envelopeError.message;
  }

  const defaultMessage = payload.message;
  if (typeof defaultMessage === "string") {
    return defaultMessage;
  }

  if (Array.isArray(defaultMessage)) {
    return defaultMessage.filter((item): item is string => typeof item === "string").join("，");
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }

  return fallback;
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
  listTasks: () => request<{ items: GenerationTaskItem[] }>("/tasks"),
  createTask: (input: CreateGenerationTaskRequest) => request<{ task: GenerationTaskItem }>("/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  }),
  cancelTask: (taskId: string) => request<{ task: GenerationTaskItem }>(`/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: "POST",
  }),
};
