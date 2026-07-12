export interface G1TaskSourceRegistryEntry {
  sourceType: string;
  targetLookup: string;
  sealPolicy: string;
  scopePolicy: "project-only" | "chapter-compatible" | "project-chapter-compatible" | "custom";
  rowKind: "entity" | "virtual-aggregate";
  sourceSection: "10.4.1";
}

export interface G1FormalProjectionRegistryEntry {
  parent: "Story" | "Storyboard" | "Preflight";
  supportedSchemaVersions: readonly [1, 2];
  ownerAndPathPolicy: string;
  projectionMapping: string;
  sourceSection: "7.11";
}

export interface G1LayoutBindingProjectionRegistryEntry {
  documentKind: "layout_document_v1" | "legacy_chapter_layout_v1";
  schemaVersion: 1;
  traversalPolicy: string;
  bindingMapping: string;
  sourceSection: "11.3.1";
}

export interface G1DomainRegistryIssue {
  registry: string;
  key: string;
  missing: string;
  sourceSection: string;
}

export interface G1SchemaDomainRegistrySource {
  generationTaskTargetTypes: readonly [
    "project",
    "character",
    "chapter",
    "story",
    "shot",
    "asset",
    "export",
    "scene",
  ];
  taskSourceRegistryV1: G1TaskSourceRegistryEntry[];
  formalProjectionRegistryV1: G1FormalProjectionRegistryEntry[];
  layoutBindingProjectionRegistryV1: G1LayoutBindingProjectionRegistryEntry[];
  preflightUnresolvedResolutionRegistryV1: {
    decisionSchemaVersion: 1;
    action: "drop_current_preflight_and_reconfirm_after_cutover";
    acknowledgedConsequences: readonly [
      "legacy_preflight_not_imported_as_formal_revision",
      "current_preflight_pointer_is_null",
      "new_candidate_work_blocked_until_reconfirmation",
    ];
    sourceSection: "7.10.1";
  };
  completenessIssues: G1DomainRegistryIssue[];
}

const TARGET_TYPES = [
  "project",
  "character",
  "chapter",
  "story",
  "shot",
  "asset",
  "export",
  "scene",
] as const;

const EXPECTED_TASK_SOURCE_TYPES = [
  "project",
  "project_script_outline",
  "chapter",
  "chapter_script_version",
  "story_version",
  "storyboard_version",
  "preflight_revision",
  "character",
  "character_visual",
  "chapter_scene",
  "scene_visual",
  "shot",
  "asset",
  "candidate",
  "candidate_lock_revision",
  "lock_set",
  "layout_revision",
  "export_revision",
] as const;

function section(markdown: string, startHeading: string, nextHeading: string): string {
  const start = markdown.indexOf(startHeading);
  const end = markdown.indexOf(nextHeading, start + startHeading.length);
  return start >= 0 && end > start ? markdown.slice(start, end) : "";
}

