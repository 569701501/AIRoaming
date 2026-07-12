/**
 * Hand-authored G1 constraint/registry source.
 *
 * Authority is deliberately limited to the two Markdown strings supplied by
 * the caller.  This module never reads Prisma schema, migration SQL, or a
 * SQLite database.  Incomplete SQL is reported through `completenessIssues`
 * and is never replaced with a permissive placeholder.
 */

export type G1Stage = 'G1' | 'G2' | 'G3' | 'G4' | 'G5';

export interface G1SchemaCheckSource {
  readonly ownerStage: G1Stage;
  readonly table: string;
  readonly name: string;
  readonly normalizedExpression: string;
  readonly sourceSection: string;
}

export interface G1SchemaTriggerSource {
  readonly ownerStage: G1Stage;
  readonly table: string;
  readonly name: string;
  readonly timing: 'BEFORE' | 'AFTER';
  readonly event: 'INSERT' | 'UPDATE' | 'DELETE';
  readonly updateColumns: readonly string[];
  readonly normalizedWhen: string;
  readonly normalizedBody: string;
  readonly errorCode: `AIR_G1:${string}`;
  readonly sourceSection: string;
}

export interface G1CompletenessIssue {
  readonly kind:
    | 'source-document'
    | 'check'
    | 'trigger'
    | 'overlay'
    | 'task-policy'
    | 'outbox-handler';
  readonly key: string;
  readonly table: string | null;
  readonly sourceSection: string;
  readonly missing: readonly string[];
  readonly known?: {
    readonly timing?: 'BEFORE' | 'AFTER';
    readonly event?: 'INSERT' | 'UPDATE' | 'DELETE';
    readonly updateColumns?: readonly string[];
    readonly errorCode?: string;
  };
}

export interface TaskCodecSource {
  readonly name: string;
  readonly schemaVersion: number;
  readonly strictUnknownFields: true;
}

export interface TaskTargetSource {
  readonly type: string;
  readonly idOwner: string;
  readonly chapterRule: 'required' | 'nullable';
  /** Input codec field which must equal GenerationTask.targetId. */
  readonly routingTargetField: string;
  /**
   * Optional output/write destination.  This is deliberately distinct from
   * the polymorphic routing target: story/shot jobs route by Chapter while
   * their result is fenced to the Chapter's active pending version.
   */
  readonly writeTargetBinding:
    | { readonly kind: 'same_as_task_target'; readonly inputField: string; readonly idOwner: string }
    | {
        readonly kind: 'active_pending_pointer';
        readonly inputField: string;
        readonly idOwner: string;
        readonly pointerOwner: 'Chapter.pendingStoryVersionId' | 'Chapter.pendingStoryboardVersionId';
        readonly requiredLifecycle: 'pending_confirmation';
        readonly expectedRowVersionField: 'expectedTargetRowVersion';
      }
    | null;
}

export interface TaskSourceRoleSource {
  readonly role: string;
  readonly sourceType: string;
  readonly cardinality: 'one' | 'zero-or-one' | 'zero-or-more' | 'one-or-more';
}

export interface TaskIdempotencyKeyBindingSource {
  readonly placeholder: string;
  /** All values come from the immutable GenerationTask row or its strict creation input. */
  readonly sourceKind: 'task_field' | 'input_field';
  readonly sourceField: string;
  readonly frozenAt: 'task_creation';
}

export interface TaskIdempotencyPolicySource {
  readonly idempotencyKeyTemplate: string;
  readonly idempotencyKeyBindings: readonly TaskIdempotencyKeyBindingSource[];
}

export interface TaskPolicySource {
  readonly type: string;
  readonly policyVersion: 1;
  readonly availability: 'G1' | 'G2' | 'G5' | 'reserved_p0_5' | 'reserved_g6';
  readonly inputCodec: TaskCodecSource;
  readonly outputCodec: TaskCodecSource;
  readonly target: TaskTargetSource;
  readonly sourceBuilder: {
    readonly policyVersion: 1;
    readonly roles: readonly TaskSourceRoleSource[];
    readonly sort: 'unsigned-utf8-byte-lexicographic(role,sourceType,sourceId);then(role,order)';
    readonly sealRequired: true;
    readonly runtimeStoryLifecycle: 'confirmed-only';
    readonly runtimeStoryboardLifecycle: 'confirmed-only';
  };
  readonly idempotencyKeyTemplate: string;
  readonly idempotencyKeyBindings: readonly TaskIdempotencyKeyBindingSource[];
  readonly concurrency: { readonly key: string; readonly slots: number };
  readonly retry: {
    readonly maxAttempts: number;
    readonly backoffSeconds: readonly number[];
    readonly retryableCodes: readonly string[];
    readonly replayPolicy: 'deterministic_replay' | 'live_retry_only' | 'manual_review';
    readonly unknownInterruption: 'deterministic_replay' | 'manual_review';
  };
  readonly lease: {
    readonly seconds: 60;
    readonly heartbeatSeconds: 15;
    readonly fencing: 'task-attempt-slot-claim-token-equality';
  };
  readonly artifactPolicy: string;
  readonly cancelPolicy: string;
  readonly terminalPolicy: string;
  readonly stageOwner: 'G1' | 'G2' | 'G5' | 'P0.5' | 'G6';
  readonly sourceDocument: '2026-07-11_G1任务与Outbox实施注册表.md';
  readonly sourceSection: '3.1,3.2,3.3,3.4';
}

export interface OutboxPayloadFieldSource {
  readonly name: string;
  readonly type: 'integer' | 'string';
  readonly nullable: boolean;
  readonly literal?: number;
  readonly enumValues?: readonly string[];
  readonly format?: 'opaque-id' | 'storage-key' | 'sha256' | 'secret-ref';
}

export interface OutboxHandlerSource {
  readonly eventType: string;
  readonly handlerVersion: 1;
  readonly payloadCodec: {
    readonly name: string;
    readonly schemaVersion: 1;
    readonly strictUnknownFields: true;
    readonly fields: readonly OutboxPayloadFieldSource[];
  };
  readonly idempotencyKeyTemplate: string;
  readonly aggregateType: string;
  readonly intentPreconditions: readonly string[];
  readonly externalEffect: readonly string[];
  readonly postconditions: readonly string[];
  readonly retry: {
    readonly maxAttempts: 3;
    readonly backoffSeconds: readonly [5, 30];
    readonly retryableCodes: readonly string[];
    readonly nonRetryableConditions: readonly string[];
  };
  readonly replayProbe: readonly string[];
  readonly terminalPolicy: readonly string[];
  readonly lease: {
    readonly seconds: 60;
    readonly heartbeatSeconds: 15;
    readonly fencing: 'status-processing-and-lease-token';
  };
  readonly sourceDocument: '2026-07-11_G1任务与Outbox实施注册表.md';
  readonly sourceSection: '4.1,4.2,4.3';
}

export interface StageOwnershipSource {
  readonly stage: G1Stage;
  readonly baseOwned: readonly string[];
  readonly overlayOwned: readonly string[];
  readonly addChecks: readonly string[];
  readonly addIndexes: readonly string[];
  readonly addTriggers: readonly string[];
  readonly sourceSection: '15';
}

export interface PurgeOwnershipSource {
  readonly table: string;
  readonly ownership:
    | 'global_or_cross_project'
    | 'project_history_or_cascade_root'
    | 'project_private_child'
    | 'project_ephemeral_state';
  /** Stable owner resolution recorded for the purge verifier; null only for global/cross-project rows. */
  readonly ownerProjectPath: string | null;
  /** DELETE trigger which owns the row's historical/purge protection, when applicable. */
  readonly deleteGuard: `trg_${string}` | null;
  /** Marks the active-dialogue subset whose ordinary DELETE guard must cover every row state. */
  readonly activeDialogueAllStateDeleteGuard: boolean;
  readonly sourceSection: '12.4';
}

export interface G1SchemaConstraintSource {
  readonly sourceDocuments: readonly [
    '2026-07-11_G1数据库Schema实施契约.md',
    '2026-07-11_G1任务与Outbox实施注册表.md',
  ];
  readonly sourceSections: readonly string[];
  readonly canonicalization: {
    readonly sqlWhitespace: 'collapse-ascii-whitespace';
    readonly arrayOrder: 'declared-source-order';
    readonly issueOrder: 'kind,key';
  };
  readonly checks: readonly G1SchemaCheckSource[];
  readonly triggers: readonly G1SchemaTriggerSource[];
  readonly stageOwnership: readonly StageOwnershipSource[];
  readonly taskPolicyRegistryV1: readonly TaskPolicySource[];
  readonly outboxHandlerRegistryV1: readonly OutboxHandlerSource[];
  readonly purgeOwnershipRegistryV1: readonly PurgeOwnershipSource[];
  readonly completenessIssues: readonly G1CompletenessIssue[];
}

const normalizeSql = (sql: string): string => sql.replace(/[\t\n\v\f\r ]+/g, ' ').trim();

const compareCanonicalText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sqlColumn = (column: string): string =>
  column === 'order' || column === 'index' ? `"${column}"` : column;

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const enumExpression = (column: string, values: readonly string[], nullable = false): string => {
  const rendered = sqlColumn(column);
  const core = `${rendered} IN (${values.map(quote).join(', ')})`;
  return nullable ? `${rendered} IS NULL OR (${core})` : core;
};

const integerAtLeastExpression = (column: string, minimum: number, nullable = false): string => {
  const rendered = sqlColumn(column);
  const core = `typeof(${rendered}) = 'integer' AND ${rendered} >= ${minimum}`;
  return nullable ? `${rendered} IS NULL OR (${core})` : core;
};

const digestExpression = (column: string, nullable = false): string => {
  const rendered = sqlColumn(column);
  const core = `length(${rendered}) = 71 AND substr(${rendered}, 1, 7) = 'sha256:' AND substr(${rendered}, 8) = lower(substr(${rendered}, 8)) AND substr(${rendered}, 8) NOT GLOB '*[^0-9a-f]*'`;
  return nullable ? `${rendered} IS NULL OR (${core})` : core;
};

const nonemptyTextExpression = (column: string, nullable = false): string => {
  const rendered = sqlColumn(column);
  const core = `typeof(${rendered}) = 'text' AND length(trim(${rendered})) > 0 AND instr(${rendered}, char(0)) = 0`;
  return nullable ? `${rendered} IS NULL OR (${core})` : core;
};

const check = (
  table: string,
  name: string,
  expression: string,
  sourceSection: string,
  ownerStage: G1Stage = 'G1',
): G1SchemaCheckSource => ({
  ownerStage,
  table,
  name,
  normalizedExpression: normalizeSql(expression),
  sourceSection,
});

const enumCheck = (
  table: string,
  name: string,
  column: string,
  values: readonly string[],
  sourceSection: string,
  nullable = false,
): G1SchemaCheckSource => check(table, name, enumExpression(column, values, nullable), sourceSection);

