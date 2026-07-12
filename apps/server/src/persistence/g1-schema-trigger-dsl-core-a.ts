import type {
  G1CompletenessIssue,
  G1SchemaTriggerSource,
} from './g1-schema-constraint-source.js';

type TriggerArg = string | number | boolean | null | readonly string[];
type TriggerArgs = Readonly<Record<string, TriggerArg>>;
type TriggerEvent = G1SchemaTriggerSource['event'];
type TriggerTiming = G1SchemaTriggerSource['timing'];

export interface G1TriggerTemplateV1 {
  readonly templateId: string;
  readonly templateVersion: 1;
  readonly argsKeys: readonly string[];
}

export interface G1PhysicalTriggerBindingV1 {
  readonly name: `trg_${string}`;
  readonly table: string;
  readonly ownerStage: 'G1';
  readonly templateId: string;
  readonly templateVersion: 1;
  readonly args: TriggerArgs;
  readonly sourceSection: string;
  readonly existingBase: boolean;
}

export interface G1SchemaTriggerCoreADslSource {
  readonly sourceDocument: '2026-07-11_G1数据库Schema实施契约.md';
  readonly sourceSections: readonly ['5.1-6.6', '6.1.1', '12.3', '12.3.1', '12.4'];
  readonly templates: readonly G1TriggerTemplateV1[];
  readonly bindings: readonly G1PhysicalTriggerBindingV1[];
  /** Only triggers still reported missing by the supplied base constraint source. */
  readonly triggers: readonly G1SchemaTriggerSource[];
  readonly completenessIssues: readonly G1CompletenessIssue[];
  readonly residualTriggerKeys: readonly string[];
}

interface RuntimeTemplate extends G1TriggerTemplateV1 {
  readonly expand: (args: TriggerArgs) => Omit<G1SchemaTriggerSource, 'ownerStage' | 'table' | 'name' | 'sourceSection'>;
}

const normalizeSql = (value: string): string => value.replace(/[\t\n\v\f\r ]+/g, ' ').trim().replace(/;$/, '');

const compareCanonicalText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const stringArg = (args: TriggerArgs, key: string): string => {
  const value = args[key];
  if (typeof value !== 'string') throw new Error(`Trigger DSL arg ${key} must be string`);
  return value;
};

