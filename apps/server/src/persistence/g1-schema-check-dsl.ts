import type {
  G1CompletenessIssue,
  G1SchemaCheckSource,
} from './g1-schema-constraint-source.js';

export type G1CheckTemplateArgValue =
  | string
  | number
  | boolean
  | null
  | readonly string[];

export interface G1CheckTemplateArgSchemaV1 {
  readonly key: string;
  readonly type: 'string' | 'number' | 'boolean' | 'string[]';
  readonly description: string;
}

export interface CheckTemplateV1 {
  readonly templateId: string;
  readonly templateVersion: 1;
  readonly argsKeys: readonly string[];
  readonly argsSchema: readonly G1CheckTemplateArgSchemaV1[];
  readonly normalizedExpressionRule: string;
  readonly sourceSection: string;
  readonly expand: (
    args: Readonly<Record<string, G1CheckTemplateArgValue>>,
  ) => { readonly normalizedExpression: string };
}

export interface PhysicalCheckBindingV1 {
  readonly name: `ck_${string}`;
  readonly table: string;
  readonly ownerStage: 'G1' | 'G2' | 'G3' | 'G4' | 'G5';
  readonly templateId: string;
  readonly templateVersion: 1;
  readonly args: Readonly<Record<string, G1CheckTemplateArgValue>>;
  readonly sourceSection: string;
  /** Records why a deliberately narrow predicate is the strongest local CHECK proved by the contract. */
  readonly decisionNotes?: string;
}

export interface G1SchemaCheckDslSource {
  readonly sourceDocument: '2026-07-11_G1数据库Schema实施契约.md';
  readonly sourceSections: readonly ['5.1-11.6', '12.2', '12.2.1'];
  readonly canonicalization: {
    readonly sqlWhitespace: 'collapse-ascii-whitespace';
    readonly identifierStyle: 'snake-case-double-quote-reserved-order-index';
    readonly stringQuote: "single-quote-double-escape";
    readonly bindingOrder: 'name-ascending';
    readonly failClosed: true;
  };
  readonly templates: readonly CheckTemplateV1[];
  readonly bindings: readonly PhysicalCheckBindingV1[];
  readonly checks: readonly G1SchemaCheckSource[];
  readonly completenessIssues: readonly G1CompletenessIssue[];
}

const normalizeSql = (sql: string): string =>
  sql.replace(/[\t\n\v\f\r ]+/g, ' ').trim();

const compareCanonicalText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const identifier = (value: G1CheckTemplateArgValue, key: string): string => {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]*$/.test(value)) {
    throw new Error(`${key} must be an unquoted snake_case identifier`);
  }
  return value === 'order' || value === 'index' ? `"${value}"` : value;
};

const stringArg = (value: G1CheckTemplateArgValue, key: string): string => {
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);
  return value;
};

const numberArg = (value: G1CheckTemplateArgValue, key: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} must be a finite number`);
  return value;
};

const booleanArg = (value: G1CheckTemplateArgValue, key: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean`);
  return value;
};

