import type {
  G1CompletenessIssue,
  G1SchemaTriggerSource,
} from './g1-schema-constraint-source.js';
import type {
  G1PhysicalTriggerBindingV1,
  G1TriggerTemplateV1,
} from './g1-schema-trigger-dsl-core-a.js';

type TriggerArg = string | number | boolean | null | readonly string[];
type TriggerArgs = Readonly<Record<string, TriggerArg>>;
type TriggerEvent = G1SchemaTriggerSource['event'];
type TriggerTiming = G1SchemaTriggerSource['timing'];

export interface G1SchemaTriggerRuntimeADslSource {
  readonly sourceDocument: '2026-07-11_G1数据库Schema实施契约.md';
  readonly sourceSections: readonly ['9.1-9.9', '12.3', '12.3.1', '12.4'];
  readonly templates: readonly G1TriggerTemplateV1[];
  readonly bindings: readonly G1PhysicalTriggerBindingV1[];
  /** Missing-only expansion; the existing AppPreference singleton trigger is not duplicated. */
  readonly triggers: readonly G1SchemaTriggerSource[];
  readonly completenessIssues: readonly G1CompletenessIssue[];
  readonly residualTriggerKeys: readonly string[];
}

interface RuntimeTemplate extends G1TriggerTemplateV1 {
  readonly expand: (args: TriggerArgs) => Omit<G1SchemaTriggerSource, 'ownerStage' | 'table' | 'name' | 'sourceSection'>;
}

const normalizeSql = (value: string): string => value.replace(/[\t\n\v\f\r ]+/g, ' ').trim().replace(/;$/, '');

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
    WHERE purge_project.id = ${projectIdSql} AND purge_project.lifecycle_status = 'deleting'
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

const immutableUpdateTemplate: RuntimeTemplate = {
  templateId: 'identity-immutable-update-v1',
  templateVersion: 1,
  argsKeys: ['columns', 'guard', 'errorCode'],
  expand: (args) => {
    const errorCode = errorCodeArg(args);
    return {
      timing: 'BEFORE', event: 'UPDATE', updateColumns: [],
      normalizedWhen: normalizeSql(stringArg(args, 'guard')),
      normalizedBody: rejectSql(errorCode, changed(stringArrayArg(args, 'columns'))),
      errorCode,
    };
  },
};