const stringArrayArg = (args: TriggerArgs, key: string): readonly string[] => {
  const value = args[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Trigger DSL arg ${key} must be string[]`);
  }
  return value as readonly string[];
};

const eventArg = (args: TriggerArgs): TriggerEvent => {
  const value = stringArg(args, 'event');
  if (value !== 'INSERT' && value !== 'UPDATE' && value !== 'DELETE') throw new Error(`Invalid trigger event ${value}`);
  return value;
};

const timingArg = (args: TriggerArgs): TriggerTiming => {
  const value = stringArg(args, 'timing');
  if (value !== 'BEFORE' && value !== 'AFTER') throw new Error(`Invalid trigger timing ${value}`);
  return value;
};

const errorCodeArg = (args: TriggerArgs): `AIR_G1:${string}` => {
  const value = stringArg(args, 'errorCode');
  if (!value.startsWith('AIR_G1:trg_')) throw new Error(`Invalid trigger errorCode ${value}`);
  return value as `AIR_G1:${string}`;
};

const rejectSql = (errorCode: string, predicate?: string): string =>
  normalizeSql(`SELECT RAISE(ABORT, '${errorCode}')${predicate === undefined ? '' : ` WHERE ${predicate}`}`);

const changed = (columns: readonly string[]): string => columns.map((column) => `NEW.${column} IS NOT OLD.${column}`).join(' OR ');

const projectPurgeEligible = (projectIdSql: string): string => normalizeSql(`
  EXISTS (
    SELECT 1 FROM projects AS purge_project
    WHERE purge_project.id = ${projectIdSql}
      AND purge_project.lifecycle_status = 'deleting'
  )
  AND EXISTS (
    SELECT 1 FROM outbox_events AS purge_event
    WHERE purge_event.event_type = 'project.delete_files'
      AND purge_event.aggregate_type = 'project'
      AND purge_event.aggregate_id = ${projectIdSql}
      AND purge_event.status = 'processed'
  )
  AND NOT EXISTS (
    SELECT 1 FROM generation_tasks AS purge_task
    WHERE purge_task.project_id = ${projectIdSql}
      AND purge_task.record_kind = 'runtime'
      AND purge_task.status IN ('queued', 'running', 'retrying')
  )
`);

const explicitTemplate: RuntimeTemplate = {
  templateId: 'explicit-trigger-v1',
  templateVersion: 1,
  argsKeys: ['timing', 'event', 'updateColumns', 'when', 'bodyStatements', 'errorCode'],
  expand: (args) => ({
    timing: timingArg(args),
    event: eventArg(args),
    updateColumns: stringArrayArg(args, 'updateColumns'),
    normalizedWhen: normalizeSql(stringArg(args, 'when')),
    normalizedBody: stringArrayArg(args, 'bodyStatements').map(normalizeSql).join('; '),
    errorCode: errorCodeArg(args),
  }),
};

const identityImmutableTemplate: RuntimeTemplate = {
  templateId: 'identity-immutable-update-v1',
  templateVersion: 1,
  argsKeys: ['columns', 'guard', 'errorCode'],
  expand: (args) => {
    const guard = stringArg(args, 'guard');
    const errorCode = errorCodeArg(args);
    return {
      timing: 'BEFORE', event: 'UPDATE', updateColumns: [], normalizedWhen: normalizeSql(guard),
      normalizedBody: rejectSql(errorCode, changed(stringArrayArg(args, 'columns'))), errorCode,
    };
  },
};

const singletonInsertTemplate: RuntimeTemplate = {
  templateId: 'singleton-insert-v1',
  templateVersion: 1,
  argsKeys: ['table', 'errorCode'],
  expand: (args) => {
    const errorCode = errorCodeArg(args);
    return {
      timing: 'BEFORE', event: 'INSERT', updateColumns: [], normalizedWhen: '1',
      normalizedBody: rejectSql(errorCode, `EXISTS (SELECT 1 FROM ${stringArg(args, 'table')})`), errorCode,
    };
  },
};

const alwaysRejectTemplate: RuntimeTemplate = {
  templateId: 'always-reject-v1',
  templateVersion: 1,
  argsKeys: ['event', 'errorCode'],
  expand: (args) => {
    const errorCode = errorCodeArg(args);
    return {
      timing: 'BEFORE', event: eventArg(args), updateColumns: [], normalizedWhen: '1',
      normalizedBody: rejectSql(errorCode), errorCode,
    };
  },
};

const projectPurgeDeleteTemplate: RuntimeTemplate = {
  templateId: 'project-purge-delete-guard-v1',
  templateVersion: 1,
  argsKeys: ['projectIdSql', 'guard', 'errorCode'],
  expand: (args) => {
    const errorCode = errorCodeArg(args);
    const guard = stringArg(args, 'guard');
    const eligible = projectPurgeEligible(stringArg(args, 'projectIdSql'));
    return {
      timing: 'BEFORE', event: 'DELETE', updateColumns: [], normalizedWhen: normalizeSql(guard),
      normalizedBody: rejectSql(errorCode, `NOT (${eligible})`), errorCode,
    };
  },
};

const validOwnerScopeTemplate: RuntimeTemplate = {
  templateId: 'owner-scope-existence-v1',
  templateVersion: 1,
  argsKeys: ['event', 'validPredicate', 'immutableColumns', 'errorCode'],
  expand: (args) => {
    const event = eventArg(args);
    const errorCode = errorCodeArg(args);
    const statements = [rejectSql(errorCode, `NOT (${stringArg(args, 'validPredicate')})`)];
    const columns = stringArrayArg(args, 'immutableColumns');
    if (event === 'UPDATE' && columns.length > 0) statements.push(rejectSql(errorCode, changed(columns)));
    return {
      timing: 'BEFORE', event, updateColumns: [], normalizedWhen: '1',
      normalizedBody: statements.join('; '), errorCode,
    };
  },
};

const RUNTIME_TEMPLATES: readonly RuntimeTemplate[] = [
  explicitTemplate,
  identityImmutableTemplate,
  singletonInsertTemplate,
  alwaysRejectTemplate,
  projectPurgeDeleteTemplate,
  validOwnerScopeTemplate,
];

const baseTriggerNames = new Set([
  'trg_persistence_states_no_second_row',
  'trg_persistence_states_no_delete',
  'trg_migration_issues_no_delete',
]);

const bindings: G1PhysicalTriggerBindingV1[] = [];

const addBinding = (
  table: string,
  name: `trg_${string}`,
  sourceSection: string,
  templateId: string,
  args: TriggerArgs,
): void => {
  bindings.push({
    name, table, ownerStage: 'G1', templateId, templateVersion: 1, args, sourceSection,
    existingBase: baseTriggerNames.has(name),
  });
};

const errorCode = (name: `trg_${string}`): `AIR_G1:${string}` => `AIR_G1:${name}`;

const addExplicit = (
  table: string,
  name: `trg_${string}`,
  sourceSection: string,
  event: TriggerEvent,
  bodyStatements: readonly string[],
  when = '1',
  updateColumns: readonly string[] = [],
  timing: TriggerTiming = 'BEFORE',
): void => addBinding(table, name, sourceSection, 'explicit-trigger-v1', {
  timing, event, updateColumns, when, bodyStatements, errorCode: errorCode(name),
});

const addIdentity = (
  table: string,
  name: `trg_${string}`,
  sourceSection: string,
  columns: readonly string[],
  guard = '1',
): void => addBinding(table, name, sourceSection, 'identity-immutable-update-v1', {
  columns, guard, errorCode: errorCode(name),
});

const addPurgeDelete = (
  table: string,
  name: `trg_${string}`,
  sourceSection: string,
  projectIdSql: string,
  guard = '1',
): void => addBinding(table, name, sourceSection, 'project-purge-delete-guard-v1', {
  projectIdSql, guard, errorCode: errorCode(name),
});

const addScope = (
  table: string,
  name: `trg_${string}`,
  sourceSection: string,
  event: 'INSERT' | 'UPDATE',
  validPredicate: string,
  immutableColumns: readonly string[] = [],
): void => addBinding(table, name, sourceSection, 'owner-scope-existence-v1', {
  event, validPredicate, immutableColumns, errorCode: errorCode(name),
});

// §5.1 PersistenceState
addExplicit('persistence_states', 'trg_persistence_states_initial_insert', '5.1,12.3', 'INSERT', [
  rejectSql(errorCode('trg_persistence_states_initial_insert'), `NOT (
    NEW.id = 'primary' AND NEW.storage_contract_version = 1 AND NEW.activation_state = 'shadow'
    AND NEW.cutover_run_id IS NULL AND NEW.source_manifest_digest IS NULL
    AND NEW.effective_schema_manifest_digest IS NULL
    AND NEW.activated_at IS NULL AND NEW.first_business_write_at IS NULL
  )`),
]);
addBinding('persistence_states', 'trg_persistence_states_no_second_row', '5.1,12.3', 'singleton-insert-v1', {
  table: 'persistence_states', errorCode: errorCode('trg_persistence_states_no_second_row'),
});
addBinding('persistence_states', 'trg_persistence_states_no_delete', '5.1,12.3', 'always-reject-v1', {
  event: 'DELETE', errorCode: errorCode('trg_persistence_states_no_delete'),
});
addIdentity('persistence_states', 'trg_persistence_states_identity_immutable', '5.1,12.3', [
  'id', 'storage_contract_version', 'created_at',
]);

const cutoverRunValid = normalizeSql(`
  NEW.cutover_run_id IS NULL OR EXISTS (
    SELECT 1 FROM migration_runs AS cutover_run
    WHERE cutover_run.id = NEW.cutover_run_id
      AND cutover_run.kind = 'final'
      AND cutover_run.status = 'succeeded'
      AND cutover_run.source_manifest_digest IS NEW.source_manifest_digest
      AND CASE WHEN json_valid(cutover_run.verification_json) = 1 THEN
        json_type(cutover_run.verification_json) IS 'object'
        AND json_type(cutover_run.verification_json, '$.effectiveSchemaManifestDigest') IS 'text'
        AND json_extract(cutover_run.verification_json, '$.effectiveSchemaManifestDigest') IS NEW.effective_schema_manifest_digest
      ELSE 0 END
  )
`);
for (const event of ['INSERT', 'UPDATE'] as const) {
  const name = `trg_persistence_states_cutover_run_${event.toLowerCase()}` as `trg_${string}`;
  addExplicit('persistence_states', name, '5.1,12.3', event, [
    rejectSql(errorCode(name), `NOT (${cutoverRunValid})`),
  ]);
}
addExplicit('persistence_states', 'trg_persistence_states_activation_transition', '5.1,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_persistence_states_activation_transition'), `NOT (
    (OLD.activation_state = NEW.activation_state)
    OR (OLD.activated_at IS NULL AND OLD.activation_state = 'shadow' AND NEW.activation_state IN ('ready_for_activation', 'recovery_required'))
    OR (OLD.activated_at IS NULL AND OLD.activation_state = 'ready_for_activation' AND NEW.activation_state IN ('shadow', 'db_only', 'recovery_required'))
    OR (OLD.activated_at IS NULL AND OLD.activation_state = 'recovery_required' AND NEW.activation_state IN ('shadow', 'ready_for_activation', 'recovery_required'))
    OR (OLD.activated_at IS NOT NULL AND OLD.activation_state = 'recovery_required' AND NEW.activation_state IN ('recovery_required', 'db_only'))
    OR (OLD.activated_at IS NOT NULL AND OLD.activation_state = 'db_only' AND NEW.activation_state IN ('db_only', 'recovery_required'))
  )`),
]);
addExplicit('persistence_states', 'trg_persistence_states_activation_first_write', '5.1,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_persistence_states_activation_first_write'), `
    OLD.activated_at IS NULL AND NEW.activated_at IS NOT NULL AND NOT (
      OLD.activation_state = 'ready_for_activation' AND NEW.activation_state = 'db_only'
      AND NEW.cutover_run_id IS NOT NULL AND NEW.source_manifest_digest IS NOT NULL
      AND NEW.effective_schema_manifest_digest IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM migration_runs AS activation_run
        WHERE activation_run.id = NEW.cutover_run_id AND activation_run.kind = 'final'
          AND activation_run.status = 'succeeded'
          AND activation_run.source_manifest_digest IS NEW.source_manifest_digest
          AND CASE WHEN json_valid(activation_run.verification_json) = 1 THEN
            json_type(activation_run.verification_json, '$.effectiveSchemaManifestDigest') IS 'text'
            AND json_extract(activation_run.verification_json, '$.effectiveSchemaManifestDigest') IS NEW.effective_schema_manifest_digest
          ELSE 0 END
      )
    )
  `),
  rejectSql(errorCode('trg_persistence_states_activation_first_write'), `
    OLD.first_business_write_at IS NULL AND NEW.first_business_write_at IS NOT NULL AND NOT (
      OLD.activated_at IS NOT NULL AND NEW.activated_at IS OLD.activated_at
      AND OLD.activation_state = 'db_only' AND NEW.activation_state = 'db_only'
    )
  `),
]);
addIdentity('persistence_states', 'trg_persistence_states_activation_identity_immutable', '5.1,12.3', [
  'activated_at', 'cutover_run_id', 'source_manifest_digest', 'effective_schema_manifest_digest',
], 'OLD.activated_at IS NOT NULL');
addExplicit('persistence_states', 'trg_persistence_states_first_write_monotonic', '5.1,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_persistence_states_first_write_monotonic'), `
    (OLD.first_business_write_at IS NOT NULL AND NEW.first_business_write_at IS NOT OLD.first_business_write_at)
    OR (OLD.first_business_write_at IS NULL AND NEW.first_business_write_at IS NOT NULL
        AND NOT (OLD.activated_at IS NOT NULL AND NEW.activated_at IS OLD.activated_at
                 AND OLD.activation_state = 'db_only' AND NEW.activation_state = 'db_only'))
  `),
]);

// §5.2 MigrationRun
addExplicit('migration_runs', 'trg_migration_runs_running_insert', '5.2,12.3', 'INSERT', [
  rejectSql(errorCode('trg_migration_runs_running_insert'), `
    NEW.status IS NOT 'running' OR NEW.finished_at IS NOT NULL OR NEW.report_digest IS NOT NULL
    OR NEW.verification_json IS NOT NULL OR NEW.verification_schema_version IS NOT NULL OR NEW.error_code IS NOT NULL
  `),
]);
addExplicit('migration_runs', 'trg_migration_runs_state_transition', '5.2,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_migration_runs_state_transition'), `NOT (
    (OLD.status = 'running' AND NEW.status = 'running' AND NEW.finished_at IS NULL)
    OR (OLD.status = 'running' AND NEW.status IN ('blocked', 'succeeded', 'failed')
        AND OLD.finished_at IS NULL AND NEW.finished_at IS NOT NULL)
  )`),
  rejectSql(errorCode('trg_migration_runs_state_transition'), `
    OLD.status = 'running' AND NEW.status = 'succeeded' AND NEW.kind = 'final' AND NOT (
      NEW.snapshot_manifest_digest IS NOT NULL AND NEW.decisions_digest IS NOT NULL AND NEW.report_digest IS NOT NULL
      AND NEW.counts_json IS NOT NULL AND NEW.counts_schema_version IS NOT NULL
      AND NEW.verification_json IS NOT NULL AND NEW.verification_schema_version = 1
      AND CASE WHEN json_valid(NEW.verification_json) = 1 THEN COALESCE((
        json_type(NEW.verification_json) IS 'object'
        AND json_extract(NEW.verification_json, '$.integrityCheck') = 'ok'
        AND json_extract(NEW.verification_json, '$.foreignKeyViolationCount') = 0
        AND json_extract(NEW.verification_json, '$.failedLedgerCount') = 0
        AND json_extract(NEW.verification_json, '$.migrationChecksumStatus') = 'verified'
        AND json_type(NEW.verification_json, '$.effectiveSchemaManifestDigest') IS 'text'
        AND length(json_extract(NEW.verification_json, '$.effectiveSchemaManifestDigest')) = 71
        AND substr(json_extract(NEW.verification_json, '$.effectiveSchemaManifestDigest'), 1, 7) = 'sha256:'
        AND substr(json_extract(NEW.verification_json, '$.effectiveSchemaManifestDigest'), 8) = lower(substr(json_extract(NEW.verification_json, '$.effectiveSchemaManifestDigest'), 8))
        AND substr(json_extract(NEW.verification_json, '$.effectiveSchemaManifestDigest'), 8) NOT GLOB '*[^0-9a-f]*'
        AND json_type(NEW.verification_json, '$.sourceManifestDigest') IS 'text'
        AND json_extract(NEW.verification_json, '$.sourceManifestDigest') IS NEW.source_manifest_digest
        AND json_extract(NEW.verification_json, '$.openBlockerCount') = 0
      ), 0) ELSE 0 END
      AND NOT EXISTS (
        SELECT 1 FROM migration_issues AS blocker
        WHERE blocker.run_id = NEW.id AND blocker.severity = 'blocker' AND blocker.resolution_status IS NOT 'resolved'
      )
    )
  `),
]);
addIdentity('migration_runs', 'trg_migration_runs_terminal_immutable_update', '5.2,12.3', [
  'id', 'kind', 'status', 'importer_version', 'source_manifest_digest', 'snapshot_manifest_digest',
  'decisions_digest', 'report_digest', 'counts_json', 'counts_schema_version', 'verification_json',
  'verification_schema_version', 'error_code', 'started_at', 'finished_at', 'created_at',
], "OLD.status IN ('blocked', 'succeeded', 'failed')");
addExplicit('migration_runs', 'trg_migration_runs_terminal_immutable_delete', '5.2,12.3', 'DELETE', [
  rejectSql(errorCode('trg_migration_runs_terminal_immutable_delete'), "OLD.status IN ('blocked', 'succeeded', 'failed')"),
]);

// §5.3 ImportedEntitySource
addIdentity('imported_entity_sources', 'trg_imported_entity_sources_identity_immutable', '5.3,12.3', [
  'source_key', 'entity_type', 'entity_id', 'source_storage_key', 'source_digest', 'first_run_id', 'created_at',
]);
addExplicit('imported_entity_sources', 'trg_imported_entity_sources_provenance_monotonic', '5.3,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_imported_entity_sources_provenance_monotonic'), `NOT (
    (OLD.provenance_status = NEW.provenance_status)
    OR (OLD.provenance_status = 'reference_only' AND NEW.provenance_status = 'partial')
    OR (OLD.provenance_status = 'partial' AND NEW.provenance_status = 'complete')
  )`),
  rejectSql(errorCode('trg_imported_entity_sources_provenance_monotonic'), `
    (OLD.payload_digest IS NOT NULL AND NEW.payload_digest IS NOT OLD.payload_digest)
    OR (NEW.last_run_id IS NOT OLD.last_run_id AND NOT (
      OLD.provenance_status IS NOT NEW.provenance_status
      OR (OLD.payload_digest IS NULL AND NEW.payload_digest IS NOT NULL)
    ))
  `),
]);

// §5.4 MigrationIssue
for (const event of ['INSERT', 'UPDATE'] as const) {
  const name = `trg_migration_issues_running_run_${event.toLowerCase()}` as `trg_${string}`;
  const validParent = `EXISTS (
      SELECT 1 FROM migration_runs AS parent_run
      WHERE parent_run.id = NEW.run_id AND parent_run.status = 'running'
    )`;
  if (event === 'INSERT') {
    addScope('migration_issues', name, '5.4,12.3', event, validParent);
  } else {
    addExplicit('migration_issues', name, '5.4,12.3', event, [
      rejectSql(errorCode(name), `NOT (${validParent})`),
      rejectSql(errorCode(name), changed(['run_id', 'issue_key', 'severity', 'code', 'source_key', 'entity_type', 'entity_id', 'storage_key', 'detail_json', 'detail_schema_version', 'created_at'])),
      rejectSql(errorCode(name), `NOT (
        OLD.resolution_status = NEW.resolution_status
        OR (OLD.resolution_status = 'open' AND NEW.resolution_status IN ('not_needed', 'resolved'))
      )`),
    ]);
  }
}
addBinding('migration_issues', 'trg_migration_issues_no_delete', '5.4,12.3', 'always-reject-v1', {
  event: 'DELETE', errorCode: errorCode('trg_migration_issues_no_delete'),
});

// §6.1 Project
const projectCurrentScope = normalizeSql(`
  (NEW.current_chapter_id IS NULL OR EXISTS (
    SELECT 1 FROM chapters AS current_chapter
    WHERE current_chapter.id = NEW.current_chapter_id AND current_chapter.project_id = NEW.id
  ))
  AND (NEW.current_script_outline_id IS NULL OR EXISTS (
    SELECT 1 FROM project_script_outlines AS current_outline
    WHERE current_outline.id = NEW.current_script_outline_id AND current_outline.project_id = NEW.id
  ))
`);
addScope('projects', 'trg_projects_current_scope_insert', '6.1,6.1.1,12.3', 'INSERT', `
  (${projectCurrentScope})
  AND (NEW.lifecycle_status = 'active' OR (NEW.current_chapter_id IS NULL AND NEW.current_script_outline_id IS NULL))
`);
addExplicit('projects', 'trg_projects_current_scope_update', '6.1,6.1.1,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_projects_current_scope_update'), `NOT (${projectCurrentScope})`),
  rejectSql(errorCode('trg_projects_current_scope_update'), `
    (NEW.current_chapter_id IS NOT OLD.current_chapter_id OR NEW.current_script_outline_id IS NOT OLD.current_script_outline_id)
    AND NOT (OLD.lifecycle_status = 'active' AND NEW.lifecycle_status = 'active')
  `),
]);
const genreTagsInvalid = normalizeSql(`
  CASE WHEN json_valid(NEW.genre_tags) = 1 THEN json_type(NEW.genre_tags) IS NOT 'array' ELSE 1 END
  OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(NEW.genre_tags) = 1 THEN NEW.genre_tags ELSE '[]' END) AS tag WHERE tag.type IS NOT 'text' OR length(trim(tag.value)) = 0)
  OR EXISTS (
    SELECT 1 FROM json_each(CASE WHEN json_valid(NEW.genre_tags) = 1 THEN NEW.genre_tags ELSE '[]' END) AS left_tag
    JOIN json_each(CASE WHEN json_valid(NEW.genre_tags) = 1 THEN NEW.genre_tags ELSE '[]' END) AS right_tag ON right_tag.key > left_tag.key AND right_tag.value = left_tag.value
  )
