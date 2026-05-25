export const PROJECT_TYPES = ["comic", "light_motion", "mixed"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const COMIC_FORMATS = ["vertical_scroll", "page_horizontal", "four_panel"] as const;
export type ComicFormat = (typeof COMIC_FORMATS)[number];

export const ART_STYLES = [
  "dark_realistic",
  "semi_realistic",
  "japanese_realistic",
  "comic_style",
  "cyberpunk",
  "custom",
] as const;
export type ArtStyle = (typeof ART_STYLES)[number];

export const PROJECT_STATUSES = [
  "draft",
  "story_ready",
  "shots_ready",
  "images_ready",
  "layout_ready",
  "exported",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const GENERATION_TASK_TYPES = [
  "story_parse",
  "shot_generate",
  "shot_prompt_generate",
  "image_generate",
  "layout_export",
  "tts_generate",
  "video_export",
  "asset_package_export",
] as const;
export type GenerationTaskType = (typeof GENERATION_TASK_TYPES)[number];

export const GENERATION_TASK_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "retrying",
] as const;
export type GenerationTaskStatus = (typeof GENERATION_TASK_STATUSES)[number];

export const GENERATION_TASK_EVENTS = [
  "task.created",
  "task.started",
  "task.progress",
  "task.asset.created",
  "task.succeeded",
  "task.failed",
  "task.cancelled",
] as const;
export type GenerationTaskEvent = (typeof GENERATION_TASK_EVENTS)[number];

export const ASSET_TYPES = ["image", "audio", "video", "document", "archive"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export interface ProjectSummary {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  currentStoryVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetSummary {
  id: string;
  projectId: string;
  type: AssetType;
  mimeType: string;
  path: string;
  sourceTaskId: string | null;
  createdAt: string;
}
