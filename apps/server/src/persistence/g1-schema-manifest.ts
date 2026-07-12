import { createHash } from "node:crypto";

import {
  buildG1SchemaConstraintSource,
  type G1CompletenessIssue,
  type G1SchemaCheckSource,
  type G1SchemaTriggerSource,
  type PurgeOwnershipSource,
} from "./g1-schema-constraint-source.js";
import { buildG1SchemaDomainRegistrySource } from "./g1-schema-domain-registry-source.js";
import { buildG1SchemaModelSource } from "./g1-schema-model-source.js";

export interface G1SchemaManifestExtensionIssue {
  kind: string;
  key: string;
  sourceSection: string;
  missing: readonly string[];
}

export interface G1SchemaManifestExtension {
  id: string;
  sourceDocument: string;
  sourceDigest: `sha256:${string}`;
  sourceSections: readonly string[];
  templates: readonly unknown[];
  bindings: readonly unknown[];
  checks?: readonly G1SchemaCheckSource[];
  triggers?: readonly G1SchemaTriggerSource[];
  completenessIssues: readonly G1SchemaManifestExtensionIssue[];
}

export interface G1SchemaManifestIssue {
  kind: string;
  key: string;
  sourceSection: string;
  detail: string;
}

export interface G1SchemaManifestInput {
  contractMarkdown: string;
  registryMarkdown: string;
  extensions?: readonly G1SchemaManifestExtension[];
  supportingSources?: readonly {
    path: string;
    digest: `sha256:${string}`;
    sections: readonly string[];
  }[];
}

const CONTRACT_PATH =
  "文档/04_方案与决策/2026-07-11_G1数据库Schema实施契约.md";
const REGISTRY_PATH =
  "文档/04_方案与决策/2026-07-11_G1任务与Outbox实施注册表.md";
const EXPECTED_CHECK_COUNT = 195;
const EXPECTED_TRIGGER_COUNT = 194;
const ALLOWED_EXPLICIT_SOURCE_PATHS = new Set([
  "apps/server/src/persistence/g1-schema-check-dsl-base.ts",
  "apps/server/src/persistence/g1-schema-check-dsl.ts",
  "apps/server/src/persistence/g1-schema-trigger-dsl-core-a.ts",
  "apps/server/src/persistence/g1-schema-trigger-dsl-core-b.ts",
  "apps/server/src/persistence/g1-schema-trigger-dsl-runtime-a.ts",
  "apps/server/src/persistence/g1-schema-trigger-dsl-runtime-b.ts",
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
]);