`);
for (const event of ['INSERT', 'UPDATE'] as const) {
  const name = `trg_projects_genre_tags_shape_${event.toLowerCase()}` as `trg_${string}`;
  addExplicit('projects', name, '6.1,12.3', event, [rejectSql(errorCode(name), genreTagsInvalid)]);
}
addExplicit('projects', 'trg_projects_deleting_monotonic', '6.1,6.1.1,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_projects_deleting_monotonic'), `NOT (
    (OLD.lifecycle_status = 'active' AND NEW.lifecycle_status = 'active' AND NEW.deleting_at IS NULL)
    OR (OLD.lifecycle_status = 'active' AND NEW.lifecycle_status = 'deleting' AND OLD.deleting_at IS NULL AND NEW.deleting_at IS NOT NULL)
    OR (OLD.lifecycle_status = 'deleting' AND NEW.lifecycle_status = 'deleting' AND NEW.deleting_at IS OLD.deleting_at)
  )`),
]);
addPurgeDelete('projects', 'trg_projects_purge_delete_guard', '6.1,6.1.1,12.3,12.4', 'OLD.id');

// §6.2 ProjectScriptOutline
addExplicit('project_script_outlines', 'trg_project_script_outlines_lifecycle_update', '6.2,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_project_script_outlines_lifecycle_update'), `NOT (
    OLD.status = NEW.status
    OR (OLD.status = 'draft' AND NEW.status = 'confirmed' AND OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL)
    OR (OLD.status = 'confirmed' AND NEW.status = 'archived' AND NEW.confirmed_at IS OLD.confirmed_at)
  )`),
]);
addIdentity('project_script_outlines', 'trg_project_script_outlines_formal_immutable_update', '6.2,12.3', [
  'project_id', 'version', 'title', 'source_text', 'source_digest', 'confirmed_at', 'created_at',
], "OLD.status IN ('confirmed', 'archived')");
addPurgeDelete('project_script_outlines', 'trg_project_script_outlines_formal_immutable_delete', '6.2,12.3,12.4', 'OLD.project_id', "OLD.status IN ('confirmed', 'archived')");

// §6.3 Chapter
const chapterPointerScope = normalizeSql(`
  EXISTS (SELECT 1 FROM projects AS owner_project WHERE owner_project.id = NEW.project_id)
  AND (NEW.current_script_version_id IS NULL OR EXISTS (SELECT 1 FROM chapter_script_versions AS value WHERE value.id = NEW.current_script_version_id AND value.chapter_id = NEW.id))
  AND (NEW.current_story_version_id IS NULL OR EXISTS (SELECT 1 FROM story_versions AS value WHERE value.id = NEW.current_story_version_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'confirmed' AND value.source_script_version_id IS NOT NULL AND value.source_policy_version IS NOT NULL AND value.source_digest IS NOT NULL))
  AND (NEW.pending_story_version_id IS NULL OR EXISTS (SELECT 1 FROM story_versions AS value WHERE value.id = NEW.pending_story_version_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'pending_confirmation'))
  AND (NEW.current_storyboard_version_id IS NULL OR EXISTS (SELECT 1 FROM storyboard_versions AS value WHERE value.id = NEW.current_storyboard_version_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'confirmed' AND value.source_story_version_id IS NOT NULL AND value.source_policy_version IS NOT NULL AND value.source_digest IS NOT NULL))
  AND (NEW.pending_storyboard_version_id IS NULL OR EXISTS (SELECT 1 FROM storyboard_versions AS value WHERE value.id = NEW.pending_storyboard_version_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'pending_confirmation'))
  AND (NEW.current_preflight_revision_id IS NULL OR EXISTS (SELECT 1 FROM preflight_revisions AS value WHERE value.id = NEW.current_preflight_revision_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.status = 'confirmed' AND value.ready = 1 AND value.source_storyboard_version_id IS NOT NULL AND value.source_policy_version IS NOT NULL AND value.source_digest IS NOT NULL))
  AND (NEW.current_layout_revision_id IS NULL OR EXISTS (SELECT 1 FROM layout_revisions AS value WHERE value.id = NEW.current_layout_revision_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id AND value.binding_set_sealed_at IS NOT NULL AND NOT (json_extract(value.document_json, '$.kind') = 'legacy_chapter_layout_v1' AND json_extract(value.document_json, '$.sourceResolution') IS NOT 'complete')))
  AND (NEW.current_export_revision_id IS NULL OR EXISTS (SELECT 1 FROM export_revisions AS value WHERE value.id = NEW.current_export_revision_id AND value.project_id = NEW.project_id AND value.chapter_id = NEW.id))
  AND (NEW.last_script_revision_id IS NULL OR EXISTS (SELECT 1 FROM chapter_script_revisions AS value WHERE value.id = NEW.last_script_revision_id AND value.chapter_id = NEW.id))
