import assert from "node:assert/strict";
import test from "node:test";

import { mergeLayoutPublicationSnapshot } from "./layout-publication-state";

type Summary = {
  id: string;
  status: "queued" | "rendering" | "ready" | "failed" | "cancelled";
  artifacts: string[];
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test("an older publication poll cannot replace a newer ready result", async () => {
  let snapshot: Summary | null = null;
  const olderPoll = deferred<Summary>();
  const newerPoll = deferred<Summary>();
  const apply = async (promise: Promise<Summary>) => {
    const incoming = await promise;
    snapshot = mergeLayoutPublicationSnapshot(snapshot, incoming);
  };

  const olderApply = apply(olderPoll.promise);
  const newerApply = apply(newerPoll.promise);

  newerPoll.resolve({ id: "export-1", status: "ready", artifacts: ["long-image"] });
  await newerApply;
  olderPoll.resolve({ id: "export-1", status: "rendering", artifacts: [] });
  await olderApply;

  assert.deepEqual(snapshot, {
    id: "export-1",
    status: "ready",
    artifacts: ["long-image"],
  });
});

test("publication progress still advances and a different export can replace the snapshot", () => {
  const rendering = mergeLayoutPublicationSnapshot<Summary>(
    { id: "export-1", status: "queued", artifacts: [] },
    { id: "export-1", status: "rendering", artifacts: [] },
  );
  const nextExport = mergeLayoutPublicationSnapshot<Summary>(
    { ...rendering, status: "ready", artifacts: ["long-image"] },
    { id: "export-2", status: "queued", artifacts: [] },
  );

  assert.equal(rendering.status, "rendering");
  assert.equal(nextExport.id, "export-2");
  assert.equal(nextExport.status, "queued");
});
