import type {
  ApiResponse,
  AIRuntimeModelItem,
  AIRuntimeModelSelection,
  CreateProjectRequest,
  DeleteProjectResponse,
  DialogueStreamEvent,
  DialogueThread,
  CreateGenerationTaskRequest,
  GenerationTaskItem,
  HealthResponse,
  ProjectListItem,
  SendDialogueMessageRequest,
  SendDialogueMessageResponse,
  UpdateProjectDraftRequest,
  WorkspaceInfo,
  WorkbenchSnapshot,
} from "@airoaming/shared";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !payload.success) {
    const message = payload.success ? response.statusText : payload.error.message;
    throw new Error(message || "API request failed");
  }

  return payload.data;
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
  workbench: (projectId: string) => request<{ snapshot: WorkbenchSnapshot }>(`/projects/${encodeURIComponent(projectId)}/workbench`),
  dialogueThread: (projectId: string, stepKey: string) => request<{ thread: DialogueThread }>(
    `/projects/${encodeURIComponent(projectId)}/dialogue/threads/${encodeURIComponent(stepKey)}`,
  ),
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