const BASE_CHECKS: readonly G1SchemaCheckSource[] = [
  check('persistence_states', 'ck_persistence_states_singleton', "id = 'primary'", '5.1'),
  enumCheck(
    'persistence_states',
    'ck_persistence_states_activation_state',
    'activation_state',
    ['shadow', 'ready_for_activation', 'db_only', 'recovery_required'],
    '3,5.1',
  ),
  check(
    'persistence_states',
    'ck_persistence_states_digest_format',
    [
      digestExpression('source_manifest_digest', true),
      digestExpression('effective_schema_manifest_digest', true),
    ].map((part) => `(${part})`).join(' AND '),
    '5.1,12.2',
  ),
  check(
    'persistence_states',
    'ck_persistence_states_storage_contract_version',
    integerAtLeastExpression('storage_contract_version', 1),
    '5.1,12.2',
  ),

  enumCheck('migration_runs', 'ck_migration_runs_kind', 'kind', ['audit', 'shadow', 'final', 'rollback_restore'], '3,5.2'),
  enumCheck('migration_runs', 'ck_migration_runs_status', 'status', ['running', 'blocked', 'succeeded', 'failed'], '3,5.2'),
  check(
    'migration_runs',
    'ck_migration_runs_digest_format',
    [
      digestExpression('source_manifest_digest'),
      digestExpression('snapshot_manifest_digest', true),
      digestExpression('decisions_digest', true),
      digestExpression('report_digest', true),
    ].map((part) => `(${part})`).join(' AND '),
    '5.2,12.2',
  ),
  check(
    'migration_runs',
    'ck_migration_runs_terminal_time',
    "(status = 'running' AND finished_at IS NULL) OR (status IN ('blocked', 'succeeded', 'failed') AND finished_at IS NOT NULL)",
    '5.2',
  ),
  enumCheck(
    'imported_entity_sources',
    'ck_imported_entity_sources_provenance_status',
    'provenance_status',
    ['reference_only', 'partial', 'complete'],
    '3,5.3',
  ),
  check(
    'imported_entity_sources',
    'ck_imported_entity_sources_digest_format',
    `(${digestExpression('source_digest')}) AND (${digestExpression('payload_digest', true)})`,
    '5.3,12.2',
  ),
  enumCheck('migration_issues', 'ck_migration_issues_severity', 'severity', ['blocker', 'warning', 'info'], '3,5.4'),
  enumCheck(
    'migration_issues',
    'ck_migration_issues_resolution_status',
    'resolution_status',
    ['not_needed', 'open', 'resolved'],
    '3,5.4',
  ),

  enumCheck('projects', 'ck_projects_type', 'type', ['comic', 'light_motion', 'mixed'], '3,6.1'),
  enumCheck('projects', 'ck_projects_lifecycle_status', 'lifecycle_status', ['active', 'deleting'], '3,6.1'),
  enumCheck('projects', 'ck_projects_comic_format', 'comic_format', ['vertical_scroll', 'paged_comic'], '3,6.1'),
  check('projects', 'ck_projects_row_version', integerAtLeastExpression('row_version', 0), '6.1,12.2'),
  check(
    'projects',
    'ck_projects_deleting_time',
    "(lifecycle_status = 'active' AND deleting_at IS NULL) OR (lifecycle_status = 'deleting' AND deleting_at IS NOT NULL)",
    '6.1',
  ),
  check('project_script_outlines', 'ck_project_script_outlines_version', integerAtLeastExpression('version', 1), '6.2,12.2'),
  enumCheck(
    'project_script_outlines',
    'ck_project_script_outlines_status',
    'status',
    ['draft', 'confirmed', 'archived'],
    '3,6.2',
  ),
  check('project_script_outlines', 'ck_project_script_outlines_digest_format', digestExpression('source_digest'), '6.2,12.2'),
  check(
    'project_script_outlines',
    'ck_project_script_outlines_confirmed_time',
    "(status = 'draft' AND confirmed_at IS NULL) OR (status IN ('confirmed', 'archived') AND confirmed_at IS NOT NULL)",
    '6.2',
  ),
  check('chapters', 'ck_chapters_order', integerAtLeastExpression('order', 1), '6.3,12.2'),
  enumCheck(
    'chapters',
    'ck_chapters_milestone_status',
    'milestone_status',
    ['draft', 'script_done', 'structured', 'storyboard_done', 'images_done', 'layout_done', 'exported'],
    '3,6.3',
  ),
  enumCheck('chapters', 'ck_chapters_script_working_state', 'script_working_state', ['empty', 'clean', 'dirty'], '3,6.3'),
  check('chapters', 'ck_chapters_row_version', integerAtLeastExpression('row_version', 0), '6.3,12.2'),
  check(
    'chapters',
    'ck_chapters_distinct_story_pointers',
    'current_story_version_id IS NULL OR pending_story_version_id IS NULL OR current_story_version_id IS NOT pending_story_version_id',
    '6.3',
  ),
  check(
    'chapters',
    'ck_chapters_distinct_storyboard_pointers',
    'current_storyboard_version_id IS NULL OR pending_storyboard_version_id IS NULL OR current_storyboard_version_id IS NOT pending_storyboard_version_id',
    '6.3',
  ),
  check('chapter_script_versions', 'ck_chapter_script_versions_version', integerAtLeastExpression('version', 1), '6.4,12.2'),
  enumCheck('chapter_script_versions', 'ck_chapter_script_versions_origin', 'origin', ['user', 'import', 'ai_confirmed'], '3,6.4'),
  check('chapter_script_versions', 'ck_chapter_script_versions_nonempty_source', nonemptyTextExpression('source_text'), '6.4,12.2'),
  check('chapter_script_versions', 'ck_chapter_script_versions_digest_format', digestExpression('source_digest'), '6.4,12.2'),
  check('chapter_script_pending', 'ck_chapter_script_pending_nonempty_source', nonemptyTextExpression('source_text'), '6.5,12.2'),
  check('chapter_script_pending', 'ck_chapter_script_pending_digest_format', digestExpression('source_digest'), '6.5,12.2'),
  check('chapter_script_pending', 'ck_chapter_script_pending_row_version', integerAtLeastExpression('row_version', 0), '6.5,12.2'),
  check('chapter_script_revisions', 'ck_chapter_script_revisions_target_digest_format', digestExpression('target_working_digest'), '6.6,12.2'),

  check('story_versions', 'ck_story_versions_version', integerAtLeastExpression('version', 1), '7.1,12.2'),
  enumCheck(
    'story_versions',
    'ck_story_versions_status',
    'status',
    ['pending_confirmation', 'confirmed', 'archived'],
    '3,7.1',
  ),
  enumCheck('story_versions', 'ck_story_versions_origin', 'origin', ['user_edit', 'ai_generate', 'import', 'legacy_import'], '3,7.1'),
  check('story_versions', 'ck_story_versions_schema_version', integerAtLeastExpression('schema_version', 1), '7.1,12.2'),
  check(
    'story_versions',
    'ck_story_versions_digest_format',
    `(${digestExpression('source_digest', true)}) AND (${digestExpression('document_digest')})`,
    '7.1,12.2',
  ),
  check('story_versions', 'ck_story_versions_row_version', integerAtLeastExpression('row_version', 0), '7.1,12.2'),
  check(
    'story_versions',
    'ck_story_versions_source_shape',
    "origin = 'legacy_import' OR (source_script_version_id IS NOT NULL AND source_policy_version IS NOT NULL AND source_digest IS NOT NULL)",
    '7.1',
  ),
  check(
    'story_versions',
    'ck_story_versions_lifecycle_times',
    "(status = 'pending_confirmation' AND confirmed_at IS NULL AND archived_at IS NULL) OR (status = 'confirmed' AND confirmed_at IS NOT NULL AND archived_at IS NULL) OR (status = 'archived' AND confirmed_at IS NULL AND archived_at IS NOT NULL)",
    '7.1',
  ),
  check('story_scene_projections', 'ck_story_scene_projections_order', integerAtLeastExpression('order', 1), '7.2,12.2'),
  check('story_scene_projections', 'ck_story_scene_projections_digest_format', digestExpression('semantic_digest'), '7.2,12.2'),
  check('story_beat_projections', 'ck_story_beat_projections_order', integerAtLeastExpression('order', 1), '7.3,12.2'),
  check('story_beat_projections', 'ck_story_beat_projections_digest_format', digestExpression('semantic_digest'), '7.3,12.2'),
  check('scene_visuals', 'ck_scene_visuals_version', integerAtLeastExpression('version', 1), '7.5,12.2'),
  check('storyboard_versions', 'ck_storyboard_versions_version', integerAtLeastExpression('version', 1), '7.6,12.2'),
  enumCheck(
    'storyboard_versions',
    'ck_storyboard_versions_status',
    'status',
    ['pending_confirmation', 'confirmed', 'archived'],
    '3,7.6',
  ),
  enumCheck('storyboard_versions', 'ck_storyboard_versions_origin', 'origin', ['user_edit', 'ai_generate', 'import', 'legacy_import'], '3,7.6'),
  check('storyboard_versions', 'ck_storyboard_versions_schema_version', integerAtLeastExpression('schema_version', 1), '7.6,12.2'),
  check(
    'storyboard_versions',
    'ck_storyboard_versions_digest_format',
    `(${digestExpression('source_digest', true)}) AND (${digestExpression('document_digest')})`,
    '7.6,12.2',
  ),
  check('storyboard_versions', 'ck_storyboard_versions_row_version', integerAtLeastExpression('row_version', 0), '7.6,12.2'),
  check(
    'storyboard_versions',
    'ck_storyboard_versions_source_shape',
    "origin = 'legacy_import' OR (source_story_version_id IS NOT NULL AND source_policy_version IS NOT NULL AND source_digest IS NOT NULL)",
    '7.6',
  ),
  check(
    'storyboard_versions',
    'ck_storyboard_versions_lifecycle_times',
    "(status = 'pending_confirmation' AND confirmed_at IS NULL AND archived_at IS NULL) OR (status = 'confirmed' AND confirmed_at IS NOT NULL AND archived_at IS NULL) OR (status = 'archived' AND confirmed_at IS NULL AND archived_at IS NOT NULL)",
    '7.6',
  ),
  enumCheck('shots', 'ck_shots_lifecycle_status', 'lifecycle_status', ['active', 'retired'], '3,7.7'),
  check(
    'shots',
    'ck_shots_retired_time',
    "(lifecycle_status = 'active' AND retired_at IS NULL) OR (lifecycle_status = 'retired' AND retired_at IS NOT NULL)",
    '7.7',
  ),
  check('storyboard_shot_projections', 'ck_storyboard_shot_projections_order', integerAtLeastExpression('order', 1), '7.8,12.2'),
  check('storyboard_shot_projections', 'ck_storyboard_shot_projections_digest_format', digestExpression('semantic_digest'), '7.8,12.2'),
  check('storyboard_shot_characters', 'ck_storyboard_shot_characters_order', integerAtLeastExpression('order', 1), '7.9,12.2'),
  check('storyboard_shot_characters', 'ck_storyboard_shot_characters_source_token', nonemptyTextExpression('source_token'), '7.9,12.2'),
  check('preflight_revisions', 'ck_preflight_revisions_version', integerAtLeastExpression('version', 1), '7.10,12.2'),
  enumCheck('preflight_revisions', 'ck_preflight_revisions_status', 'status', ['confirmed', 'archived'], '3,7.10'),
  check('preflight_revisions', 'ck_preflight_revisions_schema_version', integerAtLeastExpression('schema_version', 1), '7.10,12.2'),
  check(
    'preflight_revisions',
    'ck_preflight_revisions_digest_format',
    `(${digestExpression('source_digest')}) AND (${digestExpression('document_digest')})`,
    '7.10,12.2',
  ),
  check(
    'preflight_revisions',
    'ck_preflight_revisions_confirmed_time',
    "(status = 'confirmed' AND confirmed_at IS NOT NULL) OR (status = 'archived' AND confirmed_at IS NOT NULL)",
    '7.10',
  ),
  check('preflight_revisions', 'ck_preflight_revisions_ready_boolean', "typeof(ready) = 'integer' AND ready IN (0, 1)", '7.10,12.2'),

  enumCheck('characters', 'ck_characters_level', 'level', ['lead', 'recurring', 'chapter', 'minor', 'extra'], '3,8.1'),
  enumCheck('characters', 'ck_characters_entity_type', 'entity_type', ['human', 'creature', 'group', 'voice'], '3,8.1'),
  enumCheck('characters', 'ck_characters_status', 'status', ['draft', 'needs_reference', 'finalized', 'in_use'], '3,8.1'),
  enumCheck(
    'characters',
    'ck_characters_source',
    'source',
    ['script_outline', 'imported_script', 'manual', 'story_structure', 'image_preflight'],
    '3,8.1',
  ),
  check('characters', 'ck_characters_normalized_name', nonemptyTextExpression('normalized_name'), '8.1,12.2'),
  check('characters', 'ck_characters_row_version', integerAtLeastExpression('row_version', 0), '8.1,12.2'),
  check(
    'characters',
    'ck_characters_finalized_time',
    "(status IN ('draft', 'needs_reference') AND finalized_at IS NULL) OR (status IN ('finalized', 'in_use') AND finalized_at IS NOT NULL)",
    '8.1',
  ),
  enumCheck('character_visuals', 'ck_character_visuals_kind', 'kind', ['preview_front', 'final_reference'], '3,8.2'),
  enumCheck('character_visuals', 'ck_character_visuals_status', 'status', ['available', 'superseded', 'removed'], '3,8.2'),
  check('character_visuals', 'ck_character_visuals_version', integerAtLeastExpression('version', 1), '8.2,12.2'),
  check(
    'character_visuals',
    'ck_character_visuals_confirmed_time',
    "(kind = 'preview_front' AND confirmed_at IS NULL) OR (kind = 'final_reference' AND confirmed_at IS NOT NULL)",
    '8.2',
  ),
  enumCheck('assets', 'ck_assets_type', 'type', ['image', 'audio', 'video', 'document', 'archive', 'font'], '3,8.3'),
  enumCheck('assets', 'ck_assets_status', 'status', ['staged', 'ready', 'failed', 'missing', 'deleting'], '3,8.3'),
  check(
    'assets',
    'ck_assets_nonnegative_dimensions',
    ['bytes', 'width', 'height', 'duration_ms'].map((column) => `(${integerAtLeastExpression(column, 0, true)})`).join(' AND '),
    '8.3,12.2',
  ),
  check('assets', 'ck_assets_metadata_schema_version', integerAtLeastExpression('metadata_schema_version', 1), '8.3,12.2'),
  check(
    'assets',
    'ck_assets_metadata_digest_format',
    `(${digestExpression('metadata_digest')}) AND (${digestExpression('sha256', true)})`,
    '8.3,12.2',
  ),
  check('candidates', 'ck_candidates_index', integerAtLeastExpression('index', 1), '8.4,12.2'),
  enumCheck('candidates', 'ck_candidates_status', 'status', ['generated', 'rejected', 'superseded'], '3,8.4'),
  check(
    'candidates',
    'ck_candidates_score',
    "score IS NULL OR (typeof(score) IN ('integer', 'real') AND score >= -1.7976931348623157e308 AND score <= 1.7976931348623157e308)",
    '8.4,12.2',
  ),
  enumCheck('candidates', 'ck_candidates_generation_purpose', 'generation_purpose', ['shot_clean_plate', 'legacy_unspecified'], '3,8.4'),
  check(
    'candidates',
    'ck_candidates_generation_spec_pair',
    "(generation_purpose = 'shot_clean_plate' AND prompt_digest IS NOT NULL AND generation_spec_version IS NOT NULL AND generation_spec_digest IS NOT NULL) OR (generation_purpose = 'legacy_unspecified')",
    '8.4',
  ),
  check(
    'candidates',
    'ck_candidates_digest_format',
    `(${digestExpression('prompt_digest', true)}) AND (${digestExpression('generation_spec_digest', true)})`,
    '8.4,12.2',
  ),
  check('candidate_lock_revisions', 'ck_candidate_lock_revisions_revision', integerAtLeastExpression('revision', 1), '8.5,12.2'),
  enumCheck('candidate_lock_revisions', 'ck_candidate_lock_revisions_action', 'action', ['lock', 'replace', 'clear'], '3,8.5'),
  enumCheck('candidate_lock_revisions', 'ck_candidate_lock_revisions_origin', 'origin', ['runtime', 'legacy_import'], '3,8.5'),
  check(
    'candidate_lock_revisions',
    'ck_candidate_lock_revisions_action_candidate',
    "(action = 'clear' AND candidate_id IS NULL) OR (action IN ('lock', 'replace') AND candidate_id IS NOT NULL)",
    '8.5',
  ),
  check(
    'candidate_lock_revisions',
    'ck_candidate_lock_revisions_runtime_time',
    "(origin = 'runtime' AND decided_at IS NOT NULL) OR origin = 'legacy_import'",
    '8.5',
  ),

  check('app_preferences', 'ck_app_preferences_singleton', "id = 'primary'", '9.1'),
  enumCheck('app_preferences', 'ck_app_preferences_theme', 'theme', ['system', 'dark', 'light'], '3,9.1'),
  check('app_preferences', 'ck_app_preferences_row_version', integerAtLeastExpression('row_version', 0), '9.1,12.2'),
  enumCheck('provider_configs', 'ck_provider_configs_runtime_kind', 'runtime_kind', ['text', 'image'], '3,9.2'),
  check('provider_configs', 'ck_provider_configs_row_version', integerAtLeastExpression('row_version', 0), '9.2,12.2'),
  check(
    'provider_configs',
    'ck_provider_configs_nonempty_ids',
    `(${nonemptyTextExpression('provider_id')}) AND (${nonemptyTextExpression('model_id')})`,
    '9.2,12.2',
  ),
  check('provider_configs', 'ck_provider_configs_enabled_boolean', "typeof(enabled) = 'integer' AND enabled IN (0, 1)", '9.2,12.2'),
  enumCheck('credential_metadata', 'ck_credential_metadata_owner', 'owner', ['opencode', 'image_secret_store', 'environment'], '3,9.3'),
  enumCheck(
    'credential_metadata',
    'ck_credential_metadata_status',
    'status',
    ['unconfigured', 'configured', 'rotating', 'clearing', 'error'],
    '3,9.3',
  ),
  check('credential_metadata', 'ck_credential_metadata_configured_boolean', "typeof(configured) = 'integer' AND configured IN (0, 1)", '9.3,12.2'),
  check('credential_metadata', 'ck_credential_metadata_fingerprint_format', digestExpression('fingerprint', true), '9.3,12.2'),
  enumCheck('project_context_facts', 'ck_project_context_facts_status', 'status', ['confirmed', 'superseded', 'archived'], '3,9.4'),
  check('project_context_facts', 'ck_project_context_facts_schema_version', integerAtLeastExpression('schema_version', 1), '9.4,12.2'),
  check('project_context_facts', 'ck_project_context_facts_digest_format', digestExpression('content_digest'), '9.4,12.2'),
  check(
    'project_context_facts',
    'ck_project_context_facts_superseded_time',
    "(status = 'confirmed' AND superseded_at IS NULL) OR (status IN ('superseded', 'archived') AND superseded_at IS NOT NULL)",
    '9.4',
  ),
  enumCheck('conversation_threads', 'ck_conversation_threads_status', 'status', ['active', 'archived'], '3,9.5'),
  check(
    'conversation_threads',
    'ck_conversation_threads_scope_key',
    "(scope_key = 'project' AND chapter_id IS NULL) OR (chapter_id IS NOT NULL AND scope_key = 'chapter:' || chapter_id)",
    '9.5',
  ),
  enumCheck('conversation_messages', 'ck_conversation_messages_role', 'role', ['user', 'assistant', 'system', 'tool'], '3,9.6'),
  enumCheck('conversation_messages', 'ck_conversation_messages_status', 'status', ['running', 'completed', 'failed'], '3,9.6'),
  enumCheck(
    'dialogue_tool_results',
    'ck_dialogue_tool_results_status',
    'status',
    ['succeeded', 'failed', 'needs_user_confirmation'],
    '3,9.7',
  ),
  check('dialogue_tool_results', 'ck_dialogue_tool_results_schema_version', integerAtLeastExpression('schema_version', 1), '9.7,12.2'),
  check('dialogue_tool_results', 'ck_dialogue_tool_results_digest_format', digestExpression('payload_digest'), '9.7,12.2'),
  enumCheck('dialogue_runtime_sessions', 'ck_dialogue_runtime_sessions_status', 'status', ['active', 'archived', 'closed'], '3,9.8'),
  check(
    'dialogue_runtime_sessions',
    'ck_dialogue_runtime_sessions_closed_time',
    "(status = 'active' AND closed_at IS NULL) OR (status IN ('archived', 'closed') AND closed_at IS NOT NULL)",
    '9.8',
  ),
  enumCheck(
    'pending_dialogue_artifacts',
    'ck_pending_dialogue_artifacts_kind',
    'kind',
    ['script_import', 'inspiration_seeds', 'script_outline_decision', 'layout_editor_command_set'],
    '3,9.9',
  ),
  enumCheck(
    'pending_dialogue_artifacts',
    'ck_pending_dialogue_artifacts_status',
    'status',
    ['pending', 'applied', 'discarded', 'superseded', 'expired'],
    '3,9.9',
  ),
  check('pending_dialogue_artifacts', 'ck_pending_dialogue_artifacts_schema_version', integerAtLeastExpression('schema_version', 1), '9.9,12.2'),
  check('pending_dialogue_artifacts', 'ck_pending_dialogue_artifacts_digest_format', digestExpression('payload_digest'), '9.9,12.2'),
  check(
    'pending_dialogue_artifacts',
    'ck_pending_dialogue_artifacts_active_slot',
    "(status = 'pending' AND active_slot_key IS NOT NULL) OR (status IN ('applied', 'discarded', 'superseded', 'expired') AND active_slot_key IS NULL)",
    '9.9',
  ),
  check(
    'pending_dialogue_artifacts',
    'ck_pending_dialogue_artifacts_resolved_time',
    "(status = 'pending' AND resolved_at IS NULL) OR (status IN ('applied', 'discarded', 'superseded', 'expired') AND resolved_at IS NOT NULL)",
    '9.9',
  ),
];

