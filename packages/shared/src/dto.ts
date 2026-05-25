import type {
  ArtStyle,
  AssetType,
  ComicFormat,
  GenerationTaskStatus,
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

export interface GenerationTaskTarget {
  type: "project" | "story" | "shot" | "asset" | "export";
  id: string;
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
  shotId: string;
  label: string;
  status: "generated" | "selected" | "locked" | "rejected" | "superseded";
  assetId: string;
  palette: string;
  promptDigest: string;
}

export interface WorkbenchAsset {
  id: string;
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
