import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { buildG1SchemaBaseCheckDslSource } from "./g1-schema-check-dsl-base.js";
import { buildG1SchemaCheckDslSource } from "./g1-schema-check-dsl.js";
import { buildG1SchemaConstraintSource } from "./g1-schema-constraint-source.js";
import {
  assertG1SchemaManifestReady,
  buildG1SchemaManifest,
  digestG1SchemaManifestSource,
  type G1SchemaManifestExtension,
  verifyG1SchemaManifestDigest,
} from "./g1-schema-manifest.js";
import { buildG1SchemaTriggerCoreADslSource } from "./g1-schema-trigger-dsl-core-a.js";
import { buildG1SchemaTriggerCoreBDslSource } from "./g1-schema-trigger-dsl-core-b.js";
import { buildG1SchemaTriggerRuntimeADslSource } from "./g1-schema-trigger-dsl-runtime-a.js";
import { buildG1SchemaTriggerRuntimeBDslSource } from "./g1-schema-trigger-dsl-runtime-b.js";

export const G1_SCHEMA_MANIFEST_EXTENSION_PATHS = [
  "apps/server/src/persistence/g1-schema-check-dsl-base.ts",
  "apps/server/src/persistence/g1-schema-check-dsl.ts",
  "apps/server/src/persistence/g1-schema-trigger-dsl-core-a.ts",
  "apps/server/src/persistence/g1-schema-trigger-dsl-core-b.ts",
  "apps/server/src/persistence/g1-schema-trigger-dsl-runtime-a.ts",
  "apps/server/src/persistence/g1-schema-trigger-dsl-runtime-b.ts",
] as const;

export const G1_SCHEMA_MANIFEST_SUPPORTING_PATHS = [
  "apps/server/package.json",
  "apps/server/src/persistence/g1-schema-model-source.ts",
  "apps/server/src/persistence/g1-schema-constraint-source.ts",
  "apps/server/src/persistence/g1-schema-domain-registry-source.ts",
  "apps/server/src/persistence/g1-schema-manifest.ts",
  "apps/server/src/persistence/g1-schema-manifest-source.ts",
  "apps/server/src/persistence/g1-schema-manifest.cli.ts",
  "apps/server/src/persistence/g1-prisma-schema.ts",
  "apps/server/src/persistence/g1-prisma-schema.cli.ts",
  "apps/server/src/persistence/g1-migration-plan.ts",
  "apps/server/src/persistence/g1-migration-plan.cli.ts",
] as const;

export const G1_SCHEMA_MANIFEST_CONTRACT_PATH =
  "文档/04_方案与决策/2026-07-11_G1数据库Schema实施契约.md" as const;
export const G1_SCHEMA_MANIFEST_REGISTRY_PATH =
  "文档/04_方案与决策/2026-07-11_G1任务与Outbox实施注册表.md" as const;
export const G1_SCHEMA_MANIFEST_ARTIFACT_PATH =
  "apps/server/prisma/contracts/g1-schema-manifest.json" as const;

export const G1_SCHEMA_MANIFEST_SOURCE_PATHS = [
  ...G1_SCHEMA_MANIFEST_EXTENSION_PATHS,
  ...G1_SCHEMA_MANIFEST_SUPPORTING_PATHS,
] as const;

export type G1SchemaManifestSourcePath =
  (typeof G1_SCHEMA_MANIFEST_SOURCE_PATHS)[number];

export interface G1SchemaManifestSourceInput {
  readonly contractMarkdown: string;
  readonly registryMarkdown: string;
  readonly moduleSources: Readonly<Record<G1SchemaManifestSourcePath, string>>;
}

interface DslSource {
  readonly sourceSections: readonly string[];
  readonly templates: readonly unknown[];
  readonly bindings: readonly unknown[];
  readonly checks?: NonNullable<G1SchemaManifestExtension["checks"]>;
  readonly triggers?: NonNullable<G1SchemaManifestExtension["triggers"]>;
  readonly completenessIssues: G1SchemaManifestExtension["completenessIssues"];
}

const RELATIVE_MODULE_PATTERNS = [
  /\bfrom\s*["'](\.[^"']+)["']/g,
  /\bimport\s*["'](\.[^"']+)["']/g,
  /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
] as const;