const singletonTemplate: RuntimeTemplate = {
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

const purgeDeleteTemplate: RuntimeTemplate = {
  templateId: 'project-purge-delete-guard-v1',
  templateVersion: 1,
  argsKeys: ['projectIdSql', 'guard', 'errorCode'],
  expand: (args) => {
    const errorCode = errorCodeArg(args);
    return {
      timing: 'BEFORE', event: 'DELETE', updateColumns: [],
      normalizedWhen: normalizeSql(stringArg(args, 'guard')),
      normalizedBody: rejectSql(errorCode, `NOT (${projectPurgeEligible(stringArg(args, 'projectIdSql'))})`),
      errorCode,
    };
  },
};

const RUNTIME_TEMPLATES: readonly RuntimeTemplate[] = [
  explicitTemplate,
  immutableUpdateTemplate,
  singletonTemplate,
  purgeDeleteTemplate,
];

const bindings: G1PhysicalTriggerBindingV1[] = [];
const existingBaseNames = new Set(['trg_app_preferences_no_second_row']);
const errorCode = (name: `trg_${string}`): `AIR_G1:${string}` => `AIR_G1:${name}`;

const addBinding = (
  table: string,
  name: `trg_${string}`,
  sourceSection: string,
  templateId: string,
  args: TriggerArgs,
): void => {
  bindings.push({
    table, name, sourceSection, ownerStage: 'G1', templateId, templateVersion: 1, args,
    existingBase: existingBaseNames.has(name),
  });
};

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

const addImmutableUpdate = (
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

// §9.1 AppPreference
addBinding('app_preferences', 'trg_app_preferences_no_second_row', '9.1,12.3', 'singleton-insert-v1', {
  table: 'app_preferences', errorCode: errorCode('trg_app_preferences_no_second_row'),
});
const preferenceProvidersValid = normalizeSql(`
  (NEW.active_image_provider_id IS NULL OR EXISTS (
    SELECT 1 FROM provider_configs AS image_provider
    WHERE image_provider.id = NEW.active_image_provider_id AND image_provider.runtime_kind = 'image'
  ))
  AND (NEW.default_text_provider_id IS NULL OR EXISTS (
    SELECT 1 FROM provider_configs AS text_provider
    WHERE text_provider.id = NEW.default_text_provider_id AND text_provider.runtime_kind = 'text'
  ))
`);
for (const event of ['INSERT', 'UPDATE'] as const) {
  const name = `trg_app_preferences_provider_runtime_kind_${event.toLowerCase()}` as `trg_${string}`;
  addExplicit('app_preferences', name, '9.1,12.3', event, [
    rejectSql(errorCode(name), `NOT (${preferenceProvidersValid})`),
  ]);
}

// §9.2 ProviderConfig
addImmutableUpdate('provider_configs', 'trg_provider_configs_identity_immutable_update', '9.2,12.3', [
  'id', 'provider_id', 'runtime_kind', 'created_at',
]);

// §9.3 CredentialMetadata
const credentialOwnerValid = normalizeSql(`
  EXISTS (
    SELECT 1 FROM provider_configs AS provider
    WHERE provider.id = NEW.provider_config_id
      AND ((provider.runtime_kind = 'text' AND NEW.owner = 'opencode')
        OR (provider.runtime_kind = 'image' AND NEW.owner IN ('image_secret_store', 'environment')))
  )
`);
addExplicit('credential_metadata', 'trg_credential_metadata_provider_owner_insert', '9.3,12.3', 'INSERT', [
  rejectSql(errorCode('trg_credential_metadata_provider_owner_insert'), `NOT (${credentialOwnerValid})`),
]);
addExplicit('credential_metadata', 'trg_credential_metadata_provider_owner_update', '9.3,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_credential_metadata_provider_owner_update'), `NOT (${credentialOwnerValid})`),
  rejectSql(errorCode('trg_credential_metadata_provider_owner_update'), changed(['id', 'provider_config_id', 'owner', 'created_at'])),
]);
const matchingSecretDeleteOutbox = (status: 'pending' | 'processed'): string => normalizeSql(`
  EXISTS (
    SELECT 1 FROM outbox_events AS secret_outbox
    WHERE secret_outbox.event_type = 'secret.delete_old_ref'
      AND secret_outbox.aggregate_type = 'credential_metadata'
      AND secret_outbox.aggregate_id = OLD.id
      AND secret_outbox.status = '${status}'
      AND CASE WHEN json_valid(secret_outbox.payload_json) = 1 THEN
        json_extract(secret_outbox.payload_json, '$.oldSecretRef') IS OLD.secret_ref
      ELSE 0 END
  )
`);
addExplicit('credential_metadata', 'trg_credential_metadata_status_transition', '9.3,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_credential_metadata_status_transition'), `NOT (
    OLD.status = NEW.status
    OR (OLD.status = 'unconfigured' AND NEW.status IN ('configured', 'error'))
    OR (OLD.status = 'configured' AND NEW.status = 'rotating')
    OR (OLD.status = 'configured' AND NEW.status = 'error')
    OR (OLD.status = 'configured' AND NEW.status = 'unconfigured'
      AND OLD.secret_ref IS NULL AND NEW.secret_ref IS NULL
      AND NEW.configured = 0 AND NEW.fingerprint IS NULL)
    OR (OLD.status = 'configured' AND NEW.status = 'clearing'
      AND OLD.owner = 'image_secret_store' AND OLD.secret_ref IS NOT NULL
      AND NEW.secret_ref IS OLD.secret_ref AND NEW.fingerprint IS OLD.fingerprint
      AND NEW.configured = 1
      AND (${matchingSecretDeleteOutbox('pending')} OR ${matchingSecretDeleteOutbox('processed')}))
    OR (OLD.status = 'rotating' AND NEW.status IN ('configured', 'error'))
    OR (OLD.status = 'clearing' AND NEW.status = 'unconfigured'
      AND NEW.configured = 0 AND NEW.secret_ref IS NULL AND NEW.fingerprint IS NULL
      AND ${matchingSecretDeleteOutbox('processed')})
    OR (OLD.status = 'error' AND NEW.status IN ('unconfigured', 'configured'))
  )`),
]);
addExplicit('credential_metadata', 'trg_credential_metadata_secret_ref_update', '9.3,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_credential_metadata_secret_ref_update'), `
    OLD.secret_ref IS NULL AND NEW.secret_ref IS NOT NULL
    AND NOT (OLD.owner = 'image_secret_store' AND NEW.owner = 'image_secret_store')
  `),
  rejectSql(errorCode('trg_credential_metadata_secret_ref_update'), `
    OLD.secret_ref IS NOT NULL AND NEW.secret_ref IS OLD.secret_ref
    AND NEW.fingerprint IS NOT OLD.fingerprint
  `),
  rejectSql(errorCode('trg_credential_metadata_secret_ref_update'), `
    OLD.owner = 'image_secret_store' AND OLD.status = 'configured'
    AND NEW.status = 'clearing' AND NEW.secret_ref IS OLD.secret_ref
    AND NOT (${matchingSecretDeleteOutbox('pending')} OR ${matchingSecretDeleteOutbox('processed')})
  `),
  rejectSql(errorCode('trg_credential_metadata_secret_ref_update'), `
    OLD.secret_ref IS NOT NULL AND NEW.secret_ref IS NOT NULL AND NEW.secret_ref IS NOT OLD.secret_ref
    AND NOT (OLD.owner = 'image_secret_store' AND NEW.owner = 'image_secret_store'
      AND NEW.status IN ('configured', 'rotating') AND NEW.configured = 1
      AND (${matchingSecretDeleteOutbox('pending')} OR ${matchingSecretDeleteOutbox('processed')}))
  `),
  rejectSql(errorCode('trg_credential_metadata_secret_ref_update'), `
    OLD.secret_ref IS NOT NULL AND NEW.secret_ref IS NULL
    AND NOT (OLD.status = 'clearing' AND OLD.configured = 1
      AND NEW.status = 'unconfigured' AND NEW.configured = 0 AND NEW.fingerprint IS NULL
      AND ${matchingSecretDeleteOutbox('processed')})
  `),
]);
addExplicit('credential_metadata', 'trg_credential_metadata_secret_ref_delete', '9.3,12.3', 'DELETE', [
  rejectSql(errorCode('trg_credential_metadata_secret_ref_delete'), `
    OLD.secret_ref IS NOT NULL OR OLD.status IS NOT 'unconfigured' OR OLD.configured IS NOT 0 OR OLD.fingerprint IS NOT NULL
  `),
]);

