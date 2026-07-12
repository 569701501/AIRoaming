import type { G1CompletenessIssue, G1SchemaTriggerSource } from './g1-schema-constraint-source.js';
import type { G1PhysicalTriggerBindingV1, G1TriggerTemplateV1 } from './g1-schema-trigger-dsl-core-a.js';

type Arg = string | number | boolean | null | readonly string[];
type Args = Readonly<Record<string, Arg>>;
type Event = G1SchemaTriggerSource['event'];
type Timing = G1SchemaTriggerSource['timing'];

export interface G1SchemaTriggerRuntimeBDslSource {
  readonly sourceDocument: '2026-07-11_G1数据库Schema实施契约.md';
  readonly sourceSections: readonly ['10.1-11.6', '12.3', '12.3.1', '12.4'];
  readonly templates: readonly G1TriggerTemplateV1[];
  readonly bindings: readonly G1PhysicalTriggerBindingV1[];
  readonly triggers: readonly G1SchemaTriggerSource[];
  readonly completenessIssues: readonly G1CompletenessIssue[];
  readonly residualTriggerKeys: readonly string[];
}

interface RuntimeTemplate extends G1TriggerTemplateV1 {
  readonly expand: (args: Args) => Omit<G1SchemaTriggerSource, 'ownerStage' | 'table' | 'name' | 'sourceSection'>;
}

const normalize = (sql: string): string => sql.replace(/[\t\n\v\f\r ]+/g, ' ').trim().replace(/;$/, '');
const stringArg = (args: Args, key: string): string => {
  const value = args[key];
  if (typeof value !== 'string') throw new Error(`${key} must be string`);
  return value;
};
const stringsArg = (args: Args, key: string): readonly string[] => {
  const value = args[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`${key} must be string[]`);
  return value as readonly string[];
};
const eventArg = (args: Args): Event => {
  const value = stringArg(args, 'event');
  if (value !== 'INSERT' && value !== 'UPDATE' && value !== 'DELETE') throw new Error(`bad event ${value}`);
  return value;
};
const timingArg = (args: Args): Timing => {
  const value = stringArg(args, 'timing');
  if (value !== 'BEFORE' && value !== 'AFTER') throw new Error(`bad timing ${value}`);
  return value;
};
const codeArg = (args: Args): `AIR_G1:${string}` => {
  const value = stringArg(args, 'errorCode');
  if (!value.startsWith('AIR_G1:trg_')) throw new Error(`bad error code ${value}`);
  return value as `AIR_G1:${string}`;
};
const code = (name: `trg_${string}`): `AIR_G1:${string}` => `AIR_G1:${name}`;
const reject = (errorCode: string, predicate?: string): string =>
  normalize(`SELECT RAISE(ABORT, '${errorCode}')${predicate === undefined ? '' : ` WHERE ${predicate}`}`);
const changed = (columns: readonly string[]): string => columns.map((column) => `NEW.${column} IS NOT OLD.${column}`).join(' OR ');
const binaryCompare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const purgeEligible = (projectIdSql: string): string => normalize(`
  EXISTS (SELECT 1 FROM projects AS pp WHERE pp.id = ${projectIdSql} AND pp.lifecycle_status = 'deleting')
  AND EXISTS (
    SELECT 1 FROM outbox_events AS pe
    WHERE pe.event_type = 'project.delete_files' AND pe.aggregate_type = 'project'
      AND pe.aggregate_id = ${projectIdSql} AND pe.status = 'processed'
  )
  AND NOT EXISTS (
    SELECT 1 FROM generation_tasks AS pt
    WHERE pt.project_id = ${projectIdSql} AND pt.record_kind = 'runtime'
      AND pt.status IN ('queued', 'running', 'retrying')
  )
`);

const explicitTemplate: RuntimeTemplate = {
  templateId: 'explicit-trigger-v1', templateVersion: 1,
  argsKeys: ['timing', 'event', 'updateColumns', 'when', 'bodyStatements', 'errorCode'],
  expand: (args) => ({
    timing: timingArg(args), event: eventArg(args), updateColumns: stringsArg(args, 'updateColumns'),
    normalizedWhen: normalize(stringArg(args, 'when')),
    normalizedBody: stringsArg(args, 'bodyStatements').map(normalize).join('; '), errorCode: codeArg(args),
  }),
};
const immutableTemplate: RuntimeTemplate = {
  templateId: 'identity-immutable-update-v1', templateVersion: 1,
  argsKeys: ['columns', 'guard', 'errorCode'],
  expand: (args) => {
    const errorCode = codeArg(args);
    return { timing: 'BEFORE', event: 'UPDATE', updateColumns: [], normalizedWhen: normalize(stringArg(args, 'guard')), normalizedBody: reject(errorCode, changed(stringsArg(args, 'columns'))), errorCode };
  },
};
const alwaysRejectTemplate: RuntimeTemplate = {
  templateId: 'always-reject-v1', templateVersion: 1, argsKeys: ['event', 'errorCode'],
  expand: (args) => {
    const errorCode = codeArg(args);
    return { timing: 'BEFORE', event: eventArg(args), updateColumns: [], normalizedWhen: '1', normalizedBody: reject(errorCode), errorCode };
  },
};
const purgeDeleteTemplate: RuntimeTemplate = {
  templateId: 'project-purge-delete-guard-v1', templateVersion: 1,
  argsKeys: ['projectIdSql', 'guard', 'errorCode'],
  expand: (args) => {
    const errorCode = codeArg(args);
    return { timing: 'BEFORE', event: 'DELETE', updateColumns: [], normalizedWhen: normalize(stringArg(args, 'guard')), normalizedBody: reject(errorCode, `NOT (${purgeEligible(stringArg(args, 'projectIdSql'))})`), errorCode };
  },
};
const parentTerminalTemplate: RuntimeTemplate = {
  templateId: 'parent-terminal-set-seal-v1', templateVersion: 1,
  argsKeys: ['event', 'parentReadyPredicate', 'projectIdSql', 'errorCode'],
  expand: (args) => {
    const errorCode = codeArg(args);
    const event = eventArg(args);
    const ready = stringArg(args, 'parentReadyPredicate');
    const violation = event === 'DELETE'
      ? `(${ready}) AND NOT (${purgeEligible(stringArg(args, 'projectIdSql'))})`
      : ready;
    return { timing: 'BEFORE', event, updateColumns: [], normalizedWhen: '1', normalizedBody: reject(errorCode, violation), errorCode };
  },
};
const TEMPLATES: readonly RuntimeTemplate[] = [explicitTemplate, immutableTemplate, alwaysRejectTemplate, purgeDeleteTemplate, parentTerminalTemplate];

const bindings: G1PhysicalTriggerBindingV1[] = [];
const existingBase = new Set(['trg_task_concurrency_slots_no_delete', 'trg_outbox_events_no_delete']);
const add = (table: string, name: `trg_${string}`, section: string, templateId: string, args: Args): void => {
  bindings.push({ table, name, sourceSection: section, ownerStage: 'G1', templateId, templateVersion: 1, args, existingBase: existingBase.has(name) });
};
const explicit = (table: string, name: `trg_${string}`, section: string, event: Event, bodyStatements: readonly string[], when = '1', updateColumns: readonly string[] = [], timing: Timing = 'BEFORE'): void =>
  add(table, name, section, 'explicit-trigger-v1', { timing, event, updateColumns, when, bodyStatements, errorCode: code(name) });
const immutable = (table: string, name: `trg_${string}`, section: string, columns: readonly string[], guard = '1'): void =>
  add(table, name, section, 'identity-immutable-update-v1', { columns, guard, errorCode: code(name) });
const purgeDelete = (table: string, name: `trg_${string}`, section: string, projectIdSql: string, guard = '1'): void =>
  add(table, name, section, 'project-purge-delete-guard-v1', { projectIdSql, guard, errorCode: code(name) });

const claimColumns = ['status', 'attempt', 'lease_owner_id', 'lease_token', 'lease_expires_at', 'heartbeat_at', 'started_at'] as const;
const claimWhen = "OLD.record_kind = 'runtime' AND OLD.status IN ('queued', 'retrying') AND NEW.status = 'running'";
const heartbeatWhen = "OLD.record_kind = 'runtime' AND OLD.status = 'running' AND NEW.status = 'running' AND NEW.heartbeat_at IS NOT OLD.heartbeat_at";
const finishWhen = "OLD.finished_at IS NULL AND NEW.finished_at IS NOT NULL AND NEW.outcome IS NOT NULL";
const uuidV4Sql = normalize(`
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2, 3) || '-' ||
  substr('89ab', ((instr('0123456789abcdef', substr(lower(hex(randomblob(1))), 1, 1)) - 1) % 4) + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2, 3) || '-' || lower(hex(randomblob(6)))
`);

