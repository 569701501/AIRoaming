import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import type {
  DatabaseSync as NodeDatabaseSync,
  SQLInputValue,
} from "node:sqlite";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  G1_SCHEMA_MANIFEST_SOURCE_PATHS,
  buildG1SchemaManifestFromSources,
  type G1SchemaManifestSourcePath,
} from "./g1-schema-manifest-source.js";

type Manifest = ReturnType<typeof buildG1SchemaManifestFromSources>;
type Row = Readonly<Record<string, SQLInputValue>>;
type Database = InstanceType<typeof NodeDatabaseSync>;

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const contractPath =
  "文档/04_方案与决策/2026-07-11_G1数据库Schema实施契约.md";
const registryPath =
  "文档/04_方案与决策/2026-07-11_G1任务与Outbox实施注册表.md";
const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
const DIGEST_C = `sha256:${"c".repeat(64)}`;

let manifest: Manifest;

beforeAll(async () => {
  const [contractMarkdown, registryMarkdown, sourceEntries] =
    await Promise.all([
      readFile(resolve(workspaceRoot, contractPath), "utf8"),
      readFile(resolve(workspaceRoot, registryPath), "utf8"),
      Promise.all(
        G1_SCHEMA_MANIFEST_SOURCE_PATHS.map(async (sourcePath) => [
          sourcePath,
          await readFile(resolve(workspaceRoot, sourcePath), "utf8"),
        ] as const),
      ),
    ]);
  manifest = buildG1SchemaManifestFromSources({
    contractMarkdown,
    registryMarkdown,
    moduleSources: Object.fromEntries(sourceEntries) as Record<
      G1SchemaManifestSourcePath,
      string
    >,
  });
  expect(manifest.completeness.ready).toBe(true);
});

const quoteIdentifier = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

const sqliteType = (type: string): string => {
  if (type === "Int" || type === "Boolean") return "INTEGER";
  if (type === "Float") return "REAL";
  if (type === "Bytes") return "BLOB";
  return "TEXT";
};

function createLooseDatabase(): Database {
  const database = new DatabaseSync(":memory:");
  for (const model of manifest.models) {
    const columns = model.fields.map(
      (field) =>
        `${quoteIdentifier(field.column)} ${sqliteType(field.type)}${
          field.primaryKey ? " PRIMARY KEY" : ""
        }`,
    );
    database.exec(
      `CREATE TABLE ${quoteIdentifier(model.table)} (${columns.join(", ")})`,
    );
  }
  return database;
}

function installTriggers(
  database: Database,
  triggerNames: readonly string[],
): void {
  for (const triggerName of triggerNames) {
    const trigger = manifest.constraints.triggers.find(
      (candidate) => candidate.name === triggerName,
    );
    if (trigger === undefined) {
      throw new Error(`Missing trigger ${triggerName}`);
    }
    database.exec(trigger.normalizedSql);
  }
}

function insert(database: Database, table: string, row: Row): void {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");
  database
    .prepare(
      `INSERT INTO ${quoteIdentifier(table)} (${columns
        .map(quoteIdentifier)
        .join(", ")}) VALUES (${placeholders})`,
    )
    .run(...Object.values(row));
}

function one(
  database: Database,
  sql: string,
  ...values: SQLInputValue[]
): Record<string, unknown> {
  const value = database.prepare(sql).get(...values);
  if (value === undefined) throw new Error("Expected one row");
  return value;
}

function expectTriggerAbort(action: () => unknown, triggerName: string): void {
  expect(action).toThrow(`AIR_G1:${triggerName}`);
}

function withDatabase(action: (database: Database) => void): void {
  const database = createLooseDatabase();
  try {
    action(database);
  } finally {
    database.close();
  }
}

const PURGE_ROOT_CASES = [
  ["chapter_script_revisions", "trg_chapter_script_revisions_purge_delete_guard"],
  ["chapter_scenes", "trg_chapter_scenes_purge_delete_guard"],
  ["scene_visuals", "trg_scene_visuals_purge_delete_guard"],
  ["shots", "trg_shots_purge_delete_guard"],
  ["characters", "trg_characters_purge_delete_guard"],
  ["character_visuals", "trg_character_visuals_purge_delete_guard"],
  ["project_context_facts", "trg_project_context_facts_purge_delete_guard"],
  ["conversation_threads", "trg_conversation_threads_purge_delete_guard"],
] as const;

const ACTIVE_DIALOGUE_DELETE_CASES = [
  [
    "conversation_messages",
    "trg_conversation_messages_terminal_immutable_delete",
    { id: "dialogue-row-1", thread_id: "thread-1", role: "assistant", status: "running" },
  ],
  [
    "dialogue_runtime_sessions",
    "trg_dialogue_runtime_sessions_terminal_immutable_delete",
    { id: "dialogue-row-1", thread_id: "thread-1", status: "active" },
  ],
  [
    "pending_dialogue_artifacts",
    "trg_pending_dialogue_artifacts_terminal_immutable_delete",
    {
      id: "dialogue-row-1",
      project_id: "project-1",
      thread_id: "thread-1",
      status: "pending",
      active_slot_key: "thread-1:artifact-kind",
    },
  ],
] as const;