// §9.4 ProjectContextFact
addExplicit('project_context_facts', 'trg_project_context_facts_content_immutable', '9.4,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_project_context_facts_content_immutable'), changed([
    'id', 'project_id', 'type', 'content_json', 'schema_version', 'content_digest', 'source_type', 'source_id', 'created_at',
  ])),
  rejectSql(errorCode('trg_project_context_facts_content_immutable'), `NOT (
    OLD.status = NEW.status
    OR (OLD.status = 'confirmed' AND NEW.status IN ('superseded', 'archived'))
    OR (OLD.status = 'superseded' AND NEW.status = 'archived')
  )`),
  rejectSql(errorCode('trg_project_context_facts_content_immutable'), `NOT (
    (OLD.status = NEW.status AND NEW.superseded_at IS OLD.superseded_at)
    OR (OLD.status = 'confirmed' AND NEW.status IN ('superseded', 'archived')
      AND OLD.superseded_at IS NULL AND NEW.superseded_at IS NOT NULL)
    OR (OLD.status = 'superseded' AND NEW.status = 'archived'
      AND NEW.superseded_at IS OLD.superseded_at)
  )`),
]);
addPurgeDelete(
  'project_context_facts',
  'trg_project_context_facts_purge_delete_guard',
  '9.4,12.3,12.4',
  'OLD.project_id',
);

// §9.5 ConversationThread
const threadScopeValid = normalizeSql(`
  (NEW.chapter_id IS NULL AND NEW.scope_key = 'project')
  OR (NEW.chapter_id IS NOT NULL AND NEW.scope_key = 'chapter:' || NEW.chapter_id AND EXISTS (
    SELECT 1 FROM chapters AS owner_chapter
    WHERE owner_chapter.id = NEW.chapter_id AND owner_chapter.project_id = NEW.project_id
  ))
`);
addExplicit('conversation_threads', 'trg_conversation_threads_scope_insert', '9.5,12.3', 'INSERT', [
  rejectSql(errorCode('trg_conversation_threads_scope_insert'), `NOT (${threadScopeValid})`),
]);
addExplicit('conversation_threads', 'trg_conversation_threads_scope_update', '9.5,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_conversation_threads_scope_update'), `NOT (${threadScopeValid})`),
  rejectSql(errorCode('trg_conversation_threads_scope_update'), changed([
    'id', 'project_id', 'chapter_id', 'step_key', 'scope_key', 'created_at',
  ])),
]);
addPurgeDelete(
  'conversation_threads',
  'trg_conversation_threads_purge_delete_guard',
  '9.5,12.3,12.4',
  'OLD.project_id',
);

