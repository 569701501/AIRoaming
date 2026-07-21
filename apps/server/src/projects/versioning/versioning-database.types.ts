export interface VersionScopeV1 {
  readonly projectId: string;
  readonly chapterId: string;
}

export const G2_VERSION_TASK_TYPES = [
  "story_parse",
  "shot_generate",
  "shot_prompt_generate",
  "image_generate",
] as const;

export type G2VersionTaskType = (typeof G2_VERSION_TASK_TYPES)[number];