`);
const chapterCurrentPointersEmpty = normalizeSql(`
  NEW.current_script_version_id IS NULL AND NEW.current_story_version_id IS NULL AND NEW.pending_story_version_id IS NULL
  AND NEW.current_storyboard_version_id IS NULL AND NEW.pending_storyboard_version_id IS NULL
  AND NEW.current_preflight_revision_id IS NULL AND NEW.current_layout_revision_id IS NULL AND NEW.current_export_revision_id IS NULL
`);
addScope('chapters', 'trg_chapters_pointer_scope_insert', '6.3,6.1.1,12.3', 'INSERT', `
  (${chapterPointerScope}) AND ((${chapterCurrentPointersEmpty}) OR EXISTS (
    SELECT 1 FROM projects AS active_project
    WHERE active_project.id = NEW.project_id AND active_project.lifecycle_status = 'active'
  ))
`);
addExplicit('chapters', 'trg_chapters_pointer_scope_update', '6.3,6.1.1,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_chapters_pointer_scope_update'), `NOT (${chapterPointerScope})`),
  rejectSql(errorCode('trg_chapters_pointer_scope_update'), `
    (NEW.current_script_version_id IS NOT OLD.current_script_version_id
      OR NEW.current_story_version_id IS NOT OLD.current_story_version_id
      OR NEW.pending_story_version_id IS NOT OLD.pending_story_version_id
      OR NEW.current_storyboard_version_id IS NOT OLD.current_storyboard_version_id
      OR NEW.pending_storyboard_version_id IS NOT OLD.pending_storyboard_version_id
      OR NEW.current_preflight_revision_id IS NOT OLD.current_preflight_revision_id
      OR NEW.current_layout_revision_id IS NOT OLD.current_layout_revision_id
      OR NEW.current_export_revision_id IS NOT OLD.current_export_revision_id
      OR NEW.last_script_revision_id IS NOT OLD.last_script_revision_id)
    AND NOT EXISTS (SELECT 1 FROM projects AS owner_project WHERE owner_project.id = NEW.project_id AND owner_project.lifecycle_status = 'active')
  `),
]);
addExplicit('chapters', 'trg_chapters_milestone_monotonic', '6.3,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_chapters_milestone_monotonic'), `
    CASE NEW.milestone_status
      WHEN 'draft' THEN 0 WHEN 'script_done' THEN 1 WHEN 'structured' THEN 2
      WHEN 'storyboard_done' THEN 3 WHEN 'images_done' THEN 4 WHEN 'layout_done' THEN 5 WHEN 'exported' THEN 6
    END < CASE OLD.milestone_status
      WHEN 'draft' THEN 0 WHEN 'script_done' THEN 1 WHEN 'structured' THEN 2
      WHEN 'storyboard_done' THEN 3 WHEN 'images_done' THEN 4 WHEN 'layout_done' THEN 5 WHEN 'exported' THEN 6
    END
  `),
]);
addPurgeDelete('chapters', 'trg_chapters_purge_delete_guard', '6.3,6.1.1,12.3,12.4', 'OLD.project_id');

// §6.4 ChapterScriptVersion
addIdentity('chapter_script_versions', 'trg_chapter_script_versions_immutable_update', '6.4,12.3', [
  'id', 'chapter_id', 'version', 'source_text', 'source_digest', 'origin', 'created_at', 'completed_at',
]);
addPurgeDelete('chapter_script_versions', 'trg_chapter_script_versions_immutable_delete', '6.4,12.3,12.4', '(SELECT project_id FROM chapters WHERE id = OLD.chapter_id)');

const dialogueScopePredicate = (tableAlias: 'NEW'): string => normalizeSql(`
  EXISTS (
    SELECT 1 FROM chapters AS owner_chapter
    WHERE owner_chapter.id = ${tableAlias}.chapter_id
      AND (${tableAlias}.thread_id IS NULL OR EXISTS (
        SELECT 1 FROM conversation_threads AS source_thread
        WHERE source_thread.id = ${tableAlias}.thread_id
          AND source_thread.project_id = owner_chapter.project_id
          AND source_thread.chapter_id = owner_chapter.id
          AND (${tableAlias}.message_id IS NULL OR EXISTS (
            SELECT 1 FROM conversation_messages AS source_message
            WHERE source_message.id = ${tableAlias}.message_id AND source_message.thread_id = source_thread.id
          ))
      ))
  )