const role = (
  name: string,
  sourceType: string,
  cardinality: TaskSourceRoleSource['cardinality'] = 'one',
): TaskSourceRoleSource => ({ role: name, sourceType, cardinality });

const liveRetryCodes = ['PROVIDER_TIMEOUT', 'PROVIDER_RATE_LIMIT', 'TRANSIENT_IO'] as const;
const renderRetryCodes = ['TRANSIENT_IO', 'RENDERER_INTERRUPTED_SAFE'] as const;

const taskIdempotencyField = (
  placeholder: string,
  sourceField: 'projectId' | 'chapterId' | 'inputDigest' | 'sourceDigest',
): TaskIdempotencyKeyBindingSource => ({
  placeholder,
  sourceKind: 'task_field',
  sourceField,
  frozenAt: 'task_creation',
});

const inputIdempotencyField = (
  placeholder: string,
  sourceField = placeholder,
): TaskIdempotencyKeyBindingSource => ({
  placeholder,
  sourceKind: 'input_field',
  sourceField,
  frozenAt: 'task_creation',
});

const taskPolicy = (source: Omit<TaskPolicySource, 'policyVersion' | 'sourceBuilder' | 'lease' | 'sourceDocument' | 'sourceSection'> & {
  readonly roles: readonly TaskSourceRoleSource[];
}): TaskPolicySource => ({
  type: source.type,
  policyVersion: 1,
  availability: source.availability,
  inputCodec: source.inputCodec,
  outputCodec: source.outputCodec,
  target: source.target,
  sourceBuilder: {
    policyVersion: 1,
    roles: source.roles,
    sort: 'unsigned-utf8-byte-lexicographic(role,sourceType,sourceId);then(role,order)',
    sealRequired: true,
    runtimeStoryLifecycle: 'confirmed-only',
    runtimeStoryboardLifecycle: 'confirmed-only',
  },
  idempotencyKeyTemplate: source.idempotencyKeyTemplate,
  idempotencyKeyBindings: source.idempotencyKeyBindings,
  concurrency: source.concurrency,
  retry: source.retry,
  lease: {
    seconds: 60,
    heartbeatSeconds: 15,
    fencing: 'task-attempt-slot-claim-token-equality',
  },
  artifactPolicy: source.artifactPolicy,
  cancelPolicy: source.cancelPolicy,
  terminalPolicy: source.terminalPolicy,
  stageOwner: source.stageOwner,
  sourceDocument: '2026-07-11_G1任务与Outbox实施注册表.md',
  sourceSection: '3.1,3.2,3.3,3.4',
});

const codec = (name: string, schemaVersion: number): TaskCodecSource => ({
  name,
  schemaVersion,
  strictUnknownFields: true,
});

const commonTerminal = 'Attempt finish is the only terminal/retry entry; terminal tasks never reopen; user retry creates a new runtime task';
const cooperativeCancel = 'queued/retrying cancel directly; running sets cancelRequestedAt and finishes only through the fenced Attempt';

