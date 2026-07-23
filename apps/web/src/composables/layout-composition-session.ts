import {
  computed,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
} from "vue";
import type {
  GenerationTaskItem,
  LayoutCompositionApplyResponseV1,
  LayoutCompositionIntentV1,
  LayoutCompositionModeV1,
  LayoutCompositionScopeV1,
  LayoutDigest,
} from "@airoaming/shared";

import { api, ApiClientError } from "../services/api";

type LayoutCompositionState =
  | "idle"
  | "starting"
  | "queued"
  | "running"
  | "applying"
  | "completed"
  | "preview_ready"
  | "failed";

interface LayoutCompositionSessionInput {
  projectId: ComputedRef<string>;
  chapterId: ComputedRef<string | null>;
}

interface StartCompositionInput {
  mode: LayoutCompositionModeV1;
  intent?: LayoutCompositionIntentV1;
  scope?: LayoutCompositionScopeV1 | null;
  expectedWorkingCopyRowVersion: number | null;
  expectedDocumentDigest: LayoutDigest | null;
}

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "cancelled"]);
const POLL_INTERVAL_MS = 450;
const MAX_POLL_ATTEMPTS = 800;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function taskState(task: GenerationTaskItem): LayoutCompositionState {
  if (task.status === "running") return "running";
  if (task.status === "queued" || task.status === "retrying") return "queued";
  return "starting";
}

function friendlyError(error: unknown): string {
  const code = error instanceof ApiClientError
    ? error.code
    : error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  if (code === "LAYOUT_COMPOSITION_SOURCE_INCOMPLETE") {
    return "还有分镜没有确认候选图，先把候选图定下来后就能自动生成完整成稿。";
  }
  if (code === "LAYOUT_COMPOSITION_SOURCE_STALE") {
    return "生成期间分镜或候选图发生了变化，请按最新内容重新生成。";
  }
  if (code === "LAYOUT_COMPOSITION_ALREADY_EXISTS") {
    return "本章已经有成稿，正在重新读取现有内容。";
  }
  if (code === "LAYOUT_COMPOSITION_BASE_CONFLICT") {
    return "成稿在生成期间被修改了，请保存当前调整后再试一次。";
  }
  if (code === "LAYOUT_COMPOSITION_PROTECTION_VIOLATION") {
    return "这次整章重排会碰到你已经手动调整过的内容，系统没有覆盖它们。你可以继续手动改，或等局部重排接通后只调整未保护区域。";
  }
  if (code === "LAYOUT_COMPOSITION_SCOPE_INVALID") {
    return "这个范围里没有可智能调整的画格或气泡，请先选择一个画格、气泡，或改为调整当前页。";
  }
  if (code === "LAYOUT_COMPOSITION_NO_VALID_PLAN") {
    return "这个范围已经接近当前最佳排法，或可调整的内容都已被你锁定、保护。当前成稿没有变化。";
  }
  if (code === "LAYOUT_DB_ONLY_REQUIRED") {
    return "当前项目运行方式不支持智能成稿，请切换到数据库工作区后再试。";
  }
  if (error instanceof ApiClientError && error.message) return error.message;
  return error instanceof Error ? error.message : "智能成稿没有完成，请稍后重试。";
}

function taskFailure(task: GenerationTaskItem): Error {
  const error = new Error(task.error?.message || "LAYOUT_COMPOSITION_TASK_FAILED");
  Object.assign(error, {
    code: task.error?.code,
    retryable: task.error?.retryable ?? false,
  });
  return error;
}