// §10.1 GenerationTask
explicit('generation_tasks', 'trg_generation_tasks_initial_insert', '6.1.1,10.1,12.3', 'INSERT', [
  reject(code('trg_generation_tasks_initial_insert'), `NEW.source_set_sealed_at IS NOT NULL`),
  reject(code('trg_generation_tasks_initial_insert'), `NEW.record_kind = 'runtime' AND NOT (
    NEW.status = 'queued' AND NEW.attempt = 0 AND NEW.lease_owner_id IS NULL AND NEW.lease_token IS NULL
    AND NEW.lease_expires_at IS NULL AND NEW.heartbeat_at IS NULL AND NEW.cancel_requested_at IS NULL
    AND NEW.started_at IS NULL AND NEW.finished_at IS NULL
    AND EXISTS (SELECT 1 FROM projects AS p WHERE p.id = NEW.project_id AND p.lifecycle_status = 'active')
  )`),
  reject(code('trg_generation_tasks_initial_insert'), `NEW.record_kind <> 'runtime' AND (
    NEW.lease_owner_id IS NOT NULL OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
    OR NEW.heartbeat_at IS NOT NULL OR NEW.cancel_requested_at IS NOT NULL OR NEW.attempt <> 0
  )`),
]);
immutable('generation_tasks', 'trg_generation_tasks_input_immutable', '10.1,12.3', [
  'input_json', 'input_schema_version', 'input_digest', 'source_digest', 'idempotency_key',
  'concurrency_key', 'max_attempts', 'target_type', 'target_id',
], "OLD.record_kind = 'runtime'");
immutable('generation_tasks', 'trg_generation_tasks_record_identity_immutable', '10.1,12.3', [
  'id', 'project_id', 'chapter_id', 'type', 'created_at',
]);
explicit('generation_tasks', 'trg_generation_tasks_legacy_evidence_upgrade', '10.1,12.3', 'UPDATE', [
  reject(code('trg_generation_tasks_legacy_evidence_upgrade'), `NOT (
    (OLD.record_kind = NEW.record_kind)
    OR (OLD.record_kind = 'legacy_stub' AND NEW.record_kind = 'legacy_imported')
  )`),
  reject(code('trg_generation_tasks_legacy_evidence_upgrade'), `NOT (
    OLD.provenance_status = NEW.provenance_status
    OR (OLD.provenance_status = 'reference_only' AND NEW.provenance_status = 'partial')
    OR (OLD.provenance_status = 'partial' AND NEW.provenance_status = 'complete')
  )`),
  reject(code('trg_generation_tasks_legacy_evidence_upgrade'), `
    (OLD.input_json IS NOT NULL AND NEW.input_json IS NOT OLD.input_json)
    OR (OLD.input_schema_version IS NOT NULL AND NEW.input_schema_version IS NOT OLD.input_schema_version)
    OR (OLD.input_digest IS NOT NULL AND NEW.input_digest IS NOT OLD.input_digest)
    OR (OLD.output_json IS NOT NULL AND NEW.output_json IS NOT OLD.output_json)
    OR (OLD.output_schema_version IS NOT NULL AND NEW.output_schema_version IS NOT OLD.output_schema_version)
    OR (OLD.output_digest IS NOT NULL AND NEW.output_digest IS NOT OLD.output_digest)
    OR (OLD.error_json IS NOT NULL AND NEW.error_json IS NOT OLD.error_json)
    OR (OLD.error_schema_version IS NOT NULL AND NEW.error_schema_version IS NOT OLD.error_schema_version)
    OR (OLD.source_digest IS NOT NULL AND NEW.source_digest IS NOT OLD.source_digest)
    OR (OLD.import_source IS NOT NULL AND NEW.import_source IS NOT OLD.import_source)
    OR (OLD.imported_at IS NOT NULL AND NEW.imported_at IS NOT OLD.imported_at)
  `),
  reject(code('trg_generation_tasks_legacy_evidence_upgrade'), `
    OLD.observed_evidence_json IS NOT NULL AND NEW.observed_evidence_json IS NOT OLD.observed_evidence_json
    AND EXISTS (
      SELECT 1 FROM json_tree(OLD.observed_evidence_json) AS old_leaf
      WHERE old_leaf.atom IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM json_tree(CASE WHEN json_valid(NEW.observed_evidence_json) = 1 THEN NEW.observed_evidence_json ELSE '{}' END) AS new_leaf
        WHERE new_leaf.fullkey = old_leaf.fullkey AND new_leaf.type = old_leaf.type AND new_leaf.atom IS old_leaf.atom
      )
    )
  `),
], "OLD.record_kind IN ('legacy_stub', 'legacy_imported')");
explicit('generation_tasks', 'trg_generation_tasks_legacy_execution_guard_update', '10.1,12.3', 'UPDATE', [
  reject(code('trg_generation_tasks_legacy_execution_guard_update'), `
    NEW.status IN ('queued', 'running', 'retrying') OR NEW.lease_owner_id IS NOT NULL OR NEW.lease_token IS NOT NULL
    OR NEW.lease_expires_at IS NOT NULL OR NEW.heartbeat_at IS NOT NULL OR NEW.cancel_requested_at IS NOT NULL
    OR NEW.next_run_at IS NOT NULL OR NEW.attempt <> 0 OR NEW.retry_disabled IS NOT 1
  `),
], "OLD.record_kind <> 'runtime'");

