/**
 * DialogueService 内部共享类型(从 dialogue.service.ts 抽出)。
 *
 * 这些类型在对话编排器(DialogueService)和各工作流子 service 之间共享。
 * 见任务 2026-07-02_DialogueService拆分 轮次1。
 */
import type {
  ChapterStoryStructure,
  DialogueMessageItem,
  DialogueToolResult,
  ProjectScriptOutline,
  ScriptImportAnalysis,
  ScriptInspirationSeed,
  WorkbenchSnapshot,
} from "@airoaming/shared";

/** 本地对话线程运行态(不持久化,进程内 Map 持有)。 */
export interface LocalDialogueThread {
  id: string;
  projectId: string;
  stepKey: string;
  chapterId: string | null;
  openCodeSessionId: string | null;
  messages: DialogueMessageItem[];
  toolResults: DialogueToolResult[];
  createdAt: string;
  updatedAt: string;
}

/** 一次对话回合的上下文装配体。 */
export interface DialogueTurn {
  snapshot: WorkbenchSnapshot;
  normalizedStepKey: string;
  thread: LocalDialogueThread;
  userMessage: DialogueMessageItem;
  assistantMessage: DialogueMessageItem;
  prompt: string;
}

/** 用户提供剧本整理输入。 */
export interface ScriptOrganizationInput {
  sourceText: string;
  sourceName: string;
}

/** 待确认导入剧本(分析通过,等用户确认写入)。 */
export interface PendingScriptImport extends ScriptOrganizationInput {
  analysis: ScriptImportAnalysis;
  createdAt: string;
}

/** 待确认灵感种子(已生成,等用户选择)。 */
export interface PendingInspirationSeeds {
  seeds: ScriptInspirationSeed[];
  prompt: string;
  chapterId: string | null;
  createdAt: string;
}

/** 待确认剧本大纲(从种子或题材生成,等用户确认后生成章节)。 */
export interface PendingScriptOutline {
  outline: ProjectScriptOutline;
  /** 来源模式:seed=灵感种子生成,topic=直接题材生成(见 task 2026-06-21_直接题材生成大纲)。 */
  source: "seed" | "topic";
  seed?: ScriptInspirationSeed;
  seedPrompt?: string;
  chapterId: string | null;
  createdAt: string;
}

/** 待确认剧情结构(已生成,等用户确认写入 structure.json)。 */
export interface PendingStoryStructure {
  storyStructure: ChapterStoryStructure;
  chapterId: string;
  createdAt: string;
}

/** 维护快照中可恢复的 pending 对话工件；只覆盖实际由运行态 Map 持有的三类确认项。 */
export interface PendingDialogueCaptureArtifact {
  id: string;
  projectId: string;
  chapterId: string | null;
  threadId: string;
  kind: "script_import" | "inspiration_seeds" | "script_outline_decision";
  status: "pending";
  activeSlotKey: string;
  payload: unknown;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
}
