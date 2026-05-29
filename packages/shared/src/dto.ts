import type {
  ArtStyle,
  AssetType,
  ChapterStatus,
  ComicFormat,
  GenerationTaskStatus,
  GenerationTaskTargetType,
  GenerationTaskType,
  ProjectWorkflowScope,
  ProjectWorkflowStepKey,
  ProjectWorkflowStepStatus,
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
  lastScriptRevision: ScriptRevisionItem | null;
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

export interface ClearChapterScriptResponse {
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
}

export interface ResetProjectScriptResponse {
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
}

export type ProjectScriptOutlineStatus = "draft" | "confirmed";

export interface ProjectScriptOutline {
  id: string;
  projectId: string;
  status: ProjectScriptOutlineStatus;
  title: string;
  sourceText: string;
  outlinePath: string;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
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
  chapterId?: string | null;
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
  chapterId: string | null;
  messages: DialogueMessageItem[];
  toolResults: DialogueToolResult[];
  createdAt: string;
  updatedAt: string;
}

export type DialogueIntent =
  | "general_chat"
  | "analyze_script"
  | "organize_script_to_chapters"
  | "generate_inspiration_seeds"
  | "generate_script_outline_from_seed"
  | "generate_script_from_outline"
  | "generate_script_from_seed"
  | "update_chapter_draft";

export interface DialogueAttachmentInput {
  id?: string;
  name: string;
  mimeType: string;
  size: number;
  content: string;
}

export interface DialogueMessageContextInput {
  sourceText?: string;
  selectionText?: string;
}

export interface SendDialogueMessageRequest {
  content: string;
  stepKey?: string;
  chapterId?: string | null;
  intent?: DialogueIntent;
  context?: DialogueMessageContextInput;
  attachments?: DialogueAttachmentInput[];
  model?: AIRuntimeModelSelection;
}

export interface ScriptRevisionItem {
  id: string;
  projectId: string;
  chapterId: string | null;
  source: "ai_tool";
  threadId: string;
  messageId: string;
  toolCallId: string;
  operation: "import_script_to_chapters" | "update_chapter_draft" | "generate_script_from_seed" | "generate_script_from_outline";
  summary: string;
  createdAt: string;
}

export interface ScriptInspirationSeed {
  id: string;
  order: number;
  title: string;
  genreTags: string[];
  logline: string;
  keyConflict: string;
  visualHook: string;
  firstChapterDirection: string;
}

export type ScriptImportContentType =
  | "script"
  | "story_prose"
  | "outline"
  | "worldbuilding"
  | "invalid";

export type ScriptImportDecision =
  | "ready_to_import"
  | "needs_user_confirmation"
  | "reject";

export type ScriptImportChapterBoundary =
  | "explicit_chapter_heading"
  | "numeric_heading"
  | "single_chapter";

export interface ScriptImportChapterPlan {
  order: number;
  title: string;
  boundary: ScriptImportChapterBoundary;
  summary: string;
}

export interface ScriptImportAnalysis {
  decision: ScriptImportDecision;
  contentType: ScriptImportContentType;
  reason: string;
  chapters: ScriptImportChapterPlan[];
  risk: string | null;
  nextTool: "import_script_to_chapters" | null;
}

export interface DialogueToolResult {
  id: string;
  projectId: string;
  threadId: string;
  messageId: string;
  toolCallId: string;
  tool:
    | "analyze_script_import"
    | "import_script_to_chapters"
    | "generate_inspiration_seeds"
    | "generate_script_outline_from_seed"
    | "generate_script_from_outline"
    | "generate_script_from_seed"
    | "update_chapter_draft";
  status: "succeeded" | "failed" | "needs_user_confirmation";
  summary: string;
  chapters: ChapterListItem[];
  currentChapterId: string | null;
  currentChapter?: ChapterDetail | null;
  analysis?: ScriptImportAnalysis | null;
  inspirationSeeds?: ScriptInspirationSeed[] | null;
  scriptOutline?: ProjectScriptOutline | null;
  revision: ScriptRevisionItem | null;
  createdAt: string;
}

export interface SendDialogueMessageResponse {
  thread: DialogueThread;
  userMessage: DialogueMessageItem;
  assistantMessage: DialogueMessageItem;
  toolResults?: DialogueToolResult[];
}

export type DialogueStreamEventType =
  | "dialogue.message.created"
  | "dialogue.message.delta"
  | "dialogue.tool_result.created"
  | "dialogue.message.completed"
  | "dialogue.error";

export interface DialogueStreamEvent {
  type: DialogueStreamEventType;
  threadId: string;
  messageId?: string;
  thread?: DialogueThread;
  userMessage?: DialogueMessageItem;
  assistantMessage?: DialogueMessageItem;
  toolResult?: DialogueToolResult;
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

export interface ProjectWorkflowStep {
  key: ProjectWorkflowStepKey;
  label: string;
  status: ProjectWorkflowStepStatus;
  summary: string;
  evidence: string;
  scope: ProjectWorkflowScope;
  completionCriteria: string[];
}

export interface ProjectWorkflow {
  schemaVersion: number;
  projectId: string;
  currentChapterId: string | null;
  currentStepKey: ProjectWorkflowStepKey;
  steps: ProjectWorkflowStep[];
  updatedAt: string;
}

export type WorkbenchStage = ProjectWorkflowStep;

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
  scriptOutline: ProjectScriptOutline | null;
  workflow: ProjectWorkflow;
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