const knownSourceTypes = [
  'project', 'project_script_outline', 'chapter', 'chapter_script_version', 'story_version', 'storyboard_version',
  'preflight_revision', 'character', 'character_visual', 'chapter_scene', 'scene_visual', 'shot', 'asset', 'candidate',
  'candidate_lock_revision', 'lock_set', 'layout_revision', 'export_revision',
] as const;
const quotedKnownSourceTypes = knownSourceTypes.map((value) => `'${value}'`).join(', ');
const sourceRowValid = (source: string, task: string): string => normalize(`
  (${source}.source_type = 'project' AND ${source}.source_id = ${task}.project_id)
  OR (${source}.source_type = 'project_script_outline' AND EXISTS (SELECT 1 FROM project_script_outlines x WHERE x.id = ${source}.source_id AND x.project_id = ${task}.project_id AND x.source_digest = ${source}.source_digest))
  OR (${source}.source_type = 'chapter' AND EXISTS (SELECT 1 FROM chapters x WHERE x.id = ${source}.source_id AND x.project_id = ${task}.project_id AND (${task}.chapter_id IS NULL OR x.id = ${task}.chapter_id)))
  OR (${source}.source_type = 'chapter_script_version' AND EXISTS (SELECT 1 FROM chapter_script_versions x JOIN chapters c ON c.id = x.chapter_id WHERE x.id = ${source}.source_id AND c.project_id = ${task}.project_id AND (${task}.chapter_id IS NULL OR x.chapter_id = ${task}.chapter_id) AND x.source_digest = ${source}.source_digest))
  OR (${source}.source_type = 'story_version' AND EXISTS (SELECT 1 FROM story_versions x WHERE x.id = ${source}.source_id AND x.project_id = ${task}.project_id AND (${task}.chapter_id IS NULL OR x.chapter_id = ${task}.chapter_id) AND x.status = 'confirmed' AND x.document_digest = ${source}.source_digest))
  OR (${source}.source_type = 'storyboard_version' AND EXISTS (SELECT 1 FROM storyboard_versions x WHERE x.id = ${source}.source_id AND x.project_id = ${task}.project_id AND (${task}.chapter_id IS NULL OR x.chapter_id = ${task}.chapter_id) AND x.status = 'confirmed' AND x.document_digest = ${source}.source_digest))
  OR (${source}.source_type = 'preflight_revision' AND EXISTS (SELECT 1 FROM preflight_revisions x WHERE x.id = ${source}.source_id AND x.project_id = ${task}.project_id AND (${task}.chapter_id IS NULL OR x.chapter_id = ${task}.chapter_id) AND x.status = 'confirmed' AND x.ready = 1 AND x.source_digest = ${source}.source_digest))
  OR (${source}.source_type = 'character' AND EXISTS (SELECT 1 FROM characters x WHERE x.id = ${source}.source_id AND x.project_id = ${task}.project_id))
  OR (${source}.source_type = 'character_visual' AND EXISTS (SELECT 1 FROM character_visuals x JOIN characters c ON c.id = x.character_id JOIN assets a ON a.id = x.asset_id WHERE x.id = ${source}.source_id AND c.project_id = ${task}.project_id AND x.status = 'available' AND a.status = 'ready' AND a.sha256 = ${source}.source_digest))
  OR (${source}.source_type = 'chapter_scene' AND EXISTS (SELECT 1 FROM chapter_scenes x WHERE x.id = ${source}.source_id AND x.project_id = ${task}.project_id AND (${task}.chapter_id IS NULL OR x.chapter_id = ${task}.chapter_id)))
  OR (${source}.source_type = 'scene_visual' AND EXISTS (SELECT 1 FROM scene_visuals x JOIN chapter_scenes s ON s.id = x.chapter_scene_id JOIN assets a ON a.id = x.asset_id WHERE x.id = ${source}.source_id AND s.project_id = ${task}.project_id AND (${task}.chapter_id IS NULL OR s.chapter_id = ${task}.chapter_id) AND a.status = 'ready' AND a.sha256 = ${source}.source_digest))
  OR (${source}.source_type = 'shot' AND EXISTS (SELECT 1 FROM shots x WHERE x.id = ${source}.source_id AND x.project_id = ${task}.project_id AND (${task}.chapter_id IS NULL OR x.chapter_id = ${task}.chapter_id) AND x.lifecycle_status = 'active') AND EXISTS (SELECT 1 FROM generation_task_sources sb JOIN storyboard_shot_projections sp ON sp.storyboard_version_id = sb.source_id AND sp.shot_id = ${source}.source_id WHERE sb.task_id = ${task}.id AND sb.source_type = 'storyboard_version'))
  OR (${source}.source_type = 'asset' AND EXISTS (SELECT 1 FROM assets x WHERE x.id = ${source}.source_id AND x.project_id = ${task}.project_id AND (${task}.chapter_id IS NULL OR x.chapter_id IS NULL OR x.chapter_id = ${task}.chapter_id) AND x.status = 'ready' AND x.sha256 = ${source}.source_digest))
  OR (${source}.source_type = 'candidate' AND EXISTS (SELECT 1 FROM candidates x JOIN assets a ON a.id = x.asset_id WHERE x.id = ${source}.source_id AND x.project_id = ${task}.project_id AND (${task}.chapter_id IS NULL OR x.chapter_id = ${task}.chapter_id) AND a.status = 'ready' AND a.sha256 = ${source}.source_digest))
  OR (${source}.source_type = 'candidate_lock_revision' AND EXISTS (SELECT 1 FROM candidate_lock_revisions x JOIN candidates c ON c.id = x.candidate_id JOIN assets a ON a.id = c.asset_id WHERE x.id = ${source}.source_id AND x.project_id = ${task}.project_id AND (${task}.chapter_id IS NULL OR x.chapter_id = ${task}.chapter_id) AND x.action IN ('lock', 'replace') AND a.status = 'ready' AND a.sha256 = ${source}.source_digest))
  OR (${source}.source_type = 'lock_set' AND ${task}.chapter_id IS NOT NULL AND ${source}.source_id = ${task}.chapter_id)
  OR (${source}.source_type = 'layout_revision' AND EXISTS (SELECT 1 FROM layout_revisions x WHERE x.id = ${source}.source_id AND x.project_id = ${task}.project_id AND (${task}.chapter_id IS NULL OR x.chapter_id = ${task}.chapter_id) AND x.binding_set_sealed_at IS NOT NULL AND x.document_digest = ${source}.source_digest))
  OR (${source}.source_type = 'export_revision' AND EXISTS (SELECT 1 FROM export_revisions x WHERE x.id = ${source}.source_id AND x.project_id = ${task}.project_id AND (${task}.chapter_id IS NULL OR x.chapter_id IS NULL OR x.chapter_id = ${task}.chapter_id) AND x.status = 'ready' AND x.manifest_digest = ${source}.source_digest))
`);

explicit('generation_tasks', 'trg_generation_tasks_source_set_seal', '6.1.1,10.1,10.4.1,12.3', 'UPDATE', [
  reject(code('trg_generation_tasks_source_set_seal'), `
    (OLD.source_set_sealed_at IS NOT NULL AND NEW.source_set_sealed_at IS NOT OLD.source_set_sealed_at)
    OR (OLD.source_set_sealed_at IS NULL AND NEW.source_set_sealed_at IS NULL AND NEW.source_digest IS NOT OLD.source_digest)
  `),
  reject(code('trg_generation_tasks_source_set_seal'), `OLD.source_set_sealed_at IS NULL AND NEW.source_set_sealed_at IS NOT NULL AND (
    (NEW.record_kind = 'runtime' AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.lifecycle_status = 'active'))
    OR NOT EXISTS (SELECT 1 FROM generation_task_sources s WHERE s.task_id = NEW.id)
    OR EXISTS (SELECT 1 FROM generation_task_sources s WHERE s.task_id = NEW.id AND (s.source_type NOT IN (${quotedKnownSourceTypes}) OR NOT (${sourceRowValid('s', 'NEW')})))
    OR NEW.input_json IS NULL OR CASE WHEN json_valid(NEW.input_json) = 1 THEN NOT (
      json_type(NEW.input_json, '$.sourceProjection') = 'object'
      AND json_extract(NEW.input_json, '$.sourceProjection.schemaVersion') = 1
      AND json_type(NEW.input_json, '$.sourceProjection.policyVersion') = 'text'
      AND length(trim(json_extract(NEW.input_json, '$.sourceProjection.policyVersion'))) > 0
      AND json_extract(NEW.input_json, '$.sourceProjection.projectId') IS NEW.project_id
      AND json_extract(NEW.input_json, '$.sourceProjection.chapterId') IS NEW.chapter_id
      AND json_extract(NEW.input_json, '$.sourceProjection.consumerType') IS NEW.type
      AND json_type(NEW.input_json, '$.sourceProjection.sources') = 'array'
      AND json_array_length(NEW.input_json, '$.sourceProjection.sources') = (SELECT count(*) FROM generation_task_sources s WHERE s.task_id = NEW.id)
      AND NOT EXISTS (
        SELECT 1 FROM json_each(NEW.input_json, '$.sourceProjection.sources') j
        LEFT JOIN generation_task_sources s ON s.task_id = NEW.id
          AND s.role = json_extract(j.value, '$.role') AND s."order" = json_extract(j.value, '$.order')
        WHERE s.id IS NULL OR s.source_type IS NOT json_extract(j.value, '$.sourceType')
          OR s.source_id IS NOT json_extract(j.value, '$.sourceId') OR s.source_digest IS NOT json_extract(j.value, '$.sourceDigest')
      )
      AND NOT EXISTS (
        SELECT 1 FROM generation_task_sources s WHERE s.task_id = NEW.id AND NOT EXISTS (
          SELECT 1 FROM json_each(NEW.input_json, '$.sourceProjection.sources') j
          WHERE json_extract(j.value, '$.role') IS s.role AND json_extract(j.value, '$.order') IS s."order"
            AND json_extract(j.value, '$.sourceType') IS s.source_type
            AND json_extract(j.value, '$.sourceId') IS s.source_id
            AND json_extract(j.value, '$.sourceDigest') IS s.source_digest
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT s."order" AS actual_order,
            row_number() OVER (PARTITION BY s.role ORDER BY s.source_type COLLATE BINARY, s.source_id COLLATE BINARY) AS expected_order
          FROM generation_task_sources s WHERE s.task_id = NEW.id
        ) ordered_sources WHERE ordered_sources.actual_order <> ordered_sources.expected_order
      )
      AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT CAST(j.key AS INTEGER) + 1 AS actual_position,
            row_number() OVER (ORDER BY json_extract(j.value, '$.role') COLLATE BINARY, json_extract(j.value, '$.order')) AS expected_position,
            json_type(j.value, '$.role') AS role_type,
            json_type(j.value, '$.order') AS order_type
          FROM json_each(NEW.input_json, '$.sourceProjection.sources') j
        ) projected_sources
        WHERE projected_sources.actual_position <> projected_sources.expected_position
          OR projected_sources.role_type <> 'text' OR projected_sources.order_type <> 'integer'
      )
    ) ELSE 1 END
  )`),
]);