`);

// §6.5 ChapterScriptPending
addScope('chapter_script_pending', 'trg_chapter_script_pending_dialogue_scope_insert', '6.5,12.3', 'INSERT', dialogueScopePredicate('NEW'));
addScope('chapter_script_pending', 'trg_chapter_script_pending_dialogue_scope_update', '6.5,12.3', 'UPDATE', dialogueScopePredicate('NEW'), [
  'id', 'chapter_id', 'thread_id', 'message_id', 'tool_call_id', 'created_at',
]);

// §6.6 ChapterScriptRevision
addScope('chapter_script_revisions', 'trg_chapter_script_revisions_dialogue_scope_insert', '6.6,12.3', 'INSERT', dialogueScopePredicate('NEW'));
addScope('chapter_script_revisions', 'trg_chapter_script_revisions_dialogue_scope_update', '6.6,12.3', 'UPDATE', dialogueScopePredicate('NEW'), [
  'id', 'chapter_id', 'source', 'thread_id', 'message_id', 'tool_call_id', 'operation', 'summary', 'target_working_digest', 'created_at',
]);
addPurgeDelete(
  'chapter_script_revisions',
  'trg_chapter_script_revisions_purge_delete_guard',
  '6.6,12.3,12.4',
  '(SELECT project_id FROM chapters WHERE id = OLD.chapter_id)',
);

const CORE_A_TABLES = new Set([
  'persistence_states', 'migration_runs', 'imported_entity_sources', 'migration_issues', 'projects',
  'project_script_outlines', 'chapters', 'chapter_script_versions', 'chapter_script_pending', 'chapter_script_revisions',
]);

const expandBinding = (binding: G1PhysicalTriggerBindingV1): G1SchemaTriggerSource => {
  const template = RUNTIME_TEMPLATES.find((candidate) => candidate.templateId === binding.templateId);
  if (template === undefined) throw new Error(`Unknown trigger template ${binding.templateId}`);
  const expectedKeys = [...template.argsKeys].sort();
  const actualKeys = Object.keys(binding.args).sort();
  if (expectedKeys.join('\u0000') !== actualKeys.join('\u0000')) {
    throw new Error(`Trigger ${binding.name} args mismatch: expected ${expectedKeys.join(',')}; got ${actualKeys.join(',')}`);
  }
  const expanded = template.expand(binding.args);
  if (expanded.errorCode !== errorCode(binding.name)) throw new Error(`Trigger ${binding.name} errorCode mismatch`);
  if (expanded.normalizedWhen === '0' || expanded.normalizedBody.length === 0) throw new Error(`Trigger ${binding.name} is incomplete`);
  return { ownerStage: 'G1', table: binding.table, name: binding.name, sourceSection: binding.sourceSection, ...expanded };
};

const sameTriggerExpansion = (left: G1SchemaTriggerSource, right: G1SchemaTriggerSource): boolean =>
  left.ownerStage === right.ownerStage && left.table === right.table && left.name === right.name &&
  left.timing === right.timing && left.event === right.event &&
  JSON.stringify(left.updateColumns) === JSON.stringify(right.updateColumns) &&
  left.normalizedWhen === right.normalizedWhen && left.normalizedBody === right.normalizedBody &&
  left.errorCode === right.errorCode;

const contractMentionsBinding = (contractMarkdown: string, name: `trg_${string}`): boolean => {
  if (contractMarkdown.includes(name)) return true;
  if (name.endsWith('_update')) {
    return contractMarkdown.includes(`${name.slice(0, -'_update'.length)}_insert/update`);
  }
  if (name.endsWith('_delete')) {
    return contractMarkdown.includes(`${name.slice(0, -'_delete'.length)}_update/delete`);
  }
  return false;
};

export function buildG1SchemaTriggerCoreADslSource(
  contractMarkdown: string,
  constraintIssues: readonly G1CompletenessIssue[],
  baseTriggers: readonly G1SchemaTriggerSource[] = [],
): G1SchemaTriggerCoreADslSource {
  const completenessIssues: G1CompletenessIssue[] = [];
  const canonicalBindings = [...bindings].sort((left, right) =>
    compareCanonicalText(`${left.table}\u0000${left.name}`, `${right.table}\u0000${right.name}`),
  );
  const duplicateNames = canonicalBindings.filter((binding, index) =>
    index > 0 && binding.name === canonicalBindings[index - 1]?.name,
  );
  for (const duplicate of duplicateNames) {
    completenessIssues.push({ kind: 'trigger', key: duplicate.name, table: duplicate.table, sourceSection: duplicate.sourceSection, missing: ['exactly one physical binding'] });
  }
  const bindingNames = new Set(canonicalBindings.map((binding) => binding.name));
  for (const binding of canonicalBindings) {
    if (!contractMentionsBinding(contractMarkdown, binding.name)) {
      completenessIssues.push({ kind: 'source-document', key: binding.name, table: binding.table, sourceSection: binding.sourceSection, missing: ['physical trigger key in authority contract'] });
    }
    if (binding.existingBase && baseTriggers.length > 0) {
      const expected = baseTriggers.find((item) => item.table === binding.table && item.name === binding.name);
      const expanded = expandBinding(binding);
      if (expected === undefined) {
        completenessIssues.push({ kind: 'trigger', key: binding.name, table: binding.table, sourceSection: binding.sourceSection, missing: ['existing base trigger definition'] });
      } else if (!sameTriggerExpansion(expanded, expected)) {
        completenessIssues.push({ kind: 'trigger', key: binding.name, table: binding.table, sourceSection: binding.sourceSection, missing: ['existing base trigger is not byte-equal to template expansion'] });
      }
    }
  }
  const requested = constraintIssues.filter((issue) => issue.kind === 'trigger' && issue.table !== null && CORE_A_TABLES.has(issue.table));
  for (const issue of requested) {
    if (!bindingNames.has(issue.key as `trg_${string}`)) {
      completenessIssues.push({ ...issue, missing: ['Core A physical trigger binding and complete expansion'] });
    }
  }
  const requestedNames = new Set(requested.map((issue) => issue.key));
  const triggers = canonicalBindings
    .filter((binding) => !binding.existingBase && requestedNames.has(binding.name))
    .map(expandBinding);

  return {
    sourceDocument: '2026-07-11_G1数据库Schema实施契约.md',
    sourceSections: ['5.1-6.6', '6.1.1', '12.3', '12.3.1', '12.4'],
    templates: RUNTIME_TEMPLATES.map(({ templateId, templateVersion, argsKeys }) => ({ templateId, templateVersion, argsKeys })),
    bindings: canonicalBindings,
    triggers,
    completenessIssues: completenessIssues.sort((left, right) =>
      compareCanonicalText(`${left.kind}:${left.key}`, `${right.kind}:${right.key}`),
    ),
    residualTriggerKeys: [],
  };
}
