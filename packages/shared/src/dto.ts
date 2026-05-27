import type {
  ArtStyle,
  AssetType,
  ChapterStatus,
  ComicFormat,
  GenerationTaskStatus,
  GenerationTaskTargetType,
  GenerationTaskType,
  ProjectStatus,
  ProjectType,
} from "./domain.js";

export interface ApiEnvelope<T> {
  success: true;
  data: T;
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiEnvelope<T> | ApiErrorEnvelope;

export interface HealthResponse {
  service: "airoaming-server";
  status: "ok";
  version: string;
  checkedAt: string;
}

export interface WorkspaceInfo {
  virtualRoot: "/workspace";
  projectsPath: "/workspace/projects";
  ready: boolean;
}

export interface ProjectListItem {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  currentChapterId?: string | null;
  chapterCount?: number;
  storyTitle: string;
  genreTags: string[];
  comicFormat: ComicFormat;
  artStyle: ArtStyle;
  description: string;
  sourceTextPreview: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  type: ProjectType;
  storyTitle?: string;
  genreTags?: string[];
  comicFormat?: ComicFormat;
  artStyle?: ArtStyle;
  description?: string;
  sourceText?: string;
}

export interface UpdateProjectDraftRequest {
  name?: string;
  storyTitle?: string;
  genreTags?: string[];
  comicFormat?: ComicFormat;
  artStyle?: ArtStyle;
  description?: string;
  sourceText?: string;
}

export interface DeleteProjectResponse {
  deletedProjectId: string;
  deletedTaskCount: number;
}

export interface ChapterListItem {
  id: string;
  projectId: string;
  slug: string;
  order: number;
  title: string;
  status: ChapterStatus;
  currentScriptVersionId: string | null;
  currentStoryVersionId: string | null;
  summary: string;
  sourceTextPreview: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ChapterDetail extends ChapterListItem {
  sourceText: string;
  scriptPath: string;
}

export interface ChapterScriptVersionItem {
  id: string;
  projectId: string;
  chapterId: string;
  version: number;
  sourcePath: string;
  status: "current" | "archived";
  createdAt: string;
}

export interface ListChaptersResponse {
  chapters: ChapterListItem[];
  currentChapterId: string | null;
}

export interface GetChapterResponse {
  chapter: ChapterDetail;
}

export interface SaveChapterDraftRequest {
  sourceText: string;
  title?: string;
  summary?: string;
}

export interface SaveChapterDraftResponse {
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
}

export interface CompleteChapterRequest {
  sourceText: string;
  title?: string;
  summary?: string;
  createNextChapter?: boolean;
  nextChapterTitle?: string;
}

export interface CompleteChapterResponse {
  completedChapter: ChapterDetail;
  activeChapter: ChapterDetail;
  chapters: ChapterListItem[];
  scriptVersion: ChapterScriptVersionItem;
  createdNextChapter: boolean;
}

export interface AIRuntimeModelSelection {
  providerId: string;
  modelId: string;
}

export interface AIRuntimeModelItem extends AIRuntimeModelSelection {
  providerName: string;
  displayName: string;
  default: boolean;
}

export interface DialogueMessageItem {
  id: string;
  projectId: string;
  threadId: string;
  stepKey: string;
  role: "user" | "assistant";
  content: string;
  status: "running" | "completed" | "failed";
  model: AIRuntimeModelSelection | null;
  error: {
    code: string;
    message: string;
  } | null;
  createdAt: string;
  completedAt: string | null;
}

export interface DialogueThread {
  id: string;
  projectId: string;
  currentStepKey: string;
  messages: DialogueMessageItem[];
  createdAt: string;
  updatedAt: string;
}

export interface SendDialogueMessageRequest {
  content: string;
  stepKey?: string;
  model?: AIRuntimeModelSelection;
}

export interface SendDialogueMessageResponse {
  thread: DialogueThread;
  userMessage: DialogueMessageItem;
  assistantMessage: DialogueMessageItem;
}

export type DialogueStreamEventType =
  | "dialogue.message.created"
  | "dialogue.message.delta"
  | "dialogue.message.completed"
  | "dialogue.error";

export interface DialogueStreamEvent {
  type: DialogueStreamEventType;
  threadId: string;
  messageId?: string;
  thread?: DialogueThread;
  userMessage?: DialogueMessageItem;
  assistantMessage?: DialogueMessageItem;
  delta?: string;
  content?: string;
  error?: {
    code: string;
    message: string;
  };
  createdAt: string;
}

export interface GenerationTaskTarget {
  type: GenerationTaskTargetType;
  id: string;
  chapterId?: string;
}

export interface CreateGenerationTaskRequest {
  projectId: string;
  type: GenerationTaskType;
  target?: GenerationTaskTarget;
  input?: Record<string, unknown>;
  options?: Record<string, unknown>;
}

export interface GenerationTaskItem {
  id: string;
  projectId: string;
  type: GenerationTaskType;
  status: GenerationTaskStatus;
  phase: string;
  progressPercent: number | null;
  target: GenerationTaskTarget | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
  } | null;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface WorkbenchStage {
  key: string;
  label: string;
  status: "done" | "active" | "waiting" | "blocked";
  summary: string;
  evidence: string;
}

export interface WorkbenchStory {
  id: string;
  chapterId?: string | null;
  title: string;
  sourceText: string;
  summary: string;
  beats: Array<{
    id: string;
    order: number;
    summary: string;
    sceneName: string;
    characterNames: string[];
  }>;
}

export interface WorkbenchShot {
  id: string;
  chapterId?: string;
  shotNumber: number;
  beatId: string;
  sceneName: string;
  characters: string[];
  action: string;
  dialogue: string;
  camera: string;
  emotion: string;
  status: "draft" | "ready_for_image" | "image_generated" | "locked" | "needs_revision";
  lockedCandidateId: string | null;
}

export interface WorkbenchCandidate {
  id: string;
  chapterId?: string;
  shotId: string;
  label: string;
  status: "generated" | "selected" | "locked" | "rejected" | "superseded";
  assetId: string;
  palette: string;
  promptDigest: string;
}

export interface WorkbenchAsset {
  id: string;
  chapterId?: string | null;
  type: AssetType;
  name: string;
  path: string;
  sourceTaskId: string | null;
  meta: string;
}

export interface WorkbenchSnapshot {
  project: {
    id: string;
    name: string;
    type: ProjectType;
    status: ProjectStatus;
    storyTitle: string;
    genreTags: string[];
    comicFormat: ComicFormat;
    artStyle: ArtStyle;
    description: string;
    updatedAt: string;
  };
  chapters: ChapterListItem[];
  currentChapter: ChapterDetail | null;
  stages: WorkbenchStage[];
  story: WorkbenchStory;
  shots: WorkbenchShot[];
  candidates: WorkbenchCandidate[];
  assets: WorkbenchAsset[];
  aiNotes: Array<{
    role: "orchestrator" | "worker" | "reviewer";
    title: string;
    body: string;
  }>;
}