export function useLayoutCompositionSession(input: LayoutCompositionSessionInput) {
  const state = ref<LayoutCompositionState>("idle");
  const mode = ref<LayoutCompositionModeV1 | null>(null);
  const task = shallowRef<GenerationTaskItem | null>(null);
  const application = shallowRef<LayoutCompositionApplyResponseV1 | null>(null);
  const errorMessage = ref<string | null>(null);
  let generation = 0;

  const busy = computed(() => [
    "starting",
    "queued",
    "running",
    "applying",
  ].includes(state.value));

  const progressPercent = computed(() => {
    if (state.value === "applying") return 98;
    if (state.value === "completed" || state.value === "preview_ready") return 100;
    return task.value?.progressPercent ?? (state.value === "starting" ? 2 : 0);
  });

  const phaseLabel = computed(() => {
    if (state.value === "starting") return "正在准备本章素材";
    if (state.value === "queued") return "正在等待开始";
    if (state.value === "applying") {
      return mode.value === "initial"
        ? "正在打开可编辑成稿"
        : mode.value === "scoped_reflow"
          ? "正在准备局部调整预览"
          : "正在准备新排法预览";
    }
    if (state.value === "preview_ready") return "新排法已经准备好";
    if (state.value === "completed") return "完整成稿已经生成";
    const phase = task.value?.phase;
    if (phase === "validate_input" || phase === "claimed") return "正在理解分镜和对白";
    if (phase === "compose_candidates") {
      return mode.value === "scoped_reflow"
        ? "正在分析画面并调整选中范围"
        : "正在安排画格、图片、对白和气泡";
    }
    if (phase === "validate_plan") return "正在检查阅读顺序和文字空间";
    if (phase === "seal_output") return "正在整理成可编辑的完整成稿";
    return state.value === "failed" ? "这次没有完成" : "正在生成完整成稿";
  });

  const analysisLabel = computed(() => {
    const report = task.value?.output?.report;
    if (!report || typeof report !== "object" || Array.isArray(report)) return null;
    const analysisMode = (report as Record<string, unknown>).analysisMode;
    return analysisMode === "vision"
      ? "已结合画面分析"
      : analysisMode === "mixed"
        ? "部分画面已完成视觉分析，其余使用安全规则"
      : analysisMode === "rule_fallback"
        ? "已根据分镜、图片尺寸和对白规则排版"
        : null;
  });

  function reset(): void {
    generation += 1;
    state.value = "idle";
    mode.value = null;
    task.value = null;
    application.value = null;
    errorMessage.value = null;
  }

  async function poll(
    projectId: string,
    chapterId: string,
    taskId: string,
    localGeneration: number,
  ): Promise<GenerationTaskItem> {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
      if (localGeneration !== generation) throw new Error("LAYOUT_COMPOSITION_CANCELLED_LOCALLY");
      const response = await api.getLayoutComposition(projectId, chapterId, taskId);
      task.value = response.task;
      state.value = taskState(response.task);
      if (TERMINAL_STATUSES.has(response.task.status)) return response.task;
      await wait(POLL_INTERVAL_MS);
    }
    throw new Error("智能成稿等待时间过长，请稍后重新打开本章查看结果。");
  }

  async function start(request: StartCompositionInput): Promise<LayoutCompositionApplyResponseV1 | null> {
    const projectId = input.projectId.value;
    const chapterId = input.chapterId.value;
    if (!chapterId || busy.value) return null;
    const localGeneration = ++generation;
    mode.value = request.mode;
    task.value = null;
    application.value = null;
    errorMessage.value = null;
    state.value = "starting";

    try {
      const created = await api.createLayoutComposition(projectId, chapterId, {
        schemaVersion: 1,
        mode: request.mode,
        intent: request.intent ?? "standard",
        scope: request.scope ?? null,
        expectedWorkingCopyRowVersion: request.expectedWorkingCopyRowVersion,
        expectedDocumentDigest: request.expectedDocumentDigest,
      });
      if (localGeneration !== generation) return null;
      task.value = created.task;
      state.value = taskState(created.task);
      const completed = TERMINAL_STATUSES.has(created.task.status)
        ? created.task
        : await poll(projectId, chapterId, created.task.id, localGeneration);
      if (localGeneration !== generation) return null;
      task.value = completed;
      if (completed.status !== "succeeded") throw taskFailure(completed);

      state.value = "applying";
      const applied = await api.applyLayoutComposition(projectId, chapterId, completed.id);
      if (localGeneration !== generation) return null;
      application.value = applied;
      state.value = applied.target === "pending_command" ? "preview_ready" : "completed";
      return applied;
    } catch (error) {
      if (localGeneration !== generation) return null;
      state.value = "failed";
      errorMessage.value = friendlyError(error);
      return null;
    }
  }

  function startInitial(): Promise<LayoutCompositionApplyResponseV1 | null> {
    return start({
      mode: "initial",
      scope: null,
      expectedWorkingCopyRowVersion: null,
      expectedDocumentDigest: null,
    });
  }

  function startFullReflow(
    expectedWorkingCopyRowVersion: number,
    expectedDocumentDigest: LayoutDigest,
    intent: LayoutCompositionIntentV1 = "standard",
  ): Promise<LayoutCompositionApplyResponseV1 | null> {
    return start({
      mode: "full_reflow",
      intent,
      scope: null,
      expectedWorkingCopyRowVersion,
      expectedDocumentDigest,
    });
  }

  function startScopedReflow(
    expectedWorkingCopyRowVersion: number,
    expectedDocumentDigest: LayoutDigest,
    scope: LayoutCompositionScopeV1,
    intent: LayoutCompositionIntentV1 = "dialogue_readability",
  ): Promise<LayoutCompositionApplyResponseV1 | null> {
    return start({
      mode: "scoped_reflow",
      intent,
      scope,
      expectedWorkingCopyRowVersion,
      expectedDocumentDigest,
    });
  }

  watch([input.projectId, input.chapterId], reset);
  onBeforeUnmount(() => {
    generation += 1;
  });

  return {
    state,
    mode,
    task,
    application,
    errorMessage,
    busy,
    progressPercent,
    phaseLabel,
    analysisLabel,
    reset,
    startInitial,
    startFullReflow,
    startScopedReflow,
  };
}
