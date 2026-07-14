import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertG4CandidateLockOverlaySqlShape,
  G4_CANDIDATE_LOCK_INDEX_NAMES,
  G4_CANDIDATE_LOCK_TRIGGER_NAMES,
  readG4CandidateLockOverlaySql,
} from "./g4-candidate-lock-overlay-contract.js";

type DatabaseSync = InstanceType<typeof NodeDatabaseSync>;
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  readonly DatabaseSync: typeof NodeDatabaseSync;
};

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const migrationRoot = path.join(repoRoot, "apps/server/prisma/migrations");
const priorMigrations = [
  "0001_persistence_and_migration",
  "0002_project_chapter_script",
  "0003_story_storyboard_preflight",
  "0004_character_asset_candidate",
  "0005_dialogue_settings_secret_metadata",
  "0006_generation_task_worker",
  "0007_layout_export_outbox",
  "0008_sqlite_checks_triggers_indexes",
  "0009_g2_version_freshness_overlay",
  "0010_g3_comic_format_immutable",
  "0011_g2_project_purge_pointer_teardown",
] as const;

function createSemanticDatabase(sql: string): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE "projects" (
      "id" TEXT PRIMARY KEY,
      "lifecycle_status" TEXT NOT NULL
    );
    CREATE TABLE "shots" (
      "id" TEXT PRIMARY KEY,
      "project_id" TEXT NOT NULL,
      "chapter_id" TEXT NOT NULL,
      "current_candidate_lock_revision_id" TEXT,
      "updated_at" TEXT NOT NULL
    );
    CREATE TABLE "candidates" (
      "id" TEXT PRIMARY KEY,
      "project_id" TEXT NOT NULL,
      "chapter_id" TEXT NOT NULL,
      "shot_id" TEXT NOT NULL,
      "status" TEXT NOT NULL
    );
    CREATE TABLE "candidate_lock_revisions" (
      "id" TEXT PRIMARY KEY,
      "project_id" TEXT NOT NULL,
      "chapter_id" TEXT NOT NULL,
      "shot_id" TEXT NOT NULL,
      "revision" INTEGER NOT NULL,
      "action" TEXT NOT NULL,
      "candidate_id" TEXT,
      "previous_revision_id" TEXT,
      "origin" TEXT NOT NULL,
      "reason" TEXT,
      "decided_at" TEXT,
      "recorded_at" TEXT NOT NULL
    );
    CREATE TABLE "outbox_events" (
      "id" TEXT PRIMARY KEY,
      "event_type" TEXT NOT NULL,
      "aggregate_type" TEXT NOT NULL,
      "aggregate_id" TEXT NOT NULL,
      "status" TEXT NOT NULL
    );
    CREATE TABLE "generation_tasks" (
      "id" TEXT PRIMARY KEY,
      "project_id" TEXT NOT NULL,
      "record_kind" TEXT NOT NULL,
      "status" TEXT NOT NULL
    );
    CREATE TRIGGER "trg_shots_current_lock_scope_insert"
    BEFORE INSERT ON "shots" WHEN 0 BEGIN SELECT 1; END;
    CREATE TRIGGER "trg_shots_current_lock_scope_update"
    BEFORE UPDATE ON "shots" WHEN 0 BEGIN SELECT 1; END;
  `);
  database.exec(sql);
  return database;
}

function insertRevision(
  database: DatabaseSync,
  input: {
    id: string;
    revision: number;
    action: "lock" | "replace" | "clear";
    candidateId: string | null;
    previousRevisionId: string | null;
  },
  shotId = "shot_a",
): void {
  database
    .prepare(`
      INSERT INTO "candidate_lock_revisions" (
        "id", "project_id", "chapter_id", "shot_id", "revision",
        "action", "candidate_id", "previous_revision_id", "origin",
        "reason", "decided_at", "recorded_at"
      ) VALUES (?, 'project_a', 'chapter_a', ?, ?, ?, ?, ?, 'runtime', NULL,
        '2026-07-14T00:00:00.000Z', '2026-07-14T00:00:00.000Z')
    `)
    .run(
      input.id,
      shotId,
      input.revision,
      input.action,
      input.candidateId,
      input.previousRevisionId,
    );
}

describe("G4 candidate lock linear-history overlay", () => {
  it("DB-01/DB-21 deploys the fixed overlay on the complete prior release", async () => {
    const sql = await readG4CandidateLockOverlaySql(migrationRoot);
    assertG4CandidateLockOverlaySqlShape(sql);

    const database = new DatabaseSync(":memory:");
    for (const name of priorMigrations) {
      database.exec(
        await readFile(path.join(migrationRoot, name, "migration.sql"), "utf8"),
      );
    }
    database.exec(sql);

    const g4Indexes = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'uq_g4_%' ORDER BY name",
      )
      .all()
      .map((row) => String(row.name));
    const g4Triggers = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_g4_%' ORDER BY name",
      )
      .all()
      .map((row) => String(row.name));

    expect(g4Indexes).toEqual([...G4_CANDIDATE_LOCK_INDEX_NAMES]);
    expect(g4Triggers).toEqual([...G4_CANDIDATE_LOCK_TRIGGER_NAMES]);
    expect(
      database.prepare("PRAGMA integrity_check").get(),
    ).toEqual({ integrity_check: "ok" });
    expect(database.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    database.close();
  });

  it("DB-02/DB-06-12/DB-17 enforces one linear A-to-B-to-clear-to-A history", async () => {
    const database = createSemanticDatabase(
      await readG4CandidateLockOverlaySql(migrationRoot),
    );
    database.exec(`
      INSERT INTO "projects" VALUES ('project_a', 'active');
      INSERT INTO "shots" VALUES (
        'shot_a', 'project_a', 'chapter_a', NULL,
        '2026-07-14T00:00:00.000Z'
      );
      INSERT INTO "candidates" VALUES
        ('candidate_a', 'project_a', 'chapter_a', 'shot_a', 'generated'),
        ('candidate_b', 'project_a', 'chapter_a', 'shot_a', 'generated'),
        ('candidate_c', 'project_a', 'chapter_a', 'shot_a', 'generated');
    `);

    expect(() =>
      insertRevision(database, {
        id: "bad_first",
        revision: 2,
        action: "replace",
        candidateId: "candidate_a",
        previousRevisionId: null,
      }),
    ).toThrow("AIR_G4:CANDIDATE_LOCK_LINEAR_HISTORY");

    insertRevision(database, {
      id: "revision_1",
      revision: 1,
      action: "lock",
      candidateId: "candidate_a",
      previousRevisionId: null,
    });
    database.exec(
      "UPDATE shots SET current_candidate_lock_revision_id='revision_1' WHERE id='shot_a'",
    );

    insertRevision(database, {
      id: "revision_2",
      revision: 2,
      action: "replace",
      candidateId: "candidate_b",
      previousRevisionId: "revision_1",
    });
    expect(() =>
      insertRevision(database, {
        id: "revision_2_fork",
        revision: 2,
        action: "replace",
        candidateId: "candidate_c",
        previousRevisionId: "revision_1",
      }),
    ).toThrow(/UNIQUE constraint failed/);
    database.exec(
      "UPDATE shots SET current_candidate_lock_revision_id='revision_2' WHERE id='shot_a'",
    );

    expect(() =>
      insertRevision(database, {
        id: "bad_repeat_candidate",
        revision: 3,
        action: "replace",
        candidateId: "candidate_b",
        previousRevisionId: "revision_2",
      }),
    ).toThrow("AIR_G4:CANDIDATE_LOCK_LINEAR_HISTORY");
    expect(() =>
      insertRevision(database, {
        id: "bad_lock_after_final",
        revision: 3,
        action: "lock",
        candidateId: "candidate_c",
        previousRevisionId: "revision_2",
      }),
    ).toThrow("AIR_G4:CANDIDATE_LOCK_LINEAR_HISTORY");

    insertRevision(database, {
      id: "revision_3",
      revision: 3,
      action: "clear",
      candidateId: null,
      previousRevisionId: "revision_2",
    });
    database.exec(
      "UPDATE shots SET current_candidate_lock_revision_id='revision_3' WHERE id='shot_a'",
    );
    expect(() =>
      insertRevision(database, {
        id: "bad_replace_after_clear",
        revision: 4,
        action: "replace",
        candidateId: "candidate_c",
        previousRevisionId: "revision_3",
      }),
    ).toThrow("AIR_G4:CANDIDATE_LOCK_LINEAR_HISTORY");

    insertRevision(database, {
      id: "revision_4",
      revision: 4,
      action: "lock",
      candidateId: "candidate_a",
      previousRevisionId: "revision_3",
    });
    database.exec(
      "UPDATE shots SET current_candidate_lock_revision_id='revision_4' WHERE id='shot_a'",
    );

    expect(() =>
      database.exec(
        "UPDATE candidates SET status='rejected' WHERE id='candidate_a'",
      ),
    ).toThrow("AIR_G4:CANDIDATE_IS_CURRENT_FINAL");
    expect(() =>
      database.exec(
        "UPDATE candidates SET status='rejected' WHERE id='candidate_b'",
      ),
    ).not.toThrow();

    expect(
      database
        .prepare(`
          SELECT revision, action, candidate_id, previous_revision_id
          FROM candidate_lock_revisions ORDER BY revision
        `)
        .all(),
    ).toEqual([
      {
        revision: 1,
        action: "lock",
        candidate_id: "candidate_a",
        previous_revision_id: null,
      },
      {
        revision: 2,
        action: "replace",
        candidate_id: "candidate_b",
        previous_revision_id: "revision_1",
      },
      {
        revision: 3,
        action: "clear",
        candidate_id: null,
        previous_revision_id: "revision_2",
      },
      {
        revision: 4,
        action: "lock",
        candidate_id: "candidate_a",
        previous_revision_id: "revision_3",
      },
    ]);
    database.close();
  });

  it("DB-19 keeps revision/pointer atomic and allows null teardown only for coordinated purge", async () => {
    const database = createSemanticDatabase(
      await readG4CandidateLockOverlaySql(migrationRoot),
    );
    database.exec(`
      INSERT INTO "projects" VALUES ('project_a', 'active');
      INSERT INTO "shots" VALUES (
        'shot_a', 'project_a', 'chapter_a', NULL,
        '2026-07-14T00:00:00.000Z'
      );
      INSERT INTO "candidates" VALUES
        ('candidate_a', 'project_a', 'chapter_a', 'shot_a', 'generated');
    `);

    database.exec("BEGIN IMMEDIATE");
    insertRevision(database, {
      id: "revision_rollback",
      revision: 1,
      action: "lock",
      candidateId: "candidate_a",
      previousRevisionId: null,
    });
    expect(() =>
      database.exec(
        "UPDATE shots SET current_candidate_lock_revision_id='not_a_revision' WHERE id='shot_a'",
      ),
    ).toThrow("AIR_G4:CANDIDATE_LOCK_CURRENT_CAS");
    database.exec("ROLLBACK");
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM candidate_lock_revisions")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database
        .prepare(
          "SELECT current_candidate_lock_revision_id FROM shots WHERE id='shot_a'",
        )
        .get(),
    ).toEqual({ current_candidate_lock_revision_id: null });

    insertRevision(database, {
      id: "revision_1",
      revision: 1,
      action: "lock",
      candidateId: "candidate_a",
      previousRevisionId: null,
    });
    database.exec(
      "UPDATE shots SET current_candidate_lock_revision_id='revision_1' WHERE id='shot_a'",
    );
    expect(() =>
      database.exec(
        "UPDATE shots SET current_candidate_lock_revision_id=NULL WHERE id='shot_a'",
      ),
    ).toThrow("AIR_G4:CANDIDATE_LOCK_CURRENT_CAS");

    database.exec(`
      UPDATE projects SET lifecycle_status='deleting' WHERE id='project_a';
      INSERT INTO outbox_events VALUES (
        'purge_event', 'project.delete_files', 'project', 'project_a', 'processed'
      );
      UPDATE shots SET current_candidate_lock_revision_id=NULL WHERE id='shot_a';
    `);
    expect(
      database
        .prepare(
          "SELECT current_candidate_lock_revision_id FROM shots WHERE id='shot_a'",
        )
        .get(),
    ).toEqual({ current_candidate_lock_revision_id: null });
    database.close();
  });
});
