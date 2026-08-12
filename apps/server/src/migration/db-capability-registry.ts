export type CapabilityStatus = "implemented" | "partial" | "unsupported";
export type OperationWriteStatus = CapabilityStatus | "retired";
export type OperationReadStatus = CapabilityStatus | "not_applicable";

export interface DbCapabilityEntry {
  readonly id: string;
  readonly ownerModule: string;
  readonly readStatus: CapabilityStatus;
  readonly writeStatus: CapabilityStatus;
  readonly restartCovered: boolean;
  readonly requiredForActivate: boolean;
  readonly evidenceTestIds: readonly string[];
  readonly blocker: string | null;
}

export interface DbCapabilityOperation {
  readonly operation: string;
  readonly capabilityId: string;
  readonly ownerModule: string;
  readonly sourceFile: string;
  readonly sourceSymbol: string;
  readonly readStatus: OperationReadStatus;
  readonly writeStatus: OperationWriteStatus;
  readonly evidenceTestIds: readonly string[];
  readonly retirementReason?: string;
  readonly replacement?: string;
}

const entries: DbCapabilityEntry[] = [
  {
    id: "project_chapter_script",
    ownerModule: "projects/project-repository",
    readStatus: "implemented",
    writeStatus: "implemented",
    restartCovered: true,
    requiredForActivate: true,
    evidenceTestIds: [
      "src/projects/project-db-persistence.integration.spec.ts#persists the public create/draft/complete path across a Nest restart without a workspace project tree",
      "src/projects/project-db-persistence.integration.spec.ts#D2-A2-1: keeps metadata, chapter ensure, AI pending and outline commands replayable",
      "src/projects/project-db-persistence.integration.spec.ts#A2-2: legacy destructive routes are retired with modern replacements",
    ],
    blocker: null,
  },
  {
    id: "outline_story_storyboard_preflight",
    ownerModule: "projects/versioning",
    readStatus: "implemented",
    writeStatus: "implemented",
    restartCovered: true,
    requiredForActivate: true,
    evidenceTestIds: [
      "src/projects/project-db-persistence.integration.spec.ts#executes G2 Script working copy/publish/replay/restart through the DB repository",
      "src/projects/project-db-persistence.integration.spec.ts#executes G2 Story pending/update/confirm/discard/replay with projections",
      "src/projects/project-db-persistence.integration.spec.ts#executes G2 Storyboard pending/stable-shot/confirm/retire with projections",
      "src/projects/project-db-persistence.integration.spec.ts#builds and confirms a DB Preflight revision, then marks it stale after a new Storyboard current",
    ],
    blocker: null,
  },
  {
    id: "character_scene_asset_candidate_lock",
    ownerModule: "projects/character-asset-candidate",
    readStatus: "implemented",
    writeStatus: "implemented",
    restartCovered: true,
    requiredForActivate: true,
    evidenceTestIds: [
      "src/projects/seven-stage.characterization.integration.spec.ts#缺少主角定稿图时阻断 preflight 和图片任务，无角色缺口时确认并激活候选阶段",
      "src/projects/image-candidate.contract.integration.spec.ts#从服务端预览生成同一规格，并把候选、资产、任务证据和比例异常一起持久化",
      "src/projects/project-db-persistence.integration.spec.ts#P5-CHAR-DELETE-01: deletes a DB character reference by intent and persists an asset.delete Outbox event",
      "src/projects/project-db-persistence.integration.spec.ts#P8-OTB-03/OTB-FS-02: asset.delete verifies the exact owner, path and content hash before unlink",
    ],
    blocker: null,
  },
  {
    id: "layout_export",
    ownerModule: "projects/layout-export",
    readStatus: "implemented",
    writeStatus: "implemented",
    restartCovered: true,
    requiredForActivate: true,
    evidenceTestIds: [
      "src/projects/project-db-persistence.integration.spec.ts#P6-LAYOUT-EXPORT-01: DB layout/export/package and replay",
    ],
    blocker: null,
  },
  {
    id: "dialogue_pending_runtime",
    ownerModule: "dialogue/runtime",
    readStatus: "implemented",
    writeStatus: "implemented",
    restartCovered: true,
    requiredForActivate: true,
    evidenceTestIds: [
      "src/projects/project-db-persistence.integration.spec.ts#P7-DIALOGUE-DB-01: persists dialogue thread/messages/tool results/pending artifact/session and fences restart/maintenance/deleting",
    ],
    blocker: null,
  },
  {
    id: "task_create_claim_complete_cancel_recover",
    ownerModule: "tasks/persistent-task-repository",
    readStatus: "implemented",
    writeStatus: "implemented",
    restartCovered: true,
    requiredForActivate: true,
    evidenceTestIds: [
      "src/projects/project-db-persistence.integration.spec.ts#persists task source projection, claim fencing, retry, finish and expired-lease recovery",
    ],
    blocker: null,
  },
  {
    id: "settings_credential_secret_store",
    ownerModule: "settings/secret-store",
    readStatus: "implemented",
    writeStatus: "implemented",
    restartCovered: true,
    requiredForActivate: true,
    evidenceTestIds: [
      "src/settings/settings.service.spec.ts#SEC-08 reloads image metadata and secret after a service restart while text key stays OpenCode-owned",
      "src/settings/macos-keychain-secret-store.spec.ts#KEY-01/02 exercises the production adapter through an injected fake security executor",
      "src/migration/credential-redactor.spec.ts#SEC-10 scans DB and workspace fixture bytes for secret sentinels",
    ],
    blocker: null,
  },
  {
    id: "project_delete_outbox",
    ownerModule: "projects/delete-outbox",
    readStatus: "implemented",
    writeStatus: "implemented",
    restartCovered: true,
    requiredForActivate: true,
    evidenceTestIds: [
      "src/projects/project-db-persistence.integration.spec.ts#P8-OTB-01/DEL-00: persists an idempotent project.delete_files intent, resumes it after a Nest restart, removes the exact project root, and purges DB facts",
      "src/projects/project-db-persistence.integration.spec.ts#P8-OTB-02/OTB-FS-01: rejects unknown payload fields and leaves the event terminal",
      "src/projects/project-db-persistence.integration.spec.ts#P8-OTB-05: heartbeats and recovers an expired Outbox lease with bounded retry backoff",
      "src/projects/project-db-persistence.integration.spec.ts#P8-OTB-04/SEC-11/ACT-archive: deletes an old fake secret reference and archives metadata without asset bytes",
    ],
    blocker: null,
  },
];

