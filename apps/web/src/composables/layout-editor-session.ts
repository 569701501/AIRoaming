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
  applyLayoutCommandV2,
  encodeLayoutWorkingCopyRecoveryV1,
  LayoutDocumentCodecV1,
  LayoutDocumentCodecV1OrV2,
  projectLayoutDocumentV2ToV1,
  type CreateLayoutRevisionRequestV1OrV2,
  type CreateLayoutRevisionResponseV1,
  type CreateLayoutRevisionResponseV2,
  type EditorCommandBatchV1,
  type EditorCommandV1,
  type EditorCommandV2,
  type LayoutDocumentV1,
  type LayoutDocumentV1OrV2,
  type LayoutDocumentV2,
  type LayoutProfileV1,
  type LayoutPublicationProfileV1,
  type LayoutFontCatalogResponseV1,
  type LayoutSourceCatalogResponseV1,
  type LayoutWorkingCopyInitializationModeV1,
  type LayoutWorkingCopyResponseV1,
  type LayoutPreflightReportV1,
  type LayoutPreflightReportV2,
  type LayoutRevisionHistoryResponseV1,
  type LayoutRevisionHistoryResponseV2,
  type LayoutSourceReplacementCropModeV1,
  type LayoutSourceReplacementPreviewV1,
  type LayoutSourceReplacementPreviewV2,
  type LayoutLegacyCutoverStatusV1,
} from "@airoaming/shared";

import { api, ApiClientError } from "../services/api";
import {
  commitLayoutSaveResultIfCurrent,
  createAwaitableLayoutSaveFlight,
  sameLayoutSaveContext,
  type LayoutSaveContext,
} from "./layout-save-flight";

export const AUTOSAVE_IDLE_MS = 800;
export const AUTOSAVE_MAX_DIRTY_MS = 5_000;
export const LAYOUT_UNDO_STACK_LIMIT = 50;
const EDITOR_MIN_WIDTH = 1_024;

type SaveState = "loading" | "missing" | "saved" | "unsaved" | "saving" | "conflict" | "error";

interface LayoutEditorSessionInput {
  projectId: ComputedRef<string>;
  chapterId: ComputedRef<string | null>;
}

interface PendingLayoutRevisionAttempt {
  context: LayoutSaveContext;
  request: CreateLayoutRevisionRequestV1OrV2;
  baseRowVersion: number;
  baseDocumentDigest: string;
}

function commandId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function visibleDocument(value: LayoutDocumentV1OrV2): LayoutDocumentV1 {
  return value.schemaVersion === 2
    ? projectLayoutDocumentV2ToV1(value)
    : structuredClone(value);
}

function toV2UserCommand(
  document: LayoutDocumentV2,
  command: EditorCommandV1,
): EditorCommandV2 {
  if (command.type === "element.delete" || command.type === "element.set_hidden") {
    const payload = command.payload as {
      canvasId: string;
      elementId: string;
      hidden?: boolean;
    };
    const binding = document.automation.dialogueBindings.find(
      (item) => item.elementId === payload.elementId,
    );
    if (binding && (
      command.type === "element.delete"
      || (command.type === "element.set_hidden" && payload.hidden === true)
    )) {
      return {
        schemaVersion: 2,
        commandId: command.commandId,
        type: "balloon.suppress_bound",
        label: command.label,
        actor: "user",
        payload: {
          canvasId: payload.canvasId,
          elementId: payload.elementId,
          mode: "hide",
        },
      };
    }
    if (
      binding
      && command.type === "element.set_hidden"
      && payload.hidden === false
      && binding.disposition === "user_suppressed"
    ) {
      const canvas = document.canvases.find((item) => item.id === payload.canvasId);
      const element = canvas?.elements.find((item) => item.id === payload.elementId);
      if (!element || element.type !== "balloon") {
        throw new Error("这条对白已经不存在，无法直接恢复。");
      }
      return {
        schemaVersion: 2,
        commandId: command.commandId,
        type: "balloon.restore_bound",
        label: command.label,
        actor: "user",
        payload: {
          dialogueItemId: binding.dialogueItemId,
          canvasId: payload.canvasId,
          richText: structuredClone(element.richText),
          create: null,
          clearProtectionScopes: ["existence"],
        },
      };
    }
  }
  return {
    ...JSON.parse(JSON.stringify(command)) as EditorCommandV1,
    schemaVersion: 2,
    actor: "user",
  } as EditorCommandV2;
}

