import assert from "node:assert/strict";
import test from "node:test";
import {
  openDetachedPreviewWindow,
  openDetachedPreviewWindowAfterPreparation,
  type DetachedPreviewWindowHandle,
} from "./layout-preview-window";

test("reports popup blocking when a synchronous about:blank window cannot be opened", () => {
  const openCalls: Array<[string, string]> = [];

  const result = openDetachedPreviewWindow("/preview", (url, target) => {
    openCalls.push([url, target]);
    return null;
  });

  assert.deepEqual(openCalls, [["about:blank", "_blank"]]);
  assert.equal(result, "blocked");
});

test("detaches the opener before navigating the synchronously opened blank window", () => {
  const operations: string[] = [];
  let openerValue: unknown = {};
  const previewWindow: DetachedPreviewWindowHandle = {
    get opener() {
      return openerValue;
    },
    set opener(value: unknown) {
      openerValue = value;
      operations.push("detach-opener");
    },
    location: {
      replace(url: string) {
        assert.equal(openerValue, null);
        operations.push(`navigate:${url}`);
      },
    },
    close() {
      operations.push("close");
    },
  };

  const result = openDetachedPreviewWindow("/preview?chapterId=chapter-1", () => previewWindow);

  assert.equal(result, "opened");
  assert.deepEqual(operations, [
    "detach-opener",
    "navigate:/preview?chapterId=chapter-1",
  ]);
});

test("closes the blank window and reports navigation failure when its destination cannot load", () => {
  let closeCalls = 0;
  const previewWindow: DetachedPreviewWindowHandle = {
    opener: {},
    location: {
      replace() {
        throw new Error("navigation denied");
      },
    },
    close() {
      closeCalls += 1;
    },
  };

  const result = openDetachedPreviewWindow("/preview", () => previewWindow);

  assert.equal(result, "navigation_failed");
  assert.equal(closeCalls, 1);
});

test("opens and detaches one blank window synchronously, then waits for preparation before navigating it", async () => {
  const operations: string[] = [];
  let finishPreparation!: (ready: boolean) => void;
  const preparation = new Promise<boolean>((resolve) => {
    finishPreparation = resolve;
  });
  const previewWindow: DetachedPreviewWindowHandle = {
    opener: {},
    location: {
      replace(url: string) {
        operations.push(`navigate:${url}`);
      },
    },
    close() {
      operations.push("close");
    },
  };

  const resultPromise = openDetachedPreviewWindowAfterPreparation(
    "/preview?source=working_copy",
    () => {
      operations.push("prepare");
      return preparation;
    },
    (url, target) => {
      operations.push(`open:${url}:${target}`);
      return previewWindow;
    },
  );

  assert.equal(previewWindow.opener, null);
  assert.deepEqual(operations, ["open:about:blank:_blank", "prepare"]);

  finishPreparation(true);
  assert.equal(await resultPromise, "opened");
  assert.deepEqual(operations, [
    "open:about:blank:_blank",
    "prepare",
    "navigate:/preview?source=working_copy",
  ]);
});

test("closes the blank window without navigating when preparation reports a failed save", async () => {
  const operations: string[] = [];
  const previewWindow: DetachedPreviewWindowHandle = {
    opener: {},
    location: {
      replace(url: string) {
        operations.push(`navigate:${url}`);
      },
    },
    close() {
      operations.push("close");
    },
  };

  const result = await openDetachedPreviewWindowAfterPreparation(
    "/preview",
    async () => false,
    () => previewWindow,
  );

  assert.equal(result, "preparation_failed");
  assert.deepEqual(operations, ["close"]);
});

test("closes the blank window and reports preparation failure when saving throws", async () => {
  let closeCalls = 0;
  const previewWindow: DetachedPreviewWindowHandle = {
    opener: {},
    location: {
      replace() {
        assert.fail("a preview must not navigate after a failed save");
      },
    },
    close() {
      closeCalls += 1;
    },
  };

  const result = await openDetachedPreviewWindowAfterPreparation(
    "/preview",
    async () => {
      throw new Error("save failed");
    },
    () => previewWindow,
  );

  assert.equal(result, "preparation_failed");
  assert.equal(closeCalls, 1);
});

test("still prepares the working copy before offering a current-page fallback when the popup is blocked", async () => {
  let preparationCalls = 0;

  const result = await openDetachedPreviewWindowAfterPreparation(
    "/preview",
    async () => {
      preparationCalls += 1;
      return true;
    },
    () => null,
  );

  assert.equal(preparationCalls, 1);
  assert.equal(result, "blocked");
});

test("closes the prepared blank window when navigation itself fails", async () => {
  let closeCalls = 0;
  const previewWindow: DetachedPreviewWindowHandle = {
    opener: {},
    location: {
      replace() {
        throw new Error("navigation failed");
      },
    },
    close() {
      closeCalls += 1;
    },
  };

  const result = await openDetachedPreviewWindowAfterPreparation(
    "/preview",
    async () => true,
    () => previewWindow,
  );

  assert.equal(result, "navigation_failed");
  assert.equal(closeCalls, 1);
});
