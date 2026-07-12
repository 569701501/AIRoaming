import { describe, expect, it } from "vitest";
import { buildTaskSourceProjection, taskSourceProjectionDigest } from "./task-source-projection.js";

const DIGEST = "sha256:" + "a".repeat(64) as `sha256:${string}`;

describe("TaskSourceProjectionV1", () => {
  it("sorts by UTF-8 role/type/id and rebuilds role-local order", () => {
    const projection = buildTaskSourceProjection({
      policyVersion: "task-v1",
      projectId: "p",
      chapterId: "c",
      consumerType: "story_parse",
      sources: [
        { role: "source", sourceType: "chapter_script_version", sourceId: "z", sourceDigest: DIGEST },
        { role: "source", sourceType: "chapter_script_version", sourceId: "é", sourceDigest: DIGEST },
        { role: "owner", sourceType: "chapter", sourceId: "c", sourceDigest: DIGEST },
      ],
    });
    expect(projection.sources.map((source) => [source.role, source.order, source.sourceId])).toEqual([
      ["owner", 1, "c"],
      ["source", 1, "z"],
      ["source", 2, "é"],
    ]);
    expect(taskSourceProjectionDigest(projection)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("rejects duplicate source identity and invalid digest", () => {
    expect(() => buildTaskSourceProjection({
      policyVersion: "task-v1", projectId: "p", chapterId: null, consumerType: "x",
      sources: [
        { role: "source", sourceType: "chapter", sourceId: "c", sourceDigest: DIGEST },
        { role: "source", sourceType: "chapter", sourceId: "c", sourceDigest: DIGEST },
      ],
    })).toThrow(/duplicate source/);
    expect(() => buildTaskSourceProjection({
      policyVersion: "task-v1", projectId: "p", chapterId: null, consumerType: "x",
      sources: [{ role: "source", sourceType: "chapter", sourceId: "c", sourceDigest: "sha256:bad" as `sha256:${string}` }],
    })).toThrow(/sha256/);
  });
});

