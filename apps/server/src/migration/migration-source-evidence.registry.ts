import { encodeScriptTextV1, digestCanonicalJson } from "@airoaming/shared";
import type { VerifiedSnapshot } from "./migration-audit.service.js";

/**
 * 来源证据注册表：绝不把 sourceStorageKey 当成 sourceDigest 的替代品。
 * 当前 ProjectScriptOutline 使用 script-outline.md + script-outline.json 的复合摘要，
 * Chapter 使用 chapter.json + script.md 的复合摘要；对话实体使用 sealed
 * runtime bundle 的 canonical envelope 摘要；其余实体使用单文件摘要。
 */
export const SINGLE_ITEM_SOURCE_ENTITY_TYPES: ReadonlySet<string> = new Set([
  "Project",
  "ChapterScriptVersion",
  "ChapterScriptPending",
  "ChapterScriptRevision",
  "StoryVersion",
  "StorySceneProjection",
  "StoryBeatProjection",
  "StoryboardVersion",
  "StoryboardShotProjection",
  "Character",
  "Asset",
  "AssetPhysicalEvidence",
  "CharacterVisual",
  "SceneVisual",
  "PreflightRevision",
  "GenerationTask",
  "Candidate",
  "CandidateLockRevision",
  "LayoutWorkingCopy",
  "ExportRevision",
  "ProviderConfig",
  "CredentialMetadata",
  "AppPreference",
] as const);

export const COMPOSITE_SOURCE_ENTITY_TYPES: ReadonlySet<string> = new Set(["Chapter", "ProjectScriptOutline"]);
export const RUNTIME_BUNDLE_SOURCE_ENTITY_TYPES: ReadonlySet<string> = new Set([
  "ConversationThread",
  "ConversationMessage",
  "DialogueToolResult",
  "DialogueRuntimeSession",
  "PendingDialogueArtifact",
]);

export interface SourceEvidenceCheck {
  sourceMismatchCount: number;
  unregisteredEntityTypeCount: number;
}

/**
 * 校验 ImportedEntitySource 的锚点和摘要都来自 sealed snapshot。
 * snapshot manifest 包含脱敏 settings/runtime bundle，source manifest 包含
 * 原始工作区证据；二者必须合并检查，不能把转换后的安全输入误判为越界来源。
 */
export async function checkSourceEvidence(
  snapshot: VerifiedSnapshot,
  rows: ReadonlyArray<{ entityType: string; sourceStorageKey: string | null; sourceDigest: string }>,
): Promise<SourceEvidenceCheck> {
  const items = new Map(
    [...snapshot.sourceManifest.items, ...snapshot.snapshotManifest.items]
      .map((item) => [item.storageKey, item] as const),
  );
  let sourceMismatchCount = 0;
  let unregisteredEntityTypeCount = 0;
  for (const row of rows) {
    if (!SINGLE_ITEM_SOURCE_ENTITY_TYPES.has(row.entityType) && !COMPOSITE_SOURCE_ENTITY_TYPES.has(row.entityType) && !RUNTIME_BUNDLE_SOURCE_ENTITY_TYPES.has(row.entityType)) {
      unregisteredEntityTypeCount += 1;
      continue;
    }
    const item = row.sourceStorageKey ? items.get(row.sourceStorageKey) : undefined;
    if (!item) {
      sourceMismatchCount += 1;
      continue;
    }
    if (RUNTIME_BUNDLE_SOURCE_ENTITY_TYPES.has(row.entityType)) {
      if (row.sourceStorageKey !== "runtime-bundle.json" || row.sourceDigest !== snapshot.sealed.runtimeBundleDigest) sourceMismatchCount += 1;
      continue;
    }
    if (COMPOSITE_SOURCE_ENTITY_TYPES.has(row.entityType)) {
      if (row.entityType === "ProjectScriptOutline") {
        if (!row.sourceStorageKey?.endsWith("/script-outline.md")) {
          sourceMismatchCount += 1;
          continue;
        }
        const metadataStorageKey = row.sourceStorageKey.replace(/\/script-outline\.md$/, "/script-outline.json");
        const metadataItem = items.get(metadataStorageKey);
        const expected = digestCanonicalJson({ markdownDigest: item.sha256, metadataDigest: metadataItem?.sha256 ?? null });
        if (expected !== row.sourceDigest) sourceMismatchCount += 1;
        continue;
      }
      if (row.entityType !== "Chapter" || !row.sourceStorageKey?.endsWith("/chapter.json")) {
        sourceMismatchCount += 1;
        continue;
      }
      const scriptStorageKey = row.sourceStorageKey.replace(/\/chapter\.json$/, "/script.md");
      const scriptItem = items.get(scriptStorageKey);
      let scriptDigest: `sha256:${string}`;
      if (scriptItem) {
        const script = await snapshot.readPayload(scriptStorageKey);
        scriptDigest = encodeScriptTextV1(script.bytes, { allowEmpty: true }).digest;
      } else {
        scriptDigest = encodeScriptTextV1(Buffer.alloc(0), { allowEmpty: true }).digest;
      }
      const expected = digestCanonicalJson({ chapterJsonDigest: item.sha256, scriptDigest });
      if (expected !== row.sourceDigest) sourceMismatchCount += 1;
      continue;
    }
    if (item.sha256 !== row.sourceDigest) sourceMismatchCount += 1;
  }
  return { sourceMismatchCount, unregisteredEntityTypeCount };
}