/**
 * 操作级门禁清单。
 *
 * 这些操作都来自 `assertDatabaseOperationSupported()` 调用点，不能因为
 * 同一聚合 capability 的内部 repository 已经可写，就把公开 Service 入口
 * 误报为已完成。每个已开放门禁都必须同时具备 DB 集成测试证据；其余
 * 门禁保持 unsupported，直到对应切片补齐并添加稳定测试证据。
 */
const operations: DbCapabilityOperation[] = [
  {
    operation: "update_project_draft",
    capabilityId: "project_chapter_script",
    ownerModule: "projects/project-repository",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.updateProjectDraft",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#D2-A2-1: keeps metadata, chapter ensure, AI pending and outline commands replayable"],
  },
  {
    operation: "extract_characters",
    capabilityId: "character_scene_asset_candidate_lock",
    ownerModule: "projects/character-asset-candidate",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.extractProjectCharacters",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#P4-CHAR-02: extracts character identity into DB without a legacy characters file"],
  },
  {
    operation: "generate_anchor_candidates",
    capabilityId: "character_scene_asset_candidate_lock",
    ownerModule: "projects/character-asset-candidate",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.generateAnchorCandidates",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: [
      "src/projects/character-reference.service.spec.ts#默认生成 3 张候选,seed 互不相同,并发出图",
      "src/projects/character-reference.service.spec.ts#count 钳制:0→3,7→6,2→2",
      "src/projects/character-reference.service.spec.ts#资产行落库(role=character_anchor_candidate,metadata 含 characterId/kind/seed),status=ready",
    ],
  },
  {
    operation: "update_character",
    capabilityId: "character_scene_asset_candidate_lock",
    ownerModule: "projects/character-asset-candidate",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.updateProjectCharacter",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#P4-CHAR-01: updates character identity in DB without workspace writes"],
  },
  {
    operation: "queue_scene_reference",
    capabilityId: "character_scene_asset_candidate_lock",
    ownerModule: "projects/character-asset-candidate",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.queueSceneReference",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#P4-SCENE-01: queues a DB scene reference with chapter-scene source freeze and replay"],
  },
  {
    operation: "queue_character_reference",
    capabilityId: "character_scene_asset_candidate_lock",
    ownerModule: "projects/character-asset-candidate",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.queueCharacterReference",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#P4-CHAR-03: queues a DB character reference task with frozen source"],
  },
  {
    operation: "confirm_character_preview",
    capabilityId: "character_scene_asset_candidate_lock",
    ownerModule: "projects/character-asset-candidate",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.confirmCharacterPreview",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#P4-CHAR-06: confirms a DB preview visual and preserves final queue boundary"],
  },
  {
    operation: "confirm_character_reference",
    capabilityId: "character_scene_asset_candidate_lock",
    ownerModule: "projects/character-asset-candidate",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.confirmCharacterReference",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#P4-CHAR-07: confirms a DB final visual without workspace writes"],
  },
  {
    operation: "confirm_anchor",
    capabilityId: "character_scene_asset_candidate_lock",
    ownerModule: "projects/character-asset-candidate",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.confirmAnchor",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: [
      "src/projects/character-reference.service.spec.ts#校验通过后写入 anchorAssetId 并返回更新后的角色",
      "src/projects/character-reference.service.spec.ts#资产不存在抛 ASSET_NOT_FOUND",
      "src/projects/character-reference.service.spec.ts#资产不属于该角色(其他角色候选)抛 ASSET_NOT_FOUND",
    ],
  },
  {
    operation: "delete_character_reference",
    capabilityId: "character_scene_asset_candidate_lock",
    ownerModule: "projects/character-asset-candidate",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.deleteCharacterReference",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#P5-CHAR-DELETE-01: creates an idempotent asset.delete intent after detaching a character visual", "src/projects/project-db-persistence.integration.spec.ts#P8-OTB-03/OTB-FS-02: processes the exact asset.delete path with hash fencing"],
  },
  {
    operation: "clear_chapter_script",
    capabilityId: "project_chapter_script",
    ownerModule: "projects/project-repository",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.clearChapterScript",
    readStatus: "not_applicable",
    writeStatus: "retired",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#A2-2: legacy destructive routes are retired with modern replacements"],
    retirementReason: "Whole-tree legacy clear is replaced by observed-CAS Working Copy clear.",
    replacement: "DELETE /api/projects/{projectId}/chapters/{chapterId}/script/working-copy",
  },
  {
    operation: "confirm_chapter_pending_source",
    capabilityId: "project_chapter_script",
    ownerModule: "projects/project-repository",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.confirmChapterPendingSource",
    readStatus: "not_applicable",
    writeStatus: "retired",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#A2-2: legacy destructive routes are retired with modern replacements"],
    retirementReason: "Legacy pending source has been replaced by G2 pending suggestion adopt with CAS.",
    replacement: "POST /api/projects/{projectId}/chapters/{chapterId}/script/pending-suggestion/adopt",
  },
  {
    operation: "discard_chapter_pending_source",
    capabilityId: "project_chapter_script",
    ownerModule: "projects/project-repository",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.discardChapterPendingSource",
    readStatus: "not_applicable",
    writeStatus: "retired",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#A2-2: legacy destructive routes are retired with modern replacements"],
    retirementReason: "Legacy pending source has been replaced by G2 pending suggestion discard with CAS.",
    replacement: "DELETE /api/projects/{projectId}/chapters/{chapterId}/script/pending-suggestion",
  },
  {
    operation: "write_chapter_draft_from_ai",
    capabilityId: "project_chapter_script",
    ownerModule: "projects/project-repository",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.writeChapterDraftFromAI",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#D2-A2-1: keeps metadata, chapter ensure, AI pending and outline commands replayable"],
  },
  {
    operation: "save_script_outline_from_ai",
    capabilityId: "outline_story_storyboard_preflight",
    ownerModule: "projects/versioning",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.saveScriptOutlineFromAI",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#D2-A2-1: keeps metadata, chapter ensure, AI pending and outline commands replayable"],
  },
  {
    operation: "confirm_script_outline",
    capabilityId: "outline_story_storyboard_preflight",
    ownerModule: "projects/versioning",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.confirmScriptOutline",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#D2-A2-1: keeps metadata, chapter ensure, AI pending and outline commands replayable"],
  },
  {
    operation: "confirm_story_structure",
    capabilityId: "outline_story_storyboard_preflight",
    ownerModule: "projects/versioning",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.confirmChapterStoryStructure",
    readStatus: "not_applicable",
    writeStatus: "retired",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#A3-1: legacy story/storyboard/preflight writes are retired with G2 replacements"],
    retirementReason: "Legacy structure write would bypass StoryVersion CAS and projection transaction.",
    replacement: "POST/PATCH /api/projects/{projectId}/chapters/{chapterId}/story-structure/working-copy then POST .../confirm",
  },
  {
    operation: "update_story_structure",
    capabilityId: "outline_story_storyboard_preflight",
    ownerModule: "projects/versioning",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.updateChapterStoryStructure",
    readStatus: "not_applicable",
    writeStatus: "retired",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#A3-1: legacy story/storyboard/preflight writes are retired with G2 replacements"],
    retirementReason: "Legacy structure mutation would overwrite a confirmed document outside versioned CAS.",
    replacement: "PATCH /api/projects/{projectId}/chapters/{chapterId}/story-structure/working-copy with observed rowVersion",
  },
  {
    operation: "confirm_image_preflight",
    capabilityId: "outline_story_storyboard_preflight",
    ownerModule: "projects/versioning",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.confirmChapterImagePreflight",
    readStatus: "not_applicable",
    writeStatus: "retired",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#A3-1: legacy story/storyboard/preflight writes are retired with G2 replacements"],
    retirementReason: "Legacy preflight confirmation cannot carry the observed storyboard source digest and server-built readiness gate.",
    replacement: "GET /api/projects/{projectId}/chapters/{chapterId}/image-preflight/preview then POST .../image-preflight/confirm",
  },
  {
    operation: "resolve_image_preflight_character",
    capabilityId: "outline_story_storyboard_preflight",
    ownerModule: "projects/versioning",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.resolveImagePreflightCharacter",
    readStatus: "not_applicable",
    writeStatus: "retired",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#A3-1: legacy story/storyboard/preflight writes are retired with G2 replacements"],
    retirementReason: "Character/Visual DB writes belong to the Character/Asset capability and must not be fabricated by Preflight.",
    replacement: "Resolve the unresolved token through the Character/Asset DB capability, then rebuild Preflight preview",
  },
  {
    operation: "generation_task_create",
    capabilityId: "task_create_claim_complete_cancel_recover",
    ownerModule: "tasks/persistent-task-repository",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.guardGenerationTaskCreate",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: [
      "src/projects/project-db-persistence.integration.spec.ts#creates shot prompt/image tasks through the DB guard and records late candidates as historical",
    ],
  },
  {
    operation: "save_pending_storyboard",
    capabilityId: "outline_story_storyboard_preflight",
    ownerModule: "projects/versioning",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.savePendingChapterStoryboard",
    readStatus: "not_applicable",
    writeStatus: "retired",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#A3-1: legacy story/storyboard/preflight writes are retired with G2 replacements"],
    retirementReason: "Legacy storyboard pending write bypasses StoryboardVersion projection and CAS.",
    replacement: "POST/PATCH /api/projects/{projectId}/chapters/{chapterId}/storyboard/working-copy",
  },
  {
    operation: "confirm_storyboard",
    capabilityId: "outline_story_storyboard_preflight",
    ownerModule: "projects/versioning",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.confirmChapterStoryboard",
    readStatus: "not_applicable",
    writeStatus: "retired",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#A3-1: legacy story/storyboard/preflight writes are retired with G2 replacements"],
    retirementReason: "Legacy storyboard confirmation cannot prove observed pending/current/source versions.",
    replacement: "POST /api/projects/{projectId}/chapters/{chapterId}/storyboard/working-copy/confirm",
  },
  {
    operation: "update_storyboard",
    capabilityId: "outline_story_storyboard_preflight",
    ownerModule: "projects/versioning",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.updateChapterStoryboard",
    readStatus: "not_applicable",
    writeStatus: "retired",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#A3-1: legacy story/storyboard/preflight writes are retired with G2 replacements"],
    retirementReason: "Legacy storyboard update would mutate a confirmed document in place and hide stale downstream state.",
    replacement: "PATCH /api/projects/{projectId}/chapters/{chapterId}/storyboard/working-copy with observed rowVersion",
  },
  {
    operation: "complete_chapter_images",
    capabilityId: "character_scene_asset_candidate_lock",
    ownerModule: "projects/character-asset-candidate",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.completeChapterImages",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#P4-IMAGES-01: completes a DB chapter after every shot has a current CandidateLockRevision"],
  },
  {
    operation: "build_layout",
    capabilityId: "layout_export",
    ownerModule: "projects/layout-export",
    sourceFile: "apps/server/src/projects/layout-working-copy.service.ts",
    sourceSymbol: "LayoutWorkingCopyService.initialize",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#P6-LAYOUT-EXPORT-01: initializes an idempotent formal DB LayoutWorkingCopy from current locks and assets"],
    replacement: "PUT /api/projects/{projectId}/chapters/{chapterId}/layout/working-copy/initialize",
  },
  {
    operation: "export_layout",
    capabilityId: "layout_export",
    ownerModule: "projects/layout-export",
    sourceFile: "apps/server/src/projects/layout-publication.service.ts",
    sourceSymbol: "LayoutPublicationService.create",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#G5-M7: seals a formal LayoutRevision and materializes deterministic publication artifacts"],
    replacement: "POST /api/projects/{projectId}/chapters/{chapterId}/layout/publications",
  },
  {
    operation: "export_asset_package",
    capabilityId: "layout_export",
    ownerModule: "projects/layout-export",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.exportAssetPackage",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#P6-LAYOUT-EXPORT-01: exports a DB-derived package with ready archive artifact and replay"],
  },
  {
    operation: "delete_project",
    capabilityId: "project_delete_outbox",
    ownerModule: "projects/delete-outbox",
    sourceFile: "apps/server/src/projects/projects.service.ts",
    sourceSymbol: "ProjectsService.deleteProject",
    readStatus: "not_applicable",
    writeStatus: "implemented",
    evidenceTestIds: ["src/projects/project-db-persistence.integration.spec.ts#P8-OTB-01/DEL-00: resumes the persisted project.delete_files intent after restart and purges only after the processed file event"],
  },
];

