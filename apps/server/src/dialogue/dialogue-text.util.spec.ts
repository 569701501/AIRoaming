import { describe, expect, it } from "vitest";

import { formatRevisionSource } from "./dialogue-text.util.js";

describe("dialogue text utilities", () => {
  it("labels a revision without chapter-scoped dialogue ids as a sealed system source", () => {
    expect(formatRevisionSource({ threadId: null, messageId: null, toolCallId: null })).toBe("系统密封来源");
  });

  it("keeps compact dialogue ids when the revision has a chapter-scoped source", () => {
    expect(formatRevisionSource({
      threadId: "thread-123456789",
      messageId: "message-123456789",
      toolCallId: "tool-123456789",
    })).toBe("thread=thread-1 message=message- tool=tool-123");
  });
});
