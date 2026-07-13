import { describe, expect, it } from "vitest";
import { createRuntimeCommandId, createScriptOutlineId, createScriptPendingIds } from "./runtime-command-id.js";

describe("runtime command ids", () => {
  it("is stable and distinguishes delimiter-shaped inputs", () => {
    expect(createRuntimeCommandId("x", ["a:b", "c"])).toBe(createRuntimeCommandId("x", ["a:b", "c"]));
    expect(createRuntimeCommandId("x", ["a", "b:c"])).not.toBe(createRuntimeCommandId("x", ["a:b", "c"]));
  });

  it("derives separate pending and revision ids from the same command identity", () => {
    const first = createScriptPendingIds({ projectId: "p", chapterId: "c", threadId: "t", toolCallId: "call", operation: "generate_script_from_seed" });
    const second = createScriptPendingIds({ projectId: "p", chapterId: "c", threadId: "t", toolCallId: "call", operation: "generate_script_from_seed" });
    expect(first).toEqual(second);
    expect(first.pendingId).not.toBe(first.revisionId);
    expect(createScriptOutlineId({ projectId: "p", threadId: "t", toolCallId: "call" })).toMatch(/^script_outline_[0-9a-f]{40}$/);
  });
});