const stringsArg = (value: G1CheckTemplateArgValue, key: string): readonly string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${key} must be a string[]`);
  }
  return value as readonly string[];
};

const template = (
  source: Omit<CheckTemplateV1, 'expand'> & {
    readonly render: (args: Readonly<Record<string, G1CheckTemplateArgValue>>) => string;
  },
): CheckTemplateV1 => ({
  templateId: source.templateId,
  templateVersion: 1,
  argsKeys: source.argsKeys,
  argsSchema: source.argsSchema,
  normalizedExpressionRule: source.normalizedExpressionRule,
  sourceSection: source.sourceSection,
  expand(args) {
    const actual = Object.keys(args).sort();
    const expected = [...source.argsKeys].sort();
    if (actual.join('\u0000') !== expected.join('\u0000')) {
      throw new Error(`args mismatch: expected ${expected.join(',')}; received ${actual.join(',')}`);
    }
    const normalizedExpression = normalizeSql(source.render(args));
    if (
      normalizedExpression.length === 0 ||
      /(?:^|\W)(?:CHECK\s*\(\s*1\s*\)|WHEN\s+0)(?:$|\W)/i.test(normalizedExpression) ||
      /;/.test(normalizedExpression)
    ) {
      throw new Error('expanded predicate is empty, permissive, commented, or contains a statement separator');
    }
    return { normalizedExpression };
  },
});

const nullable = (column: string, core: string, isNullable: boolean): string =>
  isNullable ? `${column} IS NULL OR (${core})` : core;

const digestCore = (column: string): string =>
  `length(${column}) = 71 AND substr(${column}, 1, 7) = 'sha256:' AND substr(${column}, 8) = lower(substr(${column}, 8)) AND substr(${column}, 8) NOT GLOB '*[^0-9a-f]*'`;

const nonemptyCore = (column: string): string =>
  `typeof(${column}) = 'text' AND length(trim(${column})) > 0 AND instr(${column}, char(0)) = 0`;

const TEMPLATES: readonly CheckTemplateV1[] = [
  template({
    templateId: 'closed-enum-v1', templateVersion: 1,
    argsKeys: ['column', 'values', 'nullable'],
    argsSchema: [
      { key: 'column', type: 'string', description: 'physical column' },
      { key: 'values', type: 'string[]', description: 'accepted order from the closed vocabulary table' },
      { key: 'nullable', type: 'boolean', description: 'emit an explicit null branch' },
    ],
    normalizedExpressionRule: "nullable ? column IS NULL OR (column IN ('v1', 'v2')) : column IN ('v1', 'v2')",
    sourceSection: '3,12.2,12.2.1',
    render: (args) => {
      const column = identifier(args.column, 'column');
      const values = stringsArg(args.values, 'values');
      if (values.length === 0) throw new Error('values must not be empty');
      return nullable(column, `${column} IN (${values.map(quote).join(', ')})`, booleanArg(args.nullable, 'nullable'));
    },
  }),
  template({
    templateId: 'integer-at-least-v1', templateVersion: 1,
    argsKeys: ['column', 'minimum', 'nullable'],
    argsSchema: [
      { key: 'column', type: 'string', description: 'physical integer column' },
      { key: 'minimum', type: 'number', description: 'inclusive integer minimum' },
      { key: 'nullable', type: 'boolean', description: 'emit an explicit null branch' },
    ],
    normalizedExpressionRule: "nullable ? column IS NULL OR (typeof(column) = 'integer' AND column >= minimum) : typeof(column) = 'integer' AND column >= minimum",
    sourceSection: '12.2,12.2.1',
    render: (args) => {
      const column = identifier(args.column, 'column');
      const minimum = numberArg(args.minimum, 'minimum');
      if (!Number.isInteger(minimum)) throw new Error('minimum must be an integer');
      return nullable(column, `typeof(${column}) = 'integer' AND ${column} >= ${minimum}`, booleanArg(args.nullable, 'nullable'));
    },
  }),
  template({
    templateId: 'integer-between-v1', templateVersion: 1,
    argsKeys: ['column', 'minimum', 'maximum', 'nullable'],
    argsSchema: [
      { key: 'column', type: 'string', description: 'physical integer column' },
      { key: 'minimum', type: 'number', description: 'inclusive integer minimum' },
      { key: 'maximum', type: 'number', description: 'inclusive integer maximum' },
      { key: 'nullable', type: 'boolean', description: 'emit an explicit null branch' },
    ],
    normalizedExpressionRule: "nullable ? column IS NULL OR (typeof(column) = 'integer' AND column BETWEEN minimum AND maximum) : typeof(column) = 'integer' AND column BETWEEN minimum AND maximum",
    sourceSection: '12.2,12.2.1',
    render: (args) => {
      const column = identifier(args.column, 'column');
      const minimum = numberArg(args.minimum, 'minimum');
      const maximum = numberArg(args.maximum, 'maximum');
      if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum < minimum) throw new Error('invalid integer bounds');
      return nullable(column, `typeof(${column}) = 'integer' AND ${column} BETWEEN ${minimum} AND ${maximum}`, booleanArg(args.nullable, 'nullable'));
    },
  }),
  template({
    templateId: 'sha256-columns-v1', templateVersion: 1,
    argsKeys: ['columns', 'nullableColumns'],
    argsSchema: [
      { key: 'columns', type: 'string[]', description: 'physical digest columns in contract order' },
      { key: 'nullableColumns', type: 'string[]', description: 'subset requiring an explicit null branch' },
    ],
    normalizedExpressionRule: 'AND of parenthesized exact sha256 predicates; nullable columns emit column IS NULL OR (...)',
    sourceSection: '12.2,12.2.1',
    render: (args) => {
      const columns = stringsArg(args.columns, 'columns').map((item) => identifier(item, 'columns[]'));
      const nullableColumns = new Set(stringsArg(args.nullableColumns, 'nullableColumns'));
      if (columns.length === 0 || [...nullableColumns].some((item) => !columns.includes(item))) throw new Error('invalid digest column set');
      return columns.map((column) => `(${nullable(column, digestCore(column), nullableColumns.has(column))})`).join(' AND ');
    },
  }),
  template({
    templateId: 'storage-key-v1', templateVersion: 1,
    argsKeys: ['column', 'nullable'],
    argsSchema: [
      { key: 'column', type: 'string', description: 'physical storage key column' },
      { key: 'nullable', type: 'boolean', description: 'emit an explicit null branch' },
    ],
    normalizedExpressionRule: 'exact relative storage-key predicate rejecting absolute, drive, backslash, NUL, duplicate slash, dot and dot-dot segments',
    sourceSection: '12.2,12.2.1',
    render: (args) => {
      const column = identifier(args.column, 'column');
      const core = `typeof(${column}) = 'text' AND length(${column}) > 0 AND substr(${column}, 1, 1) <> '/' AND ${column} NOT GLOB '[A-Za-z]:*' AND instr(${column}, '\\') = 0 AND instr(${column}, char(0)) = 0 AND instr(${column}, '//') = 0 AND ${column} NOT IN ('.', '..') AND ${column} NOT GLOB './*' AND ${column} NOT GLOB '../*' AND ${column} NOT GLOB '*/./*' AND ${column} NOT GLOB '*/../*' AND ${column} NOT GLOB '*/.' AND ${column} NOT GLOB '*/..'`;
      return nullable(column, core, booleanArg(args.nullable, 'nullable'));
    },
  }),
  template({
    templateId: 'nonempty-text-columns-v1', templateVersion: 1,
    argsKeys: ['columns', 'nullableColumns'],
    argsSchema: [
      { key: 'columns', type: 'string[]', description: 'physical text columns in contract order' },
      { key: 'nullableColumns', type: 'string[]', description: 'subset requiring an explicit null branch' },
    ],
    normalizedExpressionRule: 'AND of parenthesized controlled-open nonempty predicates',
    sourceSection: '12.2,12.2.1',
    render: (args) => {
      const columns = stringsArg(args.columns, 'columns').map((item) => identifier(item, 'columns[]'));
      const nullableColumns = new Set(stringsArg(args.nullableColumns, 'nullableColumns'));
      if (columns.length === 0 || [...nullableColumns].some((item) => !columns.includes(item))) throw new Error('invalid nonempty column set');
      return columns.map((column) => `(${nullable(column, nonemptyCore(column), nullableColumns.has(column))})`).join(' AND ');
    },
  }),
  template({
    templateId: 'nullable-json-pairs-v1', templateVersion: 1,
    argsKeys: ['jsonColumns', 'versionColumns', 'topLevels'],
    argsSchema: [
      { key: 'jsonColumns', type: 'string[]', description: 'nullable Json columns' },
      { key: 'versionColumns', type: 'string[]', description: 'aligned nullable sibling schema-version columns' },
      { key: 'topLevels', type: 'string[]', description: 'aligned object/array top-level kinds' },
    ],
    normalizedExpressionRule: 'AND of exact both-null OR safe-json-and-positive-integer-version branches',
    sourceSection: '12.2,12.2.1',
    render: (args) => {
      const jsonColumns = stringsArg(args.jsonColumns, 'jsonColumns').map((item) => identifier(item, 'jsonColumns[]'));
      const versionColumns = stringsArg(args.versionColumns, 'versionColumns').map((item) => identifier(item, 'versionColumns[]'));
      const topLevels = stringsArg(args.topLevels, 'topLevels');
      if (jsonColumns.length === 0 || jsonColumns.length !== versionColumns.length || jsonColumns.length !== topLevels.length || topLevels.some((item) => item !== 'object' && item !== 'array')) {
        throw new Error('json/version/top-level arrays must be nonempty and aligned');
      }
      return jsonColumns.map((jsonColumn, index) => {
        const versionColumn = versionColumns[index];
        const topLevel = topLevels[index];
        return `((${jsonColumn} IS NULL AND ${versionColumn} IS NULL) OR (${jsonColumn} IS NOT NULL AND ${versionColumn} IS NOT NULL AND typeof(${versionColumn}) = 'integer' AND ${versionColumn} >= 1 AND CASE WHEN json_valid(${jsonColumn}) = 1 THEN json_type(${jsonColumn}) = '${topLevel}' ELSE 0 END))`;
      }).join(' AND ');
    },
  }),
  template({
    templateId: 'image-secret-ref-v1', templateVersion: 1,
    argsKeys: ['column', 'nullable'],
    argsSchema: [
      { key: 'column', type: 'string', description: 'physical image SecretStore reference column' },
      { key: 'nullable', type: 'boolean', description: 'emit an explicit null branch' },
    ],
    normalizedExpressionRule: 'exact airoaming:image:v1:<lowercase UUID-v4> predicate from section 12.2',
    sourceSection: '9.3,12.2,12.2.1',
    render: (args) => {
      const column = identifier(args.column, 'column');
      const core = `length(${column}) = 55 AND substr(${column}, 1, 19) = 'airoaming:image:v1:' AND substr(${column}, 20) = lower(substr(${column}, 20)) AND substr(${column}, 28, 1) = '-' AND substr(${column}, 33, 1) = '-' AND substr(${column}, 34, 1) = '4' AND substr(${column}, 38, 1) = '-' AND substr(${column}, 39, 1) IN ('8', '9', 'a', 'b') AND substr(${column}, 43, 1) = '-' AND length(replace(substr(${column}, 20), '-', '')) = 32 AND replace(substr(${column}, 20), '-', '') NOT GLOB '*[^0-9a-f]*'`;
      return nullable(column, core, booleanArg(args.nullable, 'nullable'));
    },
  }),
  template({
    templateId: 'explicit-state-shape-v1', templateVersion: 1,
    argsKeys: ['expression'],
    argsSchema: [{ key: 'expression', type: 'string', description: 'complete reviewed canonical SQL predicate; never a fragment' }],
    normalizedExpressionRule: 'return the already complete expression after canonical ASCII-whitespace validation',
    sourceSection: 'model section,12.2,12.2.1',
    render: (args) => {
      const expression = stringArg(args.expression, 'expression');
      if (normalizeSql(expression) !== expression) throw new Error('explicit expression must already be canonical');
      return expression;
    },
  }),
].sort((left, right) => compareCanonicalText(left.templateId, right.templateId));

const binding = (
  table: string,
  name: `ck_${string}`,
  templateId: string,
  args: Readonly<Record<string, G1CheckTemplateArgValue>>,
  sourceSection: string,
  decisionNotes?: string,
): PhysicalCheckBindingV1 => ({
  name, table, ownerStage: 'G1', templateId, templateVersion: 1, args, sourceSection, decisionNotes,
});

const explicit = (
  table: string,
  name: `ck_${string}`,
  expression: string,
  sourceSection: string,
  decisionNotes?: string,
): PhysicalCheckBindingV1 =>
  binding(table, name, 'explicit-state-shape-v1', { expression: normalizeSql(expression) }, sourceSection, decisionNotes);

const closed = (table: string, name: `ck_${string}`, column: string, values: readonly string[], sourceSection: string, isNullable = false): PhysicalCheckBindingV1 =>
  binding(table, name, 'closed-enum-v1', { column, values, nullable: isNullable }, sourceSection);

const positive = (table: string, name: `ck_${string}`, column: string, sourceSection: string): PhysicalCheckBindingV1 =>
  binding(table, name, 'integer-at-least-v1', { column, minimum: 1, nullable: false }, sourceSection);

const digest = (table: string, name: `ck_${string}`, columns: readonly string[], nullableColumns: readonly string[], sourceSection: string): PhysicalCheckBindingV1 =>
  binding(table, name, 'sha256-columns-v1', { columns, nullableColumns }, sourceSection);

const pathBinding = (table: string, name: `ck_${string}`, column: string, sourceSection: string, isNullable: boolean): PhysicalCheckBindingV1 =>
  binding(table, name, 'storage-key-v1', { column, nullable: isNullable }, sourceSection);

const nonempty = (table: string, name: `ck_${string}`, columns: readonly string[], sourceSection: string): PhysicalCheckBindingV1 =>
  binding(table, name, 'nonempty-text-columns-v1', { columns, nullableColumns: [] }, sourceSection);

const BINDINGS: readonly PhysicalCheckBindingV1[] = [
  explicit('assets', 'ck_assets_ready_requirements', "status <> 'ready' OR (sha256 IS NOT NULL AND bytes IS NOT NULL AND typeof(bytes) = 'integer' AND bytes > 0 AND typeof(mime_type) = 'text' AND length(trim(mime_type)) > 0 AND instr(mime_type, char(0)) = 0 AND ready_at IS NOT NULL AND (type <> 'image' OR (width IS NOT NULL AND typeof(width) = 'integer' AND width > 0 AND height IS NOT NULL AND typeof(height) = 'integer' AND height > 0)))", '8.3,12.2'),
  pathBinding('assets', 'ck_assets_storage_key', 'storage_key', '8.3,12.2', false),
  explicit('assets', 'ck_assets_terminal_times', "(status = 'staged' AND ready_at IS NULL AND failed_at IS NULL AND deleting_at IS NULL) OR (status IN ('ready', 'missing') AND ready_at IS NOT NULL AND failed_at IS NULL AND deleting_at IS NULL) OR (status = 'failed' AND ready_at IS NULL AND failed_at IS NOT NULL AND deleting_at IS NULL) OR (status = 'deleting' AND failed_at IS NULL AND deleting_at IS NOT NULL)", '8.3'),

  explicit('chapter_script_pending', 'ck_chapter_script_pending_tool_source_shape', '(thread_id IS NULL AND message_id IS NULL AND tool_call_id IS NULL) OR (thread_id IS NOT NULL AND message_id IS NOT NULL AND tool_call_id IS NOT NULL)', '6.5'),
  explicit('chapter_script_revisions', 'ck_chapter_script_revisions_tool_source_shape', '(thread_id IS NULL AND message_id IS NULL AND tool_call_id IS NULL) OR (thread_id IS NOT NULL AND message_id IS NOT NULL AND tool_call_id IS NOT NULL)', '6.6'),
  explicit('chapters', 'ck_chapters_working_consistency', "(script_working_state = 'empty' AND script_working_text = '') OR (script_working_state IN ('clean', 'dirty') AND length(script_working_text) > 0)", '6.3,12.2', 'Minimum strong local CHECK: empty/nonempty working-state semantics are provable from this row. Equality to currentScriptVersion is cross-row and remains owned by pointer/repository guards, so this CHECK does not invent a current pointer requirement.'),

  explicit('conversation_messages', 'ck_conversation_messages_error_pair', "(status IN ('running', 'completed') AND error_json IS NULL AND error_schema_version IS NULL) OR (status = 'failed' AND error_json IS NOT NULL AND error_schema_version IS NOT NULL AND typeof(error_schema_version) = 'integer' AND error_schema_version >= 1 AND CASE WHEN json_valid(error_json) = 1 THEN json_type(error_json) = 'object' ELSE 0 END)", '9.6,12.2'),
  explicit('conversation_messages', 'ck_conversation_messages_terminal_time', "(status = 'running' AND completed_at IS NULL) OR (status IN ('completed', 'failed') AND completed_at IS NOT NULL)", '9.6'),

  explicit('credential_metadata', 'ck_credential_metadata_configured_shape', "(status = 'unconfigured' AND configured = 0) OR (status IN ('configured', 'rotating', 'clearing') AND configured = 1) OR status = 'error'", '9.3'),
  binding('credential_metadata', 'ck_credential_metadata_secret_ref_format', 'image-secret-ref-v1', { column: 'secret_ref', nullable: true }, '9.3,12.2'),
  explicit('credential_metadata', 'ck_credential_metadata_text_owner_shape', "(configured = 0 AND fingerprint IS NULL AND secret_ref IS NULL) OR (configured = 1 AND fingerprint IS NOT NULL AND ((owner = 'image_secret_store' AND secret_ref IS NOT NULL) OR (owner IN ('opencode', 'environment') AND secret_ref IS NULL)))", '9.3'),

  nonempty('export_artifacts', 'ck_export_artifacts_nonempty_role', ['role'], '11.5,12.2'),
  positive('export_artifacts', 'ck_export_artifacts_order', 'order', '11.5,12.2'),
  closed('export_revisions', 'ck_export_revisions_completion_applicability', 'completion_applicability', ['current', 'historical', 'legacy_unresolved'], '3,11.4', true),
  digest('export_revisions', 'ck_export_revisions_digest_format', ['source_lock_set_digest', 'profile_digest', 'preflight_digest', 'manifest_digest'], ['source_lock_set_digest', 'profile_digest', 'preflight_digest', 'manifest_digest'], '11.4,12.2'),
  explicit('export_revisions', 'ck_export_revisions_json_pairs', "((profile_json IS NULL AND profile_schema_version IS NULL) OR (profile_json IS NOT NULL AND profile_schema_version IS NOT NULL AND typeof(profile_schema_version) = 'integer' AND profile_schema_version >= 1 AND CASE WHEN json_valid(profile_json) = 1 THEN json_type(profile_json) = 'object' ELSE 0 END AND (origin <> 'runtime' OR (json_type(profile_json, '$.schemaVersion') = 'integer' AND json_extract(profile_json, '$.schemaVersion') = profile_schema_version)))) AND ((manifest_json IS NULL AND manifest_schema_version IS NULL) OR (manifest_json IS NOT NULL AND manifest_schema_version IS NOT NULL AND typeof(manifest_schema_version) = 'integer' AND manifest_schema_version >= 1 AND CASE WHEN json_valid(manifest_json) = 1 THEN json_type(manifest_json) = 'object' ELSE 0 END AND (origin <> 'runtime' OR (json_type(manifest_json, '$.schemaVersion') = 'integer' AND json_extract(manifest_json, '$.schemaVersion') = manifest_schema_version))))", '11.4,12.2'),
  closed('export_revisions', 'ck_export_revisions_kind', 'kind', ['layout_publication', 'asset_package', 'video'], '3,11.4'),
  closed('export_revisions', 'ck_export_revisions_origin', 'origin', ['runtime', 'legacy_import'], '3,11.4'),
  explicit('export_revisions', 'ck_export_revisions_ready_shape', "status <> 'ready' OR (manifest_json IS NOT NULL AND manifest_schema_version IS NOT NULL AND manifest_digest IS NOT NULL AND completion_applicability IS NOT NULL AND ready_at IS NOT NULL)", '11.4'),
  positive('export_revisions', 'ck_export_revisions_revision', 'revision', '11.4,12.2'),
  explicit('export_revisions', 'ck_export_revisions_scope_key', "(scope_key = 'project' AND chapter_id IS NULL) OR (chapter_id IS NOT NULL AND scope_key = 'chapter:' || chapter_id)", '11.4,12.2'),
  closed('export_revisions', 'ck_export_revisions_status', 'status', ['queued', 'rendering', 'ready', 'failed', 'cancelled'], '3,11.4'),
  explicit('export_revisions', 'ck_export_revisions_terminal_times', "(status IN ('queued', 'rendering') AND ready_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL) OR (status = 'ready' AND ready_at IS NOT NULL AND failed_at IS NULL AND cancelled_at IS NULL) OR (status = 'failed' AND ready_at IS NULL AND failed_at IS NOT NULL AND cancelled_at IS NULL) OR (status = 'cancelled' AND ready_at IS NULL AND failed_at IS NULL AND cancelled_at IS NOT NULL)", '11.4'),

  digest('generation_task_sources', 'ck_generation_task_sources_digest_format', ['source_digest'], [], '10.4,12.2'),
  nonempty('generation_task_sources', 'ck_generation_task_sources_nonempty_source', ['role', 'source_type', 'source_id'], '10.4,12.2'),
  positive('generation_task_sources', 'ck_generation_task_sources_order', 'order', '10.4,12.2'),

  closed('generation_tasks', 'ck_generation_tasks_applicability', 'applicability', ['current', 'historical', 'legacy_unresolved'], '3,10.1', true),
  explicit('generation_tasks', 'ck_generation_tasks_attempt_range', "typeof(attempt) = 'integer' AND attempt >= 0 AND typeof(max_attempts) = 'integer' AND max_attempts >= 0 AND attempt <= max_attempts", '10.1,12.2'),
  digest('generation_tasks', 'ck_generation_tasks_digest_format', ['input_digest', 'output_digest', 'source_digest'], ['input_digest', 'output_digest', 'source_digest'], '10.1,12.2'),
  explicit('generation_tasks', 'ck_generation_tasks_import_shape', "(record_kind = 'runtime' AND import_source IS NULL AND imported_at IS NULL AND observed_evidence_json IS NULL AND evidence_schema_version IS NULL) OR record_kind IN ('legacy_imported', 'legacy_stub')", '10.1', 'Minimum strong local CHECK: runtime rows cannot carry importer evidence. Legacy rows deliberately allow absent/partial import facts because ADR-0012 forbids fabricating missing history; evidence pairing and monotonic upgrades are enforced separately.'),
  explicit('generation_tasks', 'ck_generation_tasks_json_pairs', "((input_json IS NULL AND input_schema_version IS NULL) OR (input_json IS NOT NULL AND input_schema_version IS NOT NULL AND typeof(input_schema_version) = 'integer' AND input_schema_version >= 1 AND CASE WHEN json_valid(input_json) = 1 THEN json_type(input_json) = 'object' ELSE 0 END AND (record_kind <> 'runtime' OR (json_type(input_json, '$.schemaVersion') = 'integer' AND json_extract(input_json, '$.schemaVersion') = input_schema_version AND json_type(input_json, '$.sourceProjection') = 'object' AND json_type(input_json, '$.sourceProjection.schemaVersion') = 'integer' AND json_extract(input_json, '$.sourceProjection.schemaVersion') = 1)))) AND ((output_json IS NULL AND output_schema_version IS NULL) OR (output_json IS NOT NULL AND output_schema_version IS NOT NULL AND typeof(output_schema_version) = 'integer' AND output_schema_version >= 1 AND CASE WHEN json_valid(output_json) = 1 THEN json_type(output_json) = 'object' ELSE 0 END)) AND ((error_json IS NULL AND error_schema_version IS NULL) OR (error_json IS NOT NULL AND error_schema_version IS NOT NULL AND typeof(error_schema_version) = 'integer' AND error_schema_version >= 1 AND CASE WHEN json_valid(error_json) = 1 THEN json_type(error_json) = 'object' ELSE 0 END)) AND ((observed_evidence_json IS NULL AND evidence_schema_version IS NULL) OR (observed_evidence_json IS NOT NULL AND evidence_schema_version IS NOT NULL AND typeof(evidence_schema_version) = 'integer' AND evidence_schema_version >= 1 AND CASE WHEN json_valid(observed_evidence_json) = 1 THEN json_type(observed_evidence_json) = 'object' ELSE 0 END))", '10.1,12.2'),
  explicit('generation_tasks', 'ck_generation_tasks_lease_shape', "(status = 'running' AND lease_owner_id IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND heartbeat_at IS NOT NULL AND lease_expires_at > heartbeat_at) OR (status IS NULL OR status <> 'running') AND lease_owner_id IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL AND heartbeat_at IS NULL", '10.1'),
  explicit('generation_tasks', 'ck_generation_tasks_legacy_imported_shape', "record_kind <> 'legacy_imported' OR (retry_disabled = 1 AND max_attempts = 0 AND attempt = 0 AND (status IS NULL OR status IN ('succeeded', 'failed', 'cancelled')) AND next_run_at IS NULL AND lease_owner_id IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL AND heartbeat_at IS NULL AND cancel_requested_at IS NULL)", '10.1'),
  explicit('generation_tasks', 'ck_generation_tasks_legacy_stub_shape', "record_kind <> 'legacy_stub' OR (status IS NULL AND retry_disabled = 1 AND max_attempts = 0 AND attempt = 0 AND next_run_at IS NULL AND lease_owner_id IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL AND heartbeat_at IS NULL AND cancel_requested_at IS NULL)", '10.1,12.2'),
  binding('generation_tasks', 'ck_generation_tasks_progress_percent', 'integer-between-v1', { column: 'progress_percent', minimum: 0, maximum: 100, nullable: true }, '10.1,12.2'),
  closed('generation_tasks', 'ck_generation_tasks_provenance_status', 'provenance_status', ['reference_only', 'partial', 'complete'], '3,10.1'),
  closed('generation_tasks', 'ck_generation_tasks_record_kind', 'record_kind', ['runtime', 'legacy_imported', 'legacy_stub'], '3,10.1'),
  explicit('generation_tasks', 'ck_generation_tasks_record_provenance_pair', "(record_kind = 'runtime' AND provenance_status = 'complete') OR (record_kind = 'legacy_imported' AND provenance_status IN ('partial', 'complete')) OR (record_kind = 'legacy_stub' AND provenance_status IN ('reference_only', 'partial'))", '10.1'),
  explicit('generation_tasks', 'ck_generation_tasks_runtime_shape', "record_kind <> 'runtime' OR (status IS NOT NULL AND retry_disabled = 0 AND max_attempts >= 1 AND idempotency_key IS NOT NULL AND input_json IS NOT NULL AND input_schema_version IS NOT NULL AND input_digest IS NOT NULL AND source_digest IS NOT NULL AND (status = 'queued' OR source_set_sealed_at IS NOT NULL))", '10.1'),
  closed('generation_tasks', 'ck_generation_tasks_status', 'status', ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'retrying'], '3,10.1', true),
  explicit('generation_tasks', 'ck_generation_tasks_terminal_time', "(status IS NULL AND finished_at IS NULL) OR (status = 'queued' AND started_at IS NULL AND finished_at IS NULL) OR (status IN ('running', 'retrying') AND started_at IS NOT NULL AND finished_at IS NULL) OR (status IN ('succeeded', 'failed', 'cancelled') AND finished_at IS NOT NULL)", '10.1'),

  pathBinding('imported_entity_sources', 'ck_imported_entity_sources_storage_key', 'source_storage_key', '5.3,12.2', true),

  digest('layout_revisions', 'ck_layout_revisions_digest_format', ['document_digest', 'source_lock_set_digest'], ['source_lock_set_digest'], '11.2,12.2'),
  closed('layout_revisions', 'ck_layout_revisions_origin', 'origin', ['runtime', 'legacy_import'], '3,11.2'),
  positive('layout_revisions', 'ck_layout_revisions_revision', 'revision', '11.2,12.2'),
  closed('layout_revisions', 'ck_layout_revisions_save_reason', 'save_reason', ['user_checkpoint', 'export_checkpoint', 'history_restore', 'legacy_import'], '3,11.2'),
  positive('layout_revisions', 'ck_layout_revisions_schema_version', 'schema_version', '11.2,12.2'),
  digest('layout_source_bindings', 'ck_layout_source_bindings_digest_format', ['source_digest'], [], '11.3,12.2'),
  positive('layout_source_bindings', 'ck_layout_source_bindings_order', 'order', '11.3,12.2'),
  explicit('layout_source_bindings', 'ck_layout_source_bindings_reference_shape', '(candidate_lock_revision_id IS NULL OR (shot_id IS NOT NULL AND candidate_id IS NOT NULL AND asset_id IS NOT NULL)) AND (candidate_id IS NULL OR (shot_id IS NOT NULL AND asset_id IS NOT NULL))', '11.3', 'Minimum strong local CHECK: proven relational identifiers must form a coherent dependency chain. Legacy unresolved bindings may leave any unproved identifier null; full relation equality and runtime completeness remain seal-trigger obligations.'),
  digest('layout_working_copies', 'ck_layout_working_copies_digest_format', ['document_digest', 'source_lock_set_digest'], ['source_lock_set_digest'], '11.1,12.2'),
  closed('layout_working_copies', 'ck_layout_working_copies_document_kind', 'document_kind', ['legacy_chapter_layout_v1', 'layout_document_v1'], '3,11.1'),
  binding('layout_working_copies', 'ck_layout_working_copies_row_version', 'integer-at-least-v1', { column: 'row_version', minimum: 0, nullable: false }, '11.1,12.2'),
  positive('layout_working_copies', 'ck_layout_working_copies_schema_version', 'schema_version', '11.1,12.2'),

  explicit('migration_issues', 'ck_migration_issues_resolution_payload', "(resolution_status IN ('not_needed', 'open') AND resolution_json IS NULL AND resolved_at IS NULL) OR (resolution_status = 'resolved' AND resolution_json IS NOT NULL AND resolved_at IS NOT NULL AND CASE WHEN json_valid(resolution_json) = 1 THEN json_type(resolution_json) = 'object' AND json_type(resolution_json, '$.decisionSchemaVersion') = 'integer' AND json_extract(resolution_json, '$.decisionSchemaVersion') = 1 ELSE 0 END)", '5.4,7.10.1,12.2'),
  pathBinding('migration_issues', 'ck_migration_issues_storage_key', 'storage_key', '5.4,12.2', true),
  binding('migration_runs', 'ck_migration_runs_json_pairs', 'nullable-json-pairs-v1', { jsonColumns: ['counts_json', 'verification_json'], versionColumns: ['counts_schema_version', 'verification_schema_version'], topLevels: ['object', 'object'] }, '5.2,12.2'),

  explicit('outbox_events', 'ck_outbox_events_attempt_range', "typeof(attempt) = 'integer' AND attempt >= 0 AND typeof(max_attempts) = 'integer' AND max_attempts = 3 AND attempt <= max_attempts", '11.6,12.2'),
  digest('outbox_events', 'ck_outbox_events_digest_format', ['payload_digest'], [], '11.6,12.2'),
  explicit('outbox_events', 'ck_outbox_events_lease_shape', "(status = 'processing' AND lease_owner_id IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_expires_at > updated_at) OR (status IN ('pending', 'processed', 'failed') AND lease_owner_id IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)", '11.6'),
  explicit('outbox_events', 'ck_outbox_events_processed_time', "(status = 'processed' AND processed_at IS NOT NULL) OR (status IN ('pending', 'processing', 'failed') AND processed_at IS NULL)", '11.6'),
  positive('outbox_events', 'ck_outbox_events_schema_version', 'payload_schema_version', '11.6,12.2'),
  closed('outbox_events', 'ck_outbox_events_status', 'status', ['pending', 'processing', 'processed', 'failed'], '3,11.6'),

  explicit('persistence_states', 'ck_persistence_states_activation_shape', "(activation_state = 'shadow' AND cutover_run_id IS NULL AND source_manifest_digest IS NULL AND effective_schema_manifest_digest IS NULL AND activated_at IS NULL AND first_business_write_at IS NULL) OR (activation_state = 'ready_for_activation' AND cutover_run_id IS NOT NULL AND source_manifest_digest IS NOT NULL AND effective_schema_manifest_digest IS NOT NULL AND activated_at IS NULL AND first_business_write_at IS NULL) OR (activation_state = 'db_only' AND cutover_run_id IS NOT NULL AND source_manifest_digest IS NOT NULL AND effective_schema_manifest_digest IS NOT NULL AND activated_at IS NOT NULL) OR (activation_state = 'recovery_required' AND ((cutover_run_id IS NULL AND source_manifest_digest IS NULL AND effective_schema_manifest_digest IS NULL AND activated_at IS NULL AND first_business_write_at IS NULL) OR (cutover_run_id IS NOT NULL AND source_manifest_digest IS NOT NULL AND effective_schema_manifest_digest IS NOT NULL AND (first_business_write_at IS NULL OR activated_at IS NOT NULL))))", '5.1'),

  positive('task_attempts', 'ck_task_attempts_attempt_no', 'attempt_no', '10.2,12.2'),
  explicit('task_attempts', 'ck_task_attempts_finished_shape', "(outcome IS NULL AND finished_at IS NULL) OR (outcome IS NOT NULL AND finished_at IS NOT NULL)", '10.2'),
  binding('task_attempts', 'ck_task_attempts_json_pairs', 'nullable-json-pairs-v1', { jsonColumns: ['error_json', 'artifact_refs_json'], versionColumns: ['error_schema_version', 'artifact_schema_version'], topLevels: ['object', 'array'] }, '10.2,12.2'),
  closed('task_attempts', 'ck_task_attempts_outcome', 'outcome', ['succeeded', 'failed', 'cancelled', 'interrupted'], '3,10.2', true),
  explicit('task_concurrency_slots', 'ck_task_concurrency_slots_claim_shape', '(task_id IS NULL AND lease_owner_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL) OR (task_id IS NOT NULL AND lease_owner_id IS NOT NULL AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL)', '10.3'),
  positive('task_concurrency_slots', 'ck_task_concurrency_slots_slot_no', 'slot_no', '10.3,12.2'),
].sort((left, right) => compareCanonicalText(left.name, right.name));

const issue = (
  key: string,
  table: string | null,
  sourceSection: string,
  missing: readonly string[],
  kind: G1CompletenessIssue['kind'] = 'check',
): G1CompletenessIssue => ({ kind, key, table, sourceSection, missing });

const REQUIRED_MARKERS = [
  'doc_id: AIR-CONTRACT-20260711-G1-SCHEMA-IMPLEMENTATION',
  '### 12.2 CHECK 完整清单',
  '#### 12.2.1 `CheckTemplateRegistryV1` 与 physical binding',
] as const;

export function buildG1SchemaCheckDslSource(
  contractMarkdown: string,
  constraintIssues: readonly G1CompletenessIssue[],
): G1SchemaCheckDslSource {
  const completenessIssues: G1CompletenessIssue[] = [];
  for (const marker of REQUIRED_MARKERS) {
    if (!contractMarkdown.includes(marker)) {
      completenessIssues.push(issue(marker, null, 'authority validation', ['required contract marker'], 'source-document'));
    }
  }

  const inputChecks = constraintIssues.filter((item) => item.kind === 'check');
  const inputByKey = new Map(inputChecks.map((item) => [item.key, item]));
  const bindingByKey = new Map<string, PhysicalCheckBindingV1>();
  for (const item of BINDINGS) {
    if (bindingByKey.has(item.name)) completenessIssues.push(issue(item.name, item.table, item.sourceSection, ['duplicate physical binding']));
    bindingByKey.set(item.name, item);
    if (!contractMarkdown.includes(item.name)) completenessIssues.push(issue(item.name, item.table, item.sourceSection, ['physical key absent from authority document']));
    if (!inputByKey.has(item.name)) completenessIssues.push(issue(item.name, item.table, item.sourceSection, ['binding has no matching input completeness issue']));
  }
  for (const item of inputChecks) {
    if (!bindingByKey.has(item.key)) completenessIssues.push(issue(item.key, item.table, item.sourceSection, ['missing physical binding']));
  }

  const templateById = new Map(TEMPLATES.map((item) => [item.templateId, item]));
  const checks: G1SchemaCheckSource[] = [];
  for (const item of BINDINGS) {
    const selected = templateById.get(item.templateId);
    if (!selected || selected.templateVersion !== item.templateVersion) {
      completenessIssues.push(issue(item.name, item.table, item.sourceSection, ['unknown template/version']));
      continue;
    }
    try {
      const { normalizedExpression } = selected.expand(item.args);
      checks.push({ ownerStage: item.ownerStage, table: item.table, name: item.name, normalizedExpression, sourceSection: item.sourceSection });
    } catch (error) {
      completenessIssues.push(issue(item.name, item.table, item.sourceSection, [`template expansion failed: ${error instanceof Error ? error.message : String(error)}`]));
    }
  }

  if (BINDINGS.length !== 70) completenessIssues.push(issue('CheckTemplateRegistryV1', null, '12.2.1', [`expected 70 bindings, got ${BINDINGS.length}`], 'source-document'));
  if (checks.length !== BINDINGS.length) completenessIssues.push(issue('CheckTemplateRegistryV1', null, '12.2.1', [`expected ${BINDINGS.length} expanded checks, got ${checks.length}`], 'source-document'));

  completenessIssues.sort((left, right) => compareCanonicalText(
    `${left.kind}:${left.key}:${left.missing.join('|')}`,
    `${right.kind}:${right.key}:${right.missing.join('|')}`,
  ));
  return {
    sourceDocument: '2026-07-11_G1数据库Schema实施契约.md',
    sourceSections: ['5.1-11.6', '12.2', '12.2.1'],
    canonicalization: {
      sqlWhitespace: 'collapse-ascii-whitespace',
      identifierStyle: 'snake-case-double-quote-reserved-order-index',
      stringQuote: 'single-quote-double-escape',
      bindingOrder: 'name-ascending',
      failClosed: true,
    },
    templates: TEMPLATES,
    bindings: BINDINGS,
    checks,
    completenessIssues,
  };
}