function cloneEntry(entry: DbCapabilityEntry): DbCapabilityEntry {
  return { ...entry, evidenceTestIds: [...entry.evidenceTestIds] };
}

function cloneOperation(operation: DbCapabilityOperation): DbCapabilityOperation {
  return { ...operation, evidenceTestIds: [...operation.evidenceTestIds] };
}

export function getDbCapabilityRegistry(): DbCapabilityEntry[] {
  return entries.map(cloneEntry);
}

export function getDbCapabilityOperations(): DbCapabilityOperation[] {
  return operations.map(cloneOperation);
}

function hasBlockedOperation(
  entry: DbCapabilityEntry,
  operationRegistry: readonly DbCapabilityOperation[],
): boolean {
  return operationRegistry
    .filter((operation) => operation.capabilityId === entry.id)
    .some((operation) => !["implemented", "retired"].includes(operation.writeStatus)
      || operation.evidenceTestIds.length === 0);
}

export function getBlockedDbCapabilities(
  registry: readonly DbCapabilityEntry[] = entries,
  operationRegistry: readonly DbCapabilityOperation[] = operations,
): DbCapabilityEntry[] {
  return registry
    .filter((entry) => entry.requiredForActivate)
    .filter((entry) => entry.readStatus !== "implemented"
      || entry.writeStatus !== "implemented"
      || !entry.restartCovered
      || entry.evidenceTestIds.length === 0
      || hasBlockedOperation(entry, operationRegistry))
    .map(cloneEntry);
}