export function useLayoutEditorSession(input: LayoutEditorSessionInput) {
  const document = shallowRef<LayoutDocumentV1 | null>(null);
  const fullDocument = shallowRef<LayoutDocumentV1OrV2 | null>(null);
  const server = shallowRef<LayoutWorkingCopyResponseV1 | null>(null);
  const sourceCatalog = shallowRef<LayoutSourceCatalogResponseV1 | null>(null);
  const fontCatalog = shallowRef<LayoutFontCatalogResponseV1 | null>(null);
  const conflictServer = shallowRef<LayoutWorkingCopyResponseV1 | null>(null);
  const revisionHistory = shallowRef<LayoutRevisionHistoryResponseV1 | LayoutRevisionHistoryResponseV2 | null>(null);
  const preflight = shallowRef<LayoutPreflightReportV1 | LayoutPreflightReportV2 | null>(null);
  const sourceReplacementPreview = shallowRef<LayoutSourceReplacementPreviewV1 | LayoutSourceReplacementPreviewV2 | null>(null);
  const legacyStatus = shallowRef<LayoutLegacyCutoverStatusV1 | null>(null);
  const saveState = ref<SaveState>("loading");
  const errorMessage = ref<string | null>(null);
  const selectedCanvasId = ref<string | null>(null);
  const selectedElementIds = ref<string[]>([]);
  const zoom = ref(0.4);
  const viewportWidth = ref(typeof window === "undefined" ? EDITOR_MIN_WIDTH : window.innerWidth);
  const isReadOnly = computed(() => viewportWidth.value < EDITOR_MIN_WIDTH);
  const isDirty = ref(false);
  const pendingRevisionAttempt = shallowRef<PendingLayoutRevisionAttempt | null>(null);
  const undoStack: LayoutDocumentV1OrV2[] = [];
  const undoDepth = ref(0);
  const canUndo = computed(() => undoDepth.value > 0);
  let firstDirtyAt: number | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let loadGeneration = 0;
  const saveFlight = createAwaitableLayoutSaveFlight();

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

  function replaceLocalDocument(value: LayoutDocumentV1OrV2): void {
    const normalized = LayoutDocumentCodecV1OrV2.parseAndNormalize(value, {
      projectId: input.projectId.value,
      ...(input.chapterId.value ? { chapterId: input.chapterId.value } : {}),
    });
    fullDocument.value = structuredClone(normalized);
    document.value = visibleDocument(normalized);
  }

  function replaceFromServer(value: LayoutWorkingCopyResponseV1): void {
    server.value = value;
    replaceLocalDocument(value.document);
    undoStack.length = 0;
    undoDepth.value = 0;
    selectedCanvasId.value = document.value?.canvases[0]?.id ?? null;
    selectedElementIds.value = [];
    conflictServer.value = null;
    preflight.value = null;
    sourceReplacementPreview.value = null;
    legacyStatus.value = null;
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
      fullDocument.value = null;
      server.value = null;
      sourceCatalog.value = null;
      fontCatalog.value = null;
      saveState.value = "missing";
      return;
    }
    const generation = ++loadGeneration;
    clearTimers();
    saveState.value = "loading";
    errorMessage.value = null;
    try {
      const [value, catalog, fonts] = await Promise.all([
        api.getLayoutWorkingCopy(input.projectId.value, chapterId),
        api.getLayoutSourceCatalog(input.projectId.value, chapterId).catch(() => null),
        api.getLayoutFonts(input.projectId.value, chapterId),
      ]);
      if (generation === loadGeneration) sourceCatalog.value = catalog;
      if (generation === loadGeneration) fontCatalog.value = fonts;
      if (generation === loadGeneration) {
        replaceFromServer(value);
        const history = await api.listLayoutRevisions(input.projectId.value, chapterId);
        if (generation === loadGeneration) revisionHistory.value = history;
      }
    } catch (error) {
      if (generation !== loadGeneration) return;
      if (error instanceof ApiClientError && error.status === 404) {
        document.value = null;
        fullDocument.value = null;
        server.value = null;
        sourceCatalog.value = await api.getLayoutSourceCatalog(input.projectId.value, chapterId).catch(() => null);
        fontCatalog.value = await api.getLayoutFonts(input.projectId.value, chapterId).catch(() => null);
        revisionHistory.value = await api.listLayoutRevisions(input.projectId.value, chapterId).catch(() => null);
        saveState.value = "missing";
        return;
      }
      if (error instanceof ApiClientError && error.code === "LAYOUT_WORKING_COPY_EXISTS" && error.status === 409) {
        const legacy = await api.getLayoutLegacyStatus(input.projectId.value, chapterId).catch(() => null);
        if (legacy?.state === "legacy_convertible" || legacy?.state === "legacy_unresolved") {
          document.value = null;
          fullDocument.value = null;
          server.value = null;
          legacyStatus.value = legacy;
          saveState.value = "missing";
          return;
        }
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
      sourceCatalog.value = await api.getLayoutSourceCatalog(input.projectId.value, chapterId).catch(() => null);
      fontCatalog.value = await api.getLayoutFonts(input.projectId.value, chapterId);
      replaceFromServer(result.value);
      revisionHistory.value = await api.listLayoutRevisions(input.projectId.value, chapterId);
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "成稿草稿初始化失败";
      saveState.value = "error";
    }
  }

  async function convertLegacy(): Promise<void> {
    const chapterId = input.chapterId.value;
    if (!chapterId || isReadOnly.value) return;
    saveState.value = "loading";
    const result = await api.convertLegacyLayout(input.projectId.value, chapterId);
    replaceFromServer(result.value);
    sourceCatalog.value = await api.getLayoutSourceCatalog(input.projectId.value, chapterId).catch(() => null);
    revisionHistory.value = await api.listLayoutRevisions(input.projectId.value, chapterId).catch(() => null);
  }

  async function rebuildLegacy(
    profile: LayoutProfileV1,
    mode: LayoutWorkingCopyInitializationModeV1,
    expectedCurrentLayoutRevisionId: string | null,
  ): Promise<void> {
    const chapterId = input.chapterId.value;
    if (!chapterId || isReadOnly.value) return;
    saveState.value = "loading";
    const result = await api.rebuildLegacyLayout(input.projectId.value, chapterId, {
      schemaVersion: 1,
      profile,
      initializationMode: mode,
      expectedCurrentLayoutRevisionId,
    });
    replaceFromServer(result.value);
    sourceCatalog.value = await api.getLayoutSourceCatalog(input.projectId.value, chapterId).catch(() => null);
    revisionHistory.value = await api.listLayoutRevisions(input.projectId.value, chapterId).catch(() => null);
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
    sourceReplacementPreview.value = null;
    isDirty.value = true;
    saveState.value = "unsaved";
    scheduleAutosave();
  }

  function pushUndoSnapshot(before: LayoutDocumentV1OrV2): void {
    undoStack.push(structuredClone(before));
    if (undoStack.length > LAYOUT_UNDO_STACK_LIMIT) undoStack.shift();
    undoDepth.value = undoStack.length;
  }

  function undo(): void {
    const snapshot = undoStack.pop();
    undoDepth.value = undoStack.length;
    if (!snapshot || isReadOnly.value || saveState.value === "conflict" || !fullDocument.value) return;
    try {
      replaceLocalDocument(snapshot);
      errorMessage.value = null;
      markDirty();
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "撤销失败";
    }
  }

  function execute(command: EditorCommandV1): void {
    const before = fullDocument.value;
    if (!before || isReadOnly.value || saveState.value === "conflict") return;
    try {
      const after = before.schemaVersion === 1
        ? applyLayoutCommand(before, command).document
        : applyLayoutCommandV2(before, toV2UserCommand(before, command)).document;
      pushUndoSnapshot(before);
      replaceLocalDocument(after);
      errorMessage.value = null;
      markDirty();
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "当前调整无法应用";
    }
  }

  function executeBatch(batch: EditorCommandBatchV1): void {
    const before = fullDocument.value;
    if (!before || batch.commands.length === 0 || isReadOnly.value || saveState.value === "conflict") return;
    try {
      let after: LayoutDocumentV1OrV2 = before;
      if (before.schemaVersion === 1) {
        for (const command of batch.commands) {
          after = applyLayoutCommand(after as LayoutDocumentV1, command).document;
        }
      } else {
        let current = before;
        for (const command of batch.commands) {
          current = applyLayoutCommandV2(current, toV2UserCommand(current, command)).document;
        }
        after = current;
      }
      pushUndoSnapshot(before);
      replaceLocalDocument(after);
      errorMessage.value = null;
      markDirty();
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "这组调整无法应用";
    }
  }

  function currentSaveContext(): LayoutSaveContext {
    return {
      projectId: input.projectId.value,
      chapterId: input.chapterId.value ?? "",
      loadGeneration,
    };
  }

  const hasPendingRevisionAttempt = computed(() => {
    const attempt = pendingRevisionAttempt.value;
    return Boolean(
      attempt
      && sameLayoutSaveContext(attempt.context, currentSaveContext())
      && !isDirty.value
      && server.value?.rowVersion === attempt.baseRowVersion
      && server.value?.documentDigest === attempt.baseDocumentDigest
    );
  });

  async function refreshConflictServer(context: LayoutSaveContext): Promise<void> {
    const value = await api.getLayoutWorkingCopy(context.projectId, context.chapterId);
    if (sameLayoutSaveContext(context, currentSaveContext())) {
      conflictServer.value = value;
    }
  }

  async function flush(): Promise<void> {
    const existingSave = saveFlight.joinCurrent();
    if (existingSave) {
      await existingSave;
    }
    const projectId = input.projectId.value;
    const chapterId = input.chapterId.value;
    const local = fullDocument.value;
    const base = server.value;
    if (!chapterId || !local || !base || !isDirty.value || isReadOnly.value || saveState.value === "conflict") return;
    const context: LayoutSaveContext = { projectId, chapterId, loadGeneration };
    clearTimers();
    const encoded = LayoutDocumentCodecV1OrV2.encode(local);
    saveState.value = "saving";
    await saveFlight.start(async () => {
      try {
        await commitLayoutSaveResultIfCurrent({
          captured: context,
          current: currentSaveContext,
          save: () => api.saveLayoutWorkingCopy(projectId, chapterId, {
            schemaVersion: 1,
            expectedRowVersion: base.rowVersion,
            baseDocumentDigest: base.documentDigest,
            documentDigest: encoded.digest,
            document: encoded.value,
          }),
          commit: (result) => {
            server.value = result.value;
            const latestDigest = fullDocument.value
              ? LayoutDocumentCodecV1OrV2.encode(fullDocument.value).digest
              : null;
            if (latestDigest === encoded.digest) {
              replaceLocalDocument(result.value.document);
              isDirty.value = false;
              firstDirtyAt = null;
              saveState.value = "saved";
            } else {
              saveState.value = "unsaved";
            }
          },
        });
      } catch (error) {
        if (!sameLayoutSaveContext(context, currentSaveContext())) return;
        if (error instanceof ApiClientError && error.code === "LAYOUT_WORKING_COPY_CONFLICT") {
          saveState.value = "conflict";
          await refreshConflictServer(context).catch(() => undefined);
        } else {
          errorMessage.value = error instanceof Error ? error.message : "自动保存失败";
          saveState.value = "unsaved";
        }
      } finally {
        if (
          sameLayoutSaveContext(context, currentSaveContext())
          && isDirty.value
          && saveState.value !== "conflict"
        ) {
          scheduleAutosave();
        }
      }
    });
  }

  async function reloadServer(): Promise<void> {
    const chapterId = input.chapterId.value;
    if (!chapterId) return;
    const [workingCopy, catalog, fonts] = await Promise.all([
      api.getLayoutWorkingCopy(input.projectId.value, chapterId),
      api.getLayoutSourceCatalog(input.projectId.value, chapterId).catch(() => null),
      api.getLayoutFonts(input.projectId.value, chapterId),
    ]);
    sourceCatalog.value = catalog;
    fontCatalog.value = fonts;
    replaceFromServer(workingCopy);
    revisionHistory.value = await api.listLayoutRevisions(input.projectId.value, chapterId);
  }

  function releaseDigests(value: LayoutWorkingCopyResponseV1): {
    revisionDocumentDigest: typeof value.documentDigest;
    visibleDocumentDigest: typeof value.documentDigest;
  } {
    return {
      revisionDocumentDigest: value.documentDigest,
      visibleDocumentDigest: LayoutDocumentCodecV1.encode(visibleDocument(value.document)).digest,
    };
  }

  async function runPreflight(
    profile: LayoutPublicationProfileV1 | null = null,
  ): Promise<LayoutPreflightReportV1 | LayoutPreflightReportV2 | null> {
    const chapterId = input.chapterId.value;
    if (!chapterId || !server.value) return null;
    const context = currentSaveContext();
    await flush();
    if (!sameLayoutSaveContext(context, currentSaveContext()) || !server.value || isDirty.value) return null;
    const current = server.value;
    const report = current.document.schemaVersion === 2
      ? await api.runLayoutPreflight(input.projectId.value, chapterId, {
          schemaVersion: 2,
          target: {
            kind: "working_copy",
            expectedRowVersion: current.rowVersion,
            expectedRevisionDocumentDigest: releaseDigests(current).revisionDocumentDigest,
            expectedVisibleDocumentDigest: releaseDigests(current).visibleDocumentDigest,
          },
          profile,
        })
      : await api.runLayoutPreflight(input.projectId.value, chapterId, {
          schemaVersion: 1,
          target: {
            kind: "working_copy",
            expectedRowVersion: current.rowVersion,
            expectedDocumentDigest: current.documentDigest,
          },
          profile,
        });
    if (
      !sameLayoutSaveContext(context, currentSaveContext())
      || isDirty.value
      || server.value?.rowVersion !== current.rowVersion
      || server.value?.documentDigest !== current.documentDigest
    ) return null;
    preflight.value = report;
    return report;
  }

  async function previewSourceReplacement(
    imageElementIds: readonly string[],
    cropMode: LayoutSourceReplacementCropModeV1,
  ): Promise<LayoutSourceReplacementPreviewV1 | LayoutSourceReplacementPreviewV2 | null> {
    const chapterId = input.chapterId.value;
    if (!chapterId || !server.value || imageElementIds.length === 0 || isReadOnly.value) return null;
    await flush();
    if (!server.value || isDirty.value) return null;
    const current = server.value;
    const replacements = imageElementIds.map((imageElementId) => ({ imageElementId, cropMode }));
    const preview = current.document.schemaVersion === 2
      ? await api.previewLayoutSourceReplacements(input.projectId.value, chapterId, {
          schemaVersion: 2,
          expectedWorkingCopyRowVersion: current.rowVersion,
          expectedRevisionDocumentDigest: releaseDigests(current).revisionDocumentDigest,
          expectedVisibleDocumentDigest: releaseDigests(current).visibleDocumentDigest,
          replacements,
        })
      : await api.previewLayoutSourceReplacements(input.projectId.value, chapterId, {
          schemaVersion: 1,
          expectedWorkingCopyRowVersion: current.rowVersion,
          expectedDocumentDigest: current.documentDigest,
          replacements,
        });
    sourceReplacementPreview.value = preview;
    return preview;
  }

  async function commitSourceReplacement(): Promise<LayoutWorkingCopyResponseV1 | null> {
    const chapterId = input.chapterId.value;
    const preview = sourceReplacementPreview.value;
    if (!chapterId || !preview || !fullDocument.value || isReadOnly.value) return null;
    const result = preview.schemaVersion === 2
      ? await api.commitLayoutSourceReplacements(input.projectId.value, chapterId, {
          schemaVersion: 2,
          expectedWorkingCopyRowVersion: preview.expectedWorkingCopyRowVersion,
          expectedRevisionDocumentDigest: preview.expectedRevisionDocumentDigest,
          expectedVisibleDocumentDigest: preview.expectedVisibleDocumentDigest,
          replacements: preview.items
            .filter((item) => item.selectionOrigin === "requested")
            .map((item) => ({ imageElementId: item.imageElementId, cropMode: item.cropMode })),
          replacementDigest: preview.replacementDigest,
          resultRevisionDocumentDigest: preview.resultRevisionDocumentDigest,
          resultVisibleDocumentDigest: preview.resultVisibleDocumentDigest,
        })
      : await api.commitLayoutSourceReplacements(input.projectId.value, chapterId, {
          schemaVersion: 1,
          expectedWorkingCopyRowVersion: preview.expectedWorkingCopyRowVersion,
          expectedDocumentDigest: preview.expectedDocumentDigest,
          replacements: preview.items.map((item) => ({ imageElementId: item.imageElementId, cropMode: item.cropMode })),
          replacementDigest: preview.replacementDigest,
          resultDocumentDigest: preview.resultDocumentDigest,
        });
    replaceFromServer(result.workingCopy);
    sourceCatalog.value = await api.getLayoutSourceCatalog(input.projectId.value, chapterId).catch(() => null);
    return result.workingCopy;
  }

  async function createRevision(
    acknowledgedIssueKeys: readonly string[],
  ): Promise<CreateLayoutRevisionResponseV1 | CreateLayoutRevisionResponseV2 | null> {
    const chapterId = input.chapterId.value;
    if (!chapterId || !server.value || isReadOnly.value) return null;
    let attempt = pendingRevisionAttempt.value;
    if (
      !attempt
      || !sameLayoutSaveContext(attempt.context, currentSaveContext())
      || isDirty.value
      || server.value.rowVersion !== attempt.baseRowVersion
      || server.value.documentDigest !== attempt.baseDocumentDigest
    ) {
      pendingRevisionAttempt.value = null;
      const context = currentSaveContext();
      await flush();
      if (!sameLayoutSaveContext(context, currentSaveContext()) || !server.value || isDirty.value) return null;
      const current = server.value;
      const common = {
        expectedWorkingCopyRowVersion: current.rowVersion,
        expectedCurrentRevisionId: current.basedOnRevisionId,
        saveReason: "user_checkpoint" as const,
        acknowledgedIssueKeys: [...acknowledgedIssueKeys],
      };
      const request: CreateLayoutRevisionRequestV1OrV2 = current.document.schemaVersion === 2
        ? {
            schemaVersion: 2,
            ...common,
            expectedRevisionDocumentDigest: releaseDigests(current).revisionDocumentDigest,
            expectedVisibleDocumentDigest: releaseDigests(current).visibleDocumentDigest,
          }
        : {
            schemaVersion: 1,
            ...common,
            expectedDocumentDigest: current.documentDigest,
          };
      attempt = {
        context,
        request,
        baseRowVersion: current.rowVersion,
        baseDocumentDigest: current.documentDigest,
      };
      pendingRevisionAttempt.value = attempt;
    }
    let result: CreateLayoutRevisionResponseV1 | CreateLayoutRevisionResponseV2;
    try {
      result = await api.createLayoutRevision(
        attempt.context.projectId,
        attempt.context.chapterId,
        attempt.request,
      );
    } catch (error) {
      if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
        pendingRevisionAttempt.value = null;
      }
      throw error;
    }
    if (pendingRevisionAttempt.value === attempt) pendingRevisionAttempt.value = null;
    if (
      !sameLayoutSaveContext(attempt.context, currentSaveContext())
      || isDirty.value
      || server.value?.rowVersion !== attempt.baseRowVersion
      || server.value?.documentDigest !== attempt.baseDocumentDigest
    ) return null;
    replaceFromServer(result.workingCopy);
    preflight.value = result.preflight;
    const history = await api.listLayoutRevisions(
      attempt.context.projectId,
      attempt.context.chapterId,
    ).catch(() => null);
    if (!sameLayoutSaveContext(attempt.context, currentSaveContext()) || isDirty.value) return null;
    revisionHistory.value = history ?? {
      schemaVersion: result.schemaVersion,
      currentLayoutRevisionId: result.revision.id,
      items: [],
    };
    return result;
  }

  async function keepLocalAndRetry(): Promise<void> {
    const chapterId = input.chapterId.value;
    if (!chapterId || !fullDocument.value) return;
    const latest = await api.getLayoutWorkingCopy(input.projectId.value, chapterId);
    server.value = latest;
    conflictServer.value = null;
    saveState.value = "unsaved";
    isDirty.value = true;
    await flush();
  }

  function downloadRecovery(): void {
    if (!fullDocument.value || !server.value) return;
    const encoded = LayoutDocumentCodecV1OrV2.encode(fullDocument.value);
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
    fullDocument,
    server,
    sourceCatalog,
    fontCatalog,
    conflictServer,
    revisionHistory,
    preflight,
    legacyStatus,
    saveState,
    errorMessage,
    currentCanvas,
    selectedCanvasId,
    selectedElementIds,
    selectedElements,
    zoom,
    isReadOnly,
    isDirty,
    hasPendingRevisionAttempt,
    canUndo,
    undo,
    selectCanvas,
    selectElement,
    initialize,
    convertLegacy,
    rebuildLegacy,
    execute,
    executeBatch,
    flush,
    reloadServer,
    runPreflight,
    previewSourceReplacement,
    commitSourceReplacement,
    createRevision,
    keepLocalAndRetry,
    downloadRecovery,
    makeTransformCommand,
  };
}
