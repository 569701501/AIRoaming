import { describe, expect, it } from "vitest";
import { stableShotId } from "./stable-shot-id.js";

const input = { projectId: "project_001", chapterId: "chapter_001", pendingVersionId: "board_pending_001", requestId: "request_001" };

describe("stable Shot ID", () => {
  it("is deterministic and scoped", () => {
    const first = stableShotId(input);
    expect(first).toMatch(/^shot_[0-9a-f]{32}$/);
    expect(stableShotId({ ...input })).toBe(first);
    expect(stableShotId({ ...input, chapterId: "chapter_002" })).not.toBe(first);
    expect(stableShotId({ ...input, pendingVersionId: "board_pending_002" })).not.toBe(first);
    expect(stableShotId({ ...input, requestId: "request_002" })).not.toBe(first);
  });
});

