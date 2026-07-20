import assert from "node:assert/strict";
import test from "node:test";
import type {
  ScriptMutationResult,
  StoryboardJson,
  StoryboardWorkingCopyDto,
  WorkbenchSnapshot,
} from "@airoaming/shared";

const digest = (value: string) => `sha256:${value.repeat(64)}` as `sha256:${string}`;

test("确认分镜回显 pending 冻结的 Story 来源摘要，不从展示结构重新计算", async () => {
  const piniaModulePath = "../../../apps/web/node_modules/pinia/dist/pinia.mjs";
  const workbenchStoreModulePath = "../../../apps/web/src/stores/workbench-store.ts";
  const [{ createPinia, setActivePinia }, { useWorkbenchStore }] = await Promise.all([
    import(piniaModulePath),
    import(workbenchStoreModulePath),
  ]);
  setActivePinia(createPinia());
  const store = useWorkbenchStore();
  const projectId = "project-confirm-source";
  const chapterId = "chapter-confirm-source";
  const sourceDigest = digest("1");
  const pendingDigest = digest("2");
  const updatedPendingDigest = digest("3");
  const now = "2026-07-20T00:00:00.000Z";
  const summaryBase = {
    version: 1,
    lifecycle: "confirmed" as const,
    schemaVersion: 2,
    sourcePolicyVersion: "storyboard-source-v1",
    origin: "user_edit" as const,
    freshness: "current" as const,
    reasonCodes: [],
    createdAt: now,
    confirmedAt: now,
    archivedAt: null,
  };
  const working = {
    pending: {
      ...summaryBase,
      id: "storyboard-pending",
      version: 2,
      lifecycle: "pending_confirmation",
      freshness: "pending",
      documentDigest: pendingDigest,
      sourceId: "story-current",
      sourceDigest,
      rowVersion: 4,
      confirmedAt: null,
    },
    current: {
      ...summaryBase,
      id: "storyboard-current",
      documentDigest: digest("4"),
      sourceId: "story-current",
      sourceDigest,
      rowVersion: 1,
    },
    document: { schemaVersion: 2, chapterId, shots: [], notes: "" },
    basedOnCurrentVersionId: null,
    sourceStoryVersionId: "story-current",
    rowVersion: 4,
    productionState: { chapterRowVersion: 10 },
  } as unknown as StoryboardWorkingCopyDto;
  const updated = {
    value: {
      ...working,
      pending: { ...working.pending!, documentDigest: updatedPendingDigest, rowVersion: 5 },
      rowVersion: 5,
      productionState: { ...working.productionState, chapterRowVersion: 11 },
    },
    productionState: { ...working.productionState, chapterRowVersion: 11 },
    chapterRowVersion: 11,
    replayed: false,
  } as ScriptMutationResult<StoryboardWorkingCopyDto>;
  const storyboardJson: StoryboardJson = {
    schemaVersion: 1,
    chapterId,
    chapterTitle: "返修章节",
    sourceStoryVersionId: "story-current",
    shots: [],
    notes: "",
    createdAt: now,
    updatedAt: now,
  };

  store.activeProjectId = projectId;
  store.activeChapterId = chapterId;
  store.snapshot = {
    versioningCapability: { mode: "g2_db" },
    storyStructure: {
      id: "story-current",
      structureJson: {
        schemaVersion: 1,
        chapterId,
        chapterTitle: "返修章节",
        sourceScriptVersionId: "script-current",
        synopsis: "展示结构会被重新编码，但不应参与确认来源摘要。",
        direction: { logline: "", chapterGoal: "", coreConflict: "", emotionalArc: "", endingHook: "" },
        characters: [],
        scenes: [],
        beats: [],
        notes: "",
        createdAt: now,
        updatedAt: now,
      },
    },
    characters: [],
  } as unknown as WorkbenchSnapshot;
  store.refreshActiveProjectRuntime = async () => undefined;

  const originalFetch = globalThis.fetch;
  const requestCapture: { confirmBody?: Record<string, unknown> } = {};
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    let data: unknown;
    if (method === "GET" && url.endsWith("/storyboard/working-copy")) {
      data = working;
    } else if (method === "PATCH" && url.endsWith("/storyboard/working-copy")) {
      data = updated;
    } else if (method === "POST" && url.endsWith("/storyboard/working-copy/confirm")) {
      requestCapture.confirmBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      data = { ...updated, value: { current: updated.value.current, document: updated.value.document } };
    } else {
      throw new Error(`UNEXPECTED_REQUEST:${method}:${url}`);
    }
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await store.confirmStoryboard(chapterId, storyboardJson);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const confirmBody = requestCapture.confirmBody;
  assert.ok(confirmBody);
  assert.equal(confirmBody.expectedSourceStoryVersionId, "story-current");
  assert.equal(confirmBody.expectedSourceDigest, sourceDigest);
  assert.equal(confirmBody.expectedPendingDocumentDigest, updatedPendingDigest);
  assert.equal(confirmBody.expectedPendingRowVersion, 5);
  assert.equal(confirmBody.expectedCurrentVersionId, "storyboard-current");
  assert.equal(confirmBody.expectedChapterRowVersion, 11);
});