const TASK_POLICIES: readonly TaskPolicySource[] = [
  taskPolicy({
    type: 'character_reference_generate', availability: 'G1',
    inputCodec: codec('CharacterReferenceGenerateInputV1', 1), outputCodec: codec('CharacterReferenceGenerateOutputV1', 1),
    target: { type: 'character', idOwner: 'Character.id', chapterRule: 'nullable', routingTargetField: 'characterId', writeTargetBinding: null },
    roles: [role('project', 'project'), role('character', 'character'), role('source_image', 'asset', 'zero-or-one')],
    idempotencyKeyTemplate: 'character-reference:{projectId}:{characterId}:{referenceKind}:{inputDigest}',
    idempotencyKeyBindings: [
      taskIdempotencyField('projectId', 'projectId'),
      inputIdempotencyField('characterId'),
      inputIdempotencyField('referenceKind'),
      taskIdempotencyField('inputDigest', 'inputDigest'),
    ],
    concurrency: { key: 'image-provider', slots: 1 },
    retry: { maxAttempts: 3, backoffSeconds: [5, 30], retryableCodes: liveRetryCodes, replayPolicy: 'live_retry_only', unknownInterruption: 'manual_review' },
    artifactPolicy: 'Create staged image Asset and CharacterVisual; set the visual pointer only while claim/current sources still match; late output is historical/cleanup',
    cancelPolicy: cooperativeCancel, terminalPolicy: commonTerminal, stageOwner: 'G1',
  }),
  taskPolicy({
    type: 'scene_reference_generate', availability: 'G1',
    inputCodec: codec('SceneReferenceGenerateInputV1', 1), outputCodec: codec('SceneReferenceGenerateOutputV1', 1),
    target: { type: 'scene', idOwner: 'ChapterScene.id', chapterRule: 'required', routingTargetField: 'chapterSceneId', writeTargetBinding: null },
    roles: [role('story', 'story_version'), role('scene', 'chapter_scene'), role('style_asset', 'asset', 'zero-or-one')],
    idempotencyKeyTemplate: 'scene-reference:{projectId}:{chapterId}:{chapterSceneId}:{inputDigest}',
    idempotencyKeyBindings: [
      taskIdempotencyField('projectId', 'projectId'),
      taskIdempotencyField('chapterId', 'chapterId'),
      inputIdempotencyField('chapterSceneId'),
      taskIdempotencyField('inputDigest', 'inputDigest'),
    ],
    concurrency: { key: 'image-provider', slots: 1 },
    retry: { maxAttempts: 3, backoffSeconds: [5, 30], retryableCodes: liveRetryCodes, replayPolicy: 'live_retry_only', unknownInterruption: 'manual_review' },
    artifactPolicy: 'Create staged image Asset and SceneVisual; set currentVisual only after same-chapter current/source validation',
    cancelPolicy: cooperativeCancel, terminalPolicy: commonTerminal, stageOwner: 'G1',
  }),
  taskPolicy({
    type: 'story_parse', availability: 'G2',
    inputCodec: codec('StoryParseInputV2', 2), outputCodec: codec('StoryDocumentV2', 2),
    target: {
      type: 'chapter', idOwner: 'Chapter.id', chapterRule: 'required', routingTargetField: 'chapterId',
      writeTargetBinding: {
        kind: 'active_pending_pointer', inputField: 'expectedTargetId', idOwner: 'StoryVersion.id',
        pointerOwner: 'Chapter.pendingStoryVersionId', requiredLifecycle: 'pending_confirmation',
        expectedRowVersionField: 'expectedTargetRowVersion',
      },
    },
    roles: [role('script', 'chapter_script_version')],
    idempotencyKeyTemplate: 'story-parse:{projectId}:{chapterId}:{expectedTargetId}:{sourceDigest}:{inputDigest}',
    idempotencyKeyBindings: [
      taskIdempotencyField('projectId', 'projectId'),
      taskIdempotencyField('chapterId', 'chapterId'),
      inputIdempotencyField('expectedTargetId'),
      taskIdempotencyField('sourceDigest', 'sourceDigest'),
      taskIdempotencyField('inputDigest', 'inputDigest'),
    ],
    concurrency: { key: 'llm-provider', slots: 1 },
    retry: { maxAttempts: 3, backoffSeconds: [5, 30], retryableCodes: ['PROVIDER_TIMEOUT', 'PROVIDER_RATE_LIMIT'], replayPolicy: 'live_retry_only', unknownInterruption: 'manual_review' },
    artifactPolicy: 'No file artifact; output may update only the expected pending StoryVersion guarded by pending pointer, rowVersion and sourceDigest',
    cancelPolicy: cooperativeCancel, terminalPolicy: commonTerminal, stageOwner: 'G2',
  }),
  taskPolicy({
    type: 'shot_generate', availability: 'G2',
    inputCodec: codec('ShotGenerateInputV2', 2), outputCodec: codec('StoryboardDocumentV2', 2),
    target: {
      type: 'chapter', idOwner: 'Chapter.id', chapterRule: 'required', routingTargetField: 'chapterId',
      writeTargetBinding: {
        kind: 'active_pending_pointer', inputField: 'expectedTargetId', idOwner: 'StoryboardVersion.id',
        pointerOwner: 'Chapter.pendingStoryboardVersionId', requiredLifecycle: 'pending_confirmation',
        expectedRowVersionField: 'expectedTargetRowVersion',
      },
    },
    roles: [role('story', 'story_version')],
    idempotencyKeyTemplate: 'shot-generate:{projectId}:{chapterId}:{expectedTargetId}:{sourceDigest}:{inputDigest}',
    idempotencyKeyBindings: [
      taskIdempotencyField('projectId', 'projectId'),
      taskIdempotencyField('chapterId', 'chapterId'),
      inputIdempotencyField('expectedTargetId'),
      taskIdempotencyField('sourceDigest', 'sourceDigest'),
      taskIdempotencyField('inputDigest', 'inputDigest'),
    ],
    concurrency: { key: 'llm-provider', slots: 1 },
    retry: { maxAttempts: 3, backoffSeconds: [5, 30], retryableCodes: ['PROVIDER_TIMEOUT', 'PROVIDER_RATE_LIMIT'], replayPolicy: 'live_retry_only', unknownInterruption: 'manual_review' },
    artifactPolicy: 'No file artifact; output may update only the expected pending StoryboardVersion and projections under pointer/rowVersion/sourceDigest guards',
    cancelPolicy: cooperativeCancel, terminalPolicy: commonTerminal, stageOwner: 'G2',
  }),
  taskPolicy({
    type: 'shot_prompt_generate', availability: 'G2',
    inputCodec: codec('ShotPromptGenerateInputV2', 2), outputCodec: codec('ShotPromptGenerateOutputV2', 2),
    target: { type: 'shot', idOwner: 'Shot.id', chapterRule: 'required', routingTargetField: 'shotId', writeTargetBinding: null },
    roles: [role('storyboard', 'storyboard_version'), role('shot', 'shot'), role('preflight', 'preflight_revision'), role('character_visual', 'character_visual', 'zero-or-more'), role('scene_visual', 'scene_visual', 'zero-or-more'), role('reference_asset', 'asset', 'zero-or-more')],
    idempotencyKeyTemplate: 'shot-prompt:{projectId}:{chapterId}:{shotId}:{sourceDigest}:{inputDigest}',
    idempotencyKeyBindings: [
      taskIdempotencyField('projectId', 'projectId'),
      taskIdempotencyField('chapterId', 'chapterId'),
      inputIdempotencyField('shotId'),
      taskIdempotencyField('sourceDigest', 'sourceDigest'),
      taskIdempotencyField('inputDigest', 'inputDigest'),
    ],
    concurrency: { key: 'local-cpu', slots: 2 },
    retry: { maxAttempts: 2, backoffSeconds: [5], retryableCodes: ['TRANSIENT_IO'], replayPolicy: 'deterministic_replay', unknownInterruption: 'deterministic_replay' },
    artifactPolicy: 'No file artifact; output is immutable task result/input for image generation and never writes current pointers',
    cancelPolicy: cooperativeCancel, terminalPolicy: commonTerminal, stageOwner: 'G2',
  }),
  taskPolicy({
    type: 'image_generate', availability: 'G2',
    inputCodec: codec('ImageGenerateInputV2', 2), outputCodec: codec('ImageGenerateOutputV2', 2),
    target: { type: 'shot', idOwner: 'Shot.id', chapterRule: 'required', routingTargetField: 'shotId', writeTargetBinding: null },
    roles: [role('storyboard', 'storyboard_version'), role('shot', 'shot'), role('preflight', 'preflight_revision'), role('character_visual', 'character_visual', 'zero-or-more'), role('scene_visual', 'scene_visual', 'zero-or-more'), role('reference_asset', 'asset', 'zero-or-more')],
    idempotencyKeyTemplate: 'image-generate:{projectId}:{chapterId}:{shotId}:{generationSpecDigest}:{requestId}',
    idempotencyKeyBindings: [
      taskIdempotencyField('projectId', 'projectId'),
      taskIdempotencyField('chapterId', 'chapterId'),
      inputIdempotencyField('shotId'),
      inputIdempotencyField('generationSpecDigest'),
      inputIdempotencyField('requestId'),
    ],
    concurrency: { key: 'image-provider', slots: 1 },
    retry: { maxAttempts: 3, backoffSeconds: [5, 30], retryableCodes: liveRetryCodes, replayPolicy: 'live_retry_only', unknownInterruption: 'manual_review' },
    artifactPolicy: 'Each candidate creates staged image Asset plus Candidate with unique (task,shot,index); late output cannot change lock/current',
    cancelPolicy: cooperativeCancel, terminalPolicy: commonTerminal, stageOwner: 'G2',
  }),
  taskPolicy({
    type: 'layout_export', availability: 'G5',
    inputCodec: codec('LayoutPublicationTaskInputV1', 1), outputCodec: codec('LayoutPublicationTaskOutputV1', 1),
    target: {
      type: 'export', idOwner: 'ExportRevision.id', chapterRule: 'required', routingTargetField: 'exportRevisionId',
      writeTargetBinding: { kind: 'same_as_task_target', inputField: 'exportRevisionId', idOwner: 'ExportRevision.id' },
    },
    roles: [role('layout_revision', 'layout_revision'), role('lock_set', 'lock_set'), role('candidate_lock', 'candidate_lock_revision', 'one-or-more'), role('image_asset', 'asset', 'one-or-more'), role('font_asset', 'asset', 'zero-or-more')],
    idempotencyKeyTemplate: 'layout-publication:{projectId}:{chapterId}:{requestId}',
    idempotencyKeyBindings: [
      taskIdempotencyField('projectId', 'projectId'),
      taskIdempotencyField('chapterId', 'chapterId'),
      inputIdempotencyField('requestId'),
    ],
    concurrency: { key: 'layout-render', slots: 1 },
    retry: { maxAttempts: 2, backoffSeconds: [5], retryableCodes: renderRetryCodes, replayPolicy: 'deterministic_replay', unknownInterruption: 'deterministic_replay' },
    artifactPolicy: 'Create staged PNG/PDF/manifest Assets and ExportArtifacts; claim atomically sets queued Export rendering; Attempt finish atomically terminates Export and Task; late output stays historical',
    cancelPolicy: cooperativeCancel, terminalPolicy: `${commonTerminal}; Export and Task terminal transitions are atomic`, stageOwner: 'G5',
  }),
  taskPolicy({
    type: 'tts_generate', availability: 'reserved_p0_5',
    inputCodec: codec('TtsGenerateInputV1', 1), outputCodec: codec('TtsGenerateOutputV1', 1),
    target: {
      type: 'asset', idOwner: 'Asset.id', chapterRule: 'nullable', routingTargetField: 'targetAssetId',
      writeTargetBinding: { kind: 'same_as_task_target', inputField: 'targetAssetId', idOwner: 'Asset.id' },
    },
    roles: [role('storyboard', 'storyboard_version'), role('shot', 'shot'), role('voice_asset', 'asset', 'zero-or-one')],
    idempotencyKeyTemplate: 'tts:{projectId}:{chapterId}:{targetAssetId}:{sourceDigest}:{inputDigest}',
    idempotencyKeyBindings: [
      taskIdempotencyField('projectId', 'projectId'),
      taskIdempotencyField('chapterId', 'chapterId'),
      inputIdempotencyField('targetAssetId'),
      taskIdempotencyField('sourceDigest', 'sourceDigest'),
      taskIdempotencyField('inputDigest', 'inputDigest'),
    ],
    concurrency: { key: 'audio-provider', slots: 1 },
    retry: { maxAttempts: 3, backoffSeconds: [5, 30], retryableCodes: liveRetryCodes, replayPolicy: 'live_retry_only', unknownInterruption: 'manual_review' },
    artifactPolicy: 'Create staged audio Asset; create is disabled until provider overlay; late output never becomes current',
    cancelPolicy: cooperativeCancel, terminalPolicy: commonTerminal, stageOwner: 'P0.5',
  }),
  taskPolicy({
    type: 'video_export', availability: 'reserved_p0_5',
    inputCodec: codec('VideoExportInputV1', 1), outputCodec: codec('VideoExportOutputV1', 1),
    target: {
      type: 'export', idOwner: 'ExportRevision.id', chapterRule: 'nullable', routingTargetField: 'exportRevisionId',
      writeTargetBinding: { kind: 'same_as_task_target', inputField: 'exportRevisionId', idOwner: 'ExportRevision.id' },
    },
    roles: [role('storyboard', 'storyboard_version'), role('image_asset', 'asset', 'one-or-more'), role('audio_asset', 'asset', 'one-or-more'), role('export_revision', 'export_revision', 'zero-or-one')],
    idempotencyKeyTemplate: 'video-export:{projectId}:{scopeKey}:{requestId}',
    idempotencyKeyBindings: [
      taskIdempotencyField('projectId', 'projectId'),
      inputIdempotencyField('scopeKey'),
      inputIdempotencyField('requestId'),
    ],
    concurrency: { key: 'video-render', slots: 1 },
    retry: { maxAttempts: 2, backoffSeconds: [5], retryableCodes: renderRetryCodes, replayPolicy: 'deterministic_replay', unknownInterruption: 'deterministic_replay' },
    artifactPolicy: 'Create staged MP4/manifest Assets and ExportArtifacts; create disabled before overlay; Export and Task states are atomic',
    cancelPolicy: cooperativeCancel, terminalPolicy: `${commonTerminal}; Export and Task terminal transitions are atomic`, stageOwner: 'P0.5',
  }),
  taskPolicy({
    type: 'asset_package_export', availability: 'reserved_g6',
    inputCodec: codec('AssetPackageExportInputV2', 2), outputCodec: codec('AssetPackageExportOutputV2', 2),
    target: {
      type: 'export', idOwner: 'ExportRevision.id', chapterRule: 'nullable', routingTargetField: 'exportRevisionId',
      writeTargetBinding: { kind: 'same_as_task_target', inputField: 'exportRevisionId', idOwner: 'ExportRevision.id' },
    },
    roles: [role('publication', 'export_revision'), role('asset', 'asset', 'zero-or-more')],
    idempotencyKeyTemplate: 'asset-package:{projectId}:{scopeKey}:{requestId}',
    idempotencyKeyBindings: [
      taskIdempotencyField('projectId', 'projectId'),
      inputIdempotencyField('scopeKey'),
      inputIdempotencyField('requestId'),
    ],
    concurrency: { key: 'package-render', slots: 1 },
    retry: { maxAttempts: 2, backoffSeconds: [5], retryableCodes: renderRetryCodes, replayPolicy: 'deterministic_replay', unknownInterruption: 'deterministic_replay' },
    artifactPolicy: 'Create staged archive/folder-manifest Asset and ExportArtifact; create disabled until G6 overlay; Export and Task states are atomic',
    cancelPolicy: cooperativeCancel, terminalPolicy: `${commonTerminal}; Export and Task terminal transitions are atomic`, stageOwner: 'G6',
  }),
];

