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

/**
 * 单文件实体的允许来源范围。摘要相等不能替代来源身份校验：同一份
 * bytes 若被挂到另一个实体的 storage key 上，也必须被 verifier 拒绝。
 */
const SINGLE_ITEM_SOURCE_STORAGE_KEY_PATTERNS: ReadonlyMap<string, RegExp> = new Map([
  ["Project", /^projects\/[^/]+\/project\.json$/],
  ["ChapterScriptVersion", /^projects\/[^/]+\/chapters\/[^/]+\/script\.versions\/[^/]+\.md$/],
  ["ChapterScriptPending", /^projects\/[^/]+\/chapters\/[^/]+\/script-pending\.json$/],
  ["ChapterScriptRevision", /^projects\/[^/]+\/chapters\/[^/]+\/script\.revisions\/latest\.json$/],
  ["StoryVersion", /^projects\/[^/]+\/chapters\/[^/]+\/structure\.json$/],
  ["StorySceneProjection", /^projects\/[^/]+\/chapters\/[^/]+\/structure\.json$/],
  ["StoryBeatProjection", /^projects\/[^/]+\/chapters\/[^/]+\/structure\.json$/],
  ["StoryboardVersion", /^projects\/[^/]+\/chapters\/[^/]+\/storyboard\.json$/],
  ["StoryboardShotProjection", /^projects\/[^/]+\/chapters\/[^/]+\/storyboard\.json$/],
  ["Character", /^projects\/[^/]+\/shared\/characters\.json$/],
  ["Asset", /^projects\/[^/]+\/shared\/assets\.json$/],
  ["AssetPhysicalEvidence", /^projects\/[^/]+\/(?:assets|chapters)\/.+$/],
  ["CharacterVisual", /^projects\/[^/]+\/shared\/characters\.json$/],
  ["SceneVisual", /^projects\/[^/]+\/chapters\/[^/]+\/structure\.json$/],
  ["PreflightRevision", /^projects\/[^/]+\/chapters\/[^/]+\/preflight\.json$/],
  ["GenerationTask", /^projects\/[^/]+\/tasks\/[^/]+\.input\.json$/],
  ["Candidate", /^projects\/[^/]+\/chapters\/[^/]+\/candidates\.json$/],
  ["CandidateLockRevision", /^projects\/[^/]+\/chapters\/[^/]+\/storyboard\.json$/],
  ["LayoutWorkingCopy", /^projects\/[^/]+\/chapters\/[^/]+\/layout\/layout\.json$/],
  ["ExportRevision", /^projects\/[^/]+\/(?:chapters\/[^/]+\/)?exports\/(?:[^/]+\/)?[^/]+$/],
  ["ProviderConfig", /^settings\.redacted\.json$/],
  ["CredentialMetadata", /^settings\.redacted\.json$/],
  ["AppPreference", /^settings\.redacted\.json$/],
]);

const CHAPTER_SOURCE_STORAGE_KEY_PATTERN = /^projects\/[^/]+\/chapters\/[^/]+\/chapter\.json$/;
const PROJECT_SCRIPT_OUTLINE_SOURCE_STORAGE_KEY_PATTERN = /^projects\/[^/]+\/script-outline\.md$/;

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
        if (!row.sourceStorageKey || !PROJECT_SCRIPT_OUTLINE_SOURCE_STORAGE_KEY_PATTERN.test(row.sourceStorageKey)) {
          sourceMismatchCount += 1;
          continue;
        }
        const metadataStorageKey = row.sourceStorageKey.replace(/\/script-outline\.md$/, "/script-outline.json");
        const metadataItem = items.get(metadataStorageKey);
        const expected = digestCanonicalJson({ markdownDigest: item.sha256, metadataDigest: metadataItem?.sha256 ?? null });
        if (expected !== row.sourceDigest) sourceMismatchCount += 1;
        continue;
      }
      if (row.entityType !== "Chapter" || !row.sourceStorageKey || !CHAPTER_SOURCE_STORAGE_KEY_PATTERN.test(row.sourceStorageKey)) {
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
        // Project/Chapter shadow importer uses chapter.json.sourceText as the
        // legacy fallback when script.md is absent. Recompute the same input
        // here so a valid fallback snapshot does not fail M4 verification.
        try {
          const chapter = JSON.parse((await snapshot.readPayload(row.sourceStorageKey)).bytes.toString("utf8")) as Record<string, unknown>;
          const fallbackText = typeof chapter.sourceText === "string" ? chapter.sourceText : "";
          scriptDigest = encodeScriptTextV1(Buffer.from(fallbackText, "utf8"), { allowEmpty: true }).digest;
        } catch {
          sourceMismatchCount += 1;
          continue;
        }
      }
      const expected = digestCanonicalJson({ chapterJsonDigest: item.sha256, scriptDigest });
      if (expected !== row.sourceDigest) sourceMismatchCount += 1;
      continue;
    }
    const sourceStorageKeyPattern = SINGLE_ITEM_SOURCE_STORAGE_KEY_PATTERNS.get(row.entityType);
    if (!sourceStorageKeyPattern || !sourceStorageKeyPattern.test(row.sourceStorageKey!)) {
      sourceMismatchCount += 1;
      continue;
    }
    if (item.sha256 !== row.sourceDigest) sourceMismatchCount += 1;
  }
  return { sourceMismatchCount, unregisteredEntityTypeCount };
}
