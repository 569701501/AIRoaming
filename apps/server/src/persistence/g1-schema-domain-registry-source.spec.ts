import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildG1SchemaDomainRegistrySource } from "./g1-schema-domain-registry-source.js";

const CONTRACT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../文档/04_方案与决策/2026-07-11_G1数据库Schema实施契约.md",
);

describe("G1 Pass 2 domain registries", () => {
  it("extracts all non-TaskPolicy registries from the authority document", async () => {
    const source = buildG1SchemaDomainRegistrySource(await readFile(CONTRACT_PATH, "utf8"));

    expect(source.completenessIssues).toEqual([]);
    expect(source.generationTaskTargetTypes).toEqual([
      "project",
      "character",
      "chapter",
      "story",
      "shot",
      "asset",
      "export",
      "scene",
    ]);
    expect(source.taskSourceRegistryV1).toHaveLength(18);
    expect(source.formalProjectionRegistryV1.map((entry) => entry.parent)).toEqual([
      "Story",
      "Storyboard",
      "Preflight",
    ]);
    expect(source.layoutBindingProjectionRegistryV1.map((entry) => entry.documentKind)).toEqual([
      "layout_document_v1",
      "legacy_chapter_layout_v1",
    ]);
    expect(source.preflightUnresolvedResolutionRegistryV1.action).toBe(
      "drop_current_preflight_and_reconfirm_after_cutover",
    );
  });

  it("keeps abandoned Story/Storyboard versions out of runtime sources", async () => {
    const source = buildG1SchemaDomainRegistrySource(await readFile(CONTRACT_PATH, "utf8"));
    for (const sourceType of ["story_version", "storyboard_version"]) {
      const entry = source.taskSourceRegistryV1.find((item) => item.sourceType === sourceType);
      expect(entry?.sealPolicy).toContain("必须 confirmed");
      expect(entry?.sealPolicy).toContain("archived");
      expect(entry?.sealPolicy).toContain("不能作为新任务来源");
    }
  });
});