function resolveRelativeTypeScriptSource(
  importer: string,
  specifier: string,
): string {
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), specifier),
  );
  if (resolved.endsWith(".js")) return `${resolved.slice(0, -3)}.ts`;
  if (resolved.endsWith(".mjs")) return `${resolved.slice(0, -4)}.mts`;
  if (resolved.endsWith(".cjs")) return `${resolved.slice(0, -4)}.cts`;
  if (path.posix.extname(resolved) === "") return `${resolved}.ts`;
  return resolved;
}

/**
 * Proves that the complete relative-import closure of every manifest-bound
 * production TypeScript source remains inside the exact source allow-list.
 */
export function assertG1SchemaManifestSourceClosure(
  moduleSources: Readonly<Record<G1SchemaManifestSourcePath, string>>,
): void {
  const allowed = new Set<string>(G1_SCHEMA_MANIFEST_SOURCE_PATHS);
  for (const importer of G1_SCHEMA_MANIFEST_SOURCE_PATHS) {
    if (!importer.endsWith(".ts")) continue;
    const source = moduleSources[importer];
    if (typeof source !== "string") {
      throw new Error(`G1_SCHEMA_MANIFEST_SOURCE_MISSING:${importer}`);
    }
    const specifiers = new Set<string>();
    for (const pattern of RELATIVE_MODULE_PATTERNS) {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
        specifiers.add(match[1]);
      }
    }
    for (const specifier of [...specifiers].sort()) {
      const target = resolveRelativeTypeScriptSource(importer, specifier);
      if (!allowed.has(target)) {
        throw new Error(
          `G1_SCHEMA_MANIFEST_SOURCE_CLOSURE_UNBOUND:${importer}->${target}`,
        );
      }
    }
  }
}

function stripFunctions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripFunctions);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => typeof item !== "function" && item !== undefined)
        .map(([key, item]) => [key, stripFunctions(item)]),
    );
  }
  return value;
}

function extension(
  id: string,
  path: (typeof G1_SCHEMA_MANIFEST_EXTENSION_PATHS)[number],
  sourceCode: string,
  source: DslSource,
  includeChecks: boolean,
): G1SchemaManifestExtension {
  return {
    id,
    sourceDocument: path,
    sourceDigest: digestG1SchemaManifestSource(sourceCode),
    sourceSections: source.sourceSections,
    templates: source.templates.map(stripFunctions),
    bindings: source.bindings.map(stripFunctions),
    checks: includeChecks ? source.checks : undefined,
    triggers: source.triggers,
    completenessIssues: source.completenessIssues,
  };
}

/**
 * Builds the Pass 2 artifact only from the two Markdown authorities and the
 * explicit production source allow-list. It deliberately has no generated
 * Prisma schema, migration tree, or SQLite input.
 */
