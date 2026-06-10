import type {
  ArtStyle,
  AssetType,
  ChapterStatus,
  ComicFormat,
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

export interface AppSettings {
  aiKey: AppAIKeySettings;
  imageProvider: AppImageProviderSettings;
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
  imageProvider?: UpdateImageProviderSettingsRequest;
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
  deletedRuntimeStateCount: number;
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
  name: string;
  role: string;
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

export interface StoryboardShotComic {
  panelDescription: string;
  composition: string;
  dialogue: string;
  caption: string;
  panelRhythm: string;
}

export interface StoryboardShotMotion {
  visualDescription: string;
  compositionDesign: string;
  cameraMovement: string;
  voiceRole: string;
  line: string;
  durationHint: string;
  frameType: string;
}

export interface StoryboardShot {
  id: string;
  order: number;
  beatId: string | null;
  sceneId: string | null;
  characterIds: string[];
  coreAction: string;
  emotion: string;
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

export type ProjectCharacterLevel = "lead" | "recurring" | "chapter" | "extra";
export type ProjectCharacterStatus = "draft" | "needs_reference" | "finalized" | "in_use";
export type ProjectCharacterReferenceKind = "preview_front" | "final_reference" | "none";

export interface ProjectCharacter {
  id: string;
  projectId: string;
  name: string;
  role: string;
  level: ProjectCharacterLevel;
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
  | "generate_inspiration_seeds"
  | "generate_script_outline_from_seed"
  | "generate_script_from_outline"
  | "generate_script_from_seed"
  | "update_chapter_draft"
  | "generate_story_structure"
  | "confirm_story_structure"
  | "generate_project_characters"
  | "generate_storyboard"
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
  storyStructure: ChapterStoryStructure | null;
  storyboard: ChapterStoryboard | null;
  pendingStoryboard: ChapterStoryboard | null;
  imagePreflight: ChapterImagePreflight | null;
  characters: ProjectCharacter[];
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
