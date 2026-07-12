export type G1PrismaScalarType =
  | "String"
  | "Int"
  | "Float"
  | "Boolean"
  | "DateTime"
  | "Json";

export type G1ReferentialAction =
  | "Restrict"
  | "Cascade"
  | "SetNull"
  | "NoAction";

export type G1ScalarDefault = string | number | boolean | null;

export interface G1ClosedStringClassification {
  field: string;
  kind: "closed";
  enumName: string;
  closedValues: string[];
}

export interface G1ControlledOpenStringClassification {
  field: string;
  kind: "controlled-open";
  vocabularyOwner: string;
}

export interface G1FreeTextStringClassification {
  field: string;
  kind: "free-text";
  formatOwner: string;
}

export type G1StringClassification =
  | G1ClosedStringClassification
  | G1ControlledOpenStringClassification
  | G1FreeTextStringClassification;

export interface G1SchemaScalarField {
  name: string;
  type: G1PrismaScalarType;
  nullable: boolean;
  default: G1ScalarDefault;
  column: string;
  primaryKey: boolean;
  migration: string;
  stringClassification?: G1StringClassification;
}

export interface G1SchemaUnique {
  name: string;
  columns: string[];
}

export interface G1SchemaIndexColumn {
  name: string;
  direction: "ASC" | "DESC";
}

export interface G1SchemaIndex {
  name: string;
  unique: false;
  columns: G1SchemaIndexColumn[];
}

export interface G1SchemaForeignKey {
  name: string;
  localColumns: string[];
  targetTable: string;
  targetColumns: string[];
  onDelete: Exclude<G1ReferentialAction, "NoAction"> | "NoAction";
  onUpdate: G1ReferentialAction;
}

export interface G1SchemaRelationField {
  name: string;
  type: string;
  list: boolean;
  optional: boolean;
  relationName: string;
  fields: string[];
  references: string[];
  onDelete: G1ReferentialAction | null;
  onUpdate: G1ReferentialAction | null;
  oppositeModel: string;
}

export interface G1SchemaModel {
  model: string;
  table: string;
  migration: string;
  fields: G1SchemaScalarField[];
  stringClassification: G1StringClassification[];
  relationFields: G1SchemaRelationField[];
  uniques: G1SchemaUnique[];
  indexes: G1SchemaIndex[];
  foreignKeys: G1SchemaForeignKey[];
}

export interface G1SchemaCompletenessIssue {
  code: string;
  message: string;
  model?: string;
  field?: string;
}

export interface G1SchemaModelSource {
  sourceDocument: string;
  sourceSections: string[];
  expectedModelCount: 44;
  expectedScalarFieldCount: 556;
  expectedForeignKeyCount: 105;
  expectedPrimaryKeyCount: 44;
  expectedUniqueConstraintCount: 70;
  expectedIndexCount: 60;
  modelCount: number;
  scalarFieldCount: number;
  foreignKeyCount: number;
  relationFieldCount: number;
  primaryKeyCount: number;
  uniqueConstraintCount: number;
  indexCount: number;
  models: G1SchemaModel[];
  completenessIssues: G1SchemaCompletenessIssue[];
}

interface RawModelSection {
  model: string;
  table: string;
  migration: string;
  body: string;
}

interface RawRelationSpec {
  localModel: string;
  purpose: string;
  localFields: string[];
  targetModel: string;
  targetFields: string[];
  onDelete: G1ReferentialAction;
  onUpdate: G1ReferentialAction;
}

const SOURCE_DOCUMENT =
  "文档/04_方案与决策/2026-07-11_G1数据库Schema实施契约.md";

const SOURCE_SECTIONS = [
  "§2 记法与全局裁决",
  "§3 闭合枚举与开放字符串",
  "§3.1 String 字段穷尽分类",
  "§4 Migration 分组",
  "§5.1–§11.6 模型字段块及 unique/index/FK 段",
  "§13 机器可比 manifest 规则",
] as const;

const EXPECTED_MODEL_COUNT = 44 as const;
const EXPECTED_SCALAR_FIELD_COUNT = 556 as const;
const EXPECTED_FOREIGN_KEY_COUNT = 105 as const;
const EXPECTED_PRIMARY_KEY_COUNT = 44 as const;
const EXPECTED_UNIQUE_CONSTRAINT_COUNT = 70 as const;
const EXPECTED_INDEX_COUNT = 60 as const;