explicit('generation_tasks', 'trg_generation_tasks_claim_validate', '6.1.1,10.1,12.3', 'UPDATE', [
  reject(code('trg_generation_tasks_claim_validate'), `
    NEW.source_set_sealed_at IS NULL OR NEW.cancel_requested_at IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id AND p.lifecycle_status = 'active')
    OR (OLD.next_run_at IS NOT NULL AND OLD.next_run_at > NEW.heartbeat_at)
    OR NEW.attempt <> OLD.attempt + 1 OR NEW.attempt > NEW.max_attempts
    OR NEW.lease_owner_id IS NULL OR NEW.lease_token IS NULL OR NEW.lease_expires_at IS NULL OR NEW.heartbeat_at IS NULL
    OR NEW.lease_expires_at <= NEW.heartbeat_at
    OR (OLD.started_at IS NULL AND NEW.started_at IS NOT NEW.heartbeat_at)
    OR (OLD.started_at IS NOT NULL AND NEW.started_at IS NOT OLD.started_at)
    OR EXISTS (SELECT 1 FROM task_attempts a WHERE a.task_id = NEW.id AND a.finished_at IS NULL)
    OR (NEW.concurrency_key IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM task_concurrency_slots s WHERE s.concurrency_key = NEW.concurrency_key AND s.task_id IS NULL
    ))
  `),
], claimWhen, claimColumns);
explicit('generation_tasks', 'trg_generation_tasks_claim_materialize', '10.1,12.3', 'UPDATE', [
  normalize(`UPDATE task_concurrency_slots SET task_id = NEW.id, lease_owner_id = NEW.lease_owner_id, claim_token = NEW.lease_token, lease_expires_at = NEW.lease_expires_at, updated_at = NEW.heartbeat_at WHERE id = (SELECT id FROM task_concurrency_slots WHERE concurrency_key = NEW.concurrency_key AND task_id IS NULL ORDER BY slot_no ASC LIMIT 1) AND NEW.concurrency_key IS NOT NULL`),
  reject(code('trg_generation_tasks_claim_materialize'), `NEW.concurrency_key IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM task_concurrency_slots s WHERE s.task_id = NEW.id AND s.claim_token = NEW.lease_token
      AND s.lease_owner_id = NEW.lease_owner_id AND s.lease_expires_at = NEW.lease_expires_at
  )`),
  normalize(`INSERT INTO task_attempts (id, task_id, attempt_no, worker_id, claim_token, outcome, error_json, error_schema_version, artifact_refs_json, artifact_schema_version, started_at, finished_at, created_at) VALUES (${uuidV4Sql}, NEW.id, NEW.attempt, NEW.lease_owner_id, NEW.lease_token, NULL, NULL, NULL, NULL, NULL, NEW.heartbeat_at, NULL, NEW.heartbeat_at)`),
  reject(code('trg_generation_tasks_claim_materialize'), `NOT EXISTS (
    SELECT 1 FROM task_attempts a WHERE a.task_id = NEW.id AND a.attempt_no = NEW.attempt
      AND a.claim_token = NEW.lease_token AND a.finished_at IS NULL
  )`),
], claimWhen, claimColumns, 'AFTER');
explicit('generation_tasks', 'trg_generation_tasks_heartbeat_validate', '10.1,12.3', 'UPDATE', [
  reject(code('trg_generation_tasks_heartbeat_validate'), `
    NEW.lease_owner_id IS NOT OLD.lease_owner_id OR NEW.lease_token IS NOT OLD.lease_token
    OR NEW.attempt <> OLD.attempt OR NEW.started_at IS NOT OLD.started_at
    OR OLD.lease_token IS NULL OR NEW.heartbeat_at <= OLD.heartbeat_at OR NEW.lease_expires_at <= NEW.heartbeat_at
    OR NOT EXISTS (SELECT 1 FROM task_attempts a WHERE a.task_id = OLD.id AND a.attempt_no = OLD.attempt AND a.claim_token = OLD.lease_token AND a.finished_at IS NULL)
    OR (OLD.concurrency_key IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM task_concurrency_slots s WHERE s.task_id = OLD.id AND s.claim_token = OLD.lease_token
        AND s.lease_owner_id = OLD.lease_owner_id AND s.lease_expires_at = OLD.lease_expires_at
    ))
  `),
], heartbeatWhen);
explicit('generation_tasks', 'trg_generation_tasks_heartbeat_materialize', '10.1,12.3', 'UPDATE', [
  normalize(`UPDATE task_concurrency_slots SET lease_expires_at = NEW.lease_expires_at, updated_at = NEW.heartbeat_at WHERE task_id = OLD.id AND claim_token = OLD.lease_token AND NEW.concurrency_key IS NOT NULL`),
  reject(code('trg_generation_tasks_heartbeat_materialize'), `NEW.concurrency_key IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM task_concurrency_slots s WHERE s.task_id = NEW.id AND s.claim_token = NEW.lease_token
      AND s.lease_expires_at = NEW.lease_expires_at AND s.updated_at = NEW.heartbeat_at
  )`),
], heartbeatWhen, [], 'AFTER');
explicit('generation_tasks', 'trg_generation_tasks_runtime_state_transition', '10.1,12.3', 'UPDATE', [
  reject(code('trg_generation_tasks_runtime_state_transition'), `NOT (
    OLD.status = NEW.status
    OR (OLD.status IN ('queued', 'retrying') AND NEW.status = 'running')
    OR (OLD.status IN ('queued', 'retrying') AND NEW.status = 'cancelled'
      AND NEW.cancel_requested_at IS NOT NULL AND NEW.finished_at IS NOT NULL)
    OR (OLD.status = 'running' AND NEW.status IN ('succeeded', 'cancelled', 'retrying', 'failed')
      AND EXISTS (SELECT 1 FROM task_attempts a WHERE a.task_id = NEW.id AND a.attempt_no = OLD.attempt AND a.claim_token = OLD.lease_token AND a.finished_at IS NOT NULL))
  )`),
  reject(code('trg_generation_tasks_runtime_state_transition'), `NEW.status = 'retrying' AND NOT (
    NEW.lease_owner_id IS NULL AND NEW.lease_token IS NULL AND NEW.lease_expires_at IS NULL AND NEW.heartbeat_at IS NULL
    AND NEW.finished_at IS NULL AND NEW.next_run_at IS NOT NULL AND NEW.next_run_at > NEW.updated_at
  )`),
  reject(code('trg_generation_tasks_runtime_state_transition'), `NEW.status IN ('succeeded', 'cancelled', 'failed') AND NOT (
    NEW.lease_owner_id IS NULL AND NEW.lease_token IS NULL AND NEW.lease_expires_at IS NULL AND NEW.heartbeat_at IS NULL
    AND NEW.next_run_at IS NULL AND NEW.finished_at IS NOT NULL
  )`),
], "OLD.record_kind = 'runtime'");
explicit('generation_tasks', 'trg_generation_tasks_running_fencing_update', '10.1,12.3', 'UPDATE', [
  reject(code('trg_generation_tasks_running_fencing_update'), `OLD.lease_token IS NULL OR NOT EXISTS (
    SELECT 1 FROM task_attempts a WHERE a.task_id = OLD.id AND a.attempt_no = OLD.attempt
      AND a.claim_token = OLD.lease_token AND (a.finished_at IS NULL OR NEW.status <> 'running')
  )`),
  reject(code('trg_generation_tasks_running_fencing_update'), `OLD.concurrency_key IS NOT NULL AND NEW.status = 'running' AND NOT EXISTS (
    SELECT 1 FROM task_concurrency_slots s WHERE s.task_id = OLD.id AND s.concurrency_key = OLD.concurrency_key
      AND s.claim_token = OLD.lease_token AND s.lease_owner_id = OLD.lease_owner_id
      AND s.lease_expires_at = OLD.lease_expires_at
  )`),
], "OLD.record_kind = 'runtime' AND OLD.status = 'running'");
purgeDelete('generation_tasks', 'trg_generation_tasks_history_delete', '10.1,12.3,12.4', 'OLD.project_id');

