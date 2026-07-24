import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  commitLayoutSaveResultIfCurrent,
  createAwaitableLayoutSaveFlight,
  type LayoutSaveContext,
} from "./layout-save-flight";

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test("a chapter A save response cannot commit after the active context moves to chapter B", async () => {
  const chapterA: LayoutSaveContext = {
    projectId: "project_1",
    chapterId: "chapter_a",
    loadGeneration: 4,
  };
  let currentContext: LayoutSaveContext = chapterA;
  const response = deferred<{ chapterId: string }>();
  let committedChapterId: string | null = null;

  const settlement = commitLayoutSaveResultIfCurrent({
    captured: chapterA,
    current: () => currentContext,
    save: () => response.promise,
    commit: (result) => {
      committedChapterId = result.chapterId;
    },
  });

  currentContext = {
    projectId: "project_1",
    chapterId: "chapter_b",
    loadGeneration: 5,
  };
  response.resolve({ chapterId: "chapter_a" });

  assert.equal(await settlement, "stale");
  assert.equal(committedChapterId, null);
});

test("a later flush can join and await the autosave already in flight", async () => {
  const autosave = deferred<void>();
  const saveFlight = createAwaitableLayoutSaveFlight();
  const activeSave = saveFlight.start(() => autosave.promise);
  const joinedSave = saveFlight.joinCurrent();
  let joinedSettled = false;

  assert.equal(joinedSave, activeSave);
  const waiter = joinedSave!.then(() => {
    joinedSettled = true;
  });
  await Promise.resolve();
  assert.equal(joinedSettled, false);

  autosave.resolve();
  await Promise.all([activeSave, waiter]);
  assert.equal(joinedSettled, true);
  assert.equal(saveFlight.joinCurrent(), null);
});

test("the editor session joins an existing flight and commits only through its captured context", async () => {
  const source = await readFile(new URL("./layout-editor-session.ts", import.meta.url), "utf8");
  const flushSource = source.slice(
    source.indexOf("async function flush"),
    source.indexOf("async function reloadServer"),
  );

  assert.match(source, /createAwaitableLayoutSaveFlight/);
  assert.match(flushSource, /saveFlight\.joinCurrent\(\)/);
  assert.match(flushSource, /await existingSave/);
  const joinBlock = flushSource.slice(
    flushSource.indexOf("if (existingSave)"),
    flushSource.indexOf("const projectId"),
  );
  assert.doesNotMatch(joinBlock, /return/);
  assert.match(flushSource, /projectId[\s\S]*chapterId[\s\S]*loadGeneration/);
  assert.match(flushSource, /commitLayoutSaveResultIfCurrent/);
});