const compareCanonicalText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sha256 = (value: string): `sha256:${string}` =>
  `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;

function canonicalize(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("G1_MANIFEST_NON_IJSON_NUMBER");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort(compareCanonicalText);
    return `{${keys
      .map((key) => {
        return `${JSON.stringify(key)}:${canonicalize(record[key])}`;
      })
      .join(",")}}`;
  }
  throw new Error(`G1_MANIFEST_NON_IJSON_TYPE:${typeof value}`);
}

const physicalKey = (table: string, name: string): string => `${table}.${name}`;

const sqlColumn = (column: string): string =>
  column === "order" || column === "index" ? `"${column}"` : column;

function normalizeTriggerSql(trigger: G1SchemaTriggerSource): string {
  const updateOf =
    trigger.event === "UPDATE" && trigger.updateColumns.length > 0
      ? ` OF ${trigger.updateColumns.map(sqlColumn).join(", ")}`
      : "";
  return [
    `CREATE TRIGGER ${trigger.name}`,
    `${trigger.timing} ${trigger.event}${updateOf} ON ${trigger.table}`,
    `WHEN ${trigger.normalizedWhen}`,
    `BEGIN ${trigger.normalizedBody}; END`,
  ].join(" ");
}

function sourceIssue(issue: G1CompletenessIssue): G1SchemaManifestIssue {
  return {
    kind: issue.kind,
    key: physicalKey(issue.table ?? "global", issue.key),
    sourceSection: issue.sourceSection,
    detail: issue.missing.join(", "),
  };
}

function validateSql(
  checks: readonly G1SchemaCheckSource[],
  triggers: readonly G1SchemaTriggerSource[],
  issues: G1SchemaManifestIssue[],
): void {
  const hasUnquotedReservedPhysicalIdentifier = (sql: string): boolean => {
    const withoutStringLiterals = sql.replace(/'(?:''|[^'])*'/g, "''");
    return /(?<!")\b(?:order|index)\b(?!")/.test(withoutStringLiterals);
  };
  for (const check of checks) {
    if (
      check.normalizedExpression.trim().length === 0 ||
      /^(?:1|CHECK\s*\(\s*1\s*\))$/i.test(check.normalizedExpression) ||
      /(?:TODO|TBD|PLACEHOLDER)/i.test(check.normalizedExpression) ||
      /[\u3400-\u9fff]/u.test(check.normalizedExpression)
    ) {
      issues.push({
        kind: "check-sql",
        key: physicalKey(check.table, check.name),
        sourceSection: check.sourceSection,
        detail: "normalizedExpression is empty, permissive, placeholder, or natural language",
      });
    }
    if (hasUnquotedReservedPhysicalIdentifier(check.normalizedExpression)) {
      issues.push({
        kind: "check-sql",
        key: physicalKey(check.table, check.name),
        sourceSection: check.sourceSection,
        detail: "physical order/index identifier must be double-quoted",
      });
    }
  }
  for (const trigger of triggers) {
    const key = physicalKey(trigger.table, trigger.name);
    if (
      trigger.normalizedWhen.trim().length === 0 ||
      trigger.normalizedWhen.trim() === "0" ||
      trigger.normalizedBody.trim().length === 0 ||
      /(?:TODO|TBD|PLACEHOLDER)/i.test(trigger.normalizedBody) ||
      /[\u3400-\u9fff]/u.test(trigger.normalizedWhen + trigger.normalizedBody)
    ) {
      issues.push({
        kind: "trigger-sql",
        key,
        sourceSection: trigger.sourceSection,
        detail: "WHEN/body is empty, disabled, placeholder, or natural language",
      });
    }
    if (
      hasUnquotedReservedPhysicalIdentifier(trigger.normalizedWhen) ||
      hasUnquotedReservedPhysicalIdentifier(trigger.normalizedBody)
    ) {
      issues.push({
        kind: "trigger-sql",
        key,
        sourceSection: trigger.sourceSection,
        detail: "physical order/index identifier must be double-quoted",
      });
    }
    if (trigger.errorCode !== `AIR_G1:${trigger.name}`) {
      issues.push({
        kind: "trigger-error-code",
        key,
        sourceSection: trigger.sourceSection,
        detail: `expected AIR_G1:${trigger.name}, received ${trigger.errorCode}`,
      });
    }
    if (!trigger.normalizedBody.includes(trigger.errorCode)) {
      issues.push({
        kind: "trigger-error-code",
        key,
        sourceSection: trigger.sourceSection,
        detail: "normalizedBody does not contain its stable errorCode",
      });
    }
  }
}

function mergeConstraintExtensions(
  baseIssues: readonly G1CompletenessIssue[],
  baseChecks: readonly G1SchemaCheckSource[],
  baseTriggers: readonly G1SchemaTriggerSource[],
  extensions: readonly G1SchemaManifestExtension[],
  issues: G1SchemaManifestIssue[],
) {
  const unresolved = new Map(
    baseIssues.map((issue) => [
      `${issue.kind}:${physicalKey(issue.table ?? "global", issue.key)}`,
      issue,
    ]),
  );
  const checks = new Map(
    baseChecks.map((check) => [physicalKey(check.table, check.name), check]),
  );
  const triggers = new Map(
    baseTriggers.map((trigger) => [physicalKey(trigger.table, trigger.name), trigger]),
  );

  for (const extension of extensions) {
    for (const extensionIssue of extension.completenessIssues) {
      issues.push({
        kind: `extension:${extensionIssue.kind}`,
        key: `${extension.id}:${extensionIssue.key}`,
        sourceSection: extensionIssue.sourceSection,
        detail: extensionIssue.missing.join(", "),
      });
    }
    for (const check of extension.checks ?? []) {
      const key = physicalKey(check.table, check.name);
      const unresolvedKey = `check:${key}`;
      if (checks.has(key)) {
        issues.push({
          kind: "duplicate-check",
          key,
          sourceSection: check.sourceSection,
          detail: `extension ${extension.id} redefines an already complete check`,
        });
        continue;
      }
      if (!unresolved.delete(unresolvedKey)) {
        issues.push({
          kind: "extra-check",
          key,
          sourceSection: check.sourceSection,
          detail: `extension ${extension.id} does not cover a declared completeness issue`,
        });
      }
      checks.set(key, check);
    }
    for (const trigger of extension.triggers ?? []) {
      const key = physicalKey(trigger.table, trigger.name);
      const unresolvedKey = `trigger:${key}`;
      if (triggers.has(key)) {
        issues.push({
          kind: "duplicate-trigger",
          key,
          sourceSection: trigger.sourceSection,
          detail: `extension ${extension.id} redefines an already complete trigger`,
        });
        continue;
      }
      if (!unresolved.delete(unresolvedKey)) {
        issues.push({
          kind: "extra-trigger",
          key,
          sourceSection: trigger.sourceSection,
          detail: `extension ${extension.id} does not cover a declared completeness issue`,
        });
      }
      triggers.set(key, trigger);
    }
  }

  for (const issue of unresolved.values()) {
    issues.push(sourceIssue(issue));
  }
  const mergedChecks = [...checks.values()].sort((left, right) =>
    compareCanonicalText(physicalKey(left.table, left.name), physicalKey(right.table, right.name)),
  );
  const mergedTriggers = [...triggers.values()].sort((left, right) =>
    compareCanonicalText(physicalKey(left.table, left.name), physicalKey(right.table, right.name)),
  );
  if (mergedChecks.length !== EXPECTED_CHECK_COUNT) {
    issues.push({
      kind: "check-count",
      key: "G1",
      sourceSection: "12.2,12.2.1",
      detail: `expected ${EXPECTED_CHECK_COUNT}, received ${mergedChecks.length}`,
    });
  }
  if (mergedTriggers.length !== EXPECTED_TRIGGER_COUNT) {
    issues.push({
      kind: "trigger-count",
      key: "G1",
      sourceSection: "12.3,12.3.1",
      detail: `expected ${EXPECTED_TRIGGER_COUNT}, received ${mergedTriggers.length}`,
    });
  }
  validateSql(mergedChecks, mergedTriggers, issues);
  return { checks: mergedChecks, triggers: mergedTriggers };
}

function validatePhysicalBindings(
  checks: readonly G1SchemaCheckSource[],
  triggers: readonly G1SchemaTriggerSource[],
  extensions: readonly G1SchemaManifestExtension[],
  issues: G1SchemaManifestIssue[],
) {
  const checkKeys = new Set(checks.map((item) => physicalKey(item.table, item.name)));
  const triggerKeys = new Set(triggers.map((item) => physicalKey(item.table, item.name)));
  const checkBindings = new Map<string, string>();
  const triggerBindings = new Map<string, string>();
  for (const extension of extensions) {
    for (const value of extension.bindings) {
      if (value === null || typeof value !== "object") {
        issues.push({
          kind: "binding-shape",
          key: extension.id,
          sourceSection: extension.sourceSections.join(","),
          detail: "binding must be an object",
        });
        continue;
      }
      const binding = value as Record<string, unknown>;
      if (typeof binding.table !== "string" || typeof binding.name !== "string") {
        issues.push({
          kind: "binding-shape",
          key: extension.id,
          sourceSection: extension.sourceSections.join(","),
          detail: "binding requires string table/name",
        });
        continue;
      }
      const key = physicalKey(binding.table, binding.name);
      const target = binding.name.startsWith("ck_")
        ? checkBindings
        : binding.name.startsWith("trg_")
          ? triggerBindings
          : null;
      const expected = binding.name.startsWith("ck_") ? checkKeys : triggerKeys;
      if (target === null) {
        issues.push({
          kind: "binding-shape",
          key,
          sourceSection: extension.sourceSections.join(","),
          detail: "physical binding name must start with ck_ or trg_",
        });
        continue;
      }
      const prior = target.get(key);
      if (prior !== undefined) {
        issues.push({
          kind: "duplicate-binding",
          key,
          sourceSection: extension.sourceSections.join(","),
          detail: `extensions ${prior} and ${extension.id} both bind the physical key`,
        });
      } else {
        target.set(key, extension.id);
      }
      if (!expected.has(key)) {
        issues.push({
          kind: "orphan-binding",
          key,
          sourceSection: extension.sourceSections.join(","),
          detail: "binding has no effective CHECK/trigger definition",
        });
      }
    }
  }
  for (const key of checkKeys) {
    if (!checkBindings.has(key)) {
      issues.push({
        kind: "missing-check-binding",
        key,
        sourceSection: "12.2.1",
        detail: "effective CHECK has no template+args binding",
      });
    }
  }
  for (const key of triggerKeys) {
    if (!triggerBindings.has(key)) {
      issues.push({
        kind: "missing-trigger-binding",
        key,
        sourceSection: "12.3.1",
        detail: "effective trigger has no template+args binding",
      });
    }
  }
  return { checkBindings: checkBindings.size, triggerBindings: triggerBindings.size };
}

function validatePurgeOwnershipRegistry(
  models: readonly { readonly table: string }[],
  registry: readonly PurgeOwnershipSource[],
  triggers: readonly G1SchemaTriggerSource[],
  issues: G1SchemaManifestIssue[],
): void {
  const modelTables = new Set(models.map((model) => model.table));
  const entriesByTable = new Map<string, PurgeOwnershipSource[]>();
  for (const entry of registry) {
    const entries = entriesByTable.get(entry.table) ?? [];
    entries.push(entry);
    entriesByTable.set(entry.table, entries);
  }
  for (const table of modelTables) {
    const entries = entriesByTable.get(table) ?? [];
    if (entries.length !== 1) {
      issues.push({
        kind: "purge-ownership",
        key: table,
        sourceSection: "12.4",
        detail: `expected exactly one ownership entry, received ${entries.length}`,
      });
    }
  }
  for (const entry of registry) {
    if (!modelTables.has(entry.table)) {
      issues.push({
        kind: "purge-ownership",
        key: entry.table,
        sourceSection: "12.4",
        detail: "ownership entry does not map to a model table",
      });
    }
    const projectOwned = entry.ownership !== "global_or_cross_project";
    if (projectOwned !== (entry.ownerProjectPath !== null)) {
      issues.push({
        kind: "purge-ownership",
        key: entry.table,
        sourceSection: "12.4",
        detail: "ownerProjectPath nullability disagrees with ownership class",
      });
    }
    if (
      entry.ownership === "project_history_or_cascade_root" &&
      entry.deleteGuard === null
    ) {
      issues.push({
        kind: "purge-ownership",
        key: entry.table,
        sourceSection: "12.4",
        detail: "project history/cascade root has no DELETE guard",
      });
    }
    if (entry.deleteGuard !== null) {
      const matches = triggers.filter(
        (trigger) =>
          trigger.table === entry.table &&
          trigger.name === entry.deleteGuard &&
          trigger.event === "DELETE",
      );
      if (matches.length !== 1) {
        issues.push({
          kind: "purge-ownership",
          key: `${entry.table}.${entry.deleteGuard}`,
          sourceSection: "12.4",
          detail: `expected exactly one matching DELETE trigger, received ${matches.length}`,
        });
      }
    }
  }
}

export function buildG1SchemaManifest(input: G1SchemaManifestInput) {
  const extensions = [...(input.extensions ?? [])].sort((left, right) =>
    compareCanonicalText(left.id, right.id),
  );
  const supportingSources = [...(input.supportingSources ?? [])].sort((left, right) =>
    compareCanonicalText(left.path, right.path),
  );
  const modelSource = buildG1SchemaModelSource(input.contractMarkdown);
  const constraintSource = buildG1SchemaConstraintSource(
    input.contractMarkdown,
    input.registryMarkdown,
  );
  const domainRegistrySource = buildG1SchemaDomainRegistrySource(input.contractMarkdown);
  const issues: G1SchemaManifestIssue[] = [
    ...modelSource.completenessIssues.map((issue) => ({
      kind: "model-source",
      key: [issue.model, issue.field, issue.code].filter(Boolean).join("."),
      sourceSection: modelSource.sourceSections.join(","),
      detail: issue.message,
    })),
    ...domainRegistrySource.completenessIssues.map((issue) => ({
      kind: "domain-registry",
      key: `${issue.registry}.${issue.key}`,
      sourceSection: issue.sourceSection,
      detail: issue.missing,
    })),
  ];
  const explicitSources = [
    ...extensions.map((extension) => extension.sourceDocument),
    ...supportingSources.map((source) => source.path),
  ];
  const duplicateSources = explicitSources.filter(
    (source, index) => explicitSources.indexOf(source) !== index,
  );
  for (const source of new Set(duplicateSources)) {
    issues.push({
      kind: "source-authority",
      key: source,
      sourceSection: "13",
      detail: "duplicate explicit source document",
    });
  }
  for (const source of explicitSources) {
    if (
      !ALLOWED_EXPLICIT_SOURCE_PATHS.has(source) ||
      /(?:schema\.prisma|\/migrations?\/|\.sqlite(?:3)?$|\.db$)/i.test(source)
    ) {
      issues.push({
        kind: "source-authority",
        key: source,
        sourceSection: "13",
        detail: "source is outside the exact Pass 2 allow-list; schema/migration/SQLite are forbidden",
      });
    }
  }
  const receivedSources = new Set(explicitSources);
  for (const source of ALLOWED_EXPLICIT_SOURCE_PATHS) {
    if (!receivedSources.has(source)) {
      issues.push({
        kind: "source-authority",
        key: source,
        sourceSection: "13",
        detail: "required Pass 2 source document is missing",
      });
    }
  }
  const constraints = mergeConstraintExtensions(
    constraintSource.completenessIssues,
    constraintSource.checks,
    constraintSource.triggers,
    extensions,
    issues,
  );
  validatePurgeOwnershipRegistry(
    modelSource.models,
    constraintSource.purgeOwnershipRegistryV1,
    constraints.triggers,
    issues,
  );
  const bindingCounts = validatePhysicalBindings(
    constraints.checks,
    constraints.triggers,
    extensions,
    issues,
  );
  issues.sort((left, right) =>
    compareCanonicalText(
      `${left.kind}\u0000${left.key}\u0000${left.detail}`,
      `${right.kind}\u0000${right.key}\u0000${right.detail}`,
    ),
  );

  const unsignedManifest = {
    manifestSchemaVersion: 1,
    baseContractVersion: 1,
    effectiveStage: "G1",
    appliedOverlays: [] as string[],
    prismaVersion: "6.19.3",
    status: issues.length === 0 ? "ready_for_materialization" : "incomplete",
    sourceDocuments: [
      {
        path: CONTRACT_PATH,
        digest: sha256(input.contractMarkdown),
        sections: [
          ...new Set([
            ...modelSource.sourceSections,
            ...constraintSource.sourceSections.filter((item) => !item.startsWith("registry:")),
            "§12.2.1 CheckTemplateRegistryV1",
            "§12.3.1 TriggerTemplateRegistryV1",
          ]),
        ],
      },
      {
        path: REGISTRY_PATH,
        digest: sha256(input.registryMarkdown),
        sections: constraintSource.sourceSections.filter((item) => item.startsWith("registry:")),
      },
      ...extensions.map((extension) => ({
        path: extension.sourceDocument,
        digest: extension.sourceDigest,
        sections: extension.sourceSections,
      })),
      ...supportingSources,
    ],
    canonicalization: {
      algorithm: "JCS-compatible-I-JSON-v1",
      objectKeyOrder: "UTF-16-code-unit-ascending",
      arrayOrder: "declared-contract-order-or-explicit-physical-key-order",
      sqlWhitespace: "collapse-ASCII-whitespace-no-trailing-semicolon",
      hashAlgorithm: "sha256-utf8",
      excludedFromDigest: ["manifestDigest"],
      coverage: [
        "44 models and 556 scalar fields",
        "105 foreign keys and 210 relation navigation fields",
        "unique/index/FK actions",
        "195 CHECK template bindings and normalized expressions",
        "194 trigger template bindings, timing/event/updateColumns/WHEN/body/errorCode/normalized SQL",
        "TaskPolicyRegistryV1 10 entries",
        "OutboxHandlerRegistryV1 5 entries",
        "PurgeOwnershipRegistryV1 44 exhaustive table entries",
        "TaskSource/FormalProjection/LayoutBinding/Preflight resolution registries",
        "G1 base and G2-G5 overlay ownership",
      ],
    },
    counts: {
      models: modelSource.modelCount,
      scalarFields: modelSource.scalarFieldCount,
      foreignKeys: modelSource.foreignKeyCount,
      relationFields: modelSource.relationFieldCount,
      primaryKeys: modelSource.primaryKeyCount,
      uniqueConstraints: modelSource.uniqueConstraintCount,
      indexes: modelSource.indexCount,
      checks: constraints.checks.length,
      triggers: constraints.triggers.length,
      checkBindings: bindingCounts.checkBindings,
      triggerBindings: bindingCounts.triggerBindings,
      generationTaskTargetTypes: domainRegistrySource.generationTaskTargetTypes.length,
      taskSourceRegistryEntries: domainRegistrySource.taskSourceRegistryV1.length,
      taskPolicies: constraintSource.taskPolicyRegistryV1.length,
      outboxHandlers: constraintSource.outboxHandlerRegistryV1.length,
      purgeOwnershipEntries:
        constraintSource.purgeOwnershipRegistryV1.length,
      formalProjectionEntries: domainRegistrySource.formalProjectionRegistryV1.length,
      layoutBindingProjectionEntries:
        domainRegistrySource.layoutBindingProjectionRegistryV1.length,
    },
    models: modelSource.models,
    constraints: {
      checks: constraints.checks,
      triggers: constraints.triggers.map((trigger) => ({
        ...trigger,
        normalizedSql: normalizeTriggerSql(trigger),
      })),
      templateSources: extensions.map((extension) => ({
        id: extension.id,
        sourceDocument: extension.sourceDocument,
        sourceDigest: extension.sourceDigest,
        sourceSections: extension.sourceSections,
        templates: extension.templates,
        bindings: extension.bindings,
      })),
    },
    registries: {
      generationTaskTargetTypes: domainRegistrySource.generationTaskTargetTypes,
      taskSourceRegistryV1: domainRegistrySource.taskSourceRegistryV1,
      taskPolicyRegistryV1: constraintSource.taskPolicyRegistryV1,
      outboxHandlerRegistryV1: constraintSource.outboxHandlerRegistryV1,
      purgeOwnershipRegistryV1:
        constraintSource.purgeOwnershipRegistryV1,
      formalProjectionRegistryV1: domainRegistrySource.formalProjectionRegistryV1,
      layoutBindingProjectionRegistryV1:
        domainRegistrySource.layoutBindingProjectionRegistryV1,
      preflightUnresolvedResolutionRegistryV1:
        domainRegistrySource.preflightUnresolvedResolutionRegistryV1,
    },
    overlays: constraintSource.stageOwnership,
    completeness: {
      ready: issues.length === 0,
      issueCount: issues.length,
      issues,
    },
  };

  return {
    ...unsignedManifest,
    manifestDigest: sha256(canonicalize(unsignedManifest)),
  };
}

export function canonicalizeG1SchemaManifest(value: unknown): string {
  return canonicalize(value);
}

export function digestG1SchemaManifestSource(value: string): `sha256:${string}` {
  return sha256(value);
}

export function verifyG1SchemaManifestDigest(manifest: Record<string, unknown>): boolean {
  const { manifestDigest, ...unsigned } = manifest;
  return typeof manifestDigest === "string" && manifestDigest === sha256(canonicalize(unsigned));
}

export function assertG1SchemaManifestReady(manifest: ReturnType<typeof buildG1SchemaManifest>): void {
  if (!manifest.completeness.ready) {
    throw new Error(`G1_SCHEMA_MANIFEST_INCOMPLETE:${manifest.completeness.issueCount}`);
  }
  if (!verifyG1SchemaManifestDigest(manifest)) {
    throw new Error("G1_SCHEMA_MANIFEST_DIGEST_MISMATCH");
  }
}
