import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertLayoutRevisionV2PublicationSqlShape,
  LAYOUT_REVISION_V2_PUBLICATION_MIGRATION_NAME,
  LAYOUT_REVISION_V2_PUBLICATION_TRIGGER_NAMES,
  readLayoutRevisionV2PublicationSql,
} from "./layout-revision-v2-publication-contract.js";
import { SCRIPT_WORKFLOW_RUNTIME_MIGRATION_NAMES } from "./script-workflow-runtime-migration-ledger.js";

type DatabaseSync = InstanceType<typeof NodeDatabaseSync>;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const migrationRoot = path.join(repoRoot, "apps/server/prisma/migrations");
const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;
const digestC = `sha256:${"c".repeat(64)}`;
const timestamp = "2026-07-24T00:00:00.000Z";

function document(schemaVersion: 1 | 2): Record<string, unknown> {
  return {
    schemaVersion,
    kind: schemaVersion === 1 ? "layout_document_v1" : "layout_document_v2",
    projectId: "project_v2_revision",
    chapterId: "chapter_v2_revision",
    comicFormat: "vertical_scroll",
    profile: { kind: "vertical_strip" },
    fontPolicy: {},
    canvases: [],
    ...(schemaVersion === 2
      ? {
          automation: {
            policyVersion: "layout_automation_v1",
            composition: {
              compositionDigest: digestC,
              compositionPolicyVersion: "layout_composition_v1",
              storyboardVersionId: "storyboard_v2_revision",
              storyboardDigest: digestA,
              sourceLockSetDigest: digestC,
              visualAnalysisSetDigest: null,
              mode: "rule_fallback",
            },
            dialogueBindings: [],
            protections: [],
          },
        }
      : {}),
  };
}

function seedScope(database: DatabaseSync): void {
  database.prepare(`
    INSERT INTO "projects"
      ("id", "name", "type", "lifecycle_status", "genre_tags", "comic_format",
       "row_version", "updated_at")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "project_v2_revision",
    "V2 正式版本",
    "comic",
    "active",
    "[]",
    "vertical_scroll",
    0,
    timestamp,
  );
  database.prepare(`
    INSERT INTO "chapters"
      ("id", "project_id", "slug", "order", "title", "milestone_status",
       "script_working_text", "script_working_digest", "script_working_state",
       "row_version", "updated_at")
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "chapter_v2_revision",
    "project_v2_revision",
    "chapter-v2-revision",
    1,
    "第一章",
    "draft",
    "",
    digestA,
    "empty",
    0,
    timestamp,
  );
}

