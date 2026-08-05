import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { inspectG1SchemaContract } from "./schema-contract.js";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const EXPECTED_G1_MODELS = [
  "PersistenceState",
  "MigrationRun",
  "ImportedEntitySource",
  "MigrationIssue",
  "OutboxEvent",
  "AppPreference",
  "ProviderConfig",
  "CredentialMetadata",
  "Project",
  "ProjectScriptOutline",
  "Chapter",
  "ChapterScriptVersion",
  "ChapterScriptPending",
  "ChapterScriptRevision",
  "StoryVersion",
  "StorySceneProjection",
  "StoryBeatProjection",
  "ChapterScene",
  "SceneVisual",
  "StoryboardVersion",
  "Shot",
  "StoryboardShotProjection",
  "StoryboardShotCharacter",
  "PreflightRevision",
  "Character",
  "CharacterVisual",
  "Asset",
  "Candidate",
  "CandidateLockRevision",
  "LayoutWorkingCopy",
  "LayoutRevision",
  "LayoutSourceBinding",
  "ExportRevision",
  "ExportArtifact",
  "ProjectContextFact",
  "ConversationThread",
  "ConversationMessage",
  "DialogueToolResult",
  "DialogueRuntimeSession",
  "PendingDialogueArtifact",
  "GenerationTask",
  "TaskAttempt",
  "TaskConcurrencySlot",
  "GenerationTaskSource",
] as const;

const EXPECTED_SCRIPT_WORKFLOW_OVERLAY_MODELS = [
  "ScriptRawSourceVersion",
  "ScriptRawSourceDocument",
  "ScriptRawSourceBlock",
  "ScriptImportAnalysisCandidate",
  "ScriptChapterMap",
  "ScriptImportBatch",
  "ScriptImportBatchItem",
  "ScriptImportFidelityReport",
  "ChapterScriptPendingSourceBinding",
] as const;

const EXPECTED_SMART_LAYOUT_OVERLAY_MODELS = [
  "LayoutCompositionApplication",
] as const;

const EXPECTED_DOCUMENT_LIBRARY_OVERLAY_MODELS = [
  "DocumentWork",
  "DocumentChapter",
] as const;

