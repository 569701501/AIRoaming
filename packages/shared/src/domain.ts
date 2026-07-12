export const PROJECT_TYPES = ["comic", "light_motion", "mixed"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

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
  "characters_ready",
  "shots_ready",
  "images_ready",
  "layout_ready",
  "exported",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const CHAPTER_STATUSES = [
  "draft",
  "script_done",
  "structured",
  "storyboard_done",
  "images_done",
  "layout_done",
  "exported",
] as const;
export type ChapterStatus = (typeof CHAPTER_STATUSES)[number];

export const PROJECT_WORKFLOW_SCHEMA_VERSION = 1;

export const PROJECT_WORKFLOW_STEP_KEYS = [
  "project_story",
  "story_structure",
  "storyboard",
  "image_preflight",
  "image_candidates",
  "layout_export",
  "asset_package",
] as const;
export type ProjectWorkflowStepKey = (typeof PROJECT_WORKFLOW_STEP_KEYS)[number];

export const PROJECT_WORKFLOW_STEP_STATUSES = ["done", "active", "waiting", "blocked", "needs_confirmation", "needs_update"] as const;
export type ProjectWorkflowStepStatus = (typeof PROJECT_WORKFLOW_STEP_STATUSES)[number];

export const PROJECT_WORKFLOW_SCOPES = ["chapter", "project"] as const;
export type ProjectWorkflowScope = (typeof PROJECT_WORKFLOW_SCOPES)[number];

export const PROJECT_WORKFLOW_STEPS = [
  {
    key: "project_story",
    label: "剧本",
    scope: "chapter",
    completionCriteria: ["当前章节 `script.md` 已保存", "用户点击完成本章并写入章节剧本版本"],
  },
  {
    key: "story_structure",
    label: "剧情结构",
    scope: "chapter",
    completionCriteria: ["当前章节存在结构化剧情", "`StoryVersion` 绑定到当前 `chapterId`"],
  },
  {
    key: "storyboard",
    label: "分镜工作台",
    scope: "chapter",
    completionCriteria: ["当前章节分镜已生成并可编辑", "分镜可追溯到剧情节拍"],
  },
  {
    key: "image_preflight",
    label: "出图准备",
    scope: "chapter",
    completionCriteria: ["当前章节正式分镜已存在", "出镜角色已绑定项目角色库或标记为临时/背景角色", "候选图所需角色参考图已补齐"],
  },
  {
    key: "image_candidates",
    label: "候选图工作台",
    scope: "chapter",
    completionCriteria: ["当前章节分镜已生成候选图", "用户已选择或锁定可用候选"],
  },
  {
    key: "layout_export",
    label: "排版导出",
    scope: "chapter",
    completionCriteria: ["当前章节已完成页面排版", "导出物可追溯到锁定候选"],
  },
  {
    key: "asset_package",
    label: "素材包",
    scope: "project",
    completionCriteria: ["项目级共享素材与章节产物已归档", "素材包 manifest 可追溯到章节和任务"],
  },
] as const satisfies ReadonlyArray<{
  key: ProjectWorkflowStepKey;
  label: string;
  scope: ProjectWorkflowScope;
  completionCriteria: readonly string[];
}>;

export const GENERATION_TASK_TYPES = [
  "character_reference_generate",
  "scene_reference_generate",
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

export const CHAPTER_SCOPED_GENERATION_TASK_TYPES = [
  "story_parse",
  "shot_generate",
  "shot_prompt_generate",
  "image_generate",
  "layout_export",
] as const satisfies ReadonlyArray<GenerationTaskType>;
export type ChapterScopedGenerationTaskType = (typeof CHAPTER_SCOPED_GENERATION_TASK_TYPES)[number];

export const GENERATION_TASK_TARGET_TYPES = [
  "project",
  "character",
  "chapter",
  "story",
  "shot",
  "asset",
  "export",
  "scene",
] as const;
export type GenerationTaskTargetType = (typeof GENERATION_TASK_TARGET_TYPES)[number];

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

export const CANDIDATE_GENERATION_SPEC_VERSION = 2 as const;
export const LEGACY_GENERATION_DEFAULT_SIZE_POLICY_VERSION =
  "legacy_generation_default_v1" as const;
export const CANDIDATE_GENERATION_PURPOSES = ["shot_clean_plate", "legacy_unspecified"] as const;
export type CandidateGenerationPurpose = (typeof CANDIDATE_GENERATION_PURPOSES)[number];

export const ASSET_TYPES = ["image", "audio", "video", "document", "archive"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const APPEARANCE_THEMES = ["system", "dark", "light"] as const;
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number];

export interface ProjectSummary {
  id: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  currentChapterId: string | null;
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
