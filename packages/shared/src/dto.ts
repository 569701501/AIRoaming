import type {
  ArtStyle,
  AssetType,
  CandidateGenerationPurpose,
  ChapterStatus,
  GenerationTaskStatus,
  GenerationTaskTargetType,
  GenerationTaskType,
  AppearanceTheme,
  ProjectWorkflowScope,
  ProjectWorkflowStepKey,
  ProjectWorkflowStepStatus,
  ProjectStatus,
  ProjectType,
} from "./domain.js";
import type { ComicFormat } from "./comic-format.js";
import type {
  CandidateChapterSourceState,
  CandidateStatus,
  CurrentCandidateDecision,
  TaskApplicability,
} from "./candidate-lock.js";
import type { ArtifactFreshness, FreshnessReasonCode } from "./versioning/production-state.js";
import type { ImportAnalysisOutputV1 } from "./script-workflow-contract.js";

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

export interface AppAppearanceSettings {
  theme: AppearanceTheme;
}

export interface AppAIKeySettings {
  providerId: string;
  providerName: string;
  modelId: string;
  baseUrl: string | null;
  configured: boolean;
  keyPreview: string | null;
  keyFingerprint: string | null;
  updatedAt: string | null;
}

export interface AppImageProviderSettings {
  providerId: string;
  providerName: string;
  modelId: string;
  baseUrl: string | null;
  configured: boolean;
  keyPreview: string | null;
  keyFingerprint: string | null;
  updatedAt: string | null;
}

/** 图片生成 provider 类型:OpenAI 协议 / 豆包协议 / Grok Imagine */
export type ImageProviderType = "openai" | "doubao" | "grok";

export interface AppSettings {
  aiKey: AppAIKeySettings;
  openaiImageProvider: AppImageProviderSettings;
  doubaoImageProvider: AppImageProviderSettings;
  grokImageProvider: AppImageProviderSettings;
  activeImageProvider: ImageProviderType;
  appearance: AppAppearanceSettings;
  settingsPath: "/workspace/settings/app-settings.json";
  updatedAt: string;
}