const EXPECTED_KEY_FIELDS: Record<(typeof EXPECTED_G1_MODELS)[number], readonly string[]> = {
  PersistenceState: ["storageContractVersion", "activationState", "firstBusinessWriteAt"],
  MigrationRun: ["kind", "status", "sourceManifestDigest", "snapshotManifestDigest", "reportDigest"],
  ImportedEntitySource: ["sourceKey", "entityType", "entityId", "sourceDigest", "provenanceStatus"],
  MigrationIssue: ["runId", "issueKey", "severity", "code", "resolutionStatus"],
  OutboxEvent: ["eventType", "payloadJson", "payloadDigest", "status", "idempotencyKey"],
  AppPreference: ["theme", "activeImageProviderId", "rowVersion"],
  ProviderConfig: ["providerId", "runtimeKind", "modelId", "enabled", "rowVersion"],
  CredentialMetadata: ["providerConfigId", "owner", "status", "secretRef", "fingerprint"],
  Project: ["lifecycleStatus", "genreTags", "comicFormat", "currentChapterId", "rowVersion"],
  ProjectScriptOutline: ["projectId", "version", "status", "sourceText", "sourceDigest"],
  Chapter: ["projectId", "slug", "order", "milestoneStatus", "scriptWorkingText", "rowVersion"],
  ChapterScriptVersion: ["chapterId", "version", "sourceText", "sourceDigest", "origin"],
  ChapterScriptPending: ["chapterId", "sourceText", "sourceDigest", "operation", "rowVersion"],
  ChapterScriptRevision: ["chapterId", "source", "operation", "targetWorkingDigest"],
  StoryVersion: ["projectId", "chapterId", "version", "status", "documentJson", "documentDigest", "rowVersion"],
  StorySceneProjection: ["storyVersionId", "chapterSceneId", "sceneKey", "order", "semanticDigest"],
  StoryBeatProjection: ["storyVersionId", "beatKey", "order", "semanticDigest"],
  ChapterScene: ["projectId", "chapterId", "sceneKey", "currentVisualId"],
  SceneVisual: ["chapterSceneId", "assetId", "sourceTaskId", "version"],
  StoryboardVersion: ["projectId", "chapterId", "version", "status", "documentJson", "documentDigest", "rowVersion"],
  Shot: ["projectId", "chapterId", "lifecycleStatus", "currentCandidateLockRevisionId"],
  StoryboardShotProjection: ["storyboardVersionId", "shotId", "order", "semanticDigest"],
  StoryboardShotCharacter: ["storyboardShotProjectionId", "order", "sourceToken", "characterId"],
  PreflightRevision: ["projectId", "chapterId", "version", "status", "sourceDigest", "documentDigest", "ready"],
  Character: ["projectId", "normalizedName", "role", "level", "entityType", "rowVersion"],
  CharacterVisual: ["characterId", "assetId", "kind", "version", "status"],
  Asset: ["projectId", "chapterId", "storageKey", "status", "sha256", "bytes", "metadataDigest"],
  Candidate: ["projectId", "chapterId", "shotId", "taskId", "assetId", "index", "status"],
  CandidateLockRevision: ["projectId", "chapterId", "shotId", "revision", "action", "candidateId"],
  LayoutWorkingCopy: ["projectId", "chapterId", "documentKind", "documentJson", "documentDigest", "rowVersion"],
  LayoutRevision: ["projectId", "chapterId", "revision", "previousRevisionId", "documentJson", "documentDigest"],
  LayoutSourceBinding: ["layoutRevisionId", "elementId", "role", "shotId", "candidateLockRevisionId", "sourceDigest"],
  ExportRevision: ["projectId", "chapterId", "scopeKey", "revision", "kind", "status", "manifestDigest"],
  ExportArtifact: ["exportRevisionId", "assetId", "role", "order"],
  ProjectContextFact: ["projectId", "type", "contentJson", "contentDigest", "status"],
  ConversationThread: ["projectId", "chapterId", "stepKey", "scopeKey", "status"],
  ConversationMessage: ["threadId", "role", "content", "status", "errorJson"],
  DialogueToolResult: ["threadId", "messageId", "toolCallId", "tool", "status", "payloadDigest"],
  DialogueRuntimeSession: ["threadId", "runtime", "externalSessionId", "status"],
  PendingDialogueArtifact: ["projectId", "threadId", "kind", "status", "activeSlotKey", "payloadDigest"],
  GenerationTask: ["projectId", "chapterId", "type", "recordKind", "provenanceStatus", "status", "idempotencyKey", "leaseToken"],
  TaskAttempt: ["taskId", "attemptNo", "workerId", "claimToken", "outcome"],
  TaskConcurrencySlot: ["concurrencyKey", "slotNo", "taskId", "claimToken", "leaseExpiresAt"],
  GenerationTaskSource: ["taskId", "role", "order", "sourceType", "sourceId", "sourceDigest"],
};

describe("SCH-00 G1 schema public contract", () => {
  it("contains the frozen 44-model G1 base plus the approved post-G1 overlays and pins Prisma 6.19.3", async () => {
    const contract = await inspectG1SchemaContract({
      schemaPath: path.join(SERVER_ROOT, "prisma/schema.prisma"),
      packageJsonPath: path.join(SERVER_ROOT, "package.json"),
    });

    expect(contract.models).toEqual(
      [
        ...EXPECTED_G1_MODELS,
        ...EXPECTED_SCRIPT_WORKFLOW_OVERLAY_MODELS,
        ...EXPECTED_SMART_LAYOUT_OVERLAY_MODELS,
        ...EXPECTED_DOCUMENT_LIBRARY_OVERLAY_MODELS,
      ].sort(),
    );
    expect(contract.models).toHaveLength(56);
    expect(contract.prismaVersion).toBe("6.19.3");
    expect(contract.prismaClientVersion).toBe("6.19.3");
  });

  it("exposes the accepted key fields on every model", async () => {
    const contract = await inspectG1SchemaContract({
      schemaPath: path.join(SERVER_ROOT, "prisma/schema.prisma"),
      packageJsonPath: path.join(SERVER_ROOT, "package.json"),
    });

    for (const model of EXPECTED_G1_MODELS) {
      expect(contract.modelFields[model], model).toEqual(
        expect.arrayContaining([...EXPECTED_KEY_FIELDS[model]]),
      );
    }
    expect(contract.modelFields.LayoutCompositionApplication).toEqual(
      expect.arrayContaining([
        "projectId",
        "chapterId",
        "taskId",
        "result",
        "targetId",
        "baseDocumentDigest",
        "resultDocumentDigest",
        "targetRowVersion",
      ]),
    );
  });
});
