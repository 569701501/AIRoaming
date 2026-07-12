import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  G1_SCHEMA_MANIFEST_SOURCE_PATHS,
  assertG1SchemaManifestSourceClosure,
  buildG1SchemaManifestFromSources,
  loadCurrentG1SchemaManifestV1,
  type G1SchemaManifestSourceInput,
  type G1SchemaManifestSourcePath,
} from "./g1-schema-manifest-source.js";
import {
  buildG1SchemaManifest,
  verifyG1SchemaManifestDigest,
} from "./g1-schema-manifest.js";

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const contractPath =
  "文档/04_方案与决策/2026-07-11_G1数据库Schema实施契约.md";
const registryPath =
  "文档/04_方案与决策/2026-07-11_G1任务与Outbox实施注册表.md";
const artifactPath =
  "apps/server/prisma/contracts/g1-schema-manifest.json";

async function loadManifestInput(): Promise<G1SchemaManifestSourceInput> {
  const [contractMarkdown, registryMarkdown, entries] = await Promise.all([
    readFile(resolve(workspaceRoot, contractPath), "utf8"),
    readFile(resolve(workspaceRoot, registryPath), "utf8"),
    Promise.all(
      G1_SCHEMA_MANIFEST_SOURCE_PATHS.map(async (path) => [
        path,
        await readFile(resolve(workspaceRoot, path), "utf8"),
      ] as const),
    ),
  ]);
  return {
    contractMarkdown,
    registryMarkdown,
    moduleSources: Object.fromEntries(entries) as Record<
      G1SchemaManifestSourcePath,
      string
    >,
  };
}

async function buildManifest() {
  return buildG1SchemaManifestFromSources(await loadManifestInput());
}