export function buildG1SchemaManifestFromSources(
  input: G1SchemaManifestSourceInput,
) {
  assertG1SchemaManifestSourceClosure(input.moduleSources);
  const base = buildG1SchemaConstraintSource(
    input.contractMarkdown,
    input.registryMarkdown,
  );
  const baseCheckDsl = buildG1SchemaBaseCheckDslSource(
    input.contractMarkdown,
    base.checks,
  );
  const checkDsl = buildG1SchemaCheckDslSource(
    input.contractMarkdown,
    base.completenessIssues,
  );
  const triggerCoreA = buildG1SchemaTriggerCoreADslSource(
    input.contractMarkdown,
    base.completenessIssues,
    base.triggers,
  );
  const triggerCoreB = buildG1SchemaTriggerCoreBDslSource(
    input.contractMarkdown,
    base.completenessIssues,
  );
  const triggerRuntimeA = buildG1SchemaTriggerRuntimeADslSource(
    input.contractMarkdown,
    base.completenessIssues,
    base.triggers,
  );
  const triggerRuntimeB = buildG1SchemaTriggerRuntimeBDslSource(
    input.contractMarkdown,
    base.completenessIssues,
    base.triggers,
  );

  const extensions: G1SchemaManifestExtension[] = [
    extension(
      "check-base-v1",
      G1_SCHEMA_MANIFEST_EXTENSION_PATHS[0],
      input.moduleSources[G1_SCHEMA_MANIFEST_EXTENSION_PATHS[0]],
      baseCheckDsl,
      false,
    ),
    extension(
      "check-gap-v1",
      G1_SCHEMA_MANIFEST_EXTENSION_PATHS[1],
      input.moduleSources[G1_SCHEMA_MANIFEST_EXTENSION_PATHS[1]],
      checkDsl,
      true,
    ),
    extension(
      "trigger-core-a-v1",
      G1_SCHEMA_MANIFEST_EXTENSION_PATHS[2],
      input.moduleSources[G1_SCHEMA_MANIFEST_EXTENSION_PATHS[2]],
      triggerCoreA,
      false,
    ),
    extension(
      "trigger-core-b-v1",
      G1_SCHEMA_MANIFEST_EXTENSION_PATHS[3],
      input.moduleSources[G1_SCHEMA_MANIFEST_EXTENSION_PATHS[3]],
      triggerCoreB,
      false,
    ),
    extension(
      "trigger-runtime-a-v1",
      G1_SCHEMA_MANIFEST_EXTENSION_PATHS[4],
      input.moduleSources[G1_SCHEMA_MANIFEST_EXTENSION_PATHS[4]],
      triggerRuntimeA,
      false,
    ),
    extension(
      "trigger-runtime-b-v1",
      G1_SCHEMA_MANIFEST_EXTENSION_PATHS[5],
      input.moduleSources[G1_SCHEMA_MANIFEST_EXTENSION_PATHS[5]],
      triggerRuntimeB,
      false,
    ),
  ];

  return buildG1SchemaManifest({
    contractMarkdown: input.contractMarkdown,
    registryMarkdown: input.registryMarkdown,
    extensions,
    supportingSources: G1_SCHEMA_MANIFEST_SUPPORTING_PATHS.map((path) => ({
      path,
      digest: digestG1SchemaManifestSource(input.moduleSources[path]),
      sections: ["Pass2 source-only manifest assembly"],
    })),
  });
}

export async function loadG1SchemaManifestSourceInput(
  workspaceRoot: string,
): Promise<G1SchemaManifestSourceInput> {
  const canonicalRoot = await realpath(path.resolve(workspaceRoot));
  const [contractMarkdown, registryMarkdown, entries] = await Promise.all([
    readFile(path.join(canonicalRoot, G1_SCHEMA_MANIFEST_CONTRACT_PATH), "utf8"),
    readFile(path.join(canonicalRoot, G1_SCHEMA_MANIFEST_REGISTRY_PATH), "utf8"),
    Promise.all(
      G1_SCHEMA_MANIFEST_SOURCE_PATHS.map(async (sourcePath) => [
        sourcePath,
        await readFile(path.join(canonicalRoot, sourcePath), "utf8"),
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

/**
 * Loads the checked artifact only after proving both its embedded digest and
 * byte-for-byte equality with a rebuild from the current production sources.
 */
export async function loadCurrentG1SchemaManifestV1(
  workspaceRoot: string,
): Promise<{
  readonly manifest: ReturnType<typeof buildG1SchemaManifestFromSources>;
  readonly serialized: string;
}> {
  const canonicalRoot = await realpath(path.resolve(workspaceRoot));
  const artifactPath = path.join(
    canonicalRoot,
    G1_SCHEMA_MANIFEST_ARTIFACT_PATH,
  );
  const checkedSource = await readFile(artifactPath, "utf8");
  const decoded = JSON.parse(checkedSource) as unknown;
  if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("G1_SCHEMA_MANIFEST_STORED_SHAPE_INVALID");
  }
  if (!verifyG1SchemaManifestDigest(decoded as Record<string, unknown>)) {
    throw new Error("G1_SCHEMA_MANIFEST_STORED_DIGEST_MISMATCH");
  }

  const manifest = buildG1SchemaManifestFromSources(
    await loadG1SchemaManifestSourceInput(canonicalRoot),
  );
  assertG1SchemaManifestReady(manifest);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (checkedSource !== serialized) {
    throw new Error("G1_SCHEMA_MANIFEST_STALE");
  }
  return { manifest, serialized };
}
