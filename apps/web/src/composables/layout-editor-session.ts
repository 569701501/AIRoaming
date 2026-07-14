import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
} from "vue";
import {
  applyLayoutCommand,
  createLayoutCommandHistory,
  encodeLayoutWorkingCopyRecoveryV1,
  LayoutDocumentCodecV1,
  pushLayoutCommandHistory,
  type ApplicableLayoutCommandV1,
  type EditorCommandBatchV1,
  type EditorCommandV1,
  type LayoutCommandHistoryV1,
  type LayoutDocumentV1,
  type LayoutProfileV1,
  type LayoutWorkingCopyInitializationModeV1,
  type LayoutWorkingCopyResponseV1,
} from "@airoaming/shared";

import { api, ApiClientError } from "../services/api";

export const AUTOSAVE_IDLE_MS = 800;
export const AUTOSAVE_MAX_DIRTY_MS = 5_000;
const EDITOR_MIN_WIDTH = 1_024;

type SaveState = "loading" | "missing" | "saved" | "unsaved" | "saving" | "conflict" | "error";

interface LayoutEditorSessionInput {
  projectId: ComputedRef<string>;
  chapterId: ComputedRef<string | null>;
}

function commandId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function useLayoutEditorSession(input: LayoutEditorSessionInput) {
  const document = shallowRef<LayoutDocumentV1 | null>(null);
  const server = shallowRef<LayoutWorkingCopyResponseV1 | null>(null);
  const conflictServer = shallowRef<LayoutWorkingCopyResponseV1 | null>(null);
  const history = shallowRef<LayoutCommandHistoryV1>(createLayoutCommandHistory());
  const saveState = ref<SaveState>("loading");
  const errorMessage = ref<string | null>(null);
  const selectedCanvasId = ref<string | null>(null);
  const selectedElementIds = ref<string[]>([]);
  const zoom = ref(0.24);
  const viewportWidth = ref(typeof window === "undefined" ? EDITOR_MIN_WIDTH : window.innerWidth);
  const isReadOnly = computed(() => viewportWidth.value < EDITOR_MIN_WIDTH);
  const canUndo = computed(() => history.value.undo.length > 0 && !isReadOnly.value);
  const canRedo = computed(() => history.value.redo.length > 0 && !isReadOnly.value);
  const isDirty = ref(false);
  let firstDirtyAt: number | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let loadGeneration = 0;
  let saveInFlight = false;

  const currentCanvas = computed(() => {
    const value = document.value;
    if (!value) return null;
    return value.canvases.find((canvas) => canvas.id === selectedCanvasId.value) ?? value.canvases[0] ?? null;
  });
  const selectedElements = computed(() => {
    const canvas = currentCanvas.value;
    const selected = new Set(selectedElementIds.value);
    return canvas?.elements.filter((element) => selected.has(element.id)) ?? [];
  });

  function clearTimers(): void {
    if (idleTimer) clearTimeout(idleTimer);
    if (maxTimer) clearTimeout(maxTimer);
    idleTimer = null;
    maxTimer = null;
  }

  function selectCanvas(canvasId: string): void {
    selectedCanvasId.value = canvasId;
    selectedElementIds.value = [];
  }

  function selectElement(elementId: string, additive = false): void {
    if (!additive) {
      selectedElementIds.value = [elementId];
      return;
    }
    selectedElementIds.value = selectedElementIds.value.includes(elementId)
      ? selectedElementIds.value.filter((id) => id !== elementId)
      : [...selectedElementIds.value, elementId];
  }

  function replaceFromServer(value: LayoutWorkingCopyResponseV1): void {
    server.value = value;
    document.value = structuredClone(value.document);
    selectedCanvasId.value = value.document.canvases[0]?.id ?? null;
    selectedElementIds.value = [];
    history.value = createLayoutCommandHistory();
    conflictServer.value = null;
    errorMessage.value = null;
    isDirty.value = false;
    firstDirtyAt = null;
    clearTimers();
    saveState.value = "saved";
  }

  async function load(): Promise<void> {
    const chapterId = input.chapterId.value;
    if (!chapterId) {
      document.value = null;
      server.value = null;
      saveState.value = "missing";
      return;
    }
    const generation = ++loadGeneration;
    clearTimers();
    saveState.value = "loading";
    errorMessage.value = null;
    try {
      const value = await api.getLayoutWorkingCopy(input.projectId.value, chapterId);
      if (generation === loadGeneration) replaceFromServer(value);
    } catch (error) {
      if (generation !== loadGeneration) return;
      if (error instanceof ApiClientError && error.status === 404) {
        document.value = null;
        server.value = null;
        saveState.value = "missing";
        return;
      }
      errorMessage.value = error instanceof Error ? error.message : "成稿草稿读取失败";
      saveState.value = "error";
    }
  }

  async function initialize(
    profile: LayoutProfileV1,
    mode: LayoutWorkingCopyInitializationModeV1,
    expectedCurrentLayoutRevisionId: string | null,
  ): Promise<void> {
    const chapterId = input.chapterId.value;
    if (!chapterId || isReadOnly.value) return;
    saveState.value = "loading";
    errorMessage.value = null;
    try {
      const result = await api.initializeLayoutWorkingCopy(input.projectId.value, chapterId, {
        schemaVersion: 1,
        profile,
        initializationMode: mode,
        expectedCurrentLayoutRevisionId,
      });
      replaceFromServer(result.value);
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "成稿草稿初始化失败";
      saveState.value = "error";
    }
  }

  function scheduleAutosave(): void {
    if (!isDirty.value || isReadOnly.value || saveState.value === "conflict") return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void flush(), AUTOSAVE_IDLE_MS);
    if (firstDirtyAt === null) firstDirtyAt = Date.now();
    if (!maxTimer) {
      const remaining = Math.max(0, AUTOSAVE_MAX_DIRTY_MS - (Date.now() - firstDirtyAt));
      maxTimer = setTimeout(() => void flush(), remaining);
    }
  }

  function markDirty(): void {
    isDirty.value = true;
    saveState.value = "unsaved";
    scheduleAutosave();
  }

  function execute(command: EditorCommandV1): void {
    if (!document.value || isReadOnly.value || saveState.value === "conflict") return;
    const result = applyLayoutCommand(document.value, command);
    document.value = result.document;
    history.value = pushLayoutCommandHistory(history.value, {
      batchId: command.commandId,
      label: command.label,
      inverse: result.inverse,
      forward: command,
    });
    markDirty();
  }

  function executeBatch(batch: EditorCommandBatchV1): void {
    if (!document.value || isReadOnly.value || saveState.value === "conflict") return;
    let current = document.value;
    let inverse: ReturnType<typeof applyLayoutCommand>["inverse"] | null = null;
    for (const command of batch.commands) {
      const result = applyLayoutCommand(current, command);
      if (!inverse) {
        inverse = {
          schemaVersion: 1,
          commandId: `inverse:${batch.batchId}`,
          type: "layout.restore_snapshot",
          label: `Undo ${batch.label}`,
          payload: { document: structuredClone(document.value) },
        };
      }
      current = result.document;
    }
    if (!inverse) return;
    document.value = current;
    history.value = pushLayoutCommandHistory(history.value, {
      batchId: batch.batchId,
      label: batch.label,
      inverse,
      forward: batch,
    });
    markDirty();
  }

  function applyStored(command: ApplicableLayoutCommandV1 | EditorCommandBatchV1): LayoutDocumentV1 {
    if (!document.value) throw new Error("layout document is missing");
    if ("batchId" in command) {
      let current = document.value;
      for (const child of command.commands) current = applyLayoutCommand(current, child).document;
      return current;
    }
    return applyLayoutCommand(document.value, command).document;
  }

  function undo(): void {
    if (!document.value || !canUndo.value) return;
    const entry = history.value.undo.at(-1)!;
    document.value = applyStored(entry.inverse);
    history.value = {
      undo: history.value.undo.slice(0, -1),
      redo: [...history.value.redo, entry],
      bytes: Math.max(0, history.value.bytes - entry.byteSize),
    };
    markDirty();
  }

  function redo(): void {
    if (!document.value || !canRedo.value) return;
    const entry = history.value.redo.at(-1)!;
    document.value = applyStored(entry.forward);
    history.value = {
      undo: [...history.value.undo, entry],
      redo: history.value.redo.slice(0, -1),
      bytes: history.value.bytes + entry.byteSize,
    };
    markDirty();
  }

  async function refreshConflictServer(): Promise<void> {
    const chapterId = input.chapterId.value;
    if (!chapterId) return;
    conflictServer.value = await api.getLayoutWorkingCopy(input.projectId.value, chapterId);
  }

  async function flush(): Promise<void> {
    const chapterId = input.chapterId.value;
    const local = document.value;
    const base = server.value;
    if (!chapterId || !local || !base || !isDirty.value || isReadOnly.value || saveState.value === "conflict") return;
    if (saveInFlight) return;
    saveInFlight = true;
    clearTimers();
    const encoded = LayoutDocumentCodecV1.encode(local);
    saveState.value = "saving";
    try {
      const result = await api.saveLayoutWorkingCopy(input.projectId.value, chapterId, {
        schemaVersion: 1,
        expectedRowVersion: base.rowVersion,
        baseDocumentDigest: base.documentDigest,
        documentDigest: encoded.digest,
        document: encoded.value,
      });
      server.value = result.value;
      const latestDigest = document.value ? LayoutDocumentCodecV1.encode(document.value).digest : null;
      if (latestDigest === encoded.digest) {
        document.value = structuredClone(result.value.document);
        isDirty.value = false;
        firstDirtyAt = null;
        saveState.value = "saved";
      } else {
        saveState.value = "unsaved";
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "LAYOUT_WORKING_COPY_CONFLICT") {
        saveState.value = "conflict";
        await refreshConflictServer().catch(() => undefined);
      } else {
        errorMessage.value = error instanceof Error ? error.message : "自动保存失败";
        saveState.value = "unsaved";
      }
    } finally {
      saveInFlight = false;
      if (isDirty.value && saveState.value !== "conflict") scheduleAutosave();
    }
  }

  async function reloadServer(): Promise<void> {
    const chapterId = input.chapterId.value;
    if (!chapterId) return;
    replaceFromServer(await api.getLayoutWorkingCopy(input.projectId.value, chapterId));
  }

  async function keepLocalAndRetry(): Promise<void> {
    const chapterId = input.chapterId.value;
    if (!chapterId || !document.value) return;
    const latest = await api.getLayoutWorkingCopy(input.projectId.value, chapterId);
    server.value = latest;
    conflictServer.value = null;
    saveState.value = "unsaved";
    isDirty.value = true;
    await flush();
  }

  function downloadRecovery(): void {
    if (!document.value || !server.value) return;
    const encoded = LayoutDocumentCodecV1.encode(document.value);
    const recovery = encodeLayoutWorkingCopyRecoveryV1({
      schemaVersion: 1,
      kind: "layout_working_copy_recovery_v1",
      projectId: server.value.projectId,
      chapterId: server.value.chapterId,
      workingCopyId: server.value.id,
      serverRowVersion: server.value.rowVersion,
      serverDocumentDigest: server.value.documentDigest,
      localDocumentDigest: encoded.digest,
      document: encoded.value,
    });
    const blob = new Blob([`${recovery.canonical}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = globalThis.document.createElement("a");
    anchor.href = url;
    anchor.download = `layout-recovery-${server.value.chapterId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function makeTransformCommand(elementId: string, transform: LayoutDocumentV1["canvases"][number]["elements"][number]["transform"]): EditorCommandV1<"element.set_transform"> {
    return {
      schemaVersion: 1,
      commandId: commandId("transform"),
      type: "element.set_transform",
      label: "调整对象",
      payload: { canvasId: currentCanvas.value!.id, elementId, transform },
    };
  }

  function handleResize(): void {
    viewportWidth.value = window.innerWidth;
  }

  function handleVisibility(): void {
    if (globalThis.document.visibilityState === "hidden") void flush();
  }

  function handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (!isDirty.value) return;
    void flush();
    event.preventDefault();
    event.returnValue = "";
  }

  watch([input.projectId, input.chapterId], () => void load(), { immediate: true });
  watch(isReadOnly, (readOnly) => {
    if (readOnly) clearTimers();
    else if (isDirty.value) scheduleAutosave();
  });

  onMounted(() => {
    window.addEventListener("resize", handleResize);
    globalThis.document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
  });
  onBeforeUnmount(() => {
    void flush();
    clearTimers();
    window.removeEventListener("resize", handleResize);
    globalThis.document.removeEventListener("visibilitychange", handleVisibility);
    window.removeEventListener("beforeunload", handleBeforeUnload);
  });

  return {
    document,
    server,
    conflictServer,
    saveState,
    errorMessage,
    currentCanvas,
    selectedCanvasId,
    selectedElementIds,
    selectedElements,
    zoom,
    isReadOnly,
    isDirty,
    canUndo,
    canRedo,
    selectCanvas,
    selectElement,
    initialize,
    execute,
    executeBatch,
    undo,
    redo,
    flush,
    reloadServer,
    keepLocalAndRetry,
    downloadRecovery,
    makeTransformCommand,
  };
}