// §10.2 TaskAttempt
explicit('task_attempts', 'trg_task_attempts_runtime_task_insert', '10.2,12.3', 'INSERT', [
  reject(code('trg_task_attempts_runtime_task_insert'), `NOT EXISTS (
    SELECT 1 FROM generation_tasks t WHERE t.id = NEW.task_id AND t.record_kind = 'runtime'
      AND t.status = 'running' AND t.source_set_sealed_at IS NOT NULL
      AND t.attempt = NEW.attempt_no AND t.lease_owner_id = NEW.worker_id AND t.lease_token = NEW.claim_token
      AND t.heartbeat_at IS NEW.started_at AND NEW.created_at IS NEW.started_at
      AND NEW.outcome IS NULL AND NEW.finished_at IS NULL
  )`),
]);
immutable('task_attempts', 'trg_task_attempts_identity_immutable_update', '10.2,12.3', [
  'id', 'task_id', 'attempt_no', 'worker_id', 'claim_token', 'started_at', 'created_at',
]);
explicit('task_attempts', 'trg_task_attempts_finish_validate', '10.1,10.2,12.3', 'UPDATE', [
  reject(code('trg_task_attempts_finish_validate'), `NOT EXISTS (
    SELECT 1 FROM generation_tasks t WHERE t.id = OLD.task_id AND t.record_kind = 'runtime'
      AND t.status = 'running' AND t.attempt = OLD.attempt_no AND t.lease_token = OLD.claim_token
      AND t.lease_owner_id = OLD.worker_id
      AND (t.concurrency_key IS NULL OR EXISTS (
        SELECT 1 FROM task_concurrency_slots s WHERE s.task_id = t.id AND s.claim_token = OLD.claim_token
          AND s.lease_owner_id = OLD.worker_id AND s.lease_expires_at = t.lease_expires_at
      ))
  )`),
  reject(code('trg_task_attempts_finish_validate'), `NEW.outcome = 'succeeded' AND (
    NEW.error_json IS NOT NULL OR NEW.error_schema_version IS NOT NULL
  )`),
  reject(code('trg_task_attempts_finish_validate'), `NEW.outcome IN ('failed', 'interrupted') AND (
    NEW.error_json IS NULL OR NEW.error_schema_version IS NULL
  )`),
  reject(code('trg_task_attempts_finish_validate'), `NEW.outcome = 'cancelled' AND NOT EXISTS (
    SELECT 1 FROM generation_tasks t WHERE t.id = OLD.task_id AND t.cancel_requested_at IS NOT NULL
  )`),
], finishWhen);
explicit('task_attempts', 'trg_task_attempts_finish_materialize', '10.1,10.2,12.3', 'UPDATE', [
  normalize(`UPDATE generation_tasks SET
    status = CASE
      WHEN NOT EXISTS (
        SELECT 1 FROM projects p
        WHERE p.id = generation_tasks.project_id AND p.lifecycle_status = 'active'
      ) THEN CASE
        WHEN NEW.outcome = 'cancelled' OR cancel_requested_at IS NOT NULL THEN 'cancelled'
        ELSE 'failed'
      END
      WHEN NEW.outcome = 'succeeded' THEN 'succeeded'
      WHEN NEW.outcome = 'cancelled' THEN 'cancelled'
      WHEN NEW.outcome IN ('failed', 'interrupted') AND attempt < max_attempts
        AND next_run_at IS NOT NULL AND next_run_at > NEW.finished_at
        AND EXISTS (SELECT 1 FROM projects p WHERE p.id = generation_tasks.project_id AND p.lifecycle_status = 'active')
        AND cancel_requested_at IS NULL THEN 'retrying'
      ELSE 'failed'
    END,
    finished_at = CASE
      WHEN NEW.outcome IN ('failed', 'interrupted') AND attempt < max_attempts
        AND next_run_at IS NOT NULL AND next_run_at > NEW.finished_at
        AND EXISTS (SELECT 1 FROM projects p WHERE p.id = generation_tasks.project_id AND p.lifecycle_status = 'active')
        AND cancel_requested_at IS NULL THEN NULL ELSE NEW.finished_at END,
    next_run_at = CASE
      WHEN NEW.outcome IN ('failed', 'interrupted') AND attempt < max_attempts
        AND next_run_at IS NOT NULL AND next_run_at > NEW.finished_at
        AND EXISTS (SELECT 1 FROM projects p WHERE p.id = generation_tasks.project_id AND p.lifecycle_status = 'active')
        AND cancel_requested_at IS NULL THEN next_run_at ELSE NULL END,
    lease_owner_id = NULL, lease_token = NULL, lease_expires_at = NULL, heartbeat_at = NULL,
    updated_at = NEW.finished_at
    WHERE id = NEW.task_id AND status = 'running' AND attempt = NEW.attempt_no AND lease_token = NEW.claim_token`),
  reject(code('trg_task_attempts_finish_materialize'), `EXISTS (
    SELECT 1 FROM generation_tasks t WHERE t.id = NEW.task_id AND t.status = 'running'
  )`),
  normalize(`UPDATE task_concurrency_slots SET task_id = NULL, lease_owner_id = NULL, claim_token = NULL, lease_expires_at = NULL, updated_at = NEW.finished_at WHERE task_id = NEW.task_id AND claim_token = NEW.claim_token`),
  reject(code('trg_task_attempts_finish_materialize'), `EXISTS (
    SELECT 1 FROM task_concurrency_slots s WHERE s.task_id = NEW.task_id OR s.claim_token = NEW.claim_token
  )`),
], finishWhen, [], 'AFTER');
purgeDelete('task_attempts', 'trg_task_attempts_history_delete', '10.2,12.3,12.4', '(SELECT project_id FROM generation_tasks WHERE id = OLD.task_id)');

// §10.3 TaskConcurrencySlot
immutable('task_concurrency_slots', 'trg_task_concurrency_slots_identity_immutable_update', '10.3,12.3', [
  'id', 'concurrency_key', 'slot_no',
]);
add('task_concurrency_slots', 'trg_task_concurrency_slots_no_delete', '10.3,12.3', 'always-reject-v1', {
  event: 'DELETE', errorCode: code('trg_task_concurrency_slots_no_delete'),
});
const slotMatchesTask = normalize(`
  (NEW.task_id IS NULL AND NEW.lease_owner_id IS NULL AND NEW.claim_token IS NULL AND NEW.lease_expires_at IS NULL)
  OR EXISTS (
    SELECT 1 FROM generation_tasks t WHERE t.id = NEW.task_id AND t.record_kind = 'runtime'
      AND t.status = 'running' AND t.source_set_sealed_at IS NOT NULL
      AND t.concurrency_key = NEW.concurrency_key AND t.lease_owner_id = NEW.lease_owner_id
      AND t.lease_token = NEW.claim_token AND t.lease_expires_at = NEW.lease_expires_at
  )
`);
explicit('task_concurrency_slots', 'trg_task_concurrency_slots_claim_matches_task_insert', '10.3,12.3', 'INSERT', [
  reject(code('trg_task_concurrency_slots_claim_matches_task_insert'), `NOT (${slotMatchesTask})`),
]);
explicit('task_concurrency_slots', 'trg_task_concurrency_slots_claim_matches_task_update', '10.3,12.3', 'UPDATE', [
  reject(code('trg_task_concurrency_slots_claim_matches_task_update'), `NOT (${slotMatchesTask})`),
  reject(code('trg_task_concurrency_slots_claim_matches_task_update'), `
    OLD.task_id IS NOT NULL AND NEW.task_id IS NULL AND NOT EXISTS (
      SELECT 1 FROM task_attempts a JOIN generation_tasks t ON t.id = a.task_id
      WHERE a.task_id = OLD.task_id AND a.claim_token = OLD.claim_token AND a.finished_at IS NOT NULL
        AND t.status <> 'running'
    )
  `),
]);

// §10.4 GenerationTaskSource
explicit('generation_task_sources', 'trg_generation_task_sources_scope_insert', '10.4,10.4.1,12.3', 'INSERT', [
  reject(code('trg_generation_task_sources_scope_insert'), `NOT EXISTS (
    SELECT 1 FROM generation_tasks t WHERE t.id = NEW.task_id AND t.source_set_sealed_at IS NULL
      AND (NEW.source_type NOT IN (${quotedKnownSourceTypes}) OR (${sourceRowValid('NEW', 't')}))
      AND (t.record_kind = 'runtime' OR t.provenance_status <> 'complete')
  )`),
]);
add('generation_task_sources', 'trg_generation_task_sources_append_only_update', '10.4,12.3', 'always-reject-v1', {
  event: 'UPDATE', errorCode: code('trg_generation_task_sources_append_only_update'),
});
purgeDelete('generation_task_sources', 'trg_generation_task_sources_history_delete', '10.4,12.3,12.4', '(SELECT project_id FROM generation_tasks WHERE id = OLD.task_id)');

// §11.1 LayoutWorkingCopy
const workingCopyScope = normalize(`
  EXISTS (SELECT 1 FROM chapters c WHERE c.id = NEW.chapter_id AND c.project_id = NEW.project_id)
  AND (NEW.based_on_revision_id IS NULL OR EXISTS (
    SELECT 1 FROM layout_revisions r WHERE r.id = NEW.based_on_revision_id
      AND r.project_id = NEW.project_id AND r.chapter_id = NEW.chapter_id
  ))
`);
for (const event of ['INSERT', 'UPDATE'] as const) {
  const name = `trg_layout_working_copies_scope_${event.toLowerCase()}` as `trg_${string}`;
  explicit('layout_working_copies', name, '11.1,12.3', event, [reject(code(name), `NOT (${workingCopyScope})`)]);
}