describe("G1 Pass 2 source-only schema manifest", () => {
  it("closes every frozen inventory and physical binding count", async () => {
    const manifest = await buildManifest();

    expect(manifest.status).toBe("ready_for_materialization");
    expect(manifest.completeness).toEqual({
      ready: true,
      issueCount: 0,
      issues: [],
    });
    expect(manifest.counts).toMatchObject({
      models: 44,
      scalarFields: 556,
      foreignKeys: 105,
      relationFields: 210,
      primaryKeys: 44,
      uniqueConstraints: 70,
      indexes: 60,
      checks: 195,
      triggers: 194,
      checkBindings: 195,
      triggerBindings: 194,
      taskPolicies: 10,
      outboxHandlers: 5,
      purgeOwnershipEntries: 44,
    });
    expect(manifest).not.toHaveProperty("reviewGate");
    expect(manifest.sourceDocuments).toHaveLength(19);
    const sourcePaths = manifest.sourceDocuments.map((source) => source.path);
    expect(sourcePaths).toEqual(
      expect.arrayContaining([
        "apps/server/package.json",
        "apps/server/src/persistence/g1-prisma-schema.ts",
        "apps/server/src/persistence/g1-prisma-schema.cli.ts",
        "apps/server/src/persistence/g1-migration-plan.ts",
        "apps/server/src/persistence/g1-migration-plan.cli.ts",
      ]),
    );
    expect(sourcePaths.filter((sourcePath) => sourcePath.endsWith(".ts"))).toHaveLength(16);
    expect(sourcePaths.filter((sourcePath) => sourcePath.endsWith(".md"))).toHaveLength(2);
    expect(sourcePaths.filter((sourcePath) => sourcePath.endsWith("package.json"))).toHaveLength(1);
    expect(
      sourcePaths.some(
        (sourcePath) =>
          sourcePath.includes("/reviews/") ||
          sourcePath.includes("/migrations/") ||
          sourcePath.endsWith("/schema.prisma") ||
          sourcePath.endsWith(".review.md") ||
          sourcePath.endsWith(".attestation.json") ||
          sourcePath.endsWith(".spec.ts"),
      ),
    ).toBe(false);
    expect(verifyG1SchemaManifestDigest(manifest)).toBe(true);

    const bindings = manifest.constraints.templateSources.flatMap((source) =>
      source.bindings.map((binding) => {
        const value = binding as { table: string; name: string };
        return `${value.table}.${value.name}`;
      }),
    );
    expect(bindings).toHaveLength(389);
    expect(new Set(bindings).size).toBe(389);
  });

  it("binds the complete relative production import closure", async () => {
    const input = await loadManifestInput();
    expect(() => assertG1SchemaManifestSourceClosure(input.moduleSources)).not.toThrow();

    const importer = "apps/server/src/persistence/g1-migration-plan.cli.ts" as const;
    const mutated = {
      ...input.moduleSources,
      [importer]: `${input.moduleSources[importer]}\nimport "./unbound-migration-helper.js";\n`,
    };
    expect(() => assertG1SchemaManifestSourceClosure(mutated)).toThrow(
      "G1_SCHEMA_MANIFEST_SOURCE_CLOSURE_UNBOUND:apps/server/src/persistence/g1-migration-plan.cli.ts->apps/server/src/persistence/unbound-migration-helper.ts",
    );
    expect(() =>
      buildG1SchemaManifestFromSources({ ...input, moduleSources: mutated }),
    ).toThrow(/G1_SCHEMA_MANIFEST_SOURCE_CLOSURE_UNBOUND/);
  });

  it("keeps the checked JSON artifact byte-for-byte current", async () => {
    const manifest = await buildManifest();
    const checkedSource = await readFile(resolve(workspaceRoot, artifactPath), "utf8");
    const checkedManifest = JSON.parse(checkedSource) as Record<string, unknown>;

    expect(checkedSource).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
    expect(verifyG1SchemaManifestDigest(checkedManifest)).toBe(true);
    await expect(loadCurrentG1SchemaManifestV1(workspaceRoot)).resolves.toEqual({
      manifest,
      serialized: checkedSource,
    });
  });

  it("freezes the complete TaskPolicy and Outbox handler registries", async () => {
    const manifest = await buildManifest();

    expect(manifest.registries.taskPolicyRegistryV1.map((item) => item.type)).toEqual([
      "character_reference_generate",
      "scene_reference_generate",
      "story_parse",
      "shot_generate",
      "shot_prompt_generate",
      "image_generate",
      "layout_export",
      "tts_generate",
      "video_export",
      "asset_package_export",
    ]);
    expect(manifest.registries.outboxHandlerRegistryV1.map((item) => item.eventType)).toEqual([
      "asset.promote",
      "asset.delete",
      "project.delete_files",
      "secret.delete_old_ref",
      "legacy_metadata.archive",
    ]);
  });

  it("fails closed for forbidden sources and digest tampering", async () => {
    const [contractMarkdown, registryMarkdown] = await Promise.all([
      readFile(resolve(workspaceRoot, contractPath), "utf8"),
      readFile(resolve(workspaceRoot, registryPath), "utf8"),
    ]);
    const forbidden = buildG1SchemaManifest({
      contractMarkdown,
      registryMarkdown,
      supportingSources: [
        {
          path: "apps/server/prisma/schema.prisma",
          digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
          sections: ["forbidden-test"],
        },
        {
          path: "apps/server/src/persistence/g1-schema-unreviewed.ts",
          digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
          sections: ["forbidden-test"],
        },
      ],
    });
    expect(
      forbidden.completeness.issues.some(
        (issue) =>
          issue.kind === "source-authority" &&
          issue.key === "apps/server/prisma/schema.prisma",
      ),
    ).toBe(true);
    expect(
      forbidden.completeness.issues.some(
        (issue) =>
          issue.kind === "source-authority" &&
          issue.key === "apps/server/src/persistence/g1-schema-unreviewed.ts",
      ),
    ).toBe(true);

    const ready = await buildManifest();
    const tampered = { ...ready, effectiveStage: "G2" };
    expect(verifyG1SchemaManifestDigest(tampered)).toBe(false);
  });
});
