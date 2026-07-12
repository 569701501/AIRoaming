export type Digest = `sha256:${string}`;

export interface EncodedDocument<T> {
  schemaVersion: number;
  canonical: string;
  canonicalBytes: Uint8Array;
  digest: Digest;
  value: T;
}

export interface StoryDirectionV2 {
  logline: string;
  chapterGoal: string;
  coreConflict: string;
  emotionalArc: string;
  endingHook: string;
}

export type StoryCharacterLevel = "lead" | "recurring" | "chapter" | "minor" | "extra";
export type StoryCharacterEntityType = "human" | "creature" | "group" | "voice";

export interface StoryCharacterV2 {
  id: string;
  projectCharacterId: string;
  name: string;
  role: string;
  level: StoryCharacterLevel;
  entityType: StoryCharacterEntityType;
  motivation: string;
  relationship: string;
  visualTraits: string;
  notes: string;
}

export interface StorySceneV2 {
  id: string;
  name: string;
  location: string;
  timeOfDay: string;
  atmosphere: string;
  purpose: string;
}

export interface StoryBeatV2 {
  id: string;
  order: number;
  title: string;
  summary: string;
  conflict: string;
  characters: string[];
  sceneId: string | null;
  visualFocus: string;
  outcome: string;
}

export interface StoryDocumentV2 {
  schemaVersion: 2;
  chapterId: string;
  synopsis: string;
  direction: StoryDirectionV2;
  characters: StoryCharacterV2[];
  scenes: StorySceneV2[];
  beats: StoryBeatV2[];
  notes: string;
}

export type PanelRhythmV2 = "slow" | "normal" | "fast" | "impact" | "transition";
export type CameraMovementV2 =
  | "static" | "push_in" | "pull_out" | "pan_left" | "pan_right"
  | "tilt_up" | "tilt_down" | "track_left" | "track_right"
  | "slow_zoom" | "handheld" | "none";
export type FrameTypeV2 = "atmosphere" | "dialogue" | "action" | "reaction" | "detail" | "transition";
export type ShotTypeV2 = "establishing" | "wide" | "full" | "medium" | "close_up" | "extreme_close_up";
export type CameraAngleV2 = "eye_level" | "high_angle" | "low_angle" | "over_shoulder" | "top_down" | "dutch_angle";

export interface StoryboardVoiceLineV2 {
  characterId: string | null;
  name: string;
  line: string;
  voiceStyle: string;
}

export interface StoryboardComicV2 {
  panelDescription: string;
  composition: string;
  dialogue: string;
  caption: string;
  panelRhythm: PanelRhythmV2;
}

export interface StoryboardMotionV2 {
  visualDescription: string;
  compositionDesign: string;
  cameraMovement: CameraMovementV2;
  frameType: FrameTypeV2;
  durationMs: number;
  durationHint: string;
  voiceLines: StoryboardVoiceLineV2[];
}

export interface StoryboardShotV2 {
  id: string;
  order: number;
  beatId: string | null;
  sceneId: string | null;
  characterIds: string[];
  coreAction: string;
  emotion: string;
  shotType: ShotTypeV2;
  cameraAngle: CameraAngleV2;
  comic: StoryboardComicV2;
  motion: StoryboardMotionV2;
  promptDraft: string;
}

export interface StoryboardDocumentV2 {
  schemaVersion: 2;
  chapterId: string;
  shots: StoryboardShotV2[];
  notes: string;
}

export type PreflightCheckStatusV2 = "ok" | "warning" | "blocked";
export type PreflightIssueTypeV2 =
  | "missing_storyboard" | "unresolved_character" | "missing_reference"
  | "running_reference_task" | "missing_scene" | "missing_scene_reference"
  | "missing_style_context";

export interface PreflightCharacterCheckV2 {
  characterId: string;
  name: string;
  level: StoryCharacterLevel;
  appearanceCount: number;
  requiredReference: boolean;
  referenceReady: boolean;
  referenceAssetId: string | null;
  status: PreflightCheckStatusV2;
  note: string;
}

export interface PreflightSceneCheckV2 {
  sceneId: string;
  name: string;
  shotCount: number;
  referenceAssetId: string | null;
  referenceReady: boolean;
  status: PreflightCheckStatusV2;
  note: string;
}

export interface PreflightStyleCheckV2 {
  comicFormat: "vertical_scroll" | "paged_comic";
  comicFormatLabel: string;
  artStyle: string;
  artStyleLabel: string;
  status: PreflightCheckStatusV2;
  note: string;
}

export interface PreflightIssueV2 {
  type: PreflightIssueTypeV2;
  status: "warning" | "blocked";
  message: string;
  relatedName: string | null;
  relatedCharacterId: string | null;
  relatedSceneId: string | null;
  relatedShotId: string | null;
}

export interface PreflightSourceSnapshotV1 {
  schemaVersion: 1;
  policyVersion: "preflight-source-v1";
  projectId: string;
  chapterId: string;
  consumerType: "preflight_revision";
  storyboard: { id: string; digest: Digest };
  style: {
    comicFormat: "vertical_scroll" | "paged_comic";
    artStyle: string;
    styleDigest: Digest;
  };
  characters: Array<{
    characterId: string;
    required: boolean;
    generationInputDigest: Digest;
    visualId: string | null;
    assetId: string | null;
    assetSha256: Digest | null;
  }>;
  scenes: Array<{
    chapterSceneId: string;
    sceneKey: string;
    visualId: string | null;
    assetId: string | null;
    assetSha256: Digest | null;
  }>;
}

export interface PreflightDocumentV2 {
  schemaVersion: 2;
  chapterId: string;
  sourceSnapshot: PreflightSourceSnapshotV1;
  shotCount: number;
  characterChecks: PreflightCharacterCheckV2[];
  sceneChecks: PreflightSceneCheckV2[];
  styleCheck: PreflightStyleCheckV2;
  issues: PreflightIssueV2[];
  ready: boolean;
  notes: string;
  policyVersion: "preflight-source-v1";
}