const TASK_IDEMPOTENCY_TASK_FIELDS = new Set([
  'projectId',
  'chapterId',
  'inputDigest',
  'sourceDigest',
]);

/**
 * Validates that every template placeholder resolves exactly once from data
 * frozen in the task-creation transaction.  Runtime code must not consult a
 * mutable owner pointer while rebuilding an idempotency key.
 */
export function validateTaskIdempotencyKeyBindings(
  policy: TaskIdempotencyPolicySource,
): readonly string[] {
  const issues: string[] = [];
  const placeholderPattern = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
  const placeholders = [...policy.idempotencyKeyTemplate.matchAll(placeholderPattern)]
    .map((match) => match[1]!);
  const templateResidue = policy.idempotencyKeyTemplate.replace(placeholderPattern, '');
  if (templateResidue.includes('{') || templateResidue.includes('}')) {
    issues.push('template contains a malformed placeholder');
  }

  const placeholderCounts = new Map<string, number>();
  for (const placeholder of placeholders) {
    placeholderCounts.set(placeholder, (placeholderCounts.get(placeholder) ?? 0) + 1);
  }
  for (const [placeholder, count] of placeholderCounts) {
    if (count !== 1) issues.push(`template placeholder ${placeholder} occurs ${count} times`);
  }

  const bindingCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  for (const binding of policy.idempotencyKeyBindings) {
    bindingCounts.set(
      binding.placeholder,
      (bindingCounts.get(binding.placeholder) ?? 0) + 1,
    );
    const sourceKey = `${binding.sourceKind}:${binding.sourceField}`;
    sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) ?? 0) + 1);
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(binding.sourceField)) {
      issues.push(`binding ${binding.placeholder} has an invalid source field`);
    }
    if (
      binding.sourceKind === 'task_field' &&
      !TASK_IDEMPOTENCY_TASK_FIELDS.has(binding.sourceField)
    ) {
      issues.push(`binding ${binding.placeholder} uses unknown task field ${binding.sourceField}`);
    }
    if (binding.frozenAt !== 'task_creation') {
      issues.push(`binding ${binding.placeholder} is not frozen at task creation`);
    }
  }

  for (const [placeholder, count] of bindingCounts) {
    if (count !== 1) issues.push(`placeholder ${placeholder} has ${count} bindings`);
    if (!placeholderCounts.has(placeholder)) {
      issues.push(`binding references unknown placeholder ${placeholder}`);
    }
  }
  for (const placeholder of placeholderCounts.keys()) {
    if (!bindingCounts.has(placeholder)) {
      issues.push(`template placeholder ${placeholder} is unbound`);
    }
  }
  for (const [source, count] of sourceCounts) {
    if (count !== 1) issues.push(`idempotency source ${source} is bound ${count} times`);
  }

  const bindingOrder = policy.idempotencyKeyBindings.map((binding) => binding.placeholder);
  if (placeholders.join('\u0000') !== bindingOrder.join('\u0000')) {
    issues.push('binding order does not match template placeholder order');
  }
  return issues;
}

const payloadField = (
  name: string,
  type: OutboxPayloadFieldSource['type'],
  options: Partial<Omit<OutboxPayloadFieldSource, 'name' | 'type'>> = {},
): OutboxPayloadFieldSource => ({ name, type, nullable: options.nullable ?? false, ...options });

const outboxHandler = (
  source: Omit<OutboxHandlerSource, 'handlerVersion' | 'lease' | 'sourceDocument' | 'sourceSection'>,
): OutboxHandlerSource => ({
  ...source,
  handlerVersion: 1,
  lease: { seconds: 60, heartbeatSeconds: 15, fencing: 'status-processing-and-lease-token' },
  sourceDocument: '2026-07-11_G1任务与Outbox实施注册表.md',
  sourceSection: '4.1,4.2,4.3',
});

const OUTBOX_HANDLERS: readonly OutboxHandlerSource[] = [
  outboxHandler({
    eventType: 'asset.promote', aggregateType: 'asset',
    payloadCodec: {
      name: 'AssetPromotePayloadV1', schemaVersion: 1, strictUnknownFields: true,
      fields: [
        payloadField('schemaVersion', 'integer', { literal: 1 }), payloadField('assetId', 'string', { format: 'opaque-id' }),
        payloadField('projectId', 'string', { format: 'opaque-id' }), payloadField('chapterId', 'string', { nullable: true, format: 'opaque-id' }),
        payloadField('tempStorageKey', 'string', { format: 'storage-key' }), payloadField('finalStorageKey', 'string', { format: 'storage-key' }),
        payloadField('sha256', 'string', { format: 'sha256' }), payloadField('bytes', 'integer'),
      ],
    },
    idempotencyKeyTemplate: 'asset.promote:{assetId}:{sha256}',
    intentPreconditions: [
      'Project must be active when intent is created',
      'Create staged Asset and pending event in one transaction',
      'Asset owner/storage/hash/bytes must equal payload',
      'A pre-existing intent whose Project later becomes deleting may only use deleting-cleanup',
    ],
    externalEffect: [
      'Active branch verifies canonical temp path, bytes and hash, then atomic-renames on the same filesystem',
      'Existing final with equal hash/bytes is idempotent; differing final is never overwritten',
      'Deleting-cleanup deletes only matching temp/final (absence is idempotent) and never registers ready',
    ],
    postconditions: [
      'Active branch rechecks Project active inside fenced completion, then performs Asset staged->ready, writes readyAt and marks event processed atomically',
      'Deleting-cleanup performs Asset staged->deleting and marks event processed atomically',
    ],
    retry: { maxAttempts: 3, backoffSeconds: [5, 30], retryableCodes: ['TRANSIENT_IO'], nonRetryableConditions: ['PATH_OUT_OF_BOUNDS', 'DIGEST_CONFLICT', 'FINAL_CONTENT_CONFLICT'] },
    replayProbe: ['Probe final path/hash/bytes before rename', 'Probe Project lifecycle before completion', 'Probe deleting cleanup paths before delete'],
    terminalPolicy: ['Mismatch becomes failed+needsReview', 'No late ready after Project deleting', 'Terminal event never reopens'],
  }),
  outboxHandler({
    eventType: 'asset.delete', aggregateType: 'asset',
    payloadCodec: {
      name: 'AssetDeletePayloadV1', schemaVersion: 1, strictUnknownFields: true,
      fields: [
        payloadField('schemaVersion', 'integer', { literal: 1 }), payloadField('assetId', 'string', { format: 'opaque-id' }),
        payloadField('projectId', 'string', { format: 'opaque-id' }), payloadField('chapterId', 'string', { nullable: true, format: 'opaque-id' }),
        payloadField('storageKey', 'string', { format: 'storage-key' }), payloadField('expectedSha256', 'string', { format: 'sha256' }),
        payloadField('reason', 'string', { enumValues: ['project_purge', 'orphan_cleanup', 'failed_promotion', 'explicit_delete'] }),
      ],
    },
    idempotencyKeyTemplate: 'asset.delete:{assetId}:{expectedSha256}:{reason}',
    intentPreconditions: ['Atomically mark Asset deleting or register controlled orphan intent', 'Reject intent while Asset is referenced by current/formal state'],
    externalEffect: ['Delete only the canonical exact storageKey', 'Missing path is idempotent success', 'Existing path with different digest is never deleted'],
    postconditions: ['Path is absent before fenced processed', 'Domain row is removed only by later explicit purge'],
    retry: { maxAttempts: 3, backoffSeconds: [5, 30], retryableCodes: ['TRANSIENT_IO'], nonRetryableConditions: ['PATH_OUT_OF_BOUNDS', 'HASH_MISMATCH'] },
    replayProbe: ['Probe path absence', 'If present, verify expected digest before delete'],
    terminalPolicy: ['Hash mismatch becomes failed+needsReview', 'processed never substitutes for project.delete_files purge evidence', 'Terminal event never reopens'],
  }),
  outboxHandler({
    eventType: 'project.delete_files', aggregateType: 'project',
    payloadCodec: {
      name: 'ProjectDeleteFilesPayloadV1', schemaVersion: 1, strictUnknownFields: true,
      fields: [
        payloadField('schemaVersion', 'integer', { literal: 1 }), payloadField('projectId', 'string', { format: 'opaque-id' }),
        payloadField('projectRootStorageKey', 'string', { format: 'storage-key' }), payloadField('assetManifestDigest', 'string', { format: 'sha256' }),
      ],
    },
    idempotencyKeyTemplate: 'project.delete_files:{projectId}:{assetManifestDigest}',
    intentPreconditions: [
      'Atomically transition Project active->deleting, request runtime task cancellation, freeze staged/temp/final Asset manifest and insert event',
      'Reject subsequent ordinary writes and new tasks',
    ],
    externalEffect: ['Idempotently delete only verified manifest entries under project-owned canonical root', 'Never delete workspace, dataRoot or home'],
    postconditions: [
      'All target Asset paths absent',
      'No active runtime task',
      'No pending/processing asset.promote or asset.delete event for the Project other than this event',
      'Only after fenced processed may explicit DB purge begin',
    ],
    retry: { maxAttempts: 3, backoffSeconds: [5, 30], retryableCodes: ['TRANSIENT_IO'], nonRetryableConditions: ['PATH_OUT_OF_BOUNDS', 'UNKNOWN_FILE', 'ACTIVE_RUNTIME_TASK', 'UNSETTLED_ASSET_EVENT'] },
    replayProbe: ['Re-scan frozen manifest paths', 'Recheck active tasks', 'Recheck other file events', 'Require existing promote on deleting Project to settle through deleting-cleanup first'],
    terminalPolicy: ['Partial delete is replayable', 'Unsafe/unsettled state stays pending or becomes failed', 'Never clear Project lifecycle state', 'Terminal event never reopens'],
  }),
  outboxHandler({
    eventType: 'secret.delete_old_ref', aggregateType: 'credential_metadata',
    payloadCodec: {
      name: 'SecretDeleteOldRefPayloadV1', schemaVersion: 1, strictUnknownFields: true,
      fields: [
        payloadField('schemaVersion', 'integer', { literal: 1 }), payloadField('credentialMetadataId', 'string', { format: 'opaque-id' }),
        payloadField('oldSecretRef', 'string', { format: 'secret-ref' }), payloadField('expectedFingerprint', 'string', { format: 'sha256' }),
        payloadField('reason', 'string', { enumValues: ['rotate', 'clear'] }),
      ],
    },
    idempotencyKeyTemplate: 'secret.delete_old_ref:{credentialMetadataId}:{oldSecretRef}',
    intentPreconditions: ['Rotate inserts old-ref event in same transaction that switches to verified new ref', 'Clear inserts event while configured->clearing and retains old ref/fingerprint', 'Payload contains opaque ref only and passes credential sentinel scan'],
    externalEffect: ['SecretStore delete(oldSecretRef)', 'Absent ref is idempotent success'],
    postconditions: ['Rotate metadata current ref is no longer old', 'Clear metadata remains clearing with old ref until event processed', 'After fenced processed, a second transaction may clear ref/fingerprint and enter unconfigured'],
    retry: { maxAttempts: 3, backoffSeconds: [5, 30], retryableCodes: ['TRANSIENT_IO'], nonRetryableConditions: ['PERMISSION_DENIED', 'OWNER_MISMATCH'] },
    replayProbe: ['Probe ref existence without reading secret value', 'Probe metadata branch precondition'],
    terminalPolicy: ['Failure moves credential metadata to error without exposing/copying secret', 'Terminal event never reopens'],
  }),
  outboxHandler({
    eventType: 'legacy_metadata.archive', aggregateType: 'project',
    payloadCodec: {
      name: 'LegacyMetadataArchivePayloadV1', schemaVersion: 1, strictUnknownFields: true,
      fields: [
        payloadField('schemaVersion', 'integer', { literal: 1 }), payloadField('cutoverRunId', 'string', { format: 'opaque-id' }),
        payloadField('projectId', 'string', { format: 'opaque-id' }), payloadField('sourceManifestDigest', 'string', { format: 'sha256' }),
        payloadField('archiveStorageKey', 'string', { format: 'storage-key' }), payloadField('metadataEntriesDigest', 'string', { format: 'sha256' }),
      ],
    },
    idempotencyKeyTemplate: 'legacy-metadata.archive:{cutoverRunId}:{projectId}:{sourceManifestDigest}',
    intentPreconditions: ['MigrationRun is succeeded final', 'Maintenance is closed', 'DB is ready_for_activation', 'Secret scan count is zero', 'Payload excludes settings plaintext'],
    externalEffect: ['Move/copy only allowlisted metadata', 'Leave Asset bytes in place', 'Write read-only archive manifest'],
    postconditions: ['Archive digest matches', 'Active scan entry points contain no legacy business metadata', 'Asset paths remain writable'],
    retry: { maxAttempts: 3, backoffSeconds: [5, 30], retryableCodes: ['TRANSIENT_IO'], nonRetryableConditions: ['SECRET_DETECTED', 'UNKNOWN_ENTRY', 'DIGEST_DRIFT'] },
    replayProbe: ['Probe archive manifest and digest', 'Probe active metadata entry points', 'Probe Asset path writability'],
    terminalPolicy: ['Secret/unknown/drift becomes failed and blocks C7', 'Terminal event never reopens'],
  }),
];

