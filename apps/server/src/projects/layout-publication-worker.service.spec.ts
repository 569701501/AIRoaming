import {
  buildTaskSourceProjection,
  LAYOUT_PUBLICATION_SOURCE_POLICY_V1,
  LAYOUT_PUBLICATION_SOURCE_POLICY_V2,
  upgradeLayoutWorkingCopyV1ToV2,
  taskSourceProjectionDigest,
  type LayoutDocumentV1,
} from "@airoaming/shared";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  assertLayoutPublicationTaskSourceProjection,
  recomputeLayoutPublicationDocument,
} from "./layout-publication-worker.service.js";

const digestA = `sha256:${"a".repeat(64)}` as const;

function fixture(schemaVersion: 1 | 2 = 1) {
  const source = {
    id: "source-layout-revision",
    role: "layout_revision",
    sourceType: "layout_revision",
    sourceId: "layout-revision-1",
    sourceDigest: digestA,
  };
  const projection = buildTaskSourceProjection({
    policyVersion: schemaVersion === 1
      ? LAYOUT_PUBLICATION_SOURCE_POLICY_V1
      : LAYOUT_PUBLICATION_SOURCE_POLICY_V2,
    projectId: "project-1",
    chapterId: "chapter-1",
    consumerType: "layout_export",
    sources: [source],
  });
  return {
    source,
    projection,
    sourceDigest: taskSourceProjectionDigest(projection),
  };
}

describe("LayoutPublicationWorker sealed source projection", () => {
  it("accepts the exact scoped projection rebuilt from sealed source rows", () => {
    const value = fixture();
    expect(() => assertLayoutPublicationTaskSourceProjection({
      taskSchemaVersion: 1,
      sourceProjection: value.projection,
      projectId: "project-1",
      chapterId: "chapter-1",
      taskType: "layout_export",
      taskSourceDigest: value.sourceDigest,
      sources: [value.source],
    })).not.toThrow();
  });

  it("rejects a cross-project projection even when its JSON is otherwise canonical", () => {
    const value = fixture();
    expect(() => assertLayoutPublicationTaskSourceProjection({
      taskSchemaVersion: 1,
      sourceProjection: {
        ...value.projection,
        projectId: "project-foreign",
      },
      projectId: "project-1",
      chapterId: "chapter-1",
      taskType: "layout_export",
      taskSourceDigest: value.sourceDigest,
      sources: [value.source],
    })).toThrow("LAYOUT_EXPORT_TASK_MAPPING_INVALID");
  });

  it("rejects projection tampering that disagrees with the sealed task source rows", () => {
    const value = fixture();
    expect(() => assertLayoutPublicationTaskSourceProjection({
      taskSchemaVersion: 1,
      sourceProjection: {
        ...value.projection,
        sources: value.projection.sources.map((source) => ({
          ...source,
          sourceId: "layout-revision-tampered",
        })),
      },
      projectId: "project-1",
      chapterId: "chapter-1",
      taskType: "layout_export",
      taskSourceDigest: value.sourceDigest,
      sources: [value.source],
    })).toThrow("LAYOUT_EXPORT_TASK_MAPPING_INVALID");
  });

  it("rejects a noncanonical source policy even when its projection digest matches", () => {
    const value = fixture(2);
    const invalidProjection = buildTaskSourceProjection({
      ...value.projection,
      policyVersion: "layout-publication-source-v3",
      sources: value.projection.sources,
    });
    expect(() => assertLayoutPublicationTaskSourceProjection({
      taskSchemaVersion: 2,
      sourceProjection: invalidProjection,
      projectId: "project-1",
      chapterId: "chapter-1",
      taskType: "layout_export",
      taskSourceDigest: taskSourceProjectionDigest(invalidProjection),
      sources: [value.source],
    })).toThrow("LAYOUT_EXPORT_TASK_MAPPING_INVALID");
  });

  it("recomputes independent V2 revision and visible digests from revision JSON", async () => {
    const fixturePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../tests/fixtures/layout/crop-rotate-flip.json",
    );
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as {
      document: LayoutDocumentV1;
    };
    const original = upgradeLayoutWorkingCopyV1ToV2(fixture.document);
    const changedAutomation = structuredClone(original);
    changedAutomation.automation.protections[0] = {
      ...changedAutomation.automation.protections[0]!,
      reason: "user_edit",
    };
    const first = recomputeLayoutPublicationDocument({
      schemaVersion: 2,
      documentJson: original,
      context: {
        projectId: original.projectId,
        chapterId: original.chapterId,
      },
    });
    const second = recomputeLayoutPublicationDocument({
      schemaVersion: 2,
      documentJson: changedAutomation,
      context: {
        projectId: original.projectId,
        chapterId: original.chapterId,
      },
    });
    expect(second.revisionDocumentDigest).not.toBe(first.revisionDocumentDigest);
    expect(second.visibleDocumentDigest).toBe(first.visibleDocumentDigest);
    expect(second.visibleDocument).toEqual(first.visibleDocument);
  });
});