const compareCanonicalText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const CLOSED_FIELD_ENUM: Readonly<Record<string, string>> = {
  "PersistenceState.activationState": "PersistenceActivationState",
  "MigrationRun.kind": "MigrationRunKind",
  "MigrationRun.status": "MigrationRunStatus",
  "ImportedEntitySource.provenanceStatus": "ProvenanceStatus",
  "MigrationIssue.severity": "MigrationSeverity",
  "MigrationIssue.resolutionStatus": "MigrationResolutionStatus",
  "Project.type": "ProjectType",
  "Project.lifecycleStatus": "ProjectLifecycleStatus",
  "Project.comicFormat": "ComicFormat",
  "ProjectScriptOutline.status": "OutlineStatus",
  "Chapter.milestoneStatus": "ChapterMilestoneStatus",
  "Chapter.scriptWorkingState": "ScriptWorkingState",
  "ChapterScriptVersion.origin": "ScriptVersionOrigin",
  "StoryVersion.status": "VersionLifecycleStatus",
  "StoryVersion.origin": "VersionOrigin",
  "StoryboardVersion.status": "VersionLifecycleStatus",
  "StoryboardVersion.origin": "VersionOrigin",
  "Shot.lifecycleStatus": "ShotLifecycleStatus",
  "PreflightRevision.status": "PreflightStatus",
  "Character.level": "CharacterLevel",
  "Character.entityType": "CharacterEntityType",
  "Character.status": "CharacterStatus",
  "Character.source": "CharacterSource",
  "CharacterVisual.kind": "CharacterVisualKind",
  "CharacterVisual.status": "CharacterVisualStatus",
  "Asset.type": "AssetType",
  "Asset.status": "AssetStatus",
  "Candidate.status": "CandidateStatus",
  "Candidate.generationPurpose": "CandidateGenerationPurpose",
  "CandidateLockRevision.action": "CandidateLockAction",
  "CandidateLockRevision.origin": "CandidateLockOrigin",
  "AppPreference.theme": "Theme",
  "ProviderConfig.runtimeKind": "ProviderRuntimeKind",
  "CredentialMetadata.owner": "CredentialOwner",
  "CredentialMetadata.status": "CredentialStatus",
  "ProjectContextFact.status": "ContextFactStatus",
  "ConversationThread.status": "ConversationThreadStatus",
  "ConversationMessage.role": "ConversationMessageRole",
  "ConversationMessage.status": "ConversationMessageStatus",
  "DialogueToolResult.status": "DialogueToolResultStatus",
  "DialogueRuntimeSession.status": "DialogueRuntimeSessionStatus",
  "PendingDialogueArtifact.kind": "PendingDialogueKind",
  "PendingDialogueArtifact.status": "PendingDialogueStatus",
  "GenerationTask.recordKind": "TaskRecordKind",
  "GenerationTask.provenanceStatus": "ProvenanceStatus",
  "GenerationTask.status": "GenerationTaskStatus",
  "GenerationTask.applicability": "TaskApplicability",
  "TaskAttempt.outcome": "TaskAttemptOutcome",
  "LayoutWorkingCopy.documentKind": "LayoutDocumentKind",
  "LayoutRevision.origin": "LayoutOrigin",
  "LayoutRevision.saveReason": "LayoutSaveReason",
  "ExportRevision.kind": "ExportKind",
  "ExportRevision.status": "ExportStatus",
  "ExportRevision.completionApplicability": "TaskApplicability",
  "ExportRevision.origin": "ExportOrigin",
  "OutboxEvent.status": "OutboxStatus",
};

const CONTROLLED_OPEN_FIELD_OWNER: Readonly<Record<string, string>> = {
  "ImportedEntitySource.entityType": "migration-codec-v1",
  "MigrationIssue.code": "migration-issue-code-registry-v1",
  "MigrationIssue.entityType": "migration-codec-v1",
  "ChapterScriptPending.operation": "script-operation-registry-v1",
  "ChapterScriptRevision.source": "script-revision-source-registry-v1",
  "ChapterScriptRevision.operation": "script-operation-registry-v1",
  "StoryVersion.sourcePolicyVersion": "version-source-policy-registry-v1",
  "StoryboardVersion.sourcePolicyVersion": "version-source-policy-registry-v1",
  "PreflightRevision.sourcePolicyVersion": "version-source-policy-registry-v1",
  "Character.role": "character-role-vocabulary-v1",
  "Asset.role": "asset-role-registry-v1",
  "Asset.mimeType": "asset-mime-codec-v1",
  "AppPreference.defaultTextModelId": "provider-registry-v1",
  "ProviderConfig.providerId": "provider-registry-v1",
  "ProviderConfig.modelId": "provider-registry-v1",
  "ProjectContextFact.type": "project-context-fact-registry-v1",
  "ProjectContextFact.sourceType": "project-context-source-registry-v1",
  "ConversationThread.stepKey": "dialogue-step-registry-v1",
  "DialogueToolResult.tool": "dialogue-tool-registry-v1",
  "DialogueRuntimeSession.runtime": "dialogue-runtime-registry-v1",
  "DialogueRuntimeSession.providerId": "provider-registry-v1",
  "DialogueRuntimeSession.modelId": "provider-registry-v1",
  "DialogueRuntimeSession.variant": "dialogue-runtime-variant-registry-v1",
  "GenerationTask.type": "task-policy-registry-v1",
  "GenerationTask.phase": "task-policy-registry-v1",
  "GenerationTask.targetType": "task-policy-registry-v1",
  "GenerationTask.importSource": "migration-task-import-codec-v1",
  "GenerationTaskSource.role": "task-source-registry-v1",
  "GenerationTaskSource.sourceType": "task-source-registry-v1",
  "LayoutSourceBinding.role": "layout-binding-projection-registry-v1",
  "ExportRevision.rendererVersion": "export-renderer-registry-v1",
  "ExportArtifact.role": "export-artifact-role-registry-v1",
  "OutboxEvent.eventType": "outbox-handler-registry-v1",
  "OutboxEvent.aggregateType": "outbox-handler-registry-v1",
};

function relation(
  localModel: string,
  purpose: string,
  localFields: string[],
  targetModel: string,
  targetFields: string[],
  onDelete: G1ReferentialAction,
): RawRelationSpec {
  return {
    localModel,
    purpose,
    localFields,
    targetModel,
    targetFields,
    onDelete,
    onUpdate: "NoAction",
  };
}