const STAGE_OWNERSHIP: readonly StageOwnershipSource[] = [
  {
    stage: 'G1',
    baseOwned: [
      '44 accepted models and all frozen scalar/relation fields',
      'Chapter current/pending columns and current=confirmed,pending=pending_confirmation base guards',
      'Story/Storyboard formal projection validation and immutable formal history',
      'Project.comicFormat NOT NULL/no default/two-value CHECK',
      'Candidate provenance nullable legacy branches and immutable CandidateLock history',
      'Layout binding seal and ready Export base immutability',
      'Task/Attempt/Slot/Source and Outbox base state machines',
      'DEL-00 Project deleting root write fence for high-risk SQL paths',
    ],
    overlayOwned: [], addChecks: [], addIndexes: [], addTriggers: [], sourceSection: '15',
  },
  {
    stage: 'G2',
    baseOwned: ['G1 current/pending/source/digest/rowVersion columns and base formal guards'],
    overlayOwned: ['active pending uniqueness', 'pending rowVersion/CAS', 'source policy freshness/NewWorkGate', 'new runtime/pending confirm requires V2 codec/trigger'],
    addChecks: ['G2 version/freshness overlay checks'], addIndexes: ['G2 one-active-pending uniqueness indexes'], addTriggers: ['G2 pending CAS/freshness/NewWorkGate/V2 confirmation triggers'], sourceSection: '15',
  },
  {
    stage: 'G3',
    baseOwned: ['projects.comic_format is non-null, has no default, and has the two-value CHECK'],
    overlayOwned: ['comicFormat update immutability', 'Create/Update parser', 'legacy comicFormat user-decision gate'],
    addChecks: [], addIndexes: [], addTriggers: ['project_comic_format_immutable'], sourceSection: '15',
  },
  {
    stage: 'G4',
    baseOwned: ['Candidate provenance branches', 'CandidateLockRevision/Shot current pointer', 'base action nullability and immutable history', 'revision DESC query index'],
    overlayOwned: ['non-null previous uniqueness', 'linear previous=current and revision+1 chain', 'replay constraints', 'impact analysis behavior'],
    addChecks: ['G4 linear-chain overlay checks'], addIndexes: ['G4 non-null previous unique index'], addTriggers: ['G4 CandidateLock linear-chain/replay triggers'], sourceSection: '15',
  },
  {
    stage: 'G5',
    baseOwned: ['Layout/Export/Pending command columns', 'bindingSetSealedAt', 'ready Export base immutability'],
    overlayOwned: ['Layout previous linear uniqueness', 'WorkingCopy autosave replay', 'publication queued->rendering->terminal atomic with Task claim/Attempt finish', 'runtime required/current finalize', 'renderer/profile/artifact completeness'],
    addChecks: ['G5 publication/runtime completeness checks'], addIndexes: ['G5 Layout previous linear unique index'], addTriggers: ['G5 Layout linear/autosave and Export-Task atomic state triggers'], sourceSection: '15',
  },
];

const purgeOwnership = (
  table: string,
  ownership: PurgeOwnershipSource['ownership'],
  ownerProjectPath: string | null,
  deleteGuard: `trg_${string}` | null,
  activeDialogueAllStateDeleteGuard = false,
): PurgeOwnershipSource => ({
  table,
  ownership,
  ownerProjectPath,
  deleteGuard,
  activeDialogueAllStateDeleteGuard,
  sourceSection: '12.4',
});

/**
 * Exhaustive 44-table ownership classification used to review purge closure.
 * A project history/cascade root must own a DELETE guard. Private children may
 * delegate only to their explicitly named guard; active dialogue rows use an
 * all-state guard so cascade or direct DELETE cannot bypass coordinated purge.
 * Mutable working state is deliberately separate from immutable history.
 */
