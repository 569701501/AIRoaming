export type CapabilityStatus = "implemented" | "partial" | "unsupported";

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

const entries: DbCapabilityEntry[] = [
  {
    id: "project_chapter_script",
    ownerModule: "projects/project-repository",
    readStatus: "implemented",
    writeStatus: "partial",
    restartCovered: true,
    requiredForActivate: true,
    evidenceTestIds: [
      "src/projects/project-db-persistence.integration.spec.ts#persists the public create/draft/complete path across a Nest restart without a workspace project tree",
    ],
    blocker: "DB mode still blocks reset/import/clear and other public write paths.",
  },
  {
    id: "outline_story_storyboard_preflight",
    ownerModule: "projects/versioning",
    readStatus: "implemented",
    writeStatus: "partial",
    restartCovered: true,
    requiredForActivate: true,
    evidenceTestIds: [
      "src/projects/project-db-persistence.integration.spec.ts#executes G2 Script working copy/publish/replay/restart through the DB repository",
      "src/projects/project-db-persistence.integration.spec.ts#executes G2 Story pending/update/confirm/discard/replay with projections",
      "src/projects/project-db-persistence.integration.spec.ts#executes G2 Storyboard pending/stable-shot/confirm/retire with projections",
      "src/projects/project-db-persistence.integration.spec.ts#builds and confirms a DB Preflight revision, then marks it stale after a new Storyboard current",
    ],
    blocker: "Several public edit and confirmation paths remain behind DB capability gates.",
  },
  {
    id: "character_scene_asset_candidate_lock",
    ownerModule: "projects/character-asset-candidate",
    readStatus: "implemented",
    writeStatus: "partial",
    restartCovered: true,
    requiredForActivate: true,
    evidenceTestIds: [
      "src/projects/seven-stage.characterization.integration.spec.ts#缺少主角定稿图时阻断 preflight 和图片任务，无角色缺口时确认并激活候选阶段",
      "src/projects/image-candidate.contract.integration.spec.ts#从服务端预览生成同一规格，并把候选、资产、任务证据和比例异常一起持久化",
    ],
    blocker: "Character/scene reference and candidate lock public writes are not fully DB-backed.",
  },
  {
    id: "layout_export",
    ownerModule: "projects/layout-export",
    readStatus: "partial",
    writeStatus: "unsupported",
    restartCovered: false,
    requiredForActivate: true,
    evidenceTestIds: [],
    blocker: "Only the legacy LayoutWorkingCopy read model is available; build/export/package writes remain blocked.",
  },
  {
    id: "dialogue_pending_runtime",
    ownerModule: "dialogue/runtime",
    readStatus: "unsupported",
    writeStatus: "unsupported",
    restartCovered: false,
    requiredForActivate: true,
    evidenceTestIds: [],
    blocker: "Dialogue runtime still uses file/process state; imported pending tables are not the runtime fact source.",
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
    readStatus: "unsupported",
    writeStatus: "unsupported",
    restartCovered: false,
    requiredForActivate: true,
    evidenceTestIds: [],
    blocker: "SettingsService still reads and writes app-settings.json; no SecretStore runtime exists.",
  },
  {
    id: "project_delete_outbox",
    ownerModule: "projects/delete-outbox",
    readStatus: "unsupported",
    writeStatus: "unsupported",
    restartCovered: false,
    requiredForActivate: true,
    evidenceTestIds: [],
    blocker: "DB-mode project deletion remains blocked and no outbox deletion workflow is wired to the public API.",
  },
];

function cloneEntry(entry: DbCapabilityEntry): DbCapabilityEntry {
  return { ...entry, evidenceTestIds: [...entry.evidenceTestIds] };
}

export function getDbCapabilityRegistry(): DbCapabilityEntry[] {
  return entries.map(cloneEntry);
}

export function getBlockedDbCapabilities(
  registry: readonly DbCapabilityEntry[] = entries,
): DbCapabilityEntry[] {
  return registry
    .filter((entry) => entry.requiredForActivate)
    .filter((entry) => entry.readStatus !== "implemented"
      || entry.writeStatus !== "implemented"
      || !entry.restartCovered
      || entry.evidenceTestIds.length === 0)
    .map(cloneEntry);
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
}

assertDbCapabilityRegistry(entries);