// This list is an explicit transcription of the FK paragraphs in §5.1–§11.6.
// It is deliberately independent from schema.prisma and migration SQL.
const RELATION_SPECS: readonly RawRelationSpec[] = [
  relation("PersistenceState", "cutoverRun", ["cutoverRunId"], "MigrationRun", ["id"], "Restrict"),

  relation("ImportedEntitySource", "firstRun", ["firstRunId"], "MigrationRun", ["id"], "Restrict"),
  relation("ImportedEntitySource", "lastRun", ["lastRunId"], "MigrationRun", ["id"], "Restrict"),
  relation("MigrationIssue", "run", ["runId"], "MigrationRun", ["id"], "Restrict"),

  relation("Project", "currentChapter", ["currentChapterId"], "Chapter", ["id"], "SetNull"),
  relation("Project", "currentScriptOutline", ["currentScriptOutlineId"], "ProjectScriptOutline", ["id"], "SetNull"),
  relation("ProjectScriptOutline", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("Chapter", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("Chapter", "currentScriptVersion", ["currentScriptVersionId"], "ChapterScriptVersion", ["id"], "SetNull"),
  relation("Chapter", "currentStoryVersion", ["currentStoryVersionId"], "StoryVersion", ["id"], "SetNull"),
  relation("Chapter", "pendingStoryVersion", ["pendingStoryVersionId"], "StoryVersion", ["id"], "SetNull"),
  relation("Chapter", "currentStoryboardVersion", ["currentStoryboardVersionId"], "StoryboardVersion", ["id"], "SetNull"),
  relation("Chapter", "pendingStoryboardVersion", ["pendingStoryboardVersionId"], "StoryboardVersion", ["id"], "SetNull"),
  relation("Chapter", "currentPreflightRevision", ["currentPreflightRevisionId"], "PreflightRevision", ["id"], "SetNull"),
  relation("Chapter", "currentLayoutRevision", ["currentLayoutRevisionId"], "LayoutRevision", ["id"], "SetNull"),
  relation("Chapter", "currentExportRevision", ["currentExportRevisionId"], "ExportRevision", ["id"], "SetNull"),
  relation("Chapter", "lastScriptRevision", ["lastScriptRevisionId"], "ChapterScriptRevision", ["id"], "SetNull"),
  relation("ChapterScriptVersion", "chapter", ["chapterId"], "Chapter", ["id"], "Restrict"),
  relation("ChapterScriptPending", "chapter", ["chapterId"], "Chapter", ["id"], "Restrict"),
  relation("ChapterScriptPending", "thread", ["threadId"], "ConversationThread", ["id"], "Restrict"),
  relation("ChapterScriptPending", "message", ["messageId"], "ConversationMessage", ["id"], "Restrict"),
  relation("ChapterScriptRevision", "chapter", ["chapterId"], "Chapter", ["id"], "Restrict"),
  relation("ChapterScriptRevision", "thread", ["threadId"], "ConversationThread", ["id"], "Restrict"),
  relation("ChapterScriptRevision", "message", ["messageId"], "ConversationMessage", ["id"], "Restrict"),

  relation("StoryVersion", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("StoryVersion", "chapter", ["chapterId"], "Chapter", ["id"], "Restrict"),
  relation("StoryVersion", "sourceScriptVersion", ["sourceScriptVersionId"], "ChapterScriptVersion", ["id"], "Restrict"),
  relation("StorySceneProjection", "storyVersion", ["storyVersionId"], "StoryVersion", ["id"], "Cascade"),
  relation("StorySceneProjection", "chapterScene", ["chapterSceneId"], "ChapterScene", ["id"], "Restrict"),
  relation("StoryBeatProjection", "storyVersion", ["storyVersionId"], "StoryVersion", ["id"], "Cascade"),
  relation("StoryBeatProjection", "chapterScene", ["chapterSceneId"], "ChapterScene", ["id"], "Restrict"),
  relation("ChapterScene", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("ChapterScene", "chapter", ["chapterId"], "Chapter", ["id"], "Restrict"),
  relation("ChapterScene", "currentVisual", ["currentVisualId"], "SceneVisual", ["id"], "SetNull"),
  relation("SceneVisual", "chapterScene", ["chapterSceneId"], "ChapterScene", ["id"], "Restrict"),
  relation("SceneVisual", "asset", ["assetId"], "Asset", ["id"], "Restrict"),
  relation("SceneVisual", "sourceTask", ["sourceTaskId"], "GenerationTask", ["id"], "Restrict"),
  relation("StoryboardVersion", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("StoryboardVersion", "chapter", ["chapterId"], "Chapter", ["id"], "Restrict"),
  relation("StoryboardVersion", "sourceStoryVersion", ["sourceStoryVersionId"], "StoryVersion", ["id"], "Restrict"),
  relation("Shot", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("Shot", "chapter", ["chapterId"], "Chapter", ["id"], "Restrict"),
  relation("Shot", "currentCandidateLockRevision", ["currentCandidateLockRevisionId"], "CandidateLockRevision", ["id"], "SetNull"),
  relation("StoryboardShotProjection", "storyboardVersion", ["storyboardVersionId"], "StoryboardVersion", ["id"], "Cascade"),
  relation("StoryboardShotProjection", "shot", ["shotId"], "Shot", ["id"], "Restrict"),
  relation("StoryboardShotProjection", "storyBeatProjection", ["storyBeatProjectionId"], "StoryBeatProjection", ["id"], "Restrict"),
  relation("StoryboardShotProjection", "chapterScene", ["chapterSceneId"], "ChapterScene", ["id"], "Restrict"),
  relation("StoryboardShotCharacter", "storyboardShotProjection", ["storyboardShotProjectionId"], "StoryboardShotProjection", ["id"], "Cascade"),
  relation("StoryboardShotCharacter", "character", ["characterId"], "Character", ["id"], "Restrict"),
  relation("PreflightRevision", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("PreflightRevision", "chapter", ["chapterId"], "Chapter", ["id"], "Restrict"),
  relation("PreflightRevision", "sourceStoryboardVersion", ["sourceStoryboardVersionId"], "StoryboardVersion", ["id"], "Restrict"),

  relation("Character", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("Character", "previewVisual", ["previewVisualId"], "CharacterVisual", ["id"], "SetNull"),
  relation("Character", "primaryVisual", ["primaryVisualId"], "CharacterVisual", ["id"], "SetNull"),
  relation("CharacterVisual", "character", ["characterId"], "Character", ["id"], "Restrict"),
  relation("CharacterVisual", "asset", ["assetId"], "Asset", ["id"], "Restrict"),
  relation("CharacterVisual", "sourceVisual", ["sourceVisualId"], "CharacterVisual", ["id"], "Restrict"),
  relation("Asset", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("Asset", "chapter", ["chapterId", "projectId"], "Chapter", ["id", "projectId"], "Restrict"),
  relation("Asset", "sourceTask", ["sourceTaskId"], "GenerationTask", ["id"], "Restrict"),
  relation("Candidate", "shot", ["shotId", "projectId", "chapterId"], "Shot", ["id", "projectId", "chapterId"], "Restrict"),
  relation("Candidate", "asset", ["assetId", "projectId", "chapterId"], "Asset", ["id", "projectId", "chapterId"], "Restrict"),
  relation("Candidate", "task", ["taskId", "projectId", "chapterId"], "GenerationTask", ["id", "projectId", "chapterId"], "Restrict"),
  relation("CandidateLockRevision", "shot", ["shotId", "projectId", "chapterId"], "Shot", ["id", "projectId", "chapterId"], "Restrict"),
  relation("CandidateLockRevision", "candidate", ["candidateId", "shotId", "projectId", "chapterId"], "Candidate", ["id", "shotId", "projectId", "chapterId"], "Restrict"),
  relation("CandidateLockRevision", "previousRevision", ["previousRevisionId", "shotId", "projectId", "chapterId"], "CandidateLockRevision", ["id", "shotId", "projectId", "chapterId"], "Restrict"),

  relation("AppPreference", "activeImageProvider", ["activeImageProviderId"], "ProviderConfig", ["id"], "SetNull"),
  relation("AppPreference", "defaultTextProvider", ["defaultTextProviderId"], "ProviderConfig", ["id"], "SetNull"),
  relation("CredentialMetadata", "providerConfig", ["providerConfigId"], "ProviderConfig", ["id"], "Restrict"),
  relation("ProjectContextFact", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("ConversationThread", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("ConversationThread", "chapter", ["chapterId"], "Chapter", ["id"], "Restrict"),
  relation("ConversationMessage", "thread", ["threadId"], "ConversationThread", ["id"], "Cascade"),
  relation("DialogueToolResult", "thread", ["threadId"], "ConversationThread", ["id"], "Cascade"),
  relation("DialogueToolResult", "message", ["messageId"], "ConversationMessage", ["id"], "Cascade"),
  relation("DialogueRuntimeSession", "thread", ["threadId"], "ConversationThread", ["id"], "Cascade"),
  relation("PendingDialogueArtifact", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("PendingDialogueArtifact", "chapter", ["chapterId"], "Chapter", ["id"], "Restrict"),
  relation("PendingDialogueArtifact", "thread", ["threadId"], "ConversationThread", ["id"], "Cascade"),
  relation("PendingDialogueArtifact", "sourceMessage", ["sourceMessageId"], "ConversationMessage", ["id"], "Restrict"),
  relation("PendingDialogueArtifact", "toolResult", ["toolResultId"], "DialogueToolResult", ["id"], "Restrict"),

  relation("GenerationTask", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("GenerationTask", "chapter", ["chapterId", "projectId"], "Chapter", ["id", "projectId"], "Restrict"),
  relation("TaskAttempt", "task", ["taskId"], "GenerationTask", ["id"], "Cascade"),
  relation("TaskConcurrencySlot", "task", ["taskId"], "GenerationTask", ["id"], "SetNull"),
  relation("GenerationTaskSource", "task", ["taskId"], "GenerationTask", ["id"], "Cascade"),

  relation("LayoutWorkingCopy", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("LayoutWorkingCopy", "chapter", ["chapterId"], "Chapter", ["id"], "Restrict"),
  relation("LayoutWorkingCopy", "basedOnRevision", ["basedOnRevisionId"], "LayoutRevision", ["id"], "Restrict"),
  relation("LayoutRevision", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("LayoutRevision", "chapter", ["chapterId"], "Chapter", ["id"], "Restrict"),
  relation("LayoutRevision", "previousRevision", ["previousRevisionId"], "LayoutRevision", ["id"], "Restrict"),
  relation("LayoutRevision", "contentBasedOnRevision", ["contentBasedOnRevisionId"], "LayoutRevision", ["id"], "Restrict"),
  relation("LayoutSourceBinding", "layoutRevision", ["layoutRevisionId"], "LayoutRevision", ["id"], "Cascade"),
  relation("LayoutSourceBinding", "shot", ["shotId"], "Shot", ["id"], "Restrict"),
  relation("LayoutSourceBinding", "candidate", ["candidateId"], "Candidate", ["id"], "Restrict"),
  relation("LayoutSourceBinding", "candidateLockRevision", ["candidateLockRevisionId"], "CandidateLockRevision", ["id"], "Restrict"),
  relation("LayoutSourceBinding", "asset", ["assetId"], "Asset", ["id"], "Restrict"),
  relation("ExportRevision", "project", ["projectId"], "Project", ["id"], "Restrict"),
  relation("ExportRevision", "chapter", ["chapterId"], "Chapter", ["id"], "Restrict"),
  relation("ExportRevision", "task", ["taskId"], "GenerationTask", ["id"], "Restrict"),
  relation("ExportRevision", "layoutRevision", ["layoutRevisionId"], "LayoutRevision", ["id"], "Restrict"),
  relation("ExportArtifact", "exportRevision", ["exportRevisionId"], "ExportRevision", ["id"], "Cascade"),
  relation("ExportArtifact", "asset", ["assetId"], "Asset", ["id"], "Restrict"),
];

function lowerFirst(value: string): string {
  return value.length === 0 ? value : value[0]!.toLowerCase() + value.slice(1);
}

function upperFirst(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

function pluralModelName(model: string): string {
  return `${lowerFirst(model)}s`;
}

function logicalToPhysical(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function parseDefault(
  raw: string | undefined,
  issues: G1SchemaCompletenessIssue[],
  model: string,
  field: string,
): G1ScalarDefault {
  if (raw === undefined) {
    return null;
  }
  if (raw === "uuid()" || raw === "now()" || raw === "@updatedAt") {
    return raw;
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  if (/^-?\d+$/.test(raw)) {
    return Number(raw);
  }
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      issues.push({
        code: "FIELD_DEFAULT_INVALID_STRING",
        model,
        field,
        message: `无法解析字段默认字符串 ${raw}`,
      });
      return raw;
    }
  }
  issues.push({
    code: "FIELD_DEFAULT_UNKNOWN",
    model,
    field,
    message: `字段默认值 ${raw} 不属于契约允许的 token/literal`,
  });
  return raw;
}

function parseEnumValues(contractMarkdown: string): Map<string, string[]> {
  const start = contractMarkdown.indexOf("## 3. 闭合枚举与开放字符串");
  const end = contractMarkdown.indexOf("### 3.1 String 字段穷尽分类", start);
  const section = start >= 0 && end > start ? contractMarkdown.slice(start, end) : "";
  const values = new Map<string, string[]>();
  const rowPattern = /^\| `([A-Za-z][A-Za-z0-9]*)` \| (.+) \|$/gm;
  for (const match of section.matchAll(rowPattern)) {
    const enumName = match[1]!;
    const enumValues = [...match[2]!.matchAll(/`([^`]+)`/g)]
      .flatMap((item) => item[1]!.split("/"))
      .map((item) => item.trim())
      .filter((item) => /^[a-z][a-z0-9_]*$/.test(item));
    values.set(enumName, enumValues);
  }
  return values;
}

function parseModelSections(
  contractMarkdown: string,
  issues: G1SchemaCompletenessIssue[],
): RawModelSection[] {
  const migrationByMajor = new Map<string, string>();
  for (const match of contractMarkdown.matchAll(/^## (\d+)\. `([^`]+)`$/gm)) {
    migrationByMajor.set(match[1]!, match[2]!);
  }

  const headings = [
    ...contractMarkdown.matchAll(
      /^### (\d+)\.(\d+) `([A-Za-z][A-Za-z0-9]*)` → `([a-z][a-z0-9_]*)`$/gm,
    ),
  ];

  return headings.map((heading, index) => {
    const bodyStart = heading.index! + heading[0].length;
    const bodyEnd = index + 1 < headings.length
      ? headings[index + 1]!.index!
      : contractMarkdown.indexOf("## 12.", bodyStart);
    const migration = migrationByMajor.get(heading[1]!);
    if (!migration) {
      issues.push({
        code: "MODEL_MIGRATION_UNRESOLVED",
        model: heading[3],
        message: `无法从 §${heading[1]} 解析 migration 名称`,
      });
    }
    return {
      model: heading[3]!,
      table: heading[4]!,
      migration: migration ?? "",
      body: contractMarkdown.slice(bodyStart, bodyEnd >= 0 ? bodyEnd : undefined),
    };
  });
}

function freeTextFormatOwner(model: string, field: G1SchemaScalarField): string {
  if (/Digest$/.test(field.name) || field.name === "sha256" || field.name === "fingerprint") {
    return "sha256-format-v1";
  }
  if (/storageKey$/i.test(field.name)) {
    return "workspace-storage-key-v1";
  }
  if (field.name === "secretRef") {
    return "image-secret-ref-v1";
  }
  if (field.name === "baseUrl") {
    return "absolute-url-or-provider-base-url-v1";
  }
  if (/Token$/.test(field.name) || field.name === "leaseToken") {
    return "opaque-fencing-token-v1";
  }
  if (/Key$/.test(field.name)) {
    return "opaque-key-v1";
  }
  if (field.name === "id" || /Id$/.test(field.name)) {
    return "opaque-id-v1";
  }
  if (/Version$/.test(field.name)) {
    return "implementation-version-v1";
  }
  if (/Code$/.test(field.name)) {
    return "stable-code-v1";
  }
  if (model === "CredentialMetadata") {
    return "credential-metadata-non-secret-text-v1";
  }
  return "utf8-text-v1";
}

function classifyStringField(
  model: string,
  field: G1SchemaScalarField,
  enumValues: Map<string, string[]>,
  issues: G1SchemaCompletenessIssue[],
): G1StringClassification {
  const key = `${model}.${field.name}`;
  const closedEnum = CLOSED_FIELD_ENUM[key];
  const controlledOwner = CONTROLLED_OPEN_FIELD_OWNER[key];
  if (closedEnum && controlledOwner) {
    issues.push({
      code: "STRING_CLASSIFICATION_DUPLICATE",
      model,
      field: field.name,
      message: `${key} 同时被标为 closed 与 controlled-open`,
    });
  }
  if (closedEnum) {
    const closedValues = enumValues.get(closedEnum) ?? [];
    if (closedValues.length === 0) {
      issues.push({
        code: "CLOSED_ENUM_VALUES_MISSING",
        model,
        field: field.name,
        message: `${key} 引用的 ${closedEnum} 未从 §3 解析出值域`,
      });
    }
    if (closedValues.some((value) => value.includes("/"))) {
      issues.push({
        code: "CLOSED_ENUM_VALUE_NOT_ATOMIC",
        model,
        field: field.name,
        message: `${closedEnum} 含未拆分的枚举值`,
      });
    }
    return { field: field.name, kind: "closed", enumName: closedEnum, closedValues };
  }
  if (controlledOwner) {
    return {
      field: field.name,
      kind: "controlled-open",
      vocabularyOwner: controlledOwner,
    };
  }
  return {
    field: field.name,
    kind: "free-text",
    formatOwner: freeTextFormatOwner(model, field),
  };
}

function parseFields(
  section: RawModelSection,
  enumValues: Map<string, string[]>,
  issues: G1SchemaCompletenessIssue[],
): G1SchemaScalarField[] {
  const block = section.body.match(/\n\n```text\n([\s\S]*?)\n```/);
  if (!block) {
    issues.push({
      code: "MODEL_FIELD_BLOCK_MISSING",
      model: section.model,
      message: `${section.model} 缺少首个 text 字段块`,
    });
    return [];
  }

  const fields: G1SchemaScalarField[] = [];
  for (const line of block[1]!.split("\n")) {
    const lastAt = line.lastIndexOf("@");
    const declaration = lastAt >= 0 ? line.slice(0, lastAt) : line;
    const mapping = lastAt >= 0 ? line.slice(lastAt + 1) : "";
    const match = declaration.match(
      /^([A-Za-z][A-Za-z0-9]*):(String|Int|Float|Boolean|DateTime|Json)(\?)?(?:=(.*))?$/,
    );
    if (!match || mapping.length === 0) {
      issues.push({
        code: "FIELD_DECLARATION_UNPARSEABLE",
        model: section.model,
        message: `无法解析字段行：${line}`,
      });
      continue;
    }
    const primaryKey = mapping === "id";
    const field: G1SchemaScalarField = {
      name: match[1]!,
      type: match[2]! as G1PrismaScalarType,
      nullable: match[3] === "?",
      default: parseDefault(match[4], issues, section.model, match[1]!),
      column: primaryKey ? logicalToPhysical(match[1]!) : mapping,
      primaryKey,
      migration: section.migration,
    };
    if (field.type === "String") {
      field.stringClassification = classifyStringField(
        section.model,
        field,
        enumValues,
        issues,
      );
    }
    fields.push(field);
  }
  return fields;
}

function parseNamedColumnLists(
  body: string,
  prefix: "uq" | "ix",
): Array<{ name: string; columns: G1SchemaIndexColumn[] }> {
  const pattern = new RegExp(
    "`(" + prefix + "_[a-z0-9_]+)\\(([^`]+)\\)`",
    "g",
  );
  return [...body.matchAll(pattern)]
    .map((match) => ({
      name: match[1]!,
      columns: match[2]!.split(",").map((rawColumn) => {
        const parts = rawColumn.trim().split(/\s+/);
        return {
          name: parts[0]!,
          direction: parts[1]?.toUpperCase() === "DESC" ? "DESC" : "ASC",
        } as G1SchemaIndexColumn;
      }),
    }))
    .sort((left, right) => compareCanonicalText(left.name, right.name));
}

function relationSpecsFor(model: string): RawRelationSpec[] {
  return RELATION_SPECS.filter((item) => item.localModel === model);
}

function hasUniqueForeignKey(model: G1SchemaModel, localColumns: string[]): boolean {
  const localSet = new Set(localColumns);
  return model.uniques.some(
    (unique) =>
      unique.columns.length === localColumns.length &&
      unique.columns.every((column) => localSet.has(column)),
  );
}

function compareIssue(
  left: G1SchemaCompletenessIssue,
  right: G1SchemaCompletenessIssue,
): number {
  return compareCanonicalText(
    [left.code, left.model ?? "", left.field ?? "", left.message].join("\u0000"),
    [right.code, right.model ?? "", right.field ?? "", right.message].join("\u0000"),
  );
}

function addModelRelations(
  models: G1SchemaModel[],
  sectionByModel: Map<string, RawModelSection>,
  issues: G1SchemaCompletenessIssue[],
): void {
  const modelByName = new Map(models.map((model) => [model.model, model]));
  const relationNames = new Map<string, number>();

  for (const spec of RELATION_SPECS) {
    const localModel = modelByName.get(spec.localModel);
    const targetModel = modelByName.get(spec.targetModel);
    if (!localModel || !targetModel) {
      issues.push({
        code: "RELATION_MODEL_MISSING",
        model: spec.localModel,
        message: `${spec.localModel}.${spec.purpose} 的目标 ${spec.targetModel} 不在 44 模型中`,
      });
      continue;
    }

    const localFields = spec.localFields.map((name) =>
      localModel.fields.find((field) => field.name === name),
    );
    const targetFields = spec.targetFields.map((name) =>
      targetModel.fields.find((field) => field.name === name),
    );
    if (localFields.some((field) => !field) || targetFields.some((field) => !field)) {
      issues.push({
        code: "RELATION_SCALAR_FIELD_MISSING",
        model: spec.localModel,
        message: `${spec.localModel}.${spec.purpose} 的 fields/references 未在字段块中完整找到`,
      });
      continue;
    }

    const localColumns = localFields.map((field) => field!.column);
    const targetColumns = targetFields.map((field) => field!.column);
    const relationName = `${spec.localModel}_${spec.purpose}_${spec.targetModel}`;
    const fkName = `fk_${localModel.table}_${localColumns.join("_")}__${targetModel.table}`;
    const localOptional = localFields.some((field) => field!.nullable);
    const inverseSingular = hasUniqueForeignKey(localModel, localColumns);
    const inverseName = inverseSingular
      ? `${lowerFirst(spec.localModel)}By${upperFirst(spec.purpose)}`
      : `${pluralModelName(spec.localModel)}By${upperFirst(spec.purpose)}`;

    localModel.foreignKeys.push({
      name: fkName,
      localColumns,
      targetTable: targetModel.table,
      targetColumns,
      onDelete: spec.onDelete,
      onUpdate: spec.onUpdate,
    });
    localModel.relationFields.push({
      name: spec.purpose,
      type: spec.targetModel,
      list: false,
      optional: localOptional,
      relationName,
      fields: [...spec.localFields],
      references: [...spec.targetFields],
      onDelete: spec.onDelete,
      onUpdate: spec.onUpdate,
      oppositeModel: spec.targetModel,
    });
    targetModel.relationFields.push({
      name: inverseName,
      type: spec.localModel,
      list: !inverseSingular,
      optional: inverseSingular,
      relationName,
      fields: [],
      references: [],
      onDelete: null,
      onUpdate: null,
      oppositeModel: spec.localModel,
    });
    relationNames.set(relationName, (relationNames.get(relationName) ?? 0) + 2);

    const fkLine = sectionByModel
      .get(spec.localModel)
      ?.body.split("\n")
      .find((line) => line.includes("FK："));
    const missingEvidence = [
      ...localColumns.filter((column) => !fkLine?.includes(column)),
      ...targetColumns.filter((column) => !fkLine?.includes(column)),
      ...(fkLine?.includes(targetModel.table) ? [] : [targetModel.table]),
      ...(fkLine?.includes(`onDelete=${spec.onDelete}`) ? [] : [`onDelete=${spec.onDelete}`]),
      ...(fkLine?.includes(`onUpdate=${spec.onUpdate}`) ? [] : [`onUpdate=${spec.onUpdate}`]),
    ];
    if (missingEvidence.length > 0) {
      issues.push({
        code: "FK_PARAGRAPH_EVIDENCE_MISSING",
        model: spec.localModel,
        message: `${spec.localModel}.${spec.purpose} 的 FK 段缺少：${missingEvidence.join(", ")}`,
      });
    }
  }

  for (const model of models) {
    model.foreignKeys.sort((left, right) => compareCanonicalText(left.name, right.name));
    model.relationFields.sort((left, right) =>
      compareCanonicalText(
        [left.relationName, left.name].join("\u0000"),
        [right.relationName, right.name].join("\u0000"),
      ),
    );
    const expectedLocalRelations = relationSpecsFor(model.model).length;
    const hasFkParagraph = sectionByModel
      .get(model.model)
      ?.body.split("\n")
      .some((line) => line.includes("FK："));
    if (hasFkParagraph !== (expectedLocalRelations > 0)) {
      issues.push({
        code: "FK_PARAGRAPH_CATALOG_MISMATCH",
        model: model.model,
        message: `${model.model} 的 FK 段存在性与显式关系目录不一致`,
      });
    }
  }

  for (const [relationName, count] of relationNames) {
    if (count !== 2) {
      issues.push({
        code: "RELATION_PAIR_INCOMPLETE",
        message: `${relationName} 应恰好有本地/反向两个 relation field，实际 ${count}`,
      });
    }
  }
}

function validateCatalogKeys(
  models: G1SchemaModel[],
  issues: G1SchemaCompletenessIssue[],
): void {
  const scalarByKey = new Map<string, G1SchemaScalarField>();
  for (const model of models) {
    for (const field of model.fields) {
      scalarByKey.set(`${model.model}.${field.name}`, field);
    }
  }
  for (const key of [...Object.keys(CLOSED_FIELD_ENUM), ...Object.keys(CONTROLLED_OPEN_FIELD_OWNER)]) {
    const field = scalarByKey.get(key);
    if (!field || field.type !== "String") {
      issues.push({
        code: "STRING_CLASSIFICATION_CATALOG_ORPHAN",
        model: key.split(".")[0],
        field: key.split(".")[1],
        message: `${key} 的分类目录没有对应 String 字段`,
      });
    }
  }
}

/**
 * Build the independent, document-derived G1 model source used by Pass 2.
 *
 * The caller supplies the already-read authoritative Markdown. This function
 * never reads schema.prisma, migration SQL, a database file, or SQLite state.
 * Consumers must fail closed whenever completenessIssues is non-empty.
 */
export function buildG1SchemaModelSource(
  contractMarkdown: string,
): G1SchemaModelSource {
  const issues: G1SchemaCompletenessIssue[] = [];
  const enumValues = parseEnumValues(contractMarkdown);
  const sections = parseModelSections(contractMarkdown, issues);

  const models: G1SchemaModel[] = sections.map((section) => {
    const fields = parseFields(section, enumValues, issues);
    const uniques = parseNamedColumnLists(section.body, "uq").map((item) => ({
      name: item.name,
      columns: item.columns.map((column) => column.name),
    }));
    const indexes = parseNamedColumnLists(section.body, "ix").map((item) => ({
      name: item.name,
      unique: false as const,
      columns: item.columns,
    }));
    return {
      model: section.model,
      table: section.table,
      migration: section.migration,
      fields,
      stringClassification: fields
        .map((field) => field.stringClassification)
        .filter((item): item is G1StringClassification => item !== undefined),
      relationFields: [],
      uniques,
      indexes,
      foreignKeys: [],
    };
  });

  validateCatalogKeys(models, issues);
  addModelRelations(models, new Map(sections.map((section) => [section.model, section])), issues);

  const modelCount = models.length;
  const scalarFieldCount = models.reduce((sum, model) => sum + model.fields.length, 0);
  const foreignKeyCount = models.reduce((sum, model) => sum + model.foreignKeys.length, 0);
  const relationFieldCount = models.reduce((sum, model) => sum + model.relationFields.length, 0);
  const primaryKeyCount = models.reduce(
    (sum, model) => sum + model.fields.filter((field) => field.primaryKey).length,
    0,
  );
  const uniqueConstraintCount = models.reduce((sum, model) => sum + model.uniques.length, 0);
  const indexCount = models.reduce((sum, model) => sum + model.indexes.length, 0);

  if (modelCount !== EXPECTED_MODEL_COUNT) {
    issues.push({
      code: "MODEL_COUNT_MISMATCH",
      message: `模型数应为 ${EXPECTED_MODEL_COUNT}，实际 ${modelCount}`,
    });
  }
  if (scalarFieldCount !== EXPECTED_SCALAR_FIELD_COUNT) {
    issues.push({
      code: "SCALAR_FIELD_COUNT_MISMATCH",
      message: `Prisma scalar field 数应为 ${EXPECTED_SCALAR_FIELD_COUNT}，实际 ${scalarFieldCount}`,
    });
  }
  if (foreignKeyCount !== EXPECTED_FOREIGN_KEY_COUNT) {
    issues.push({
      code: "FOREIGN_KEY_COUNT_MISMATCH",
      message: `FK 数应为 ${EXPECTED_FOREIGN_KEY_COUNT}，实际 ${foreignKeyCount}`,
    });
  }
  if (relationFieldCount !== foreignKeyCount * 2) {
    issues.push({
      code: "RELATION_FIELD_COUNT_MISMATCH",
      message: `relation field 应为 FK 的两倍，FK=${foreignKeyCount} relation=${relationFieldCount}`,
    });
  }
  if (primaryKeyCount !== EXPECTED_PRIMARY_KEY_COUNT) {
    issues.push({
      code: "PRIMARY_KEY_COUNT_MISMATCH",
      message: `PK 数应为 ${EXPECTED_PRIMARY_KEY_COUNT}，实际 ${primaryKeyCount}`,
    });
  }
  if (uniqueConstraintCount !== EXPECTED_UNIQUE_CONSTRAINT_COUNT) {
    issues.push({
      code: "UNIQUE_CONSTRAINT_COUNT_MISMATCH",
      message: `named unique 数应为 ${EXPECTED_UNIQUE_CONSTRAINT_COUNT}，实际 ${uniqueConstraintCount}`,
    });
  }
  if (indexCount !== EXPECTED_INDEX_COUNT) {
    issues.push({
      code: "INDEX_COUNT_MISMATCH",
      message: `named index 数应为 ${EXPECTED_INDEX_COUNT}，实际 ${indexCount}`,
    });
  }
  for (const model of models) {
    const stringFieldCount = model.fields.filter((field) => field.type === "String").length;
    if (stringFieldCount !== model.stringClassification.length) {
      issues.push({
        code: "STRING_CLASSIFICATION_INCOMPLETE",
        model: model.model,
        message: `String 字段 ${stringFieldCount} 个，分类 ${model.stringClassification.length} 个`,
      });
    }
    const physicalColumns = new Set(model.fields.map((field) => field.column));
    for (const unique of model.uniques) {
      const missing = unique.columns.filter((column) => !physicalColumns.has(column));
      if (missing.length > 0) {
        issues.push({
          code: "UNIQUE_COLUMN_MISSING",
          model: model.model,
          message: `${unique.name} 引用了不存在的列 ${missing.join(", ")}`,
        });
      }
    }
    for (const index of model.indexes) {
      const missing = index.columns
        .map((column) => column.name)
        .filter((column) => !physicalColumns.has(column));
      if (missing.length > 0) {
        issues.push({
          code: "INDEX_COLUMN_MISSING",
          model: model.model,
          message: `${index.name} 引用了不存在的列 ${missing.join(", ")}`,
        });
      }
    }
  }

  return {
    sourceDocument: SOURCE_DOCUMENT,
    sourceSections: [...SOURCE_SECTIONS],
    expectedModelCount: EXPECTED_MODEL_COUNT,
    expectedScalarFieldCount: EXPECTED_SCALAR_FIELD_COUNT,
    expectedForeignKeyCount: EXPECTED_FOREIGN_KEY_COUNT,
    expectedPrimaryKeyCount: EXPECTED_PRIMARY_KEY_COUNT,
    expectedUniqueConstraintCount: EXPECTED_UNIQUE_CONSTRAINT_COUNT,
    expectedIndexCount: EXPECTED_INDEX_COUNT,
    modelCount,
    scalarFieldCount,
    foreignKeyCount,
    relationFieldCount,
    primaryKeyCount,
    uniqueConstraintCount,
    indexCount,
    models,
    completenessIssues: issues.sort(compareIssue),
  };
}