describe("LayoutRevision V2 publication migration", () => {
  it("preserves historical V1 and seals an immutable V2 revision with a separate visible digest", async () => {
    expect(LAYOUT_REVISION_V2_PUBLICATION_MIGRATION_NAME)
      .toBe("0019_layout_revision_v2_publication");
    const sql = await readLayoutRevisionV2PublicationSql(migrationRoot);
    assertLayoutRevisionV2PublicationSqlShape(sql);

    const database: DatabaseSync = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON;");
    for (const migrationName of SCRIPT_WORKFLOW_RUNTIME_MIGRATION_NAMES.slice(0, -1)) {
      database.exec(await readFile(
        path.join(migrationRoot, migrationName, "migration.sql"),
        "utf8",
      ));
    }
    seedScope(database);
    database.prepare(`
      INSERT INTO "layout_revisions"
        ("id", "project_id", "chapter_id", "revision", "document_json",
         "schema_version", "document_digest", "source_lock_set_digest",
         "origin", "save_reason", "created_at")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "layout_revision_v1",
      "project_v2_revision",
      "chapter_v2_revision",
      1,
      JSON.stringify(document(1)),
      1,
      digestA,
      digestC,
      "runtime",
      "user_checkpoint",
      timestamp,
    );
    database.prepare(`
      UPDATE "layout_revisions"
      SET "binding_set_sealed_at" = ?
      WHERE "id" = ?
    `).run(timestamp, "layout_revision_v1");
    database.prepare(`
      UPDATE "chapters"
      SET "current_layout_revision_id" = ?, "row_version" = "row_version" + 1
      WHERE "id" = ?
    `).run("layout_revision_v1", "chapter_v2_revision");
    const before = database.prepare(`
      SELECT "document_json", "document_digest"
      FROM "layout_revisions"
      WHERE "id" = ?
    `).get("layout_revision_v1");

    database.exec(sql);
    expect(database.prepare(`
      SELECT "document_json", "document_digest", "visible_document_digest"
      FROM "layout_revisions"
      WHERE "id" = ?
    `).get("layout_revision_v1")).toEqual({
      ...before,
      visible_document_digest: null,
    });
    expect(database.prepare(`
      SELECT "name"
      FROM "sqlite_master"
      WHERE "type" = 'trigger'
        AND "name" IN (${LAYOUT_REVISION_V2_PUBLICATION_TRIGGER_NAMES.map(() => "?").join(",")})
      ORDER BY "name"
    `).all(...LAYOUT_REVISION_V2_PUBLICATION_TRIGGER_NAMES).map((row) => String(row.name)))
      .toEqual([...LAYOUT_REVISION_V2_PUBLICATION_TRIGGER_NAMES].sort());

    database.prepare(`
      INSERT INTO "layout_revisions"
        ("id", "project_id", "chapter_id", "revision", "previous_revision_id",
         "content_based_on_revision_id", "document_json", "schema_version",
         "document_digest", "visible_document_digest", "source_lock_set_digest",
         "origin", "save_reason", "created_at")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "layout_revision_v2",
      "project_v2_revision",
      "chapter_v2_revision",
      2,
      "layout_revision_v1",
      "layout_revision_v1",
      JSON.stringify(document(2)),
      2,
      digestB,
      digestA,
      digestC,
      "runtime",
      "user_checkpoint",
      "2026-07-24T00:01:00.000Z",
    );
    expect(() => database.prepare(`
      UPDATE "layout_revisions"
      SET "binding_set_sealed_at" = ?
      WHERE "id" = ?
    `).run(
      "2026-07-24T00:01:00.000Z",
      "layout_revision_v2",
    )).not.toThrow();
    expect(database.prepare(`
      SELECT "schema_version", "document_digest", "visible_document_digest",
             "binding_set_sealed_at"
      FROM "layout_revisions"
      WHERE "id" = ?
    `).get("layout_revision_v2")).toEqual({
      schema_version: 2,
      document_digest: digestB,
      visible_document_digest: digestA,
      binding_set_sealed_at: "2026-07-24T00:01:00.000Z",
    });

    expect(() => database.prepare(`
      UPDATE "layout_revisions"
      SET "visible_document_digest" = ?
      WHERE "id" = ?
    `).run(digestC, "layout_revision_v2"))
      .toThrow(/trg_layout_revisions_immutable_update/);

    expect(() => database.prepare(`
      INSERT INTO "layout_revisions"
        ("id", "project_id", "chapter_id", "revision", "previous_revision_id",
         "document_json", "schema_version", "document_digest",
         "visible_document_digest", "source_lock_set_digest", "origin",
         "save_reason", "created_at")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "layout_revision_bad",
      "project_v2_revision",
      "chapter_v2_revision",
      3,
      "layout_revision_v2",
      JSON.stringify(document(1)),
      2,
      digestC,
      digestA,
      digestC,
      "runtime",
      "user_checkpoint",
      "2026-07-24T00:02:00.000Z",
    )).toThrow(/LAYOUT_REVISION_DOCUMENT_INVALID/);

    const missingComposition = document(2);
    delete (missingComposition.automation as Record<string, unknown>).composition;
    expect(() => database.prepare(`
      INSERT INTO "layout_revisions"
        ("id", "project_id", "chapter_id", "revision", "previous_revision_id",
         "document_json", "schema_version", "document_digest",
         "visible_document_digest", "source_lock_set_digest", "origin",
         "save_reason", "created_at")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "layout_revision_missing_composition",
      "project_v2_revision",
      "chapter_v2_revision",
      3,
      "layout_revision_v2",
      JSON.stringify(missingComposition),
      2,
      digestC,
      digestA,
      digestC,
      "runtime",
      "user_checkpoint",
      "2026-07-24T00:03:00.000Z",
    )).toThrow(/LAYOUT_REVISION_DOCUMENT_INVALID/);
    const nullComposition = document(2);
    (nullComposition.automation as Record<string, unknown>).composition = null;
    expect(() => database.prepare(`
      INSERT INTO "layout_revisions"
        ("id", "project_id", "chapter_id", "revision", "previous_revision_id",
         "document_json", "schema_version", "document_digest",
         "visible_document_digest", "source_lock_set_digest", "origin",
         "save_reason", "created_at")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "layout_revision_null_composition",
      "project_v2_revision",
      "chapter_v2_revision",
      3,
      "layout_revision_v2",
      JSON.stringify(nullComposition),
      2,
      digestC,
      digestA,
      digestC,
      "runtime",
      "user_checkpoint",
      "2026-07-24T00:04:00.000Z",
    )).toThrow(/LAYOUT_REVISION_DOCUMENT_INVALID/);
    expect(database.prepare("PRAGMA integrity_check").get()).toEqual({
      integrity_check: "ok",
    });
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });

  it("keeps an in-flight V1 publication finishable without rewriting its historical digests", async () => {
    const sql = await readLayoutRevisionV2PublicationSql(migrationRoot);
    const database: DatabaseSync = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON;");
    for (const migrationName of SCRIPT_WORKFLOW_RUNTIME_MIGRATION_NAMES.slice(0, -1)) {
      database.exec(await readFile(
        path.join(migrationRoot, migrationName, "migration.sql"),
        "utf8",
      ));
    }
    seedScope(database);
    database.prepare(`
      INSERT INTO "layout_revisions"
        ("id", "project_id", "chapter_id", "revision", "document_json",
         "schema_version", "document_digest", "source_lock_set_digest",
         "origin", "save_reason", "created_at")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "layout_revision_legacy_inflight",
      "project_v2_revision",
      "chapter_v2_revision",
      1,
      JSON.stringify(document(1)),
      1,
      digestA,
      digestC,
      "runtime",
      "user_checkpoint",
      timestamp,
    );
    database.prepare(`
      UPDATE "layout_revisions"
      SET "binding_set_sealed_at" = ?
      WHERE "id" = ?
    `).run(timestamp, "layout_revision_legacy_inflight");
    database.prepare(`
      UPDATE "chapters"
      SET "current_layout_revision_id" = ?, "row_version" = "row_version" + 1
      WHERE "id" = ?
    `).run("layout_revision_legacy_inflight", "chapter_v2_revision");

    const taskInput = {
      schemaVersion: 1,
      requestId: "legacy-inflight-request",
      exportRevisionId: "export_legacy_inflight",
      layoutRevisionId: "layout_revision_legacy_inflight",
      documentDigest: digestA,
      sourceLockSetDigest: digestC,
      profile: {
        schemaVersion: 1,
        kind: "vertical_publication",
        outputScale: 1,
        maxSliceHeightPx: 4096,
        cutPolicy: "prefer_section_boundary_then_exact",
        includeLongPng: false,
      },
      profileDigest: digestB,
      preflightDigest: digestC,
      renderer: { rendererVersion: "legacy-renderer-v1" },
      assetManifest: { schemaVersion: 1, images: [], fonts: [] },
      sourceProjection: {
        schemaVersion: 1,
        policyVersion: "layout-publication-source-v1",
        projectId: "project_v2_revision",
        chapterId: "chapter_v2_revision",
        consumerType: "layout_export",
        sources: [{
          role: "layout_revision",
          order: 1,
          sourceType: "layout_revision",
          sourceId: "layout_revision_legacy_inflight",
          sourceDigest: digestA,
        }],
      },
    };
    database.prepare(`
      INSERT INTO "generation_tasks"
        ("id", "project_id", "chapter_id", "type", "record_kind",
         "provenance_status", "status", "phase", "progress_percent",
         "target_type", "target_id", "input_json", "input_schema_version",
         "input_digest", "source_digest", "source_set_sealed_at",
         "idempotency_key", "concurrency_key", "attempt", "max_attempts",
         "retry_disabled", "needs_review", "created_at", "updated_at")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "task_legacy_inflight",
      "project_v2_revision",
      "chapter_v2_revision",
      "layout_export",
      "runtime",
      "complete",
      "queued",
      "queued",
      0,
      "export",
      "export_legacy_inflight",
      JSON.stringify(taskInput),
      1,
      digestA,
      digestC,
      null,
      "legacy-inflight-request",
      "layout-render",
      0,
      2,
      0,
      0,
      timestamp,
      timestamp,
    );
    database.prepare(`
      INSERT INTO "generation_task_sources"
        ("id", "task_id", "role", "order", "source_type", "source_id", "source_digest")
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      "source_legacy_inflight",
      "task_legacy_inflight",
      "layout_revision",
      1,
      "layout_revision",
      "layout_revision_legacy_inflight",
      digestA,
    );
    database.prepare(`
      UPDATE "generation_tasks"
      SET "source_set_sealed_at" = ?, "updated_at" = ?
      WHERE "id" = ?
    `).run(timestamp, timestamp, "task_legacy_inflight");
    database.prepare(`
      INSERT INTO "export_revisions"
        ("id", "project_id", "chapter_id", "scope_key", "revision", "kind",
         "status", "task_id", "layout_revision_id", "source_lock_set_digest",
         "profile_json", "profile_schema_version", "profile_digest",
         "preflight_digest", "renderer_version", "origin", "created_at")
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "export_legacy_inflight",
      "project_v2_revision",
      "chapter_v2_revision",
      "chapter:chapter_v2_revision",
      1,
      "layout_publication",
      "queued",
      "task_legacy_inflight",
      "layout_revision_legacy_inflight",
      digestC,
      JSON.stringify(taskInput.profile),
      1,
      digestB,
      digestC,
      "legacy-renderer-v1",
      "runtime",
      timestamp,
    );

    database.exec(sql);
    expect(database.prepare(`
      SELECT "revision_document_digest", "visible_document_digest"
      FROM "export_revisions"
      WHERE "id" = ?
    `).get("export_legacy_inflight")).toEqual({
      revision_document_digest: null,
      visible_document_digest: null,
    });

    database.prepare(`
      INSERT INTO "task_concurrency_slots"
        ("id", "concurrency_key", "slot_no", "updated_at")
      VALUES (?, ?, ?, ?)
    `).run("slot_legacy_inflight", "layout-render", 1, timestamp);
    database.prepare(`
      UPDATE "generation_tasks"
      SET "status" = 'running',
          "phase" = 'validate_input',
          "progress_percent" = 5,
          "attempt" = 1,
          "lease_owner_id" = 'worker-legacy',
          "lease_token" = 'claim-legacy',
          "heartbeat_at" = ?,
          "lease_expires_at" = ?,
          "started_at" = ?,
          "updated_at" = ?
      WHERE "id" = ?
    `).run(
      "2026-07-24T00:10:00.000Z",
      "2026-07-24T00:15:00.000Z",
      "2026-07-24T00:10:00.000Z",
      "2026-07-24T00:10:00.000Z",
      "task_legacy_inflight",
    );
    database.prepare(`
      UPDATE "export_revisions"
      SET "status" = 'rendering'
      WHERE "id" = ?
    `).run("export_legacy_inflight");

    for (const asset of [
      {
        id: "asset_legacy_slice",
        type: "image",
        mimeType: "image/png",
        storageKey: "projects/project_v2_revision/chapters/chapter-v2-revision/exports/export_legacy_inflight/slice.png",
        sha256: digestC,
        width: 1,
        height: 1,
      },
      {
        id: "asset_legacy_manifest",
        type: "document",
        mimeType: "application/json",
        storageKey: "projects/project_v2_revision/chapters/chapter-v2-revision/exports/export_legacy_inflight/manifest.json",
        sha256: digestB,
        width: null,
        height: null,
      },
    ] as const) {
      database.prepare(`
        INSERT INTO "assets"
          ("id", "project_id", "chapter_id", "type", "role", "mime_type",
           "storage_key", "status", "sha256", "bytes", "width", "height",
           "source_task_id", "metadata_json", "metadata_schema_version",
           "metadata_digest", "created_at", "updated_at", "ready_at")
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        asset.id,
        "project_v2_revision",
        "chapter_v2_revision",
        asset.type,
        "layout_publication",
        asset.mimeType,
        asset.storageKey,
        "staged",
        null,
        null,
        asset.width,
        asset.height,
        "task_legacy_inflight",
        "{}",
        1,
        digestA,
        timestamp,
        timestamp,
        null,
      );
      database.prepare(`
        UPDATE "assets"
        SET "status" = 'ready',
            "sha256" = ?,
            "bytes" = 1,
            "ready_at" = ?,
            "updated_at" = ?
        WHERE "id" = ?
      `).run(asset.sha256, timestamp, timestamp, asset.id);
    }
    database.prepare(`
      INSERT INTO "export_artifacts"
        ("id", "export_revision_id", "asset_id", "role", "order")
      VALUES (?, ?, ?, ?, ?)
    `).run(
      "artifact_legacy_slice",
      "export_legacy_inflight",
      "asset_legacy_slice",
      "strip_slice_png",
      1,
    );
    database.prepare(`
      INSERT INTO "export_artifacts"
        ("id", "export_revision_id", "asset_id", "role", "order")
      VALUES (?, ?, ?, ?, ?)
    `).run(
      "artifact_legacy_manifest",
      "export_legacy_inflight",
      "asset_legacy_manifest",
      "publication_manifest",
      1,
    );
    const manifest = {
      schemaVersion: 1,
      kind: "layout_publication_manifest_v1",
      exportRevisionId: "export_legacy_inflight",
      layoutRevisionId: "layout_revision_legacy_inflight",
      documentDigest: digestA,
      sourceLockSetDigest: digestC,
      profileDigest: digestB,
    };
    expect(() => database.prepare(`
      UPDATE "export_revisions"
      SET "status" = 'ready',
          "manifest_json" = ?,
          "manifest_schema_version" = 1,
          "manifest_digest" = ?,
          "completion_applicability" = 'current',
          "ready_at" = ?
      WHERE "id" = ?
    `).run(
      JSON.stringify(manifest),
      digestB,
      "2026-07-24T00:12:00.000Z",
      "export_legacy_inflight",
    )).not.toThrow();
    expect(database.prepare(`
      SELECT "status", "revision_document_digest", "visible_document_digest"
      FROM "export_revisions"
      WHERE "id" = ?
    `).get("export_legacy_inflight")).toEqual({
      status: "ready",
      revision_document_digest: null,
      visible_document_digest: null,
    });
    database.close();
  });
});
