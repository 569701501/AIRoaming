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
} from "@airoaming/shared";

import { api, ApiClientError } from "../services/api";

type LayoutCompositionState =
  | "idle"
  | "starting"
  | "queued"
  | "running"
  | "applying"
  | "completed"
  | "failed";

interface LayoutCompositionSessionInput {
  projectId: ComputedRef<string>;
  chapterId: ComputedRef<string | null>;
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
    return "生成期间分镜或候选图发生了变化，请返回候选图确认最新内容后重新进入漫画成稿。";
  }
  if (code === "LAYOUT_COMPOSITION_ALREADY_EXISTS") {
    return "本章已经有成稿，正在重新读取现有内容。";
  }
  if (code === "LAYOUT_COMPOSITION_BASE_CONFLICT") {
    return "成稿在生成期间被修改了，请保存当前调整后再试一次。";
  }
  if (code === "LAYOUT_COMPOSITION_PROTECTION_VIOLATION") {
    return "已有人工调整受到保护，系统没有覆盖它们。请刷新页面继续使用当前成稿。";
  }
  if (code === "LAYOUT_COMPOSITION_NO_VALID_PLAN") {
    return "系统没有找到可用的首次排版方案，请返回候选图检查后重新进入漫画成稿。";
  }
  if (code === "LAYOUT_DB_ONLY_REQUIRED") {
    return "当前项目运行方式不支持智能成稿，请切换到数据库工作区后再试。";
  }
  if (error instanceof ApiClientError && error.message) return error.message;
  return error instanceof Error ? error.message : "首次排版没有完成，请返回候选图检查后重新进入漫画成稿。";
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
    if (state.value === "completed") return 100;
    return task.value?.progressPercent ?? (state.value === "starting" ? 2 : 0);
  });

  const phaseLabel = computed(() => {
    if (state.value === "starting") return "正在准备本章素材";
    if (state.value === "queued") return "正在等待开始";
    if (state.value === "applying") return "正在打开可编辑成稿";
    if (state.value === "completed") return "完整成稿已经生成";
    const phase = task.value?.phase;
    if (phase === "validate_input" || phase === "claimed") return "正在理解分镜和对白";
    if (phase === "compose_candidates") return "正在安排画格、图片、对白和气泡";
    if (phase === "validate_plan") return "正在检查阅读顺序和文字空间";
    if (phase === "seal_output") return "正在整理成可编辑的完整成稿";
    return state.value === "failed" ? "这次没有完成" : "正在生成完整成稿";
  });

  function reset(): void {
    generation += 1;
    state.value = "idle";
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

  async function startInitial(): Promise<LayoutCompositionApplyResponseV1 | null> {
    const projectId = input.projectId.value;
    const chapterId = input.chapterId.value;
    if (!chapterId || busy.value) return null;
    const localGeneration = ++generation;
    task.value = null;
    application.value = null;
    errorMessage.value = null;
    state.value = "starting";

    try {
      const created = await api.createLayoutComposition(projectId, chapterId, {
        schemaVersion: 1,
        mode: "initial",
        intent: "standard",
        scope: null,
        expectedWorkingCopyRowVersion: null,
        expectedDocumentDigest: null,
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
      state.value = "completed";
      return applied;
    } catch (error) {
      if (localGeneration !== generation) return null;
      state.value = "failed";
      errorMessage.value = friendlyError(error);
      return null;
    }
  }

  watch([input.projectId, input.chapterId], reset);
  onBeforeUnmount(() => {
    generation += 1;
  });

  return {
    state,
    task,
    application,
    errorMessage,
    busy,
    progressPercent,
    phaseLabel,
    reset,
    startInitial,
  };
}