// §9.6 ConversationMessage
addExplicit('conversation_messages', 'trg_conversation_messages_initial_insert', '9.6,12.3', 'INSERT', [
  rejectSql(errorCode('trg_conversation_messages_initial_insert'), `NOT (
    (NEW.role IN ('user', 'system', 'tool') AND NEW.status = 'completed'
      AND NEW.completed_at IS NOT NULL AND NEW.error_json IS NULL AND NEW.error_schema_version IS NULL)
    OR (NEW.role = 'assistant' AND NEW.status = 'running'
      AND NEW.completed_at IS NULL AND NEW.error_json IS NULL AND NEW.error_schema_version IS NULL)
    OR (NEW.role = 'assistant' AND NEW.status = 'completed'
      AND NEW.completed_at IS NOT NULL AND NEW.error_json IS NULL AND NEW.error_schema_version IS NULL)
  )`),
]);
addExplicit('conversation_messages', 'trg_conversation_messages_state_transition', '9.6,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_conversation_messages_state_transition'), `NOT (
    (OLD.status = 'running' AND NEW.status = 'running' AND NEW.completed_at IS NULL
      AND NEW.error_json IS NULL AND NEW.error_schema_version IS NULL)
    OR (OLD.status = 'running' AND NEW.status = 'completed'
      AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL
      AND NEW.error_json IS NULL AND NEW.error_schema_version IS NULL)
    OR (OLD.status = 'running' AND NEW.status = 'failed'
      AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL
      AND NEW.error_json IS NOT NULL AND NEW.error_schema_version IS NOT NULL)
  )`),
], "OLD.status = 'running' OR NEW.status IS NOT OLD.status");
addExplicit('conversation_messages', 'trg_conversation_messages_running_append_only', '9.6,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_conversation_messages_running_append_only'), `
    NEW.id IS NOT OLD.id OR NEW.thread_id IS NOT OLD.thread_id OR NEW.role IS NOT OLD.role
    OR NEW.created_at IS NOT OLD.created_at OR length(NEW.content) < length(OLD.content)
    OR substr(NEW.content, 1, length(OLD.content)) IS NOT OLD.content
  `),
], "OLD.status = 'running'");
addImmutableUpdate('conversation_messages', 'trg_conversation_messages_terminal_immutable_update', '9.6,12.3', [
  'id', 'thread_id', 'role', 'content', 'status', 'provider_id', 'model_id', 'error_json',
  'error_schema_version', 'created_at', 'updated_at', 'completed_at',
], "OLD.status IN ('completed', 'failed')");
addPurgeDelete(
  'conversation_messages',
  'trg_conversation_messages_terminal_immutable_delete',
  '9.6,12.3,12.4',
  '(SELECT project_id FROM conversation_threads WHERE id = OLD.thread_id)',
);

// §9.7 DialogueToolResult
addExplicit('dialogue_tool_results', 'trg_dialogue_tool_results_message_scope_insert', '9.7,12.3', 'INSERT', [
  rejectSql(errorCode('trg_dialogue_tool_results_message_scope_insert'), `NOT EXISTS (
    SELECT 1 FROM conversation_messages AS source_message
    WHERE source_message.id = NEW.message_id AND source_message.thread_id = NEW.thread_id
  )`),
]);
addImmutableUpdate('dialogue_tool_results', 'trg_dialogue_tool_results_audit_immutable_update', '9.7,12.3', [
  'id', 'thread_id', 'message_id', 'tool_call_id', 'tool', 'status', 'summary', 'payload_json',
  'schema_version', 'payload_digest', 'created_at',
]);
addPurgeDelete(
  'dialogue_tool_results',
  'trg_dialogue_tool_results_audit_immutable_delete',
  '9.7,12.3,12.4',
  '(SELECT project_id FROM conversation_threads WHERE id = OLD.thread_id)',
);