const PURGE_OWNERSHIP: readonly PurgeOwnershipSource[] = [
  purgeOwnership('persistence_states', 'global_or_cross_project', null, 'trg_persistence_states_no_delete'),
  purgeOwnership('migration_runs', 'global_or_cross_project', null, 'trg_migration_runs_terminal_immutable_delete'),
  purgeOwnership('imported_entity_sources', 'global_or_cross_project', null, null),
  purgeOwnership('migration_issues', 'global_or_cross_project', null, 'trg_migration_issues_no_delete'),
  purgeOwnership('projects', 'project_history_or_cascade_root', 'OLD.id', 'trg_projects_purge_delete_guard'),
  purgeOwnership('project_script_outlines', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_project_script_outlines_formal_immutable_delete'),
  purgeOwnership('chapters', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_chapters_purge_delete_guard'),
  purgeOwnership('chapter_script_versions', 'project_history_or_cascade_root', 'Chapter.project_id via OLD.chapter_id', 'trg_chapter_script_versions_immutable_delete'),
  purgeOwnership('chapter_script_pending', 'project_ephemeral_state', 'Chapter.project_id via OLD.chapter_id', null),
  purgeOwnership('chapter_script_revisions', 'project_history_or_cascade_root', 'Chapter.project_id via OLD.chapter_id', 'trg_chapter_script_revisions_purge_delete_guard'),
  purgeOwnership('story_versions', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_story_versions_formal_immutable_delete'),
  purgeOwnership('story_scene_projections', 'project_private_child', 'StoryVersion.project_id via OLD.story_version_id', 'trg_story_scene_projections_parent_formal_delete'),
  purgeOwnership('story_beat_projections', 'project_private_child', 'StoryVersion.project_id via OLD.story_version_id', 'trg_story_beat_projections_parent_formal_delete'),
  purgeOwnership('chapter_scenes', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_chapter_scenes_purge_delete_guard'),
  purgeOwnership('scene_visuals', 'project_history_or_cascade_root', 'ChapterScene.project_id via OLD.chapter_scene_id', 'trg_scene_visuals_purge_delete_guard'),
  purgeOwnership('storyboard_versions', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_storyboard_versions_formal_immutable_delete'),
  purgeOwnership('shots', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_shots_purge_delete_guard'),
  purgeOwnership('storyboard_shot_projections', 'project_private_child', 'StoryboardVersion.project_id via OLD.storyboard_version_id', 'trg_storyboard_shot_projections_parent_formal_delete'),
  purgeOwnership('storyboard_shot_characters', 'project_private_child', 'StoryboardVersion.project_id via StoryboardShotProjection', 'trg_storyboard_shot_characters_parent_formal_delete'),
  purgeOwnership('preflight_revisions', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_preflight_revisions_immutable_delete'),
  purgeOwnership('characters', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_characters_purge_delete_guard'),
  purgeOwnership('character_visuals', 'project_history_or_cascade_root', 'Character.project_id via OLD.character_id', 'trg_character_visuals_purge_delete_guard'),
  purgeOwnership('assets', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_assets_ready_core_immutable_delete'),
  purgeOwnership('candidates', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_candidates_history_delete'),
  purgeOwnership('candidate_lock_revisions', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_candidate_lock_revisions_immutable_delete'),
  purgeOwnership('app_preferences', 'global_or_cross_project', null, null),
  purgeOwnership('provider_configs', 'global_or_cross_project', null, null),
  purgeOwnership('credential_metadata', 'global_or_cross_project', null, 'trg_credential_metadata_secret_ref_delete'),
  purgeOwnership('project_context_facts', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_project_context_facts_purge_delete_guard'),
  purgeOwnership('conversation_threads', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_conversation_threads_purge_delete_guard'),
  purgeOwnership('conversation_messages', 'project_private_child', 'ConversationThread.project_id via OLD.thread_id', 'trg_conversation_messages_terminal_immutable_delete', true),
  purgeOwnership('dialogue_tool_results', 'project_history_or_cascade_root', 'ConversationThread.project_id via ConversationMessage', 'trg_dialogue_tool_results_audit_immutable_delete'),
  purgeOwnership('dialogue_runtime_sessions', 'project_private_child', 'ConversationThread.project_id via OLD.thread_id', 'trg_dialogue_runtime_sessions_terminal_immutable_delete', true),
  purgeOwnership('pending_dialogue_artifacts', 'project_private_child', 'OLD.project_id', 'trg_pending_dialogue_artifacts_terminal_immutable_delete', true),
  purgeOwnership('generation_tasks', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_generation_tasks_history_delete'),
  purgeOwnership('task_attempts', 'project_history_or_cascade_root', 'GenerationTask.project_id via OLD.task_id', 'trg_task_attempts_history_delete'),
  purgeOwnership('task_concurrency_slots', 'global_or_cross_project', null, 'trg_task_concurrency_slots_no_delete'),
  purgeOwnership('generation_task_sources', 'project_history_or_cascade_root', 'GenerationTask.project_id via OLD.task_id', 'trg_generation_task_sources_history_delete'),
  purgeOwnership('layout_working_copies', 'project_ephemeral_state', 'OLD.project_id', null),
  purgeOwnership('layout_revisions', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_layout_revisions_immutable_delete'),
  purgeOwnership('layout_source_bindings', 'project_history_or_cascade_root', 'LayoutRevision.project_id via OLD.layout_revision_id', 'trg_layout_source_bindings_history_delete'),
  purgeOwnership('export_revisions', 'project_history_or_cascade_root', 'OLD.project_id', 'trg_export_revisions_ready_immutable_delete'),
  purgeOwnership('export_artifacts', 'project_private_child', 'ExportRevision.project_id via OLD.export_revision_id', 'trg_export_artifacts_parent_ready_delete'),
  purgeOwnership('outbox_events', 'global_or_cross_project', null, 'trg_outbox_events_no_delete'),
];

interface TriggerRequirement {
  readonly table: string;
  readonly name: string;
  readonly sourceSection: string;
}

const requirements = (table: string, sourceSection: string, names: readonly string[]): readonly TriggerRequirement[] =>
  names.map((name) => ({ table, name, sourceSection }));

const TRIGGER_REQUIREMENTS: readonly TriggerRequirement[] = [
  ...requirements('persistence_states', '5.1,12.3', [
    'trg_persistence_states_initial_insert', 'trg_persistence_states_no_second_row', 'trg_persistence_states_no_delete',
    'trg_persistence_states_identity_immutable', 'trg_persistence_states_cutover_run_insert', 'trg_persistence_states_cutover_run_update',
    'trg_persistence_states_activation_transition', 'trg_persistence_states_activation_first_write',
    'trg_persistence_states_activation_identity_immutable', 'trg_persistence_states_first_write_monotonic',
  ]),
  ...requirements('migration_runs', '5.2,12.3', [
    'trg_migration_runs_running_insert', 'trg_migration_runs_state_transition',
    'trg_migration_runs_terminal_immutable_update', 'trg_migration_runs_terminal_immutable_delete',
  ]),
  ...requirements('imported_entity_sources', '5.3,12.3', ['trg_imported_entity_sources_identity_immutable', 'trg_imported_entity_sources_provenance_monotonic']),
  ...requirements('migration_issues', '5.4,12.3', ['trg_migration_issues_running_run_insert', 'trg_migration_issues_running_run_update', 'trg_migration_issues_no_delete']),
  ...requirements('projects', '6.1,6.1.1,12.3', [
    'trg_projects_current_scope_insert', 'trg_projects_current_scope_update', 'trg_projects_genre_tags_shape_insert',
    'trg_projects_genre_tags_shape_update', 'trg_projects_deleting_monotonic', 'trg_projects_purge_delete_guard',
  ]),
  ...requirements('project_script_outlines', '6.2,12.3', ['trg_project_script_outlines_lifecycle_update', 'trg_project_script_outlines_formal_immutable_update', 'trg_project_script_outlines_formal_immutable_delete']),
  ...requirements('chapters', '6.3,12.3', ['trg_chapters_pointer_scope_insert', 'trg_chapters_pointer_scope_update', 'trg_chapters_milestone_monotonic', 'trg_chapters_purge_delete_guard']),
  ...requirements('chapter_script_versions', '6.4,12.3', ['trg_chapter_script_versions_immutable_update', 'trg_chapter_script_versions_immutable_delete']),
  ...requirements('chapter_script_pending', '6.5,12.3', ['trg_chapter_script_pending_dialogue_scope_insert', 'trg_chapter_script_pending_dialogue_scope_update']),
  ...requirements('chapter_script_revisions', '6.6,12.3,12.4', ['trg_chapter_script_revisions_dialogue_scope_insert', 'trg_chapter_script_revisions_dialogue_scope_update', 'trg_chapter_script_revisions_purge_delete_guard']),
  ...requirements('story_versions', '7.1,12.3', ['trg_story_versions_scope_insert', 'trg_story_versions_scope_update', 'trg_story_versions_unconfirmed_insert', 'trg_story_versions_formalize_guard', 'trg_story_versions_formal_immutable_update', 'trg_story_versions_formal_immutable_delete']),
  ...requirements('story_scene_projections', '7.2,12.3', ['trg_story_scene_projections_scope_insert', 'trg_story_scene_projections_scope_update', 'trg_story_scene_projections_parent_formal_insert', 'trg_story_scene_projections_parent_formal_update', 'trg_story_scene_projections_parent_formal_delete']),
  ...requirements('story_beat_projections', '7.3,12.3', ['trg_story_beat_projections_scope_insert', 'trg_story_beat_projections_scope_update', 'trg_story_beat_projections_parent_formal_insert', 'trg_story_beat_projections_parent_formal_update', 'trg_story_beat_projections_parent_formal_delete']),
  ...requirements('chapter_scenes', '7.4,12.3,12.4', ['trg_chapter_scenes_scope_insert', 'trg_chapter_scenes_scope_update', 'trg_chapter_scenes_current_visual_scope_insert', 'trg_chapter_scenes_current_visual_scope_update', 'trg_chapter_scenes_purge_delete_guard']),
  ...requirements('scene_visuals', '7.5,12.3,12.4', ['trg_scene_visuals_scope_insert', 'trg_scene_visuals_scope_update', 'trg_scene_visuals_purge_delete_guard']),
  ...requirements('storyboard_versions', '7.6,12.3', ['trg_storyboard_versions_scope_insert', 'trg_storyboard_versions_scope_update', 'trg_storyboard_versions_unconfirmed_insert', 'trg_storyboard_versions_formalize_guard', 'trg_storyboard_versions_formal_immutable_update', 'trg_storyboard_versions_formal_immutable_delete']),
  ...requirements('shots', '7.7,12.3,12.4', ['trg_shots_scope_insert', 'trg_shots_scope_update', 'trg_shots_current_lock_scope_insert', 'trg_shots_current_lock_scope_update', 'trg_shots_purge_delete_guard']),
  ...requirements('storyboard_shot_projections', '7.8,12.3', ['trg_storyboard_shot_projections_scope_insert', 'trg_storyboard_shot_projections_scope_update', 'trg_storyboard_shot_projections_parent_formal_insert', 'trg_storyboard_shot_projections_parent_formal_update', 'trg_storyboard_shot_projections_parent_formal_delete']),
  ...requirements('storyboard_shot_characters', '7.9,12.3', ['trg_storyboard_shot_characters_scope_insert', 'trg_storyboard_shot_characters_scope_update', 'trg_storyboard_shot_characters_parent_formal_insert', 'trg_storyboard_shot_characters_parent_formal_update', 'trg_storyboard_shot_characters_parent_formal_delete']),
  ...requirements('preflight_revisions', '7.10,12.3', ['trg_preflight_revisions_scope_insert', 'trg_preflight_revisions_immutable_update', 'trg_preflight_revisions_immutable_delete']),
  ...requirements('characters', '8.1,12.3,12.4', ['trg_characters_current_visual_scope_insert', 'trg_characters_current_visual_scope_update', 'trg_characters_purge_delete_guard']),
  ...requirements('character_visuals', '8.2,12.3,12.4', ['trg_character_visuals_asset_scope_insert', 'trg_character_visuals_asset_scope_update', 'trg_character_visuals_current_reverse_update', 'trg_character_visuals_purge_delete_guard']),
  ...requirements('assets', '8.3,12.3', ['trg_assets_source_scope_insert', 'trg_assets_source_scope_update', 'trg_assets_unready_insert', 'trg_assets_ready_transition', 'trg_assets_ready_core_immutable_update', 'trg_assets_ready_core_immutable_delete']),
  ...requirements('candidates', '8.4,12.3', ['trg_candidates_task_provenance_insert', 'trg_candidates_identity_immutable_update', 'trg_candidates_history_delete']),
  ...requirements('candidate_lock_revisions', '6.1.1,8.5,12.3', ['trg_candidate_lock_revisions_initial_insert', 'trg_candidate_lock_revisions_immutable_update', 'trg_candidate_lock_revisions_immutable_delete']),
  ...requirements('app_preferences', '9.1,12.3', ['trg_app_preferences_no_second_row', 'trg_app_preferences_provider_runtime_kind_insert', 'trg_app_preferences_provider_runtime_kind_update']),
  ...requirements('provider_configs', '9.2,12.3', ['trg_provider_configs_identity_immutable_update']),
  ...requirements('credential_metadata', '9.3,12.3', ['trg_credential_metadata_provider_owner_insert', 'trg_credential_metadata_provider_owner_update', 'trg_credential_metadata_status_transition', 'trg_credential_metadata_secret_ref_update', 'trg_credential_metadata_secret_ref_delete']),
  ...requirements('project_context_facts', '9.4,12.3,12.4', ['trg_project_context_facts_content_immutable', 'trg_project_context_facts_purge_delete_guard']),
  ...requirements('conversation_threads', '9.5,12.3,12.4', ['trg_conversation_threads_scope_insert', 'trg_conversation_threads_scope_update', 'trg_conversation_threads_purge_delete_guard']),
  ...requirements('conversation_messages', '9.6,12.3', ['trg_conversation_messages_initial_insert', 'trg_conversation_messages_state_transition', 'trg_conversation_messages_running_append_only', 'trg_conversation_messages_terminal_immutable_update', 'trg_conversation_messages_terminal_immutable_delete']),
  ...requirements('dialogue_tool_results', '9.7,12.3', ['trg_dialogue_tool_results_message_scope_insert', 'trg_dialogue_tool_results_audit_immutable_update', 'trg_dialogue_tool_results_audit_immutable_delete']),
  ...requirements('dialogue_runtime_sessions', '9.8,12.3', ['trg_dialogue_runtime_sessions_initial_insert', 'trg_dialogue_runtime_sessions_state_transition', 'trg_dialogue_runtime_sessions_identity_immutable_update', 'trg_dialogue_runtime_sessions_terminal_immutable_update', 'trg_dialogue_runtime_sessions_terminal_immutable_delete']),
  ...requirements('pending_dialogue_artifacts', '9.9,12.3', ['trg_pending_dialogue_artifacts_scope_insert', 'trg_pending_dialogue_artifacts_scope_update', 'trg_pending_dialogue_artifacts_initial_insert', 'trg_pending_dialogue_artifacts_state_transition', 'trg_pending_dialogue_artifacts_identity_immutable_update', 'trg_pending_dialogue_artifacts_terminal_immutable_update', 'trg_pending_dialogue_artifacts_terminal_immutable_delete']),
  ...requirements('generation_tasks', '6.1.1,10.1,12.3', ['trg_generation_tasks_initial_insert', 'trg_generation_tasks_input_immutable', 'trg_generation_tasks_record_identity_immutable', 'trg_generation_tasks_legacy_evidence_upgrade', 'trg_generation_tasks_legacy_execution_guard_update', 'trg_generation_tasks_source_set_seal', 'trg_generation_tasks_runtime_state_transition', 'trg_generation_tasks_claim_validate', 'trg_generation_tasks_claim_materialize', 'trg_generation_tasks_heartbeat_validate', 'trg_generation_tasks_heartbeat_materialize', 'trg_generation_tasks_running_fencing_update', 'trg_generation_tasks_history_delete']),
  ...requirements('task_attempts', '10.2,12.3', ['trg_task_attempts_runtime_task_insert', 'trg_task_attempts_identity_immutable_update', 'trg_task_attempts_finish_validate', 'trg_task_attempts_finish_materialize', 'trg_task_attempts_history_delete']),
  ...requirements('task_concurrency_slots', '10.3,12.3', ['trg_task_concurrency_slots_identity_immutable_update', 'trg_task_concurrency_slots_no_delete', 'trg_task_concurrency_slots_claim_matches_task_insert', 'trg_task_concurrency_slots_claim_matches_task_update']),
  ...requirements('generation_task_sources', '10.4,12.3', ['trg_generation_task_sources_scope_insert', 'trg_generation_task_sources_append_only_update', 'trg_generation_task_sources_history_delete']),
  ...requirements('layout_working_copies', '11.1,12.3', ['trg_layout_working_copies_scope_insert', 'trg_layout_working_copies_scope_update']),
  ...requirements('layout_revisions', '11.2,12.3', ['trg_layout_revisions_scope_insert', 'trg_layout_revisions_binding_set_seal', 'trg_layout_revisions_immutable_update', 'trg_layout_revisions_immutable_delete']),
  ...requirements('layout_source_bindings', '11.3,12.3', ['trg_layout_source_bindings_scope_insert', 'trg_layout_source_bindings_append_only_update', 'trg_layout_source_bindings_history_delete']),
  ...requirements('export_revisions', '11.4,12.3', ['trg_export_revisions_scope_insert', 'trg_export_revisions_scope_update', 'trg_export_revisions_unready_insert', 'trg_export_revisions_runtime_source_immutable_update', 'trg_export_revisions_ready_guard_update', 'trg_export_revisions_ready_immutable_update', 'trg_export_revisions_ready_immutable_delete']),
  ...requirements('export_artifacts', '11.5,12.3', ['trg_export_artifacts_scope_insert', 'trg_export_artifacts_scope_update', 'trg_export_artifacts_parent_ready_insert', 'trg_export_artifacts_parent_ready_update', 'trg_export_artifacts_parent_ready_delete']),
  ...requirements('outbox_events', '11.6,12.3', ['trg_outbox_events_pending_insert', 'trg_outbox_events_intent_immutable', 'trg_outbox_events_attempt_transition', 'trg_outbox_events_state_transition', 'trg_outbox_events_lease_shape', 'trg_outbox_events_lease_fencing', 'trg_outbox_events_processed_immutable', 'trg_outbox_events_no_delete']),
];

const inferTriggerEvent = (name: string): 'INSERT' | 'UPDATE' | 'DELETE' => {
  if (name.endsWith('_insert') || name.endsWith('_no_second_row') || name.endsWith('_running_insert') || name.endsWith('_initial_insert') || name.endsWith('_pending_insert')) return 'INSERT';
  if (name.endsWith('_delete') || name.endsWith('_no_delete') || name.endsWith('_history_delete') || name.endsWith('_purge_delete_guard')) return 'DELETE';
  return 'UPDATE';
};

const trigger = (
  table: string,
  name: string,
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  body: string,
  sourceSection: string,
  when = '1',
): G1SchemaTriggerSource => ({
  ownerStage: 'G1', table, name, timing: 'BEFORE', event, updateColumns: [],
  normalizedWhen: normalizeSql(when), normalizedBody: normalizeSql(body),
  errorCode: `AIR_G1:${name}`, sourceSection,
});

const COMPLETE_TRIGGERS: readonly G1SchemaTriggerSource[] = [
  trigger('persistence_states', 'trg_persistence_states_no_delete', 'DELETE', "SELECT RAISE(ABORT, 'AIR_G1:trg_persistence_states_no_delete')", '5.1,12.3'),
  trigger('migration_issues', 'trg_migration_issues_no_delete', 'DELETE', "SELECT RAISE(ABORT, 'AIR_G1:trg_migration_issues_no_delete')", '5.4,12.3'),
  trigger('task_concurrency_slots', 'trg_task_concurrency_slots_no_delete', 'DELETE', "SELECT RAISE(ABORT, 'AIR_G1:trg_task_concurrency_slots_no_delete')", '10.3,12.3'),
  trigger('outbox_events', 'trg_outbox_events_no_delete', 'DELETE', "SELECT RAISE(ABORT, 'AIR_G1:trg_outbox_events_no_delete')", '11.6,12.3'),
  trigger('persistence_states', 'trg_persistence_states_no_second_row', 'INSERT', "SELECT RAISE(ABORT, 'AIR_G1:trg_persistence_states_no_second_row') WHERE EXISTS (SELECT 1 FROM persistence_states)", '5.1,12.3'),
  trigger('app_preferences', 'trg_app_preferences_no_second_row', 'INSERT', "SELECT RAISE(ABORT, 'AIR_G1:trg_app_preferences_no_second_row') WHERE EXISTS (SELECT 1 FROM app_preferences)", '9.1,12.3'),
];

const knownTables = (): readonly string[] => [...new Set([
  ...BASE_CHECKS.map((item) => item.table),
  ...TRIGGER_REQUIREMENTS.map((item) => item.table),
])].sort((left, right) => right.length - left.length);

const inferTableFromPhysicalKey = (key: string): string | null => {
  const prefix = key.startsWith('ck_') ? 'ck_' : key.startsWith('trg_') ? 'trg_' : '';
  return knownTables().find((table) => key.startsWith(`${prefix}${table}_`)) ?? null;
};

const extractPhysicalKeys = (markdown: string, prefix: 'ck_' | 'trg_'): readonly string[] => {
  const expression = new RegExp(`(?:^|[^a-z0-9_])(${prefix}[a-z0-9_]+)`, 'gim');
  return [...new Set([...markdown.matchAll(expression)].map((match) => match[1]))].sort();
};

const triggerKnown = (requirement: TriggerRequirement): NonNullable<G1CompletenessIssue['known']> => {
  const timing = requirement.name.includes('_materialize') ? 'AFTER' : 'BEFORE';
  const event = inferTriggerEvent(requirement.name);
  const updateColumns = requirement.name === 'trg_generation_tasks_claim_validate' || requirement.name === 'trg_generation_tasks_claim_materialize'
    ? ['status', 'attempt', 'lease_owner_id', 'lease_token', 'lease_expires_at', 'heartbeat_at', 'started_at']
    : [];
  return {
    timing,
    event,
    updateColumns,
    errorCode: `AIR_G1:${requirement.name}`,
  };
};

/**
 * Builds the source strictly from the supplied authority text.  The data is
 * static and reviewed; the text is used only to prove that the expected
 * authority documents/sections and physical keys are present.  It is never
 * used to reverse-engineer a tested schema.
 */
export function buildG1SchemaConstraintSource(
  contractMarkdown: string,
  registryMarkdown: string,
): G1SchemaConstraintSource {
  const issues: G1CompletenessIssue[] = [];

  const requiredContractMarkers = [
    'doc_id: AIR-CONTRACT-20260711-G1-SCHEMA-IMPLEMENTATION',
    '## 3. 闭合枚举与开放字符串',
    '#### 6.1.1 `DEL-00` Project deleting 根写栅栏',
    '#### 10.4.1 `TaskSourceRegistryV1`',
    '### 12.2 CHECK 完整清单',
    '### 12.3 trigger 完整清单与职责',
    '## 15. 后续阶段所有权',
  ];
  const requiredRegistryMarkers = [
    'doc_id: AIR-CONTRACT-20260711-G1-TASK-OUTBOX-REGISTRY',
    '## 3. TaskPolicyRegistryV1',
    '### 3.3 manifest 精确补充列',
    '### 3.4 幂等模板占位符绑定',
    '## 4. OutboxHandlerRegistryV1',
  ];

  for (const marker of requiredContractMarkers) {
    if (!contractMarkdown.includes(marker)) {
      issues.push({ kind: 'source-document', key: marker, table: null, sourceSection: 'authority validation', missing: ['required contract marker'] });
    }
  }
  for (const marker of requiredRegistryMarkers) {
    if (!registryMarkdown.includes(marker)) {
      issues.push({ kind: 'source-document', key: marker, table: null, sourceSection: 'authority validation', missing: ['required registry marker'] });
    }
  }

  const completeCheckNames = new Set(BASE_CHECKS.map((item) => item.name));
  for (const key of extractPhysicalKeys(contractMarkdown, 'ck_')) {
    if (!completeCheckNames.has(key)) {
      issues.push({
        kind: 'check',
        key,
        table: inferTableFromPhysicalKey(key),
        sourceSection: 'model section + 12.2',
        missing: ['full canonical normalizedExpression uniquely frozen as SQL'],
      });
    }
  }

  const completeTriggerNames = new Set(COMPLETE_TRIGGERS.map((item) => item.name));
  const requirementByName = new Map(TRIGGER_REQUIREMENTS.map((item) => [item.name, item]));
  for (const key of extractPhysicalKeys(contractMarkdown, 'trg_')) {
    if (!requirementByName.has(key)) {
      requirementByName.set(key, { table: inferTableFromPhysicalKey(key) ?? 'UNRESOLVED_TABLE', name: key, sourceSection: '12.3' });
    }
  }
  for (const requirement of requirementByName.values()) {
    if (completeTriggerNames.has(requirement.name)) continue;
    issues.push({
      kind: 'trigger',
      key: requirement.name,
      table: requirement.table === 'UNRESOLVED_TABLE' ? null : requirement.table,
      sourceSection: requirement.sourceSection,
      missing: ['full normalizedWhen transition predicate where applicable', 'full ordered normalizedBody SQL statements and violation predicates'],
      known: triggerKnown(requirement),
    });
  }

  const expectedTaskTypes = [
    'character_reference_generate', 'scene_reference_generate', 'story_parse', 'shot_generate', 'shot_prompt_generate',
    'image_generate', 'layout_export', 'tts_generate', 'video_export', 'asset_package_export',
  ];
  for (const type of expectedTaskTypes) {
    if (!registryMarkdown.includes(`\`${type}\``) || !TASK_POLICIES.some((item) => item.type === type)) {
      issues.push({ kind: 'task-policy', key: type, table: 'generation_tasks', sourceSection: '3.1,3.2,3.3,3.4', missing: ['complete TaskPolicyRegistryV1 entry'] });
    }
  }
  for (const policy of TASK_POLICIES) {
    const bindingIssues = validateTaskIdempotencyKeyBindings(policy);
    if (bindingIssues.length > 0) {
      issues.push({
        kind: 'task-policy',
        key: `${policy.type}:idempotency`,
        table: 'generation_tasks',
        sourceSection: '3.1,3.2,3.3,3.4',
        missing: bindingIssues,
      });
    }
  }
  for (const eventType of ['asset.promote', 'asset.delete', 'project.delete_files', 'secret.delete_old_ref', 'legacy_metadata.archive']) {
    if (!registryMarkdown.includes(`\`${eventType}\``) || !OUTBOX_HANDLERS.some((item) => item.eventType === eventType)) {
      issues.push({ kind: 'outbox-handler', key: eventType, table: 'outbox_events', sourceSection: '4.1,4.2,4.3', missing: ['complete OutboxHandlerRegistryV1 entry'] });
    }
  }

  issues.sort((left, right) => compareCanonicalText(`${left.kind}:${left.key}`, `${right.kind}:${right.key}`));

  return {
    sourceDocuments: ['2026-07-11_G1数据库Schema实施契约.md', '2026-07-11_G1任务与Outbox实施注册表.md'],
    sourceSections: ['3', '5-12.4', '13', '15', '16', 'registry:2-6'],
    canonicalization: {
      sqlWhitespace: 'collapse-ascii-whitespace',
      arrayOrder: 'declared-source-order',
      issueOrder: 'kind,key',
    },
    checks: [...BASE_CHECKS].sort((left, right) => compareCanonicalText(left.name, right.name)),
    triggers: [...COMPLETE_TRIGGERS].sort((left, right) => compareCanonicalText(left.name, right.name)),
    stageOwnership: STAGE_OWNERSHIP,
    taskPolicyRegistryV1: TASK_POLICIES,
    outboxHandlerRegistryV1: OUTBOX_HANDLERS,
    purgeOwnershipRegistryV1: PURGE_OWNERSHIP,
    completenessIssues: issues,
  };
}