function seedPurgeRoot(database: Database, table: string): void {
  if (table === "chapter_script_revisions") {
    insert(database, "chapters", { id: "chapter-1", project_id: "project-1" });
    insert(database, table, { id: "root-1", chapter_id: "chapter-1" });
    return;
  }
  if (table === "scene_visuals") {
    insert(database, "chapter_scenes", {
      id: "scene-1", project_id: "project-1", chapter_id: "chapter-1",
    });
    insert(database, table, { id: "root-1", chapter_scene_id: "scene-1" });
    return;
  }
  if (table === "character_visuals") {
    insert(database, "characters", { id: "character-1", project_id: "project-1" });
    insert(database, table, { id: "root-1", character_id: "character-1" });
    return;
  }
  insert(database, table, { id: "root-1", project_id: "project-1" });
}

describe("G1 trigger DSL real SQLite semantics", () => {
  it("creates all 44 loose authority tables and parses all 194 triggers", () => {
    withDatabase((database) => {
      installTriggers(
        database,
        manifest.constraints.triggers.map((trigger) => trigger.name),
      );
      const sqliteTriggers = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
        .all();
      expect(manifest.models).toHaveLength(44);
      expect(manifest.counts.scalarFields).toBe(556);
      expect(sqliteTriggers).toHaveLength(194);
    });
  });

  it("executes the full Outbox claim, heartbeat, recovery, reclaim, completion, and terminal-freeze lifecycle", () => {
    withDatabase((database) => {
      insert(database, "outbox_events", {
        id: "event-1",
        event_type: "project.delete_files",
        aggregate_type: "project",
        aggregate_id: "project-1",
        payload_json: "{}",
        payload_schema_version: 1,
        payload_digest: DIGEST_A,
        status: "pending",
        attempt: 0,
        max_attempts: 3,
        available_at: "2026-07-12T00:00:00.000Z",
        lease_owner_id: null,
        lease_token: null,
        lease_expires_at: null,
        last_error_json: null,
        idempotency_key: "project.delete_files:project-1:v1",
        created_at: "2026-07-12T00:00:00.000Z",
        updated_at: "2026-07-12T00:00:00.000Z",
        processed_at: null,
      });
      installTriggers(database, [
        "trg_outbox_events_intent_immutable",
        "trg_outbox_events_attempt_transition",
        "trg_outbox_events_state_transition",
        "trg_outbox_events_lease_shape",
        "trg_outbox_events_lease_fencing",
        "trg_outbox_events_processed_immutable",
      ]);

      database.exec(`UPDATE outbox_events
        SET status='processing', attempt=1,
            lease_owner_id='worker-1', lease_token='lease-1',
            lease_expires_at='2026-07-12T00:02:00.000Z',
            updated_at='2026-07-12T00:01:00.000Z'
        WHERE id='event-1'`);
      database.exec(`UPDATE outbox_events
        SET lease_expires_at='2026-07-12T00:04:00.000Z',
            updated_at='2026-07-12T00:02:00.000Z'
        WHERE id='event-1'`);
      database.exec(`UPDATE outbox_events
        SET status='pending', available_at='2026-07-12T00:04:00.000Z',
            lease_owner_id=NULL, lease_token=NULL, lease_expires_at=NULL,
            updated_at='2026-07-12T00:03:00.000Z'
        WHERE id='event-1'`);
      database.exec(`UPDATE outbox_events
        SET status='processing', attempt=2,
            lease_owner_id='worker-2', lease_token='lease-2',
            lease_expires_at='2026-07-12T00:07:00.000Z',
            updated_at='2026-07-12T00:05:00.000Z'
        WHERE id='event-1'`);
      database.exec(`UPDATE outbox_events
        SET status='processed', processed_at='2026-07-12T00:06:00.000Z',
            lease_owner_id=NULL, lease_token=NULL, lease_expires_at=NULL,
            updated_at='2026-07-12T00:06:00.000Z'
        WHERE id='event-1'`);
      expect(one(
        database,
        "SELECT status, attempt, processed_at FROM outbox_events WHERE id=?",
        "event-1",
      )).toMatchObject({
        status: "processed",
        attempt: 2,
        processed_at: "2026-07-12T00:06:00.000Z",
      });
      expectTriggerAbort(
        () =>
          database.exec(
            "UPDATE outbox_events SET updated_at='late' WHERE id='event-1'",
          ),
        "trg_outbox_events_processed_immutable",
      );
    });
  });

  function formalizeStoryboard(options: {
    readonly token: SQLInputValue;
    readonly sourceToken: string;
    readonly childCharacterId: string | null;
    readonly matchingCharacter?: string;
    readonly schemaVersion?: 1 | 2;
  }): void {
    withDatabase((database) => {
      const schemaVersion = options.schemaVersion ?? 1;
      const document = {
        schemaVersion,
        chapterId: "chapter-1",
        ...(schemaVersion === 1
          ? { sourceStoryVersionId: "story-1" }
          : {}),
        shots: [
          {
            id: "shot-1",
            order: 1,
            beatId: null,
            sceneId: null,
            characterIds: [options.token],
          },
        ],
      };
      insert(database, "storyboard_versions", {
        id: "storyboard-1",
        project_id: "project-1",
        chapter_id: "chapter-1",
        status: "pending_confirmation",
        source_story_version_id: "story-1",
        source_policy_version: 1,
        source_digest: DIGEST_A,
        document_json: JSON.stringify(document),
        schema_version: schemaVersion,
        origin: "user_edit",
        confirmed_at: null,
        archived_at: null,
      });
      insert(database, "shots", {
        id: "shot-1",
        project_id: "project-1",
        chapter_id: "chapter-1",
      });
      insert(database, "storyboard_shot_projections", {
        id: "projection-1",
        storyboard_version_id: "storyboard-1",
        shot_id: "shot-1",
        order: 1,
        story_beat_projection_id: null,
        chapter_scene_id: null,
      });
      if (options.matchingCharacter !== undefined) {
        insert(database, "characters", {
          id: options.matchingCharacter,
          project_id: "project-1",
        });
      }
      insert(database, "storyboard_shot_characters", {
        id: "shot-character-1",
        storyboard_shot_projection_id: "projection-1",
        order: 1,
        source_token: options.sourceToken,
        character_id: options.childCharacterId,
      });
      installTriggers(database, ["trg_storyboard_versions_formalize_guard"]);
      database.exec(`UPDATE storyboard_versions
        SET status='confirmed', confirmed_at='2026-07-12T00:00:00.000Z'
        WHERE id='storyboard-1'`);
    });
  }

  it("uses json_each.type and rejects a non-string Storyboard character token", () => {
    expect(() =>
      formalizeStoryboard({
        token: 7,
        sourceToken: "7",
        childCharacterId: null,
      }),
    ).toThrow("AIR_G1:trg_storyboard_versions_formalize_guard");
  });

  it("requires an exact Character binding when a V1 token resolves", () => {
    expect(() =>
      formalizeStoryboard({
        token: "character-1",
        sourceToken: "character-1",
        childCharacterId: null,
        matchingCharacter: "character-1",
      }),
    ).toThrow("AIR_G1:trg_storyboard_versions_formalize_guard");
    expect(() =>
      formalizeStoryboard({
        token: "character-1",
        sourceToken: "character-1",
        childCharacterId: "character-1",
        matchingCharacter: "character-1",
      }),
    ).not.toThrow();
  });

  it("allows only an unresolved V1 token to stay null and rejects it for V2", () => {
    expect(() =>
      formalizeStoryboard({
        token: "legacy-role-name",
        sourceToken: "legacy-role-name",
        childCharacterId: null,
      }),
    ).not.toThrow();
    expect(() =>
      formalizeStoryboard({
        token: "legacy-role-name",
        sourceToken: "legacy-role-name",
        childCharacterId: null,
        schemaVersion: 2,
      }),
    ).toThrow("AIR_G1:trg_storyboard_versions_formalize_guard");
  });

  it("accepts an empty Storyboard characterIds array with zero child rows", () => {
    withDatabase((database) => {
      insert(database, "storyboard_versions", {
        id: "storyboard-1",
        project_id: "project-1",
        chapter_id: "chapter-1",
        status: "pending_confirmation",
        source_story_version_id: "story-1",
        source_policy_version: 1,
        source_digest: DIGEST_A,
        document_json: JSON.stringify({
          schemaVersion: 1,
          chapterId: "chapter-1",
          sourceStoryVersionId: "story-1",
          shots: [{
            id: "shot-1",
            order: 1,
            beatId: null,
            sceneId: null,
            characterIds: [],
          }],
        }),
        schema_version: 1,
        origin: "user_edit",
        confirmed_at: null,
        archived_at: null,
      });
      insert(database, "shots", {
        id: "shot-1",
        project_id: "project-1",
        chapter_id: "chapter-1",
      });
      insert(database, "storyboard_shot_projections", {
        id: "projection-1",
        storyboard_version_id: "storyboard-1",
        shot_id: "shot-1",
        order: 1,
        story_beat_projection_id: null,
        chapter_scene_id: null,
      });
      installTriggers(database, ["trg_storyboard_versions_formalize_guard"]);
      expect(() => database.exec(`UPDATE storyboard_versions
        SET status='confirmed', confirmed_at='2026-07-12T00:00:00.000Z'
        WHERE id='storyboard-1'`)).not.toThrow();
    });
  });

  it.each([
    "story_scene_projection",
    "story_beat_projection",
    "storyboard_shot_projection",
    "storyboard_shot_character",
    "export_artifact",
  ] as const)("rejects sealed child reparenting: %s", (kind) => {
    withDatabase((database) => {
      if (kind === "story_scene_projection") {
        insert(database, "story_versions", {
          id: "story-1", project_id: "project-1", chapter_id: "chapter-1",
        });
        insert(database, "story_versions", {
          id: "story-2", project_id: "project-1", chapter_id: "chapter-1",
        });
        insert(database, "chapter_scenes", {
          id: "scene-1", project_id: "project-1", chapter_id: "chapter-1",
        });
        insert(database, "story_scene_projections", {
          id: "projection-1", story_version_id: "story-1",
          chapter_scene_id: "scene-1",
        });
        installTriggers(database, ["trg_story_scene_projections_scope_update"]);
        expectTriggerAbort(
          () => database.exec(
            "UPDATE story_scene_projections SET story_version_id='story-2' WHERE id='projection-1'",
          ),
          "trg_story_scene_projections_scope_update",
        );
        return;
      }
      if (kind === "story_beat_projection") {
        insert(database, "story_versions", {
          id: "story-1", project_id: "project-1", chapter_id: "chapter-1",
        });
        insert(database, "story_versions", {
          id: "story-2", project_id: "project-1", chapter_id: "chapter-1",
        });
        insert(database, "story_beat_projections", {
          id: "beat-1", story_version_id: "story-1", chapter_scene_id: null,
        });
        installTriggers(database, ["trg_story_beat_projections_scope_update"]);
        expectTriggerAbort(
          () => database.exec(
            "UPDATE story_beat_projections SET story_version_id='story-2' WHERE id='beat-1'",
          ),
          "trg_story_beat_projections_scope_update",
        );
        return;
      }
      if (kind === "storyboard_shot_projection") {
        insert(database, "storyboard_versions", {
          id: "storyboard-1", project_id: "project-1", chapter_id: "chapter-1",
        });
        insert(database, "storyboard_versions", {
          id: "storyboard-2", project_id: "project-1", chapter_id: "chapter-1",
        });
        insert(database, "shots", {
          id: "shot-1", project_id: "project-1", chapter_id: "chapter-1",
        });
        insert(database, "storyboard_shot_projections", {
          id: "projection-1", storyboard_version_id: "storyboard-1",
          shot_id: "shot-1", story_beat_projection_id: null,
          chapter_scene_id: null,
        });
        installTriggers(database, ["trg_storyboard_shot_projections_scope_update"]);
        expectTriggerAbort(
          () => database.exec(
            "UPDATE storyboard_shot_projections SET storyboard_version_id='storyboard-2' WHERE id='projection-1'",
          ),
          "trg_storyboard_shot_projections_scope_update",
        );
        return;
      }
      if (kind === "storyboard_shot_character") {
        insert(database, "storyboard_shot_projections", {
          id: "projection-1", storyboard_version_id: "storyboard-1",
        });
        insert(database, "storyboard_shot_projections", {
          id: "projection-2", storyboard_version_id: "storyboard-1",
        });
        insert(database, "storyboard_shot_characters", {
          id: "character-row-1",
          storyboard_shot_projection_id: "projection-1",
          character_id: null,
        });
        installTriggers(database, ["trg_storyboard_shot_characters_scope_update"]);
        expectTriggerAbort(
          () => database.exec(
            "UPDATE storyboard_shot_characters SET storyboard_shot_projection_id='projection-2' WHERE id='character-row-1'",
          ),
          "trg_storyboard_shot_characters_scope_update",
        );
        return;
      }

      insert(database, "export_revisions", {
        id: "export-1", project_id: "project-1", chapter_id: "chapter-1",
      });
      insert(database, "export_revisions", {
        id: "export-2", project_id: "project-1", chapter_id: "chapter-1",
      });
      insert(database, "assets", {
        id: "asset-1", project_id: "project-1", chapter_id: "chapter-1",
      });
      insert(database, "export_artifacts", {
        id: "artifact-1", export_revision_id: "export-1", asset_id: "asset-1",
      });
      installTriggers(database, ["trg_export_artifacts_scope_update"]);
      expectTriggerAbort(
        () => database.exec(
          "UPDATE export_artifacts SET export_revision_id='export-2' WHERE id='artifact-1'",
        ),
        "trg_export_artifacts_scope_update",
      );
    });
  });

  function sealLayout(
    document: unknown,
    bindings: readonly Row[] = [],
  ): void {
    withDatabase((database) => {
      insert(database, "layout_revisions", {
        id: "layout-1",
        project_id: "project-1",
        chapter_id: "chapter-1",
        document_json: JSON.stringify(document),
        binding_set_sealed_at: null,
      });
      for (const binding of bindings) {
        insert(database, "layout_source_bindings", binding);
      }
      installTriggers(database, ["trg_layout_revisions_binding_set_seal"]);
      database.exec(`UPDATE layout_revisions
        SET binding_set_sealed_at='2026-07-12T00:00:00.000Z'
        WHERE id='layout-1'`);
    });
  }

  it("requires canvases/elements arrays but permits a sealed pure-text Layout", () => {
    expect(() =>
      sealLayout({ schemaVersion: 1, kind: "layout_document_v1" }),
    ).toThrow("AIR_G1:trg_layout_revisions_binding_set_seal");
    expect(() =>
      sealLayout({
        schemaVersion: 1,
        kind: "layout_document_v1",
        canvases: [{ elements: null }],
      }),
    ).toThrow("AIR_G1:trg_layout_revisions_binding_set_seal");
    expect(() =>
      sealLayout({
        schemaVersion: 1,
        kind: "layout_document_v1",
        canvases: [{ elements: [{ id: "text-1", type: "text" }] }],
      }),
    ).not.toThrow();
  });

  it("rejects partial source-backed Layout and complete legacy null provenance", () => {
    expect(() =>
      sealLayout({
        schemaVersion: 1,
        kind: "layout_document_v1",
        canvases: [
          {
            elements: [
              {
                id: "image-1",
                type: "free_image",
                source: { assetId: "asset-1", sourceDigest: DIGEST_A },
              },
            ],
          },
        ],
      }),
    ).toThrow("AIR_G1:trg_layout_revisions_binding_set_seal");

    const legacyBinding = {
      elementId: "legacy-image-1",
      role: "candidate_image",
      order: 1,
      shotId: null,
      candidateId: null,
      candidateLockRevisionId: null,
      assetId: null,
      sourceDigest: DIGEST_A,
    };
    expect(() =>
      sealLayout(
        {
          schemaVersion: 1,
          kind: "legacy_chapter_layout_v1",
          sourceResolution: "complete",
          sourceBindings: [legacyBinding],
        },
        [
          {
            id: "binding-1",
            layout_revision_id: "layout-1",
            element_id: legacyBinding.elementId,
            role: legacyBinding.role,
            order: legacyBinding.order,
            shot_id: null,
            candidate_id: null,
            candidate_lock_revision_id: null,
            asset_id: null,
            source_digest: DIGEST_A,
          },
        ],
      ),
    ).toThrow("AIR_G1:trg_layout_revisions_binding_set_seal");
  });

  it("seals a complete source-backed Layout projection and binding set", () => {
    const source = {
      shotId: "shot-1",
      candidateId: "candidate-1",
      candidateLockRevisionId: "lock-1",
      assetId: "asset-1",
      sourceDigest: DIGEST_A,
    };
    expect(() =>
      sealLayout(
        {
          schemaVersion: 1,
          kind: "layout_document_v1",
          canvases: [{
            elements: [{
              id: "image-1",
              type: "free_image",
              source,
            }],
          }],
        },
        [{
          id: "binding-1",
          layout_revision_id: "layout-1",
          element_id: "image-1",
          role: "candidate_image",
          order: 1,
          shot_id: source.shotId,
          candidate_id: source.candidateId,
          candidate_lock_revision_id: source.candidateLockRevisionId,
          asset_id: source.assetId,
          source_digest: source.sourceDigest,
        }],
      ),
    ).not.toThrow();
  });

  it("requires Layout Candidate/Lock/Asset to be one provenance chain", () => {
    withDatabase((database) => {
      insert(database, "layout_revisions", {
        id: "layout-1", project_id: "project-1", chapter_id: "chapter-1",
        binding_set_sealed_at: null,
      });
      insert(database, "shots", {
        id: "shot-1", project_id: "project-1", chapter_id: "chapter-1",
      });
      insert(database, "assets", {
        id: "asset-a", project_id: "project-1", chapter_id: "chapter-1",
        status: "ready", sha256: DIGEST_A,
      });
      insert(database, "assets", {
        id: "asset-b", project_id: "project-1", chapter_id: "chapter-1",
        status: "ready", sha256: DIGEST_A,
      });
      insert(database, "candidates", {
        id: "candidate-1", project_id: "project-1", chapter_id: "chapter-1",
        shot_id: "shot-1", asset_id: "asset-a",
      });
      insert(database, "candidate_lock_revisions", {
        id: "lock-1", project_id: "project-1", chapter_id: "chapter-1",
        shot_id: "shot-1", candidate_id: "candidate-1", action: "lock",
      });
      installTriggers(database, ["trg_layout_source_bindings_scope_insert"]);

      const binding = {
        id: "binding-1",
        layout_revision_id: "layout-1",
        element_id: "image-1",
        role: "candidate_image",
        order: 1,
        shot_id: "shot-1",
        candidate_id: "candidate-1",
        candidate_lock_revision_id: "lock-1",
        source_digest: DIGEST_A,
      } as const;
      expectTriggerAbort(
        () => insert(database, "layout_source_bindings", {
          ...binding,
          asset_id: "asset-b",
        }),
        "trg_layout_source_bindings_scope_insert",
      );
      expect(() => insert(database, "layout_source_bindings", {
        ...binding,
        asset_id: "asset-a",
      })).not.toThrow();
    });
  });

  function finishTask(options: {
    readonly projectStatus: "active" | "deleting";
    readonly attempt: number;
    readonly maxAttempts: number;
    readonly outcome: "succeeded" | "failed" | "interrupted";
    readonly nextRunAt: string | null;
  }): Record<string, unknown> {
    let result: Record<string, unknown> = {};
    withDatabase((database) => {
      insert(database, "projects", {
        id: "project-1", lifecycle_status: options.projectStatus,
      });
      insert(database, "generation_tasks", {
        id: "task-1",
        project_id: "project-1",
        record_kind: "runtime",
        status: "running",
        attempt: options.attempt,
        max_attempts: options.maxAttempts,
        next_run_at: options.nextRunAt,
        lease_owner_id: "worker-1",
        lease_token: "claim-1",
        lease_expires_at: "2026-07-12T00:10:00.000Z",
        heartbeat_at: "2026-07-12T00:00:00.000Z",
        concurrency_key: null,
        cancel_requested_at: null,
        finished_at: null,
        updated_at: "2026-07-12T00:00:00.000Z",
      });
      insert(database, "task_attempts", {
        id: "attempt-1",
        task_id: "task-1",
        attempt_no: options.attempt,
        worker_id: "worker-1",
        claim_token: "claim-1",
        outcome: null,
        error_json: null,
        error_schema_version: null,
        finished_at: null,
      });
      installTriggers(database, [
        "trg_task_attempts_finish_validate",
        "trg_task_attempts_finish_materialize",
      ]);
      database
        .prepare(`UPDATE task_attempts
          SET outcome=?, finished_at='2026-07-12T00:01:00.000Z',
              error_json=?, error_schema_version=?
          WHERE id='attempt-1'`)
        .run(
          options.outcome,
          options.outcome === "succeeded" ? null : '{"code":"TRANSIENT_IO"}',
          options.outcome === "succeeded" ? null : 1,
        );
      result = one(
        database,
        "SELECT status, finished_at, next_run_at, lease_token FROM generation_tasks WHERE id='task-1'",
      );
    });
    return result;
  }

  it("never materializes Task succeeded after its Project starts deleting", () => {
    expect(
      finishTask({
        projectStatus: "deleting",
        attempt: 1,
        maxAttempts: 3,
        outcome: "succeeded",
        nextRunAt: null,
      }),
    ).toMatchObject({
      status: "failed",
      finished_at: "2026-07-12T00:01:00.000Z",
      next_run_at: null,
      lease_token: null,
    });
  });

  it("uses maxAttempts as total attempts and clears final nextRunAt", () => {
    expect(
      finishTask({
        projectStatus: "active",
        attempt: 1,
        maxAttempts: 3,
        outcome: "failed",
        nextRunAt: "2026-07-12T00:05:00.000Z",
      }),
    ).toMatchObject({ status: "retrying", finished_at: null });
    expect(
      finishTask({
        projectStatus: "active",
        attempt: 3,
        maxAttempts: 3,
        outcome: "failed",
        nextRunAt: "2026-07-12T00:05:00.000Z",
      }),
    ).toMatchObject({
      status: "failed",
      finished_at: "2026-07-12T00:01:00.000Z",
      next_run_at: null,
    });
  });

  const migrationVerification = (
    overrides: Readonly<Record<string, unknown>> = {},
  ): string =>
    JSON.stringify({
      integrityCheck: "ok",
      foreignKeyViolationCount: 0,
      failedLedgerCount: 0,
      migrationChecksumStatus: "verified",
      effectiveSchemaManifestDigest: DIGEST_A,
      sourceManifestDigest: DIGEST_A,
      openBlockerCount: 0,
      ...overrides,
    });

  function succeedFinalMigration(verificationJson: string): void {
    withDatabase((database) => {
      insert(database, "migration_runs", {
        id: "run-1",
        kind: "final",
        status: "running",
        source_manifest_digest: DIGEST_A,
        snapshot_manifest_digest: null,
        decisions_digest: null,
        report_digest: null,
        counts_json: null,
        counts_schema_version: null,
        verification_json: null,
        verification_schema_version: null,
        finished_at: null,
      });
      installTriggers(database, ["trg_migration_runs_state_transition"]);
      database
        .prepare(`UPDATE migration_runs SET
          status='succeeded', finished_at='2026-07-12T00:00:00.000Z',
          snapshot_manifest_digest=?, decisions_digest=?, report_digest=?,
          counts_json='{}', counts_schema_version=1,
          verification_json=?, verification_schema_version=1
          WHERE id='run-1'`)
        .run(DIGEST_A, DIGEST_A, DIGEST_A, verificationJson);
    });
  }

  it("requires a strict lowercase effective Schema digest on final migration success", () => {
    const missingEffective = JSON.parse(migrationVerification()) as Record<
      string,
      unknown
    >;
    delete missingEffective.effectiveSchemaManifestDigest;
    expect(() => succeedFinalMigration(JSON.stringify(missingEffective)))
      .toThrow("AIR_G1:trg_migration_runs_state_transition");
    expect(() =>
      succeedFinalMigration(
        migrationVerification({
          effectiveSchemaManifestDigest: `sha256:${"A".repeat(64)}`,
        }),
      ),
    ).toThrow("AIR_G1:trg_migration_runs_state_transition");
    expect(() =>
      succeedFinalMigration(
        migrationVerification({ sourceManifestDigest: DIGEST_B }),
      ),
    ).toThrow("AIR_G1:trg_migration_runs_state_transition");
    expect(() => succeedFinalMigration(migrationVerification())).not.toThrow();
  });

  it("binds activation to separate source and effective manifest identities", () => {
    withDatabase((database) => {
      insert(database, "migration_runs", {
        id: "run-1",
        kind: "final",
        status: "succeeded",
        source_manifest_digest: DIGEST_A,
        verification_json: migrationVerification({
          effectiveSchemaManifestDigest: DIGEST_B,
        }),
      });
      insert(database, "persistence_states", {
        id: "primary",
        storage_contract_version: 1,
        activation_state: "shadow",
        cutover_run_id: null,
        source_manifest_digest: null,
        effective_schema_manifest_digest: null,
        activated_at: null,
        first_business_write_at: null,
      });
      installTriggers(database, [
        "trg_persistence_states_cutover_run_update",
        "trg_persistence_states_activation_transition",
        "trg_persistence_states_activation_first_write",
        "trg_persistence_states_activation_identity_immutable",
      ]);

      expectTriggerAbort(
        () => database
          .prepare(`UPDATE persistence_states SET
            activation_state='ready_for_activation', cutover_run_id='run-1',
            source_manifest_digest=?, effective_schema_manifest_digest=?
            WHERE id='primary'`)
          .run(DIGEST_C, DIGEST_B),
        "trg_persistence_states_cutover_run_update",
      );
      expectTriggerAbort(
        () => database
          .prepare(`UPDATE persistence_states SET
            activation_state='ready_for_activation', cutover_run_id='run-1',
            source_manifest_digest=?, effective_schema_manifest_digest=?
            WHERE id='primary'`)
          .run(DIGEST_A, DIGEST_C),
        "trg_persistence_states_cutover_run_update",
      );
      database
        .prepare(`UPDATE persistence_states SET
          activation_state='ready_for_activation', cutover_run_id='run-1',
          source_manifest_digest=?, effective_schema_manifest_digest=?
          WHERE id='primary'`)
        .run(DIGEST_A, DIGEST_B);
      database.exec(`UPDATE persistence_states SET
        activation_state='db_only', activated_at='2026-07-12T00:00:00.000Z'
        WHERE id='primary'`);
      expectTriggerAbort(
        () => database.prepare(
          "UPDATE persistence_states SET effective_schema_manifest_digest=? WHERE id='primary'",
        ).run(DIGEST_C),
        "trg_persistence_states_activation_identity_immutable",
      );
    });
  });

  it("accepts only the two exact recovery identity shapes", () => {
    const activationShape = manifest.constraints.checks.find(
      (check) => check.name === "ck_persistence_states_activation_shape",
    );
    expect(activationShape).toBeDefined();
    const database = new DatabaseSync(":memory:");
    try {
      database.exec(`CREATE TABLE state_shape (
        activation_state TEXT,
        cutover_run_id TEXT,
        source_manifest_digest TEXT,
        effective_schema_manifest_digest TEXT,
        activated_at TEXT,
        first_business_write_at TEXT,
        CHECK (${activationShape?.normalizedExpression ?? "0"})
      )`);
      const addShape = (
        state: string,
        cutover: string | null,
        source: string | null,
        effective: string | null,
        activated: string | null,
        firstWrite: string | null,
      ): void => {
        database.prepare(
          "INSERT INTO state_shape VALUES (?, ?, ?, ?, ?, ?)",
        ).run(state, cutover, source, effective, activated, firstWrite);
      };
      expect(() => addShape(
        "recovery_required", null, null, null, null, null,
      )).not.toThrow();
      expect(() => addShape(
        "recovery_required", "run-1", DIGEST_A, DIGEST_B, null, null,
      )).not.toThrow();
      expect(() => addShape(
        "recovery_required", "run-1", DIGEST_A, DIGEST_B,
        "2026-07-12T00:00:00.000Z", "2026-07-12T00:01:00.000Z",
      )).not.toThrow();
      expect(() => addShape(
        "recovery_required", "run-1", DIGEST_A, null, null, null,
      )).toThrow();
      expect(() => addShape(
        "recovery_required", null, null, null,
        "2026-07-12T00:00:00.000Z", null,
      )).toThrow();
    } finally {
      database.close();
    }
  });

  it.each(PURGE_ROOT_CASES)(
    "guards active empty root and permits coordinated purge: %s",
    (table, triggerName) => {
      withDatabase((database) => {
        insert(database, "projects", {
          id: "project-1", lifecycle_status: "active",
        });
        seedPurgeRoot(database, table);
        installTriggers(database, [triggerName]);
        expectTriggerAbort(
          () => database.exec(
            `DELETE FROM ${quoteIdentifier(table)} WHERE id='root-1'`,
          ),
          triggerName,
        );

        database.exec(
          "UPDATE projects SET lifecycle_status='deleting' WHERE id='project-1'",
        );
        insert(database, "outbox_events", {
          id: "delete-event-1",
          event_type: "project.delete_files",
          aggregate_type: "project",
          aggregate_id: "project-1",
          status: "processed",
        });
        expect(() => database.exec(
          `DELETE FROM ${quoteIdentifier(table)} WHERE id='root-1'`,
        )).not.toThrow();
      });
    },
  );

  it("requires all three database purge facts even when a cascade root has children", () => {
    withDatabase((database) => {
      insert(database, "projects", {
        id: "project-1", lifecycle_status: "active",
      });
      seedPurgeRoot(database, "conversation_threads");
      insert(database, "conversation_messages", {
        id: "message-1", thread_id: "root-1", status: "running",
      });
      installTriggers(database, ["trg_conversation_threads_purge_delete_guard"]);
      expectTriggerAbort(
        () => database.exec(
          "DELETE FROM conversation_threads WHERE id='root-1'",
        ),
        "trg_conversation_threads_purge_delete_guard",
      );

      database.exec(
        "UPDATE projects SET lifecycle_status='deleting' WHERE id='project-1'",
      );
      expectTriggerAbort(
        () => database.exec(
          "DELETE FROM conversation_threads WHERE id='root-1'",
        ),
        "trg_conversation_threads_purge_delete_guard",
      );
      insert(database, "outbox_events", {
        id: "delete-event-1",
        event_type: "project.delete_files",
        aggregate_type: "project",
        aggregate_id: "project-1",
        status: "processed",
      });
      insert(database, "generation_tasks", {
        id: "task-1", project_id: "project-1",
        record_kind: "runtime", status: "queued",
      });
      expectTriggerAbort(
        () => database.exec(
          "DELETE FROM conversation_threads WHERE id='root-1'",
        ),
        "trg_conversation_threads_purge_delete_guard",
      );
      database.exec("UPDATE generation_tasks SET status='failed' WHERE id='task-1'");
      expect(() => database.exec(
        "DELETE FROM conversation_threads WHERE id='root-1'",
      )).not.toThrow();
    });
  });

  it.each(ACTIVE_DIALOGUE_DELETE_CASES)(
    "blocks active dialogue DELETE until the complete coordinated purge: %s",
    (table, triggerName, row) => {
      withDatabase((database) => {
        insert(database, "projects", {
          id: "project-1",
          lifecycle_status: "active",
        });
        insert(database, "conversation_threads", {
          id: "thread-1",
          project_id: "project-1",
        });
        insert(database, table, row);
        installTriggers(database, [triggerName]);

        const trigger = manifest.constraints.triggers.find(
          (candidate) => candidate.name === triggerName,
        );
        expect(trigger?.normalizedWhen).toBe("1");
        expectTriggerAbort(
          () => database.exec(
            `DELETE FROM ${quoteIdentifier(table)} WHERE id='dialogue-row-1'`,
          ),
          triggerName,
        );
        expect(one(
          database,
          `SELECT count(*) AS count FROM ${quoteIdentifier(table)} WHERE id=?`,
          "dialogue-row-1",
        )).toMatchObject({ count: 1 });
        if (table === "pending_dialogue_artifacts") {
          expect(one(
            database,
            "SELECT active_slot_key FROM pending_dialogue_artifacts WHERE id=?",
            "dialogue-row-1",
          )).toMatchObject({ active_slot_key: "thread-1:artifact-kind" });
        }

        database.exec(
          "UPDATE projects SET lifecycle_status='deleting' WHERE id='project-1'",
        );
        expectTriggerAbort(
          () => database.exec(
            `DELETE FROM ${quoteIdentifier(table)} WHERE id='dialogue-row-1'`,
          ),
          triggerName,
        );
        insert(database, "outbox_events", {
          id: "delete-event-1",
          event_type: "project.delete_files",
          aggregate_type: "project",
          aggregate_id: "project-1",
          status: "processed",
        });
        insert(database, "generation_tasks", {
          id: "task-1",
          project_id: "project-1",
          record_kind: "runtime",
          status: "queued",
        });
        expectTriggerAbort(
          () => database.exec(
            `DELETE FROM ${quoteIdentifier(table)} WHERE id='dialogue-row-1'`,
          ),
          triggerName,
        );
        database.exec(
          "UPDATE generation_tasks SET status='failed' WHERE id='task-1'",
        );
        expect(() => database.exec(
          `DELETE FROM ${quoteIdentifier(table)} WHERE id='dialogue-row-1'`,
        )).not.toThrow();
      });
    },
  );

  it.each(["configured", "rotating", "error"] as const)(
    "rejects Credential clearing rollback/jump to %s",
    (nextStatus) => {
      withDatabase((database) => {
        insert(database, "credential_metadata", {
          id: "credential-1",
          owner: "image_secret_store",
          status: "clearing",
          configured: 1,
          secret_ref: "airoaming:image:v1:00000000-0000-4000-8000-000000000000",
          fingerprint: DIGEST_A,
        });
        insert(database, "outbox_events", {
          id: "secret-event-1",
          event_type: "secret.delete_old_ref",
          aggregate_type: "credential_metadata",
          aggregate_id: "credential-1",
          status: "processed",
          payload_json: JSON.stringify({
            oldSecretRef:
              "airoaming:image:v1:00000000-0000-4000-8000-000000000000",
          }),
        });
        installTriggers(database, ["trg_credential_metadata_status_transition"]);
        expectTriggerAbort(
          () => database.prepare(
            "UPDATE credential_metadata SET status=? WHERE id='credential-1'",
          ).run(nextStatus),
          "trg_credential_metadata_status_transition",
        );
      });
    },
  );

  it("allows Credential clearing only to processed-evidence unconfigured shape", () => {
    withDatabase((database) => {
      const oldRef =
        "airoaming:image:v1:00000000-0000-4000-8000-000000000000";
      insert(database, "credential_metadata", {
        id: "credential-1",
        owner: "image_secret_store",
        status: "clearing",
        configured: 1,
        secret_ref: oldRef,
        fingerprint: DIGEST_A,
      });
      insert(database, "outbox_events", {
        id: "secret-event-1",
        event_type: "secret.delete_old_ref",
        aggregate_type: "credential_metadata",
        aggregate_id: "credential-1",
        status: "processed",
        payload_json: JSON.stringify({ oldSecretRef: oldRef }),
      });
      installTriggers(database, ["trg_credential_metadata_status_transition"]);
      expectTriggerAbort(
        () => database.exec(`UPDATE credential_metadata
          SET status='unconfigured' WHERE id='credential-1'`),
        "trg_credential_metadata_status_transition",
      );
      database.exec(`UPDATE credential_metadata
        SET status='unconfigured', configured=0, secret_ref=NULL, fingerprint=NULL
        WHERE id='credential-1'`);
      expect(one(
        database,
        "SELECT status, configured, secret_ref, fingerprint FROM credential_metadata WHERE id='credential-1'",
      )).toMatchObject({
        status: "unconfigured", configured: 0, secret_ref: null, fingerprint: null,
      });
    });
  });
});