// §9.8 DialogueRuntimeSession
addExplicit('dialogue_runtime_sessions', 'trg_dialogue_runtime_sessions_initial_insert', '9.8,12.3', 'INSERT', [
  rejectSql(errorCode('trg_dialogue_runtime_sessions_initial_insert'), "NEW.status IS NOT 'active' OR NEW.closed_at IS NOT NULL"),
]);
addExplicit('dialogue_runtime_sessions', 'trg_dialogue_runtime_sessions_state_transition', '9.8,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_dialogue_runtime_sessions_state_transition'), `NOT (
    (OLD.status = 'active' AND NEW.status = 'active' AND NEW.closed_at IS NULL)
    OR (OLD.status = 'active' AND NEW.status IN ('archived', 'closed')
      AND OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL)
  )`),
], "OLD.status = 'active' OR NEW.status IS NOT OLD.status");
addImmutableUpdate('dialogue_runtime_sessions', 'trg_dialogue_runtime_sessions_identity_immutable_update', '9.8,12.3', [
  'id', 'thread_id', 'runtime', 'external_session_id', 'provider_id', 'model_id', 'variant', 'created_at',
]);
addImmutableUpdate('dialogue_runtime_sessions', 'trg_dialogue_runtime_sessions_terminal_immutable_update', '9.8,12.3', [
  'status', 'closed_at', 'updated_at',
], "OLD.status IN ('archived', 'closed')");
addPurgeDelete(
  'dialogue_runtime_sessions',
  'trg_dialogue_runtime_sessions_terminal_immutable_delete',
  '9.8,12.3,12.4',
  '(SELECT project_id FROM conversation_threads WHERE id = OLD.thread_id)',
);

// §9.9 PendingDialogueArtifact
const pendingArtifactScopeValid = normalizeSql(`
  EXISTS (
    SELECT 1 FROM conversation_threads AS owner_thread
    WHERE owner_thread.id = NEW.thread_id AND owner_thread.project_id = NEW.project_id
      AND owner_thread.chapter_id IS NEW.chapter_id
  )
  AND (NEW.chapter_id IS NULL OR EXISTS (
    SELECT 1 FROM chapters AS owner_chapter
    WHERE owner_chapter.id = NEW.chapter_id AND owner_chapter.project_id = NEW.project_id
  ))
  AND (NEW.source_message_id IS NULL OR EXISTS (
    SELECT 1 FROM conversation_messages AS source_message
    WHERE source_message.id = NEW.source_message_id AND source_message.thread_id = NEW.thread_id
  ))
  AND (NEW.tool_result_id IS NULL OR EXISTS (
    SELECT 1 FROM dialogue_tool_results AS source_result
    WHERE source_result.id = NEW.tool_result_id AND source_result.thread_id = NEW.thread_id
      AND (NEW.source_message_id IS NULL OR source_result.message_id = NEW.source_message_id)
  ))
`);
for (const event of ['INSERT', 'UPDATE'] as const) {
  const name = `trg_pending_dialogue_artifacts_scope_${event.toLowerCase()}` as `trg_${string}`;
  addExplicit('pending_dialogue_artifacts', name, '9.9,12.3', event, [
    rejectSql(errorCode(name), `NOT (${pendingArtifactScopeValid})`),
  ]);
}
addExplicit('pending_dialogue_artifacts', 'trg_pending_dialogue_artifacts_initial_insert', '9.9,12.3', 'INSERT', [
  rejectSql(errorCode('trg_pending_dialogue_artifacts_initial_insert'), `
    NEW.status IS NOT 'pending' OR NEW.active_slot_key IS NULL OR NEW.resolved_at IS NOT NULL
  `),
]);
addExplicit('pending_dialogue_artifacts', 'trg_pending_dialogue_artifacts_state_transition', '9.9,12.3', 'UPDATE', [
  rejectSql(errorCode('trg_pending_dialogue_artifacts_state_transition'), `NOT (
    (OLD.status = 'pending' AND NEW.status = 'pending'
      AND NEW.active_slot_key IS OLD.active_slot_key AND NEW.resolved_at IS NULL)
    OR (OLD.status = 'pending' AND NEW.status IN ('applied', 'discarded', 'superseded', 'expired')
      AND OLD.resolved_at IS NULL AND OLD.active_slot_key IS NOT NULL
      AND NEW.active_slot_key IS NULL AND NEW.resolved_at IS NOT NULL)
  )`),
], "OLD.status = 'pending' OR NEW.status IS NOT OLD.status");
addImmutableUpdate('pending_dialogue_artifacts', 'trg_pending_dialogue_artifacts_identity_immutable_update', '9.9,12.3', [
  'id', 'project_id', 'chapter_id', 'thread_id', 'kind', 'payload_json', 'schema_version',
  'payload_digest', 'source_message_id', 'tool_result_id', 'created_at',
]);
addImmutableUpdate('pending_dialogue_artifacts', 'trg_pending_dialogue_artifacts_terminal_immutable_update', '9.9,12.3', [
  'status', 'active_slot_key', 'updated_at', 'resolved_at',
], "OLD.status IN ('applied', 'discarded', 'superseded', 'expired')");
addPurgeDelete(
  'pending_dialogue_artifacts',
  'trg_pending_dialogue_artifacts_terminal_immutable_delete',
  '9.9,12.3,12.4',
  'OLD.project_id',
);