function stripInlineCode(value: string): string {
  return value.replace(/`([^`]+)`/g, "$1").trim();
}

function parseTaskSources(
  markdown: string,
  issues: G1DomainRegistryIssue[],
): G1TaskSourceRegistryEntry[] {
  const body = section(markdown, "#### 10.4.1 `TaskSourceRegistryV1`", "## 11.");
  const entries: G1TaskSourceRegistryEntry[] = [];
  const row = /^\| `([a-z][a-z0-9_]*)` \| ([^\n|]+) \| ([^\n|]+) \|$/gm;
  for (const match of body.matchAll(row)) {
    const sourceType = match[1]!;
    const targetLookup = stripInlineCode(match[2]!);
    const sealPolicy = stripInlineCode(match[3]!);
    const scopePolicy = sealPolicy.includes("chapter-compatible")
      ? "chapter-compatible"
      : sealPolicy.includes("project-only")
        ? "project-only"
        : sealPolicy.includes("project match") && sealPolicy.includes("chapter")
          ? "project-chapter-compatible"
          : "custom";
    entries.push({
      sourceType,
      targetLookup,
      sealPolicy,
      scopePolicy,
      rowKind: sourceType === "lock_set" ? "virtual-aggregate" : "entity",
      sourceSection: "10.4.1",
    });
  }
  const actual = entries.map((entry) => entry.sourceType);
  if (JSON.stringify(actual) !== JSON.stringify(EXPECTED_TASK_SOURCE_TYPES)) {
    issues.push({
      registry: "TaskSourceRegistryV1",
      key: "sourceType-order",
      missing: `expected=${EXPECTED_TASK_SOURCE_TYPES.join(",")} actual=${actual.join(",")}`,
      sourceSection: "10.4.1",
    });
  }
  return entries;
}

function parseFormalProjection(
  markdown: string,
  issues: G1DomainRegistryIssue[],
): G1FormalProjectionRegistryEntry[] {
  const body = section(markdown, "### 7.11 `FormalProjectionRegistryV1`", "## 8.");
  const entries: G1FormalProjectionRegistryEntry[] = [];
  const row = /^\| (Story|Storyboard|Preflight) V1\/V2 \| ([^\n|]+) \| ([^\n|]+) \|$/gm;
  for (const match of body.matchAll(row)) {
    entries.push({
      parent: match[1] as G1FormalProjectionRegistryEntry["parent"],
      supportedSchemaVersions: [1, 2],
      ownerAndPathPolicy: stripInlineCode(match[2]!),
      projectionMapping: stripInlineCode(match[3]!),
      sourceSection: "7.11",
    });
  }
  if (entries.map((entry) => entry.parent).join(",") !== "Story,Storyboard,Preflight") {
    issues.push({
      registry: "FormalProjectionRegistryV1",
      key: "parent-order",
      missing: "Story/Storyboard/Preflight V1/V2 exact rows",
      sourceSection: "7.11",
    });
  }
  return entries;
}

function parseLayoutBindingProjection(
  markdown: string,
  issues: G1DomainRegistryIssue[],
): G1LayoutBindingProjectionRegistryEntry[] {
  const body = section(markdown, "#### 11.3.1 `LayoutBindingProjectionRegistryV1`", "### 11.4");
  const entries: G1LayoutBindingProjectionRegistryEntry[] = [];
  const row = /^\| `([^`]+)` \| ([^\n|]+) \| ([^\n|]+) \|$/gm;
  for (const match of body.matchAll(row)) {
    const documentKind = match[1]!;
    if (documentKind !== "layout_document_v1" && documentKind !== "legacy_chapter_layout_v1") {
      continue;
    }
    entries.push({
      documentKind,
      schemaVersion: 1,
      traversalPolicy: stripInlineCode(match[2]!),
      bindingMapping: stripInlineCode(match[3]!),
      sourceSection: "11.3.1",
    });
  }
  if (entries.map((entry) => entry.documentKind).join(",") !==
      "layout_document_v1,legacy_chapter_layout_v1") {
    issues.push({
      registry: "LayoutBindingProjectionRegistryV1",
      key: "documentKind-order",
      missing: "layout_document_v1/legacy_chapter_layout_v1 exact rows",
      sourceSection: "11.3.1",
    });
  }
  return entries;
}

export function buildG1SchemaDomainRegistrySource(
  contractMarkdown: string,
): G1SchemaDomainRegistrySource {
  const completenessIssues: G1DomainRegistryIssue[] = [];
  const decisionToken = "drop_current_preflight_and_reconfirm_after_cutover";
  if (!contractMarkdown.includes(`\"action\": \"${decisionToken}\"`)) {
    completenessIssues.push({
      registry: "PreflightUnresolvedResolutionRegistryV1",
      key: decisionToken,
      missing: "strict resolution JSON",
      sourceSection: "7.10.1",
    });
  }

  return {
    generationTaskTargetTypes: TARGET_TYPES,
    taskSourceRegistryV1: parseTaskSources(contractMarkdown, completenessIssues),
    formalProjectionRegistryV1: parseFormalProjection(contractMarkdown, completenessIssues),
    layoutBindingProjectionRegistryV1: parseLayoutBindingProjection(
      contractMarkdown,
      completenessIssues,
    ),
    preflightUnresolvedResolutionRegistryV1: {
      decisionSchemaVersion: 1,
      action: decisionToken,
      acknowledgedConsequences: [
        "legacy_preflight_not_imported_as_formal_revision",
        "current_preflight_pointer_is_null",
        "new_candidate_work_blocked_until_reconfirmation",
      ],
      sourceSection: "7.10.1",
    },
    completenessIssues,
  };
}