export function assertDbCapabilityOperations(
  operationRegistry: readonly DbCapabilityOperation[],
  registry: readonly DbCapabilityEntry[] = entries,
): void {
  const capabilityIds = new Set(registry.map((entry) => entry.id));
  const operationIds = new Set<string>();
  for (const operation of operationRegistry) {
    if (!operation.operation || operationIds.has(operation.operation)
      || !capabilityIds.has(operation.capabilityId)
      || !operation.ownerModule
      || !operation.sourceFile
      || !operation.sourceSymbol
      || !["implemented", "partial", "unsupported", "not_applicable"].includes(operation.readStatus)
      || !["implemented", "partial", "unsupported", "retired"].includes(operation.writeStatus)) {
      throw new Error("DB_CAPABILITIES_OPERATION_REGISTRY_INVALID");
    }
    operationIds.add(operation.operation);
    if (!Array.isArray(operation.evidenceTestIds)
      || operation.evidenceTestIds.some((testId) => typeof testId !== "string" || !testId.includes("#"))) {
      throw new Error("DB_CAPABILITIES_OPERATION_EVIDENCE_INVALID");
    }
    if ((operation.writeStatus === "implemented" || operation.writeStatus === "partial" || operation.writeStatus === "retired")
      && operation.evidenceTestIds.length === 0) {
      throw new Error("DB_CAPABILITIES_OPERATION_EVIDENCE_MISSING");
    }
    if (operation.writeStatus === "retired" && (!operation.retirementReason || !operation.replacement)) {
      throw new Error("DB_CAPABILITIES_RETIRED_OPERATION_METADATA_MISSING");
    }
  }
}

export function assertDbCapabilityRegistry(
  registry: readonly DbCapabilityEntry[],
): void {
  const ids = new Set<string>();
  for (const entry of registry) {
    if (!entry.id || ids.has(entry.id)) throw new Error("DB_CAPABILITIES_REGISTRY_INVALID");
    ids.add(entry.id);
    if (!entry.ownerModule || !["implemented", "partial", "unsupported"].includes(entry.readStatus)
      || !["implemented", "partial", "unsupported"].includes(entry.writeStatus)) {
      throw new Error("DB_CAPABILITIES_REGISTRY_INVALID");
    }
    if (!Array.isArray(entry.evidenceTestIds)
      || entry.evidenceTestIds.some((testId) => typeof testId !== "string" || !testId.includes("#"))) {
      throw new Error("DB_CAPABILITIES_REGISTRY_INVALID");
    }
    if ((entry.readStatus === "implemented" || entry.writeStatus === "implemented")
      && entry.evidenceTestIds.length === 0) {
      throw new Error("DB_CAPABILITIES_EVIDENCE_MISSING");
    }
  }
  assertDbCapabilityOperations(operations, registry);
}

assertDbCapabilityRegistry(entries);