// §11.2 LayoutRevision
explicit('layout_revisions', 'trg_layout_revisions_scope_insert', '11.2,12.3', 'INSERT', [
  reject(code('trg_layout_revisions_scope_insert'), `NEW.binding_set_sealed_at IS NOT NULL OR NOT (
    EXISTS (SELECT 1 FROM chapters c JOIN projects p ON p.id = c.project_id WHERE c.id = NEW.chapter_id AND c.project_id = NEW.project_id AND p.lifecycle_status = 'active')
    AND (NEW.previous_revision_id IS NULL OR EXISTS (SELECT 1 FROM layout_revisions r WHERE r.id = NEW.previous_revision_id AND r.project_id = NEW.project_id AND r.chapter_id = NEW.chapter_id))
    AND (NEW.content_based_on_revision_id IS NULL OR EXISTS (SELECT 1 FROM layout_revisions r WHERE r.id = NEW.content_based_on_revision_id AND r.project_id = NEW.project_id AND r.chapter_id = NEW.chapter_id))
  )`),
]);
const layoutProjectionRows = normalize(`
  SELECT
    json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.id') AS element_id,
    'candidate_image' AS role,
    row_number() OVER (ORDER BY CAST(c.key AS INTEGER), CAST(e.key AS INTEGER)) AS binding_order,
    json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.shotId') AS shot_id,
    json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.candidateId') AS candidate_id,
    json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.candidateLockRevisionId') AS lock_id,
    json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.assetId') AS asset_id,
    json_extract(CASE WHEN json_extract(e.value, '$.type') = 'panel_frame' THEN json_extract(e.value, '$.contentImage') ELSE e.value END, '$.source.sourceDigest') AS source_digest
  FROM json_each(NEW.document_json, '$.canvases') c, json_each(c.value, '$.elements') e
  WHERE (json_extract(e.value, '$.type') = 'panel_frame' AND json_type(e.value, '$.contentImage') = 'object')
     OR json_extract(e.value, '$.type') = 'free_image'
`);
explicit('layout_revisions', 'trg_layout_revisions_binding_set_seal', '11.2,11.3.1,12.3', 'UPDATE', [
  reject(code('trg_layout_revisions_binding_set_seal'), `
    OLD.binding_set_sealed_at IS NOT NULL AND NEW.binding_set_sealed_at IS NOT OLD.binding_set_sealed_at
  `),
  reject(code('trg_layout_revisions_binding_set_seal'), `OLD.binding_set_sealed_at IS NULL AND NEW.binding_set_sealed_at IS NOT NULL AND CASE
    WHEN json_valid(NEW.document_json) <> 1 THEN 1
    WHEN json_extract(NEW.document_json, '$.kind') = 'layout_document_v1' THEN NOT COALESCE((
      json_extract(NEW.document_json, '$.schemaVersion') = 1 AND json_extract(NEW.document_json, '$.kind') = 'layout_document_v1'
      AND json_type(NEW.document_json, '$.canvases') IS 'array'
      AND NOT EXISTS (
        SELECT 1 FROM json_each(NEW.document_json, '$.canvases') canvas
        WHERE json_type(canvas.value, '$.elements') IS NOT 'array'
      )
      AND NOT EXISTS (
        SELECT 1 FROM (${layoutProjectionRows}) p
        WHERE p.element_id IS NULL OR length(trim(p.element_id)) = 0
          OR p.shot_id IS NULL OR length(trim(p.shot_id)) = 0
          OR p.candidate_id IS NULL OR length(trim(p.candidate_id)) = 0
          OR p.lock_id IS NULL OR length(trim(p.lock_id)) = 0
          OR p.asset_id IS NULL OR length(trim(p.asset_id)) = 0
          OR p.source_digest IS NULL OR length(trim(p.source_digest)) = 0
      )
      AND (SELECT count(*) FROM layout_source_bindings b WHERE b.layout_revision_id = NEW.id) = (SELECT count(*) FROM (${layoutProjectionRows}))
      AND NOT EXISTS (
        SELECT 1 FROM (${layoutProjectionRows}) p
        LEFT JOIN layout_source_bindings b ON b.layout_revision_id = NEW.id AND b.role = p.role AND b."order" = p.binding_order
        WHERE b.id IS NULL OR b.element_id IS NOT p.element_id OR b.shot_id IS NOT p.shot_id
          OR b.candidate_id IS NOT p.candidate_id OR b.candidate_lock_revision_id IS NOT p.lock_id
          OR b.asset_id IS NOT p.asset_id OR b.source_digest IS NOT p.source_digest
      )
    ), 0)
    WHEN json_extract(NEW.document_json, '$.kind') = 'legacy_chapter_layout_v1' THEN NOT COALESCE((
      json_extract(NEW.document_json, '$.schemaVersion') = 1 AND json_extract(NEW.document_json, '$.kind') = 'legacy_chapter_layout_v1'
      AND json_extract(NEW.document_json, '$.sourceResolution') IN ('complete', 'unresolved')
      AND json_type(NEW.document_json, '$.sourceBindings') IS 'array'
      AND NOT (
        json_extract(NEW.document_json, '$.sourceResolution') = 'complete'
        AND EXISTS (
          SELECT 1 FROM json_each(NEW.document_json, '$.sourceBindings') complete_source
          WHERE json_type(complete_source.value, '$.role') IS NOT 'text'
            OR length(trim(json_extract(complete_source.value, '$.role'))) = 0
            OR json_type(complete_source.value, '$.order') IS NOT 'integer'
            OR json_extract(complete_source.value, '$.order') < 1
            OR json_type(complete_source.value, '$.elementId') IS NOT 'text'
            OR length(trim(json_extract(complete_source.value, '$.elementId'))) = 0
            OR json_type(complete_source.value, '$.shotId') IS NOT 'text'
            OR length(trim(json_extract(complete_source.value, '$.shotId'))) = 0
            OR json_type(complete_source.value, '$.candidateId') IS NOT 'text'
            OR length(trim(json_extract(complete_source.value, '$.candidateId'))) = 0
            OR json_type(complete_source.value, '$.candidateLockRevisionId') IS NOT 'text'
            OR length(trim(json_extract(complete_source.value, '$.candidateLockRevisionId'))) = 0
            OR json_type(complete_source.value, '$.assetId') IS NOT 'text'
            OR length(trim(json_extract(complete_source.value, '$.assetId'))) = 0
            OR json_type(complete_source.value, '$.sourceDigest') IS NOT 'text'
            OR length(trim(json_extract(complete_source.value, '$.sourceDigest'))) = 0
        )
      )
      AND (SELECT count(*) FROM layout_source_bindings b WHERE b.layout_revision_id = NEW.id) = json_array_length(NEW.document_json, '$.sourceBindings')
      AND NOT EXISTS (
        SELECT 1 FROM json_each(NEW.document_json, '$.sourceBindings') j
        LEFT JOIN layout_source_bindings b ON b.layout_revision_id = NEW.id
          AND b.role = json_extract(j.value, '$.role') AND b."order" = json_extract(j.value, '$.order')
        WHERE b.id IS NULL OR b.element_id IS NOT json_extract(j.value, '$.elementId')
          OR b.shot_id IS NOT json_extract(j.value, '$.shotId') OR b.candidate_id IS NOT json_extract(j.value, '$.candidateId')
          OR b.candidate_lock_revision_id IS NOT json_extract(j.value, '$.candidateLockRevisionId')
          OR b.asset_id IS NOT json_extract(j.value, '$.assetId') OR b.source_digest IS NOT json_extract(j.value, '$.sourceDigest')
      )
    ), 0)
    ELSE 1 END
  `),
]);
explicit('layout_revisions', 'trg_layout_revisions_immutable_update', '11.2,12.3', 'UPDATE', [
  reject(code('trg_layout_revisions_immutable_update'), `
    ${changed(['id', 'project_id', 'chapter_id', 'revision', 'previous_revision_id', 'content_based_on_revision_id', 'document_json', 'schema_version', 'document_digest', 'source_lock_set_digest', 'origin', 'save_reason', 'created_at'])}
    OR NOT ((OLD.binding_set_sealed_at IS NEW.binding_set_sealed_at)
      OR (OLD.binding_set_sealed_at IS NULL AND NEW.binding_set_sealed_at IS NOT NULL))
  `),
]);
purgeDelete('layout_revisions', 'trg_layout_revisions_immutable_delete', '11.2,12.3,12.4', 'OLD.project_id');