export interface UpdateAIKeySettingsRequest {
  providerId?: string;
  providerName?: string;
  modelId?: string;
  baseUrl?: string | null;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface UpdateImageProviderSettingsRequest {
  providerId?: string;
  providerName?: string;
  modelId?: string;
  baseUrl?: string | null;
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface UpdateAppearanceSettingsRequest {
  theme?: AppearanceTheme;
}

export interface UpdateAppSettingsRequest {
  aiKey?: UpdateAIKeySettingsRequest;
  openaiImageProvider?: UpdateImageProviderSettingsRequest;
  doubaoImageProvider?: UpdateImageProviderSettingsRequest;
  grokImageProvider?: UpdateImageProviderSettingsRequest;
  activeImageProvider?: ImageProviderType;
  appearance?: UpdateAppearanceSettingsRequest;
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
  comicFormat: ComicFormat;
  storyTitle?: string;
  genreTags?: string[];
  artStyle?: ArtStyle;
  description?: string;
  sourceText?: string;
}

export interface UpdateProjectDraftRequest {
  name?: string;
  storyTitle?: string;
  genreTags?: string[];
  artStyle?: ArtStyle;
  description?: string;
  sourceText?: string;
}

export interface DeleteProjectResponse {
  deletedProjectId: string;
  deletedTaskCount: number;
  deletedRuntimeStateCount: number;
  status?: "deleting" | "pending" | "processing" | "processed";
  cleanupEventId?: string;
}

export interface ChapterListItem {
  id: string;
  projectId: string;
  slug: string;
  order: number;
  title: string;
  status: ChapterStatus;
  storyboardStatus: ChapterStoryboardStatus | null;
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
  /** AI 生成的章节正文草稿缓冲(见 ADR-0008)。确认前不覆盖正式 sourceText。 */
  pendingSourceText: ChapterPendingSourceText | null;
}

/**
 * 章节正文草稿缓冲。AI 生成正文时写入此处(落 script.pending.md),
 * 用户确认后才覆盖正式 chapter.sourceText。仿分镜 storyboard.pending 机制。
 * 单草稿:一个章节同时只有一份 pending,新生成覆盖旧的。
 */
export interface ChapterPendingSourceText {
  /** DB-only 来源类型；旧文件态数据可缺省为 legacy。 */
  kind?: "legacy" | "ai" | "import";
  /** 草稿正文文本。 */
  sourceText: string;
  /** 生成该草稿的来源对话消息 id,用于追溯。 */
  threadId: string | null;
  messageId: string | null;
  toolCallId: string | null;
  /** 生成操作类型。 */
  operation: "generate_script_from_seed" | "generate_script_from_outline" | "update_chapter_draft" | "import_materialize";
  /** 生成时间。 */
  createdAt: string;
  /** 最近一次更新时间。 */
  updatedAt: string;
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

export interface ConfirmChapterPendingSourceResponse {
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
}

export interface DiscardChapterPendingSourceResponse {
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
}

export interface ConfirmImportChapterRequest {
  pendingId: string;
  expectedPendingRowVersion: number;
  expectedPendingDigest: `sha256:${string}`;
  expectedChapterRowVersion: number;
}

export interface ConfirmImportChapterResponse {
  scriptVersionId: string;
  batchItemId: string;
}

export interface ResetProjectScriptResponse {
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
}

export type ChapterStoryStructureStatus = "pending_confirmation" | "structured";

export interface StoryStructureDirection {
  logline: string;
  chapterGoal: string;
  coreConflict: string;
  emotionalArc: string;
  endingHook: string;
}

export interface StoryStructureCharacterCard {
  id: string;
  /**
   * 指向项目角色库 ProjectCharacter.id。
   * AI 生成结构卡时不填(为 null),由后端在确认剧情结构时
   * 按 name 匹配/新建项目角色后回填(见 ADR-0006)。
   */
  projectCharacterId: string | null;
  name: string;
  role: string;
  /**
   * 角色层级。AI 显式输出(lead/recurring/chapter/minor/extra),见 task 2026-06-21_角色分层双维度。
   * null 表示 AI 未输出,后端 inferCharacterLevel 兜底。
   */
  level: ProjectCharacterLevel | null;
  /**
   * 角色存在形态。AI 显式输出(human/creature/group/voice)。
   * null 表示 AI 未输出,后端默认 human。
   */
  entityType: ProjectCharacterEntityType | null;
  motivation: string;
  relationship: string;
  visualTraits: string;
  notes: string;
}

export interface StoryStructureSceneCard {
  id: string;
  name: string;
  location: string;
  timeOfDay: string;
  atmosphere: string;
  purpose: string;
  /** 场景背景图资产 id(生成后回写),绑在章节级 scene 上 */
  referenceAssetId?: string | null;
}

export interface StoryStructureBeat {
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

export interface StoryStructureJson {
  schemaVersion: 1;
  chapterId: string;
  chapterTitle: string;
  sourceScriptVersionId: string | null;
  synopsis: string;
  direction: StoryStructureDirection;
  characters: StoryStructureCharacterCard[];
  scenes: StoryStructureSceneCard[];
  beats: StoryStructureBeat[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterStoryStructure {
  id: string;
  projectId: string;
  chapterId: string;
  version: number;
  status: ChapterStoryStructureStatus;
  structurePath: string | null;
  sourceScriptVersionId: string | null;
  structureJson: StoryStructureJson;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
}

export interface GetChapterStoryStructureResponse {
  storyStructure: ChapterStoryStructure | null;
}

export interface ConfirmChapterStoryStructureRequest {
  structureJson: StoryStructureJson;
}

export interface UpdateChapterStoryStructureRequest {
  structureJson: StoryStructureJson;
}

export interface SaveChapterStoryStructureResponse {
  storyStructure: ChapterStoryStructure;
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
}

export type ChapterStoryboardStatus = "pending_confirmation" | "storyboard_done";
export type StoryboardShotStatus = "draft" | "ready_for_image" | "image_generated" | "locked" | "needs_revision";

/**
 * 景别。共同核心层,comic 和 motion 共用一份。
 * 决定镜头离主体的远近,是出图最关键参数之一(见 ADR-0007)。
 */
export type ShotType =
  | "establishing"
  | "wide"
  | "full"
  | "medium"
  | "close_up"
  | "extreme_close_up";

/**
 * 机位角度。共同核心层,comic 和 motion 共用一份。
 * 决定摄像机俯仰关系,和景别是两个独立维度(见 ADR-0007)。
 */
export type CameraAngle =
  | "eye_level"
  | "high_angle"
  | "low_angle"
  | "over_shoulder"
  | "top_down"
  | "dutch_angle";

/** 画格节奏。漫画阅读节奏,影响排版与停顿感。 */
export type PanelRhythm = "slow" | "normal" | "fast" | "impact" | "transition";

/** 运镜方式。漫剧镜头的运动方式,做视频时直接解析。 */
export type CameraMovement =
  | "static"
  | "push_in"
  | "pull_out"
  | "pan_left"
  | "pan_right"
  | "tilt_up"
  | "tilt_down"
  | "track_left"
  | "track_right"
  | "slow_zoom"
  | "handheld"
  | "none";

/** 镜头类型。镜头在叙事中的功能分类。 */
export type FrameType = "atmosphere" | "dialogue" | "action" | "reaction" | "detail" | "transition";

/** 配音台词。一个镜头可含多人对话,characterId 与 projectCharacterId 思路对齐。 */
export interface StoryboardShotVoiceLine {
  characterId: string | null;
  name: string;
  line: string;
  voiceStyle: string;
}

export interface StoryboardShotComic {
  panelDescription: string;
  /** 构图说明。只描述人物/场景的摆放与重心,景别和机位已移到 Shot 顶层。 */
  composition: string;
  dialogue: string;
  caption: string;
  panelRhythm: PanelRhythm;
}

export interface StoryboardShotMotion {
  visualDescription: string;
  /** 构图设计。只描述动态画面的构图关系,景别和机位已移到 Shot 顶层。 */
  compositionDesign: string;
  cameraMovement: CameraMovement;
  frameType: FrameType;
  /** 镜头时长,毫秒。给程序算时间线用(见 ADR-0007)。 */
  durationMs: number;
  /** 时长展示文本。给人看,如"约 3-4s"。 */
  durationHint: string;
  /** 配音台词数组,替换旧 voiceRole+line(见 ADR-0007)。 */
  voiceLines: StoryboardShotVoiceLine[];
}

export interface StoryboardShot {
  id: string;
  order: number;
  beatId: string | null;
  sceneId: string | null;
  characterIds: string[];
  coreAction: string;
  emotion: string;
  /** 景别,共同核心层字段(见 ADR-0007)。 */
  shotType: ShotType;
  /** 机位角度,共同核心层字段(见 ADR-0007)。 */
  cameraAngle: CameraAngle;
  comic: StoryboardShotComic;
  motion: StoryboardShotMotion;
  promptDraft: string;
  lockedCandidateId: string | null;
  status: StoryboardShotStatus;
}

export interface StoryboardJson {
  schemaVersion: 1;
  chapterId: string;
  chapterTitle: string;
  sourceStoryVersionId: string | null;
  shots: StoryboardShot[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterStoryboard {
  id: string;
  projectId: string;
  chapterId: string;
  version: number;
  status: ChapterStoryboardStatus;
  storyboardPath: string | null;
  sourceStoryVersionId: string | null;
  storyboardJson: StoryboardJson;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
}

export interface GetChapterStoryboardResponse {
  storyboard: ChapterStoryboard | null;
  pendingStoryboard: ChapterStoryboard | null;
}

export interface ConfirmChapterStoryboardRequest {
  storyboardJson: StoryboardJson;
}

export interface UpdateChapterStoryboardRequest {
  storyboardJson: StoryboardJson;
}

export interface SaveChapterStoryboardResponse {
  storyboard: ChapterStoryboard;
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
}

export type ImagePreflightCheckStatus = "ok" | "warning" | "blocked";

export interface ImagePreflightCharacterCheck {
  characterId: string;
  name: string;
  level: ProjectCharacterLevel;
  appearanceCount: number;
  requiredReference: boolean;
  referenceReady: boolean;
  referenceAssetId: string | null;
  status: ImagePreflightCheckStatus;
  note: string;
}

export interface ImagePreflightSceneCheck {
  sceneId: string;
  name: string;
  shotCount: number;
  /** 场景卡绑定的参考图资产 id(场景背景图);无图时为 null。 */
  referenceAssetId: string | null;
  /** 场景是否已生成参考图(referenceAssetId 存在)。 */
  referenceReady: boolean;
  status: ImagePreflightCheckStatus;
  note: string;
}

export interface ImagePreflightStyleCheck {
  comicFormat: ComicFormat;
  comicFormatLabel: string;
  artStyle: ArtStyle;
  artStyleLabel: string;
  status: ImagePreflightCheckStatus;
  note: string;
}

export interface ImagePreflightIssue {
  type:
    | "missing_storyboard"
    | "unresolved_character"
    | "missing_reference"
    | "running_reference_task"
    | "missing_scene"
    | "missing_scene_reference"
    | "missing_style_context";
  status: Exclude<ImagePreflightCheckStatus, "ok">;
  message: string;
  relatedName?: string;
  relatedCharacterId?: string;
  relatedSceneId?: string;
  relatedShotId?: string;
}

export interface ImagePreflightJson {
  schemaVersion: 1;
  chapterId: string;
  chapterTitle: string;
  sourceStoryboardId: string | null;
  sourceStoryboardUpdatedAt: string | null;
  shotCount: number;
  unresolvedCharacters: string[];
  characterChecks: ImagePreflightCharacterCheck[];
  sceneChecks: ImagePreflightSceneCheck[];
  styleCheck: ImagePreflightStyleCheck;
  issues: ImagePreflightIssue[];
  ready: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterImagePreflight {
  id: string;
  projectId: string;
  chapterId: string;
  version: number;
  status: "confirmed";
  preflightPath: string;
  sourceStoryboardId: string | null;
  sourceStoryboardUpdatedAt: string | null;
  preflightJson: ImagePreflightJson;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string;
}

export interface GetChapterImagePreflightResponse {
  imagePreflight: ChapterImagePreflight | null;
}

export interface ConfirmChapterImagePreflightRequest {
  notes?: string;
}

export interface SaveChapterImagePreflightResponse {
  imagePreflight: ChapterImagePreflight;
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
}

export type ResolveImagePreflightCharacterAction =
  | "add_to_library"
  | "merge_existing"
  | "mark_temporary"
  | "ignore";

export interface ResolveImagePreflightCharacterRequest {
  token: string;
  action: ResolveImagePreflightCharacterAction;
  targetCharacterId?: string;
  level?: ProjectCharacterLevel;
  role?: string;
  appearance?: string;
  personality?: string;
  promptFragment?: string;
}

export type ProjectCharacterLevel = "lead" | "recurring" | "chapter" | "minor" | "extra";
export type ProjectCharacterStatus = "draft" | "needs_reference" | "finalized" | "in_use";
export type ProjectCharacterReferenceKind = "preview_front" | "final_reference" | "none";
/**
 * 角色存在形态(见 task 2026-06-21_角色分层双维度)。
 * human:人类角色(默认,现有生图正常走);creature:怪物/异常体;group:群体角色;voice:纯声音角色。
 * 第一批只 human 走通生图,creature/group/voice 占位 fallback 到 human prompt。
 */
export type ProjectCharacterEntityType = "human" | "creature" | "group" | "voice";

export interface ProjectCharacter {
  id: string;
  projectId: string;
  name: string;
  role: string;
  level: ProjectCharacterLevel;
  entityType: ProjectCharacterEntityType;
  status: ProjectCharacterStatus;
  appearance: string;
  personality: string;
  promptFragment: string;
  referenceAssetIds: string[];
  previewReferenceAssetId: string | null;
  previewConfirmedAt: string | null;
  primaryReferenceAssetId: string | null;
  primaryReferenceKind: ProjectCharacterReferenceKind;
  visualVersion: number;
  source: "script_outline" | "imported_script" | "manual" | "story_structure" | "image_preflight";
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
}

export interface ProjectCharactersResponse {
  characters: ProjectCharacter[];
  assets: WorkbenchAsset[];
  ready: boolean;
}

export interface ExtractProjectCharactersRequest {
  source?: "script_outline" | "current_chapter" | "auto";
}

export interface ExtractProjectCharactersResponse extends ProjectCharactersResponse {
  createdCount: number;
  updatedCount: number;
}

export interface UpdateProjectCharacterRequest {
  name?: string;
  role?: string;
  level?: ProjectCharacterLevel;
  appearance?: string;
  personality?: string;
  promptFragment?: string;
}

export interface SaveProjectCharacterResponse extends ProjectCharactersResponse {
  character: ProjectCharacter;
}

export interface DeleteCharacterReferenceResponse extends ProjectCharactersResponse {
  character: ProjectCharacter;
  deletedAssetId: string;
  cleanupStatus: "pending" | "processed";
  cleanupEventId: string | null;
}

export interface ResolveImagePreflightCharacterResponse extends ProjectCharactersResponse {
  storyboard: ChapterStoryboard;
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
  imagePreflight: ChapterImagePreflight | null;
  character: ProjectCharacter | null;
}

export interface GenerateCharacterReferenceRequest {
  referenceKind?: ProjectCharacterReferenceKind;
  prompt?: string;
  size?: string;
  quality?: "auto" | "low" | "medium" | "high";
  outputFormat?: "webp" | "png" | "jpeg";
}

export interface GenerateCharacterReferenceResponse extends ProjectCharactersResponse {
  character: ProjectCharacter;
  asset: WorkbenchAsset;
}

export interface QueueCharacterReferenceResponse extends ProjectCharactersResponse {
  tasks: GenerationTaskItem[];
  createdCount: number;
}

/** 场景背景图生成请求(章节级,纯文生图) */
export interface GenerateSceneReferenceRequest {
  prompt?: string;
  size?: string;
}

export interface GenerateSceneReferenceResponse {
  storyStructure: ChapterStoryStructure;
  asset: WorkbenchAsset;
}

export interface QueueSceneReferenceResponse {
  storyStructure: ChapterStoryStructure;
  assets: WorkbenchAsset[];
  tasks: GenerationTaskItem[];
  createdCount: number;
}

export interface ConfirmCharacterPreviewRequest {
  assetId: string;
}

export interface ConfirmCharacterPreviewResponse extends ProjectCharactersResponse {
  character: ProjectCharacter;
  tasks: GenerationTaskItem[];
}

export interface ConfirmCharacterReferenceRequest {
  assetId: string;
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
  | "confirm_script_chapter_map"
  | "generate_inspiration_seeds"
  | "generate_script_outline_from_seed"
  | "generate_script_from_outline"
  | "generate_script_from_seed"
  | "update_chapter_draft"
  | "generate_story_structure"
  | "confirm_story_structure"
  | "generate_project_characters"
  | "generate_storyboard"
  | "revise_pending_storyboard"
  | "confirm_storyboard";

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
  threadId: string | null;
  messageId: string | null;
  toolCallId: string | null;
  operation: "import_script_to_chapters" | "import_materialize" | "update_chapter_draft" | "generate_script_from_seed" | "generate_script_from_outline";
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

export interface ScriptImportWorkflowBatchItem {
  id: string;
  chapterId: string;
  order: number;
  title: string;
  status: "queued" | "materializing" | "verifying" | "pending_ready" | "generation_failed" | "confirmed";
  errorCode: string | null;
}

export interface ScriptImportWorkflowResult {
  stage: "analysis_candidate" | "batch_result";
  rawSourceVersionId: string;
  analysisCandidateId: string;
  analysis: ImportAnalysisOutputV1;
  blockingIssues: string[];
  chapterMapId: string | null;
  batchId: string | null;
  batchStatus: "queued" | "processing" | "ready_for_review" | "partial_failure" | "failed" | "completed" | null;
  batchItems: ScriptImportWorkflowBatchItem[];
}

export interface ScriptImportBatchStatusResponse {
  batch: {
    id: string;
    chapterMapId: string;
    status: Exclude<ScriptImportWorkflowResult["batchStatus"], null>;
    items: ScriptImportWorkflowBatchItem[];
  };
}

export interface RetryScriptImportItemRequest {
  model?: AIRuntimeModelSelection;
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
    | "generate_script_outline_from_topic"
    | "generate_script_from_outline"
    | "generate_script_from_seed"
    | "generate_multiple_chapters"
    | "update_chapter_draft"
    | "generate_story_structure"
    | "confirm_story_structure"
    | "generate_project_characters"
    | "generate_storyboard"
    | "confirm_storyboard";
  status: "succeeded" | "failed" | "needs_user_confirmation";
  summary: string;
  chapters: ChapterListItem[];
  currentChapterId: string | null;
  currentChapter?: ChapterDetail | null;
  analysis?: ScriptImportAnalysis | null;
  importWorkflow?: ScriptImportWorkflowResult | null;
  inspirationSeeds?: ScriptInspirationSeed[] | null;
  scriptOutline?: ProjectScriptOutline | null;
  storyStructure?: ChapterStoryStructure | null;
  storyboard?: ChapterStoryboard | null;
  characters?: ProjectCharacter[] | null;
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
  /** G2 server projection fields; omitted by legacy file-mode workflow. */
  milestoneReached?: boolean;
  currentArtifactId?: string | null;
  freshness?: ArtifactFreshness | null;
  attention?: "needs_confirmation" | "source_updated" | "blocked" | null;
  canStartTask?: boolean;
  historyAvailable?: boolean;
  reasonCodes?: FreshnessReasonCode[];
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
  order: number;
  beatId: string | null;
  sceneId: string | null;
  sceneName: string;
  characterIds: string[];
  characters: string[];
  coreAction: string;
  emotion: string;
  comic: StoryboardShotComic;
  motion: StoryboardShotMotion;
  promptDraft: string;
  status: StoryboardShotStatus;
  lockedCandidateId: string | null;
  /** DB-only G4 authority. Legacy mode leaves this undefined. */
  currentCandidateDecision?: CurrentCandidateDecision;
}

export type CandidateGenerationReferenceKind = "character_identity" | "scene_environment";

export interface CandidateGenerationReference {
  assetId: string;
  kind: CandidateGenerationReferenceKind;
  entityId: string;
  label: string;
  /** 数值越大越优先；同 provider 超过引用上限时用于确定性裁剪。 */
  priority: number;
}

export interface CandidatePromptSection {
  key: "visual" | "composition" | "action" | "camera" | "scene" | "characters" | "style";
  label: string;
  value: string;
}

export interface CandidateGenerationSpec {
  schemaVersion: 2;
  sizePolicyVersion: "legacy_generation_default_v1";
  purpose: "shot_clean_plate";
  projectId: string;
  chapterId: string;
  shotId: string;
  positivePrompt: string;
  negativePrompt: string;
  sections: CandidatePromptSection[];
  systemConstraints: string[];
  requestedSize: { width: number; height: number };
  references: CandidateGenerationReference[];
  warnings: string[];
  digest: string;
}

export interface CandidateGenerationPreviewResponse {
  spec: CandidateGenerationSpec;
}

export interface WorkbenchCandidate {
  id: string;
  chapterId?: string;
  shotId: string;
  label: string;
  status: CandidateStatus;
  /** DB-only preference and authority projection. */
  favoriteAt?: string | null;
  isCurrentFinal?: boolean;
  sourceApplicability?: TaskApplicability;
  assetId: string;
  taskId?: string | null;
  index?: number;
  palette: string;
  promptDigest: string;
  generationPurpose: CandidateGenerationPurpose;
  generationSpecVersion: number | null;
  generationSpecDigest: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 章节候选图正式记录，落盘 chapters/{slug}/candidates.json */
export interface ProjectCandidate {
  id: string;
  projectId: string;
  chapterId: string;
  shotId: string;
  taskId: string;
  assetId: string;
  index: number;
  status: CandidateStatus;
  label: string;
  promptDigest: string;
  generationPurpose?: Exclude<CandidateGenerationPurpose, "legacy_unspecified">;
  generationSpecVersion?: number;
  generationSpecDigest?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterCandidates {
  schemaVersion: 1;
  projectId: string;
  chapterId: string;
  candidates: ProjectCandidate[];
  updatedAt: string;
}

export interface LockChapterCandidateRequest {
  candidateId: string;
}

export interface LockChapterCandidateResponse {
  candidate: WorkbenchCandidate;
  candidates: WorkbenchCandidate[];
  shots: WorkbenchShot[];
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
  storyboard: ChapterStoryboard;
  assets: WorkbenchAsset[];
}

export interface CompleteChapterImagesResponse {
  chapter: ChapterDetail;
  chapters: ChapterListItem[];
  candidates: WorkbenchCandidate[];
  shots: WorkbenchShot[];
  storyboard: ChapterStoryboard | null;
  workflow: ProjectWorkflow;
}

export interface PanelPlacement {
  shotId: string;
  candidateId: string;
  assetId: string;
  order: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutPage {
  id: string;
  projectId: string;
  chapterId: string;
  pageNumber: number;
  format: "vertical_comic" | "page_horizontal" | "four_panel";
  width: number;
  height: number;
  placements: PanelPlacement[];
  exportAssetId: string | null;
}

export interface ChapterLayout {
  schemaVersion: 1;
  id: string;
  projectId: string;
  chapterId: string;
  pages: LayoutPage[];
  exportAssetIds: string[];
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
}

export interface AssetPackageManifestFile {
  path: string;
  type: string;
  chapterId?: string | null;
  shotId?: string | null;
  candidateId?: string | null;
  assetId?: string | null;
}

export interface AssetPackageManifest {
  schemaVersion: 1;
  packageId: string;
  projectId: string;
  chapterIds: string[];
  createdAt: string;
  files: AssetPackageManifestFile[];
}

export interface ExportAssetPackageResponse {
  packageId: string;
  packagePath: string;
  manifest: AssetPackageManifest;
  asset: WorkbenchAsset;
  chapter: ChapterDetail | null;
  chapters: ChapterListItem[];
  assets: WorkbenchAsset[];
  workflow: ProjectWorkflow;
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
  versioningCapability: VersioningCapability;
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
  storyStructure: ChapterStoryStructure | null;
  storyboard: ChapterStoryboard | null;
  pendingStoryboard: ChapterStoryboard | null;
  imagePreflight: ChapterImagePreflight | null;
  chapterLayout: ChapterLayout | null;
  characters: ProjectCharacter[];
  workflow: ProjectWorkflow;
  stages: WorkbenchStage[];
  story: WorkbenchStory;
  shots: WorkbenchShot[];
  candidates: WorkbenchCandidate[];
  candidateSources?: CandidateChapterSourceState | null;
  assets: WorkbenchAsset[];
  aiNotes: Array<{
    role: "orchestrator" | "worker" | "reviewer";
    title: string;
    body: string;
  }>;
}

export interface VersioningCapability {
  mode: "legacy_file" | "g2_db";
  schemaVersion: 2;
  supports: {
    scriptWorkingCopy: boolean;
    storyWorkingCopy: boolean;
    storyboardWorkingCopy: boolean;
    preflightRevision: boolean;
    persistentTaskRuntime: boolean;
    importer: boolean;
  };
}