const RUNTIME_A_TABLES = new Set([
  'app_preferences', 'provider_configs', 'credential_metadata', 'project_context_facts',
  'conversation_threads', 'conversation_messages', 'dialogue_tool_results',
  'dialogue_runtime_sessions', 'pending_dialogue_artifacts',
]);

const binaryCompare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

const expandBinding = (binding: G1PhysicalTriggerBindingV1): G1SchemaTriggerSource => {
  const template = RUNTIME_TEMPLATES.find((candidate) => candidate.templateId === binding.templateId);
  if (template === undefined) throw new Error(`Unknown trigger template ${binding.templateId}`);
  const expectedKeys = [...template.argsKeys].sort(binaryCompare);
  const actualKeys = Object.keys(binding.args).sort(binaryCompare);
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

const contractMentionsBinding = (contractMarkdown: string, table: string, name: `trg_${string}`): boolean => {
  if (contractMarkdown.includes(name)) return true;
  if (name.endsWith('_update') && contractMarkdown.includes(`${name.slice(0, -'_update'.length)}_insert/update`)) return true;
  if (name.endsWith('_delete') && contractMarkdown.includes(`${name.slice(0, -'_delete'.length)}_update/delete`)) return true;
  const prefix = `trg_${table}_`;
  const suffix = name.startsWith(prefix) ? name.slice(prefix.length) : name;
  let offset = contractMarkdown.indexOf(prefix);
  while (offset >= 0) {
    const window = contractMarkdown.slice(offset, offset + 800);
    if (window.includes(suffix)) return true;
    if (suffix.endsWith('_delete') && window.includes(`${suffix.slice(0, -'_delete'.length)}_update/delete`)) return true;
    offset = contractMarkdown.indexOf(prefix, offset + prefix.length);
  }
  return false;
};

export function buildG1SchemaTriggerRuntimeADslSource(
  contractMarkdown: string,
  constraintIssues: readonly G1CompletenessIssue[],
  baseTriggers: readonly G1SchemaTriggerSource[] = [],
): G1SchemaTriggerRuntimeADslSource {
  const completenessIssues: G1CompletenessIssue[] = [];
  const canonicalBindings = [...bindings].sort((left, right) =>
    binaryCompare(`${left.table}\u0000${left.name}`, `${right.table}\u0000${right.name}`),
  );
  const nameCounts = canonicalBindings.reduce<Map<string, number>>((counts, binding) => {
    counts.set(binding.name, (counts.get(binding.name) ?? 0) + 1);
    return counts;
  }, new Map());
  for (const binding of canonicalBindings) {
    if ((nameCounts.get(binding.name) ?? 0) !== 1) {
      completenessIssues.push({ kind: 'trigger', key: binding.name, table: binding.table, sourceSection: binding.sourceSection, missing: ['exactly one physical binding'] });
    }
    if (!contractMentionsBinding(contractMarkdown, binding.table, binding.name)) {
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
  const bindingNames = new Set(canonicalBindings.map((binding) => binding.name));
  const requested = constraintIssues.filter((issue) => issue.kind === 'trigger' && issue.table !== null && RUNTIME_A_TABLES.has(issue.table));
  for (const issue of requested) {
    if (!bindingNames.has(issue.key as `trg_${string}`)) {
      completenessIssues.push({ ...issue, missing: ['Runtime A physical trigger binding and complete expansion'] });
    }
  }
  const requestedNames = new Set(requested.map((issue) => issue.key));
  const triggers = canonicalBindings
    .filter((binding) => !binding.existingBase && requestedNames.has(binding.name))
    .map(expandBinding);

  return {
    sourceDocument: '2026-07-11_G1数据库Schema实施契约.md',
    sourceSections: ['9.1-9.9', '12.3', '12.3.1', '12.4'],
    templates: RUNTIME_TEMPLATES.map(({ templateId, templateVersion, argsKeys }) => ({ templateId, templateVersion, argsKeys })),
    bindings: canonicalBindings,
    triggers,
    completenessIssues: completenessIssues.sort((left, right) => binaryCompare(`${left.kind}:${left.key}`, `${right.kind}:${right.key}`)),
    residualTriggerKeys: [],
  };
}