// §11.3 LayoutSourceBinding
explicit('layout_source_bindings', 'trg_layout_source_bindings_scope_insert', '11.3,12.3', 'INSERT', [
  reject(code('trg_layout_source_bindings_scope_insert'), `NOT EXISTS (
    SELECT 1 FROM layout_revisions r WHERE r.id = NEW.layout_revision_id AND r.binding_set_sealed_at IS NULL
      AND (NEW.shot_id IS NULL OR EXISTS (SELECT 1 FROM shots s WHERE s.id = NEW.shot_id AND s.project_id = r.project_id AND s.chapter_id = r.chapter_id))
      AND (NEW.candidate_id IS NULL OR (NEW.asset_id IS NOT NULL AND EXISTS (SELECT 1 FROM candidates c WHERE c.id = NEW.candidate_id AND c.project_id = r.project_id AND c.chapter_id = r.chapter_id AND c.asset_id IS NEW.asset_id AND (NEW.shot_id IS NULL OR c.shot_id = NEW.shot_id))))
      AND (NEW.candidate_lock_revision_id IS NULL OR (NEW.candidate_id IS NOT NULL AND EXISTS (SELECT 1 FROM candidate_lock_revisions l WHERE l.id = NEW.candidate_lock_revision_id AND l.project_id = r.project_id AND l.chapter_id = r.chapter_id AND l.action IN ('lock', 'replace') AND (NEW.shot_id IS NULL OR l.shot_id = NEW.shot_id) AND l.candidate_id IS NEW.candidate_id)))
      AND (NEW.asset_id IS NULL OR EXISTS (SELECT 1 FROM assets a WHERE a.id = NEW.asset_id AND a.project_id = r.project_id AND (a.chapter_id IS NULL OR a.chapter_id = r.chapter_id) AND a.status = 'ready' AND a.sha256 = NEW.source_digest))
  )`),
]);
add('layout_source_bindings', 'trg_layout_source_bindings_append_only_update', '11.3,12.3', 'always-reject-v1', {
  event: 'UPDATE', errorCode: code('trg_layout_source_bindings_append_only_update'),
});
purgeDelete('layout_source_bindings', 'trg_layout_source_bindings_history_delete', '11.3,12.3,12.4', '(SELECT project_id FROM layout_revisions WHERE id = OLD.layout_revision_id)');

// §11.4 ExportRevision
const exportScopeValid = normalize(`
  EXISTS (SELECT 1 FROM projects p WHERE p.id = NEW.project_id)
  AND ((NEW.chapter_id IS NULL AND NEW.scope_key = 'project')
    OR (NEW.chapter_id IS NOT NULL AND NEW.scope_key = 'chapter:' || NEW.chapter_id
      AND EXISTS (SELECT 1 FROM chapters c WHERE c.id = NEW.chapter_id AND c.project_id = NEW.project_id)))
  AND (NEW.task_id IS NULL OR EXISTS (SELECT 1 FROM generation_tasks t WHERE t.id = NEW.task_id AND t.project_id = NEW.project_id AND t.chapter_id IS NEW.chapter_id))
  AND (NEW.layout_revision_id IS NULL OR EXISTS (SELECT 1 FROM layout_revisions r WHERE r.id = NEW.layout_revision_id AND r.project_id = NEW.project_id AND r.chapter_id IS NEW.chapter_id))
`);
for (const event of ['INSERT', 'UPDATE'] as const) {
  const name = `trg_export_revisions_scope_${event.toLowerCase()}` as `trg_${string}`;
  explicit('export_revisions', name, '11.4,12.3', event, [reject(code(name), `NOT (${exportScopeValid})`)]);
}
explicit('export_revisions', 'trg_export_revisions_unready_insert', '11.4,12.3', 'INSERT', [
  reject(code('trg_export_revisions_unready_insert'), `
    NEW.status = 'ready' OR NEW.ready_at IS NOT NULL OR NEW.completion_applicability IS NOT NULL
  `),
]);
immutable('export_revisions', 'trg_export_revisions_runtime_source_immutable_update', '11.4,12.3', [
  'id', 'project_id', 'chapter_id', 'scope_key', 'revision', 'kind', 'task_id', 'layout_revision_id',
  'source_lock_set_digest', 'profile_json', 'profile_schema_version', 'profile_digest', 'preflight_digest',
  'renderer_version', 'origin', 'created_at',
], "OLD.origin = 'runtime'");
explicit('export_revisions', 'trg_export_revisions_ready_guard_update', '11.4,12.3', 'UPDATE', [
  reject(code('trg_export_revisions_ready_guard_update'), `NOT (
    NEW.ready_at IS NOT NULL AND NEW.manifest_json IS NOT NULL AND NEW.manifest_schema_version IS NOT NULL
    AND NEW.manifest_digest IS NOT NULL AND NEW.completion_applicability IS NOT NULL
    AND NEW.failed_at IS NULL AND NEW.cancelled_at IS NULL
    AND EXISTS (SELECT 1 FROM export_artifacts ea WHERE ea.export_revision_id = NEW.id)
    AND NOT EXISTS (
      SELECT 1 FROM export_artifacts ea JOIN assets a ON a.id = ea.asset_id
      WHERE ea.export_revision_id = NEW.id AND a.status <> 'ready'
    )
  )`),
], "OLD.status <> 'ready' AND NEW.status = 'ready'");
immutable('export_revisions', 'trg_export_revisions_ready_immutable_update', '11.4,12.3', [
  'id', 'project_id', 'chapter_id', 'scope_key', 'revision', 'kind', 'status', 'task_id', 'layout_revision_id',
  'source_lock_set_digest', 'profile_json', 'profile_schema_version', 'profile_digest', 'preflight_digest',
  'renderer_version', 'manifest_json', 'manifest_schema_version', 'manifest_digest', 'completion_applicability',
  'origin', 'created_at', 'ready_at', 'failed_at', 'cancelled_at',
], "OLD.status = 'ready'");
purgeDelete('export_revisions', 'trg_export_revisions_ready_immutable_delete', '11.4,12.3,12.4', 'OLD.project_id', "OLD.status = 'ready'");

// §11.5 ExportArtifact
const exportArtifactScope = normalize(`
  EXISTS (
    SELECT 1 FROM export_revisions e JOIN assets a ON a.id = NEW.asset_id
    WHERE e.id = NEW.export_revision_id AND a.project_id = e.project_id
      AND (e.chapter_id IS NULL OR a.chapter_id IS NULL OR a.chapter_id = e.chapter_id)
  )
`);
for (const event of ['INSERT', 'UPDATE'] as const) {
  const name = `trg_export_artifacts_scope_${event.toLowerCase()}` as `trg_${string}`;
  explicit('export_artifacts', name, '11.5,12.3', event, [reject(code(name), `${event === 'UPDATE' ? 'NEW.export_revision_id IS NOT OLD.export_revision_id OR ' : ''}NOT (${exportArtifactScope})`)]);
}
for (const event of ['INSERT', 'UPDATE', 'DELETE'] as const) {
  const name = `trg_export_artifacts_parent_ready_${event.toLowerCase()}` as `trg_${string}`;
  const row = event === 'DELETE' ? 'OLD' : 'NEW';
  add('export_artifacts', name, '11.5,12.3,12.4', 'parent-terminal-set-seal-v1', {
    event,
    parentReadyPredicate: `EXISTS (SELECT 1 FROM export_revisions e WHERE e.id = ${row}.export_revision_id AND e.status = 'ready')`,
    projectIdSql: `(SELECT project_id FROM export_revisions WHERE id = ${row}.export_revision_id)`,
    errorCode: code(name),
  });
}

// §11.6 OutboxEvent
explicit('outbox_events', 'trg_outbox_events_pending_insert', '11.6,12.3', 'INSERT', [
  reject(code('trg_outbox_events_pending_insert'), `NOT (
    NEW.status = 'pending' AND NEW.attempt = 0 AND NEW.max_attempts = 3 AND NEW.processed_at IS NULL
    AND NEW.lease_owner_id IS NULL AND NEW.lease_token IS NULL AND NEW.lease_expires_at IS NULL
  )`),
]);
immutable('outbox_events', 'trg_outbox_events_intent_immutable', '11.6,12.3', [
  'id', 'event_type', 'aggregate_type', 'aggregate_id', 'payload_json', 'payload_schema_version',
  'payload_digest', 'max_attempts', 'idempotency_key', 'created_at',
]);
explicit('outbox_events', 'trg_outbox_events_attempt_transition', '11.6,12.3', 'UPDATE', [
  reject(code('trg_outbox_events_attempt_transition'), `NOT (
    (OLD.status = 'pending' AND NEW.status = 'processing' AND NEW.attempt = OLD.attempt + 1 AND NEW.attempt <= NEW.max_attempts)
    OR (NOT (OLD.status = 'pending' AND NEW.status = 'processing') AND NEW.attempt = OLD.attempt)
  )`),
]);
explicit('outbox_events', 'trg_outbox_events_state_transition', '11.6,12.3', 'UPDATE', [
  reject(code('trg_outbox_events_state_transition'), `NOT (
    (OLD.status = 'pending' AND NEW.status = 'processing' AND OLD.available_at <= NEW.updated_at AND NEW.available_at IS OLD.available_at)
    OR (OLD.status = 'processing' AND NEW.status = 'processing' AND NEW.available_at IS OLD.available_at)
    OR (OLD.status = 'processing' AND NEW.status = 'pending' AND OLD.attempt < OLD.max_attempts AND NEW.available_at > NEW.updated_at)
    OR (OLD.status = 'processing' AND NEW.status IN ('processed', 'failed') AND NEW.available_at IS OLD.available_at)
  )`),
]);
explicit('outbox_events', 'trg_outbox_events_lease_shape', '11.6,12.3', 'UPDATE', [
  reject(code('trg_outbox_events_lease_shape'), `NOT (
    (OLD.status = 'pending' AND NEW.status = 'processing'
      AND OLD.lease_owner_id IS NULL AND OLD.lease_token IS NULL AND OLD.lease_expires_at IS NULL
      AND NEW.lease_owner_id IS NOT NULL AND NEW.lease_token IS NOT NULL AND NEW.lease_expires_at > NEW.updated_at)
    OR (OLD.status = 'processing' AND NEW.status = 'processing'
      AND NEW.lease_owner_id IS NOT NULL AND NEW.lease_token IS NOT NULL AND NEW.lease_expires_at IS NOT NULL)
    OR (OLD.status = 'processing' AND NEW.status IN ('pending', 'processed', 'failed')
      AND NEW.lease_owner_id IS NULL AND NEW.lease_token IS NULL AND NEW.lease_expires_at IS NULL)
  )`),
]);
explicit('outbox_events', 'trg_outbox_events_lease_fencing', '11.6,12.3', 'UPDATE', [
  reject(code('trg_outbox_events_lease_fencing'), `OLD.status = 'processing' AND NEW.status = 'processing' AND (
    NEW.lease_owner_id IS NOT OLD.lease_owner_id OR NEW.lease_token IS NOT OLD.lease_token
    OR NEW.updated_at <= OLD.updated_at OR NEW.lease_expires_at <= OLD.lease_expires_at
  )`),
  reject(code('trg_outbox_events_lease_fencing'), `OLD.status = 'processing' AND NEW.status <> 'processing' AND (
    OLD.lease_owner_id IS NULL OR OLD.lease_token IS NULL OR OLD.lease_expires_at IS NULL
  )`),
]);
explicit('outbox_events', 'trg_outbox_events_processed_immutable', '11.6,12.3', 'UPDATE', [
  reject(code('trg_outbox_events_processed_immutable'), `
    OLD.status = 'processing' AND NEW.status = 'processed' AND NOT (OLD.processed_at IS NULL AND NEW.processed_at IS NOT NULL)
  `),
  reject(code('trg_outbox_events_processed_immutable'), `NEW.status <> 'processed' AND NEW.processed_at IS NOT NULL`),
  reject(code('trg_outbox_events_processed_immutable'), `OLD.status IN ('processed', 'failed') AND (${changed([
    'status', 'attempt', 'available_at', 'lease_owner_id', 'lease_token', 'lease_expires_at', 'last_error_json', 'updated_at', 'processed_at',
  ])})`),
]);
add('outbox_events', 'trg_outbox_events_no_delete', '11.6,12.3', 'always-reject-v1', {
  event: 'DELETE', errorCode: code('trg_outbox_events_no_delete'),
});

const TABLES = new Set([
  'generation_tasks', 'task_attempts', 'task_concurrency_slots', 'generation_task_sources',
  'layout_working_copies', 'layout_revisions', 'layout_source_bindings', 'export_revisions',
  'export_artifacts', 'outbox_events',
]);

const expand = (binding: G1PhysicalTriggerBindingV1): G1SchemaTriggerSource => {
  const template = TEMPLATES.find((item) => item.templateId === binding.templateId);
  if (template === undefined) throw new Error(`unknown template ${binding.templateId}`);
  const expected = [...template.argsKeys].sort(binaryCompare);
  const actual = Object.keys(binding.args).sort(binaryCompare);
  if (expected.join('\0') !== actual.join('\0')) throw new Error(`${binding.name} args mismatch`);
  const value = template.expand(binding.args);
  if (value.errorCode !== code(binding.name) || value.normalizedBody.length === 0 || value.normalizedWhen === '0') {
    throw new Error(`${binding.name} incomplete expansion`);
  }
  return { ownerStage: 'G1', table: binding.table, name: binding.name, sourceSection: binding.sourceSection, ...value };
};

const sameTriggerExpansion = (left: G1SchemaTriggerSource, right: G1SchemaTriggerSource): boolean =>
  left.ownerStage === right.ownerStage && left.table === right.table && left.name === right.name &&
  left.timing === right.timing && left.event === right.event &&
  JSON.stringify(left.updateColumns) === JSON.stringify(right.updateColumns) &&
  left.normalizedWhen === right.normalizedWhen && left.normalizedBody === right.normalizedBody &&
  left.errorCode === right.errorCode;

const mentioned = (markdown: string, table: string, name: `trg_${string}`): boolean => {
  if (markdown.includes(name)) return true;
  const prefix = `trg_${table}_`;
  const suffix = name.startsWith(prefix) ? name.slice(prefix.length) : name;
  let offset = markdown.indexOf(prefix);
  while (offset >= 0) {
    const window = markdown.slice(offset, offset + 2000);
    if (window.includes(suffix)) return true;
    if (suffix.endsWith('_update') && window.includes(`${suffix.slice(0, -'_update'.length)}_insert/update`)) return true;
    if (suffix.endsWith('_delete') && window.includes(`${suffix.slice(0, -'_delete'.length)}_update/delete`)) return true;
    offset = markdown.indexOf(prefix, offset + prefix.length);
  }
  if (markdown.includes(suffix)) return true;
  if (suffix.endsWith('_delete')) {
    const stem = suffix.slice(0, -'_delete'.length);
    return markdown.includes(`${stem}_update/delete`) || markdown.includes(`${stem}_insert/update/delete`);
  }
  return false;
};

export function buildG1SchemaTriggerRuntimeBDslSource(
  contractMarkdown: string,
  constraintIssues: readonly G1CompletenessIssue[],
  baseTriggers: readonly G1SchemaTriggerSource[] = [],
): G1SchemaTriggerRuntimeBDslSource {
  const completenessIssues: G1CompletenessIssue[] = [];
  const canonical = [...bindings].sort((left, right) => binaryCompare(`${left.table}\0${left.name}`, `${right.table}\0${right.name}`));
  const counts = canonical.reduce<Map<string, number>>((map, item) => map.set(item.name, (map.get(item.name) ?? 0) + 1), new Map());
  for (const binding of canonical) {
    if (counts.get(binding.name) !== 1) completenessIssues.push({ kind: 'trigger', key: binding.name, table: binding.table, sourceSection: binding.sourceSection, missing: ['exactly one binding'] });
    if (!mentioned(contractMarkdown, binding.table, binding.name)) completenessIssues.push({ kind: 'source-document', key: binding.name, table: binding.table, sourceSection: binding.sourceSection, missing: ['physical trigger authority'] });
    if (binding.existingBase && baseTriggers.length > 0) {
      const expected = baseTriggers.find((item) => item.table === binding.table && item.name === binding.name);
      const expanded = expand(binding);
      if (expected === undefined) {
        completenessIssues.push({ kind: 'trigger', key: binding.name, table: binding.table, sourceSection: binding.sourceSection, missing: ['existing base trigger definition'] });
      } else if (!sameTriggerExpansion(expanded, expected)) {
        completenessIssues.push({ kind: 'trigger', key: binding.name, table: binding.table, sourceSection: binding.sourceSection, missing: ['existing base trigger is not byte-equal to template expansion'] });
      }
    }
  }
  const names = new Set(canonical.map((item) => item.name));
  const requested = constraintIssues.filter((issue) => issue.kind === 'trigger' && issue.table !== null && TABLES.has(issue.table));
  for (const issue of requested) {
    if (!names.has(issue.key as `trg_${string}`)) completenessIssues.push({ ...issue, missing: ['Runtime B complete binding'] });
  }
  const requestedNames = new Set(requested.map((issue) => issue.key));
  const triggers = canonical.filter((item) => !item.existingBase && requestedNames.has(item.name)).map(expand);
  return {
    sourceDocument: '2026-07-11_G1数据库Schema实施契约.md',
    sourceSections: ['10.1-11.6', '12.3', '12.3.1', '12.4'],
    templates: TEMPLATES.map(({ templateId, templateVersion, argsKeys }) => ({ templateId, templateVersion, argsKeys })),
    bindings: canonical,
    triggers,
    completenessIssues: completenessIssues.sort((left, right) => binaryCompare(`${left.kind}:${left.key}`, `${right.kind}:${right.key}`)),
    residualTriggerKeys: [],
  };
}
