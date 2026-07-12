import type {
  G1CompletenessIssue,
  G1SchemaCheckSource,
} from './g1-schema-constraint-source.js';

export type G1BaseCheckArgValue = string | number | boolean | null | readonly string[];

export interface G1BaseCheckTemplateV1 {
  readonly templateId: string;
  readonly templateVersion: 1;
  readonly argsKeys: readonly string[];
  readonly sourceSection: string;
  readonly expand: (args: Readonly<Record<string, G1BaseCheckArgValue>>) => string;
}

export interface G1BasePhysicalCheckBindingV1 {
  readonly name: `ck_${string}`;
  readonly table: string;
  readonly ownerStage: 'G1' | 'G2' | 'G3' | 'G4' | 'G5';
  readonly templateId: string;
  readonly templateVersion: 1;
  readonly args: Readonly<Record<string, G1BaseCheckArgValue>>;
  readonly sourceSection: string;
}

export interface G1VerifiedBaseCheckV1 {
  readonly binding: G1BasePhysicalCheckBindingV1;
  readonly expected: G1SchemaCheckSource;
  readonly reexpandedNormalizedExpression: string;
  readonly byteEqual: boolean;
}

export interface G1SchemaBaseCheckDslSource {
  readonly sourceDocument: '2026-07-11_G1数据库Schema实施契约.md';
  readonly sourceSections: readonly ['3', '5.1-11.6', '12.2', '12.2.1'];
  readonly templates: readonly G1BaseCheckTemplateV1[];
  readonly bindings: readonly G1BasePhysicalCheckBindingV1[];
  /** Verification metadata only; callers must not merge this array as new CHECK definitions. */
  readonly verifiedChecks: readonly G1VerifiedBaseCheckV1[];
  readonly completenessIssues: readonly G1CompletenessIssue[];
}

const normalizeSql = (sql: string): string => sql.replace(/[\t\n\v\f\r ]+/g, ' ').trim();

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;

const exactArgs = (args: Readonly<Record<string, G1BaseCheckArgValue>>, keys: readonly string[]): void => {
  const actual = Object.keys(args).sort().join('\u0000');
  const expected = [...keys].sort().join('\u0000');
  if (actual !== expected) throw new Error(`args mismatch: expected ${keys.join(',')}`);
};

const stringArg = (value: G1BaseCheckArgValue, key: string): string => {
  if (typeof value !== 'string') throw new Error(`${key} must be string`);
  return value;
};

const numberArg = (value: G1BaseCheckArgValue, key: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${key} must be finite number`);
  return value;
};

const booleanArg = (value: G1BaseCheckArgValue, key: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${key} must be boolean`);
  return value;
};

const stringsArg = (value: G1BaseCheckArgValue, key: string): readonly string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`${key} must be string[]`);
  return value as readonly string[];
};

const identifier = (value: G1BaseCheckArgValue, key: string): string => {
  const result = stringArg(value, key);
  if (!/^[a-z][a-z0-9_]*$/.test(result)) throw new Error(`${key} must be snake_case identifier`);
  return result === 'order' || result === 'index' ? `"${result}"` : result;
};

const sqlIdentifier = (value: G1BaseCheckArgValue, key: string): string => {
  const result = stringArg(value, key);
  if (!/^(?:[a-z][a-z0-9_]*|"[a-z][a-z0-9_]*")$/.test(result)) throw new Error(`${key} must be canonical physical identifier SQL`);
  return result;
};

const digestCore = (column: string): string =>
  `length(${column}) = 71 AND substr(${column}, 1, 7) = 'sha256:' AND substr(${column}, 8) = lower(substr(${column}, 8)) AND substr(${column}, 8) NOT GLOB '*[^0-9a-f]*'`;

const nonemptyCore = (column: string): string =>
  `typeof(${column}) = 'text' AND length(trim(${column})) > 0 AND instr(${column}, char(0)) = 0`;

const TEMPLATES: readonly G1BaseCheckTemplateV1[] = ([
  {
    templateId: 'boolean-integer-v1', templateVersion: 1, argsKeys: ['column'], sourceSection: '12.2,12.2.1',
    expand(args) { exactArgs(args, this.argsKeys); const column = identifier(args.column, 'column'); return `typeof(${column}) = 'integer' AND ${column} IN (0, 1)`; },
  },
  {
    templateId: 'closed-enum-v1', templateVersion: 1, argsKeys: ['column', 'values'], sourceSection: '3,12.2,12.2.1',
    expand(args) { exactArgs(args, this.argsKeys); const column = identifier(args.column, 'column'); const values = stringsArg(args.values, 'values'); if (values.length === 0) throw new Error('empty enum'); return `${column} IN (${values.map(quote).join(', ')})`; },
  },
  {
    templateId: 'digest-columns-v1', templateVersion: 1, argsKeys: ['columns', 'nullableColumns'], sourceSection: '12.2,12.2.1',
    expand(args) {
      exactArgs(args, this.argsKeys);
      const columns = stringsArg(args.columns, 'columns').map((column) => identifier(column, 'columns[]'));
      const nullableColumns = new Set(stringsArg(args.nullableColumns, 'nullableColumns'));
      if (columns.length === 0 || [...nullableColumns].some((column) => !columns.includes(column))) throw new Error('invalid digest columns');
      const predicates = columns.map((column) => nullableColumns.has(column) ? `${column} IS NULL OR (${digestCore(column)})` : digestCore(column));
      return predicates.length === 1 ? predicates[0] : predicates.map((predicate) => `(${predicate})`).join(' AND ');
    },
  },
  {
    templateId: 'explicit-state-shape-v1', templateVersion: 1, argsKeys: ['expression'], sourceSection: 'model section,12.2.1',
    expand(args) { exactArgs(args, this.argsKeys); const expression = stringArg(args.expression, 'expression'); if (normalizeSql(expression) !== expression || expression.length === 0 || expression === '1') throw new Error('invalid explicit expression'); return expression; },
  },
  {
    templateId: 'integer-at-least-columns-v1', templateVersion: 1, argsKeys: ['columns', 'nullableColumns', 'minimum'], sourceSection: '12.2,12.2.1',
    expand(args) {
      exactArgs(args, this.argsKeys);
      const columns = stringsArg(args.columns, 'columns').map((column) => sqlIdentifier(column, 'columns[]'));
      const nullableColumns = new Set(stringsArg(args.nullableColumns, 'nullableColumns'));
      const minimum = numberArg(args.minimum, 'minimum');
      if (columns.length === 0 || !Number.isInteger(minimum) || [...nullableColumns].some((column) => !columns.includes(column))) throw new Error('invalid integer columns');
      const predicates = columns.map((column) => {
        const core = `typeof(${column}) = 'integer' AND ${column} >= ${minimum}`;
        return nullableColumns.has(column) ? `${column} IS NULL OR (${core})` : core;
      });
      return predicates.length === 1 ? predicates[0] : predicates.map((predicate) => `(${predicate})`).join(' AND ');
    },
  },
  {
    templateId: 'literal-equality-v1', templateVersion: 1, argsKeys: ['column', 'value'], sourceSection: 'model section,12.2.1',
    expand(args) { exactArgs(args, this.argsKeys); const column = identifier(args.column, 'column'); return `${column} = ${quote(stringArg(args.value, 'value'))}`; },
  },
  {
    templateId: 'nonempty-text-columns-v1', templateVersion: 1, argsKeys: ['columns'], sourceSection: '12.2,12.2.1',
    expand(args) { exactArgs(args, this.argsKeys); const columns = stringsArg(args.columns, 'columns').map((column) => identifier(column, 'columns[]')); if (columns.length === 0) throw new Error('empty columns'); const predicates = columns.map(nonemptyCore); return predicates.length === 1 ? predicates[0] : predicates.map((predicate) => `(${predicate})`).join(' AND '); },
  },
  {
    templateId: 'nullable-bounded-numeric-v1', templateVersion: 1, argsKeys: ['column', 'minimum', 'maximum'], sourceSection: '8.4,12.2,12.2.1',
    expand(args) { exactArgs(args, this.argsKeys); const column = identifier(args.column, 'column'); const minimum = stringArg(args.minimum, 'minimum'); const maximum = stringArg(args.maximum, 'maximum'); if (!Number.isFinite(Number(minimum)) || !Number.isFinite(Number(maximum))) throw new Error('invalid numeric literal'); return `${column} IS NULL OR (typeof(${column}) IN ('integer', 'real') AND ${column} >= ${minimum} AND ${column} <= ${maximum})`; },
  },
  {
    templateId: 'state-nullability-v1', templateVersion: 1,
    argsKeys: ['stateColumn', 'stateGroups', 'nullColumnsByGroup', 'nonNullColumnsByGroup', 'orderedConditionsByGroup'], sourceSection: 'model section,12.2.1',
    expand(args) {
      exactArgs(args, this.argsKeys);
      const stateColumn = identifier(args.stateColumn, 'stateColumn');
      const groups = stringsArg(args.stateGroups, 'stateGroups');
      const nullGroups = stringsArg(args.nullColumnsByGroup, 'nullColumnsByGroup');
      const nonNullGroups = stringsArg(args.nonNullColumnsByGroup, 'nonNullColumnsByGroup');
      const orderedGroups = stringsArg(args.orderedConditionsByGroup, 'orderedConditionsByGroup');
      if (groups.length === 0 || groups.length !== nullGroups.length || groups.length !== nonNullGroups.length || groups.length !== orderedGroups.length) throw new Error('unaligned state groups');
      return groups.map((group, index) => {
        const states = group.split('|');
        const statePredicate = states.length === 1 ? `${stateColumn} = ${quote(states[0])}` : `${stateColumn} IN (${states.map(quote).join(', ')})`;
        const nullColumns = nullGroups[index] ? nullGroups[index].split(',').map((column) => identifier(column, 'null column')) : [];
        const nonNullColumns = nonNullGroups[index] ? nonNullGroups[index].split(',').map((column) => identifier(column, 'nonnull column')) : [];
        const orderedConditions = orderedGroups[index]
          ? orderedGroups[index].split(',').map((condition) => {
              const [columnValue, nullability] = condition.split(':');
              const column = identifier(columnValue, 'ordered condition column');
              if (nullability !== 'null' && nullability !== 'not-null') throw new Error('invalid ordered nullability');
              return `${column} IS ${nullability === 'null' ? 'NULL' : 'NOT NULL'}`;
            })
          : [...nullColumns.map((column) => `${column} IS NULL`), ...nonNullColumns.map((column) => `${column} IS NOT NULL`)];
        return `(${[statePredicate, ...orderedConditions].join(' AND ')})`;
      }).join(' OR ');
    },
  },
] satisfies G1BaseCheckTemplateV1[]).sort((left, right) => left.templateId < right.templateId ? -1 : left.templateId > right.templateId ? 1 : 0);

interface StateArgs {
  readonly stateColumn: string;
  readonly stateGroups: readonly string[];
  readonly nullColumnsByGroup: readonly string[];
  readonly nonNullColumnsByGroup: readonly string[];
  readonly orderedConditionsByGroup?: readonly string[];
}

const STATE_BINDINGS: Readonly<Record<string, StateArgs>> = {
  ck_candidate_lock_revisions_action_candidate: { stateColumn: 'action', stateGroups: ['clear', 'lock|replace'], nullColumnsByGroup: ['candidate_id', ''], nonNullColumnsByGroup: ['', 'candidate_id'] },
  ck_candidates_generation_spec_pair: { stateColumn: 'generation_purpose', stateGroups: ['shot_clean_plate', 'legacy_unspecified'], nullColumnsByGroup: ['', ''], nonNullColumnsByGroup: ['prompt_digest,generation_spec_version,generation_spec_digest', ''] },
  ck_character_visuals_confirmed_time: { stateColumn: 'kind', stateGroups: ['preview_front', 'final_reference'], nullColumnsByGroup: ['confirmed_at', ''], nonNullColumnsByGroup: ['', 'confirmed_at'] },
  ck_characters_finalized_time: { stateColumn: 'status', stateGroups: ['draft|needs_reference', 'finalized|in_use'], nullColumnsByGroup: ['finalized_at', ''], nonNullColumnsByGroup: ['', 'finalized_at'] },
  ck_dialogue_runtime_sessions_closed_time: { stateColumn: 'status', stateGroups: ['active', 'archived|closed'], nullColumnsByGroup: ['closed_at', ''], nonNullColumnsByGroup: ['', 'closed_at'] },
  ck_migration_runs_terminal_time: { stateColumn: 'status', stateGroups: ['running', 'blocked|succeeded|failed'], nullColumnsByGroup: ['finished_at', ''], nonNullColumnsByGroup: ['', 'finished_at'] },
  ck_pending_dialogue_artifacts_active_slot: { stateColumn: 'status', stateGroups: ['pending', 'applied|discarded|superseded|expired'], nullColumnsByGroup: ['', 'active_slot_key'], nonNullColumnsByGroup: ['active_slot_key', ''] },
  ck_pending_dialogue_artifacts_resolved_time: { stateColumn: 'status', stateGroups: ['pending', 'applied|discarded|superseded|expired'], nullColumnsByGroup: ['resolved_at', ''], nonNullColumnsByGroup: ['', 'resolved_at'] },
  ck_preflight_revisions_confirmed_time: { stateColumn: 'status', stateGroups: ['confirmed', 'archived'], nullColumnsByGroup: ['', ''], nonNullColumnsByGroup: ['confirmed_at', 'confirmed_at'] },
  ck_project_context_facts_superseded_time: { stateColumn: 'status', stateGroups: ['confirmed', 'superseded|archived'], nullColumnsByGroup: ['superseded_at', ''], nonNullColumnsByGroup: ['', 'superseded_at'] },
  ck_project_script_outlines_confirmed_time: { stateColumn: 'status', stateGroups: ['draft', 'confirmed|archived'], nullColumnsByGroup: ['confirmed_at', ''], nonNullColumnsByGroup: ['', 'confirmed_at'] },
  ck_projects_deleting_time: { stateColumn: 'lifecycle_status', stateGroups: ['active', 'deleting'], nullColumnsByGroup: ['deleting_at', ''], nonNullColumnsByGroup: ['', 'deleting_at'] },
  ck_shots_retired_time: { stateColumn: 'lifecycle_status', stateGroups: ['active', 'retired'], nullColumnsByGroup: ['retired_at', ''], nonNullColumnsByGroup: ['', 'retired_at'] },
  ck_story_versions_lifecycle_times: { stateColumn: 'status', stateGroups: ['pending_confirmation', 'confirmed', 'archived'], nullColumnsByGroup: ['confirmed_at,archived_at', 'archived_at', 'confirmed_at'], nonNullColumnsByGroup: ['', 'confirmed_at', 'archived_at'], orderedConditionsByGroup: ['confirmed_at:null,archived_at:null', 'confirmed_at:not-null,archived_at:null', 'confirmed_at:null,archived_at:not-null'] },
  ck_storyboard_versions_lifecycle_times: { stateColumn: 'status', stateGroups: ['pending_confirmation', 'confirmed', 'archived'], nullColumnsByGroup: ['confirmed_at,archived_at', 'archived_at', 'confirmed_at'], nonNullColumnsByGroup: ['', 'confirmed_at', 'archived_at'], orderedConditionsByGroup: ['confirmed_at:null,archived_at:null', 'confirmed_at:not-null,archived_at:null', 'confirmed_at:null,archived_at:not-null'] },
};

const parseQuotedValues = (source: string): readonly string[] =>
  [...source.matchAll(/'((?:''|[^'])*)'/g)].map((match) => match[1].replace(/''/g, "'"));

const classifyBinding = (check: G1SchemaCheckSource): G1BasePhysicalCheckBindingV1 => {
  const common = { name: check.name as `ck_${string}`, table: check.table, ownerStage: check.ownerStage, templateVersion: 1 as const, sourceSection: check.sourceSection };
  const stateArgs = STATE_BINDINGS[check.name];
  if (stateArgs) return {
    ...common,
    templateId: 'state-nullability-v1',
    args: {
      stateColumn: stateArgs.stateColumn,
      stateGroups: stateArgs.stateGroups,
      nullColumnsByGroup: stateArgs.nullColumnsByGroup,
      nonNullColumnsByGroup: stateArgs.nonNullColumnsByGroup,
      orderedConditionsByGroup: stateArgs.orderedConditionsByGroup ?? stateArgs.stateGroups.map(() => ''),
    },
  };

  const enumMatch = check.normalizedExpression.match(/^([a-z][a-z0-9_]*) IN \((.+)\)$/);
  if (enumMatch) return { ...common, templateId: 'closed-enum-v1', args: { column: enumMatch[1], values: parseQuotedValues(enumMatch[2]) } };

  const integerParts = [...check.normalizedExpression.matchAll(/typeof\(("[a-z][a-z0-9_]*"|[a-z][a-z0-9_]*)\) = 'integer' AND \1 >= (-?\d+)/g)];
  if (integerParts.length > 0 && integerParts.every((part) => part[2] === integerParts[0][2])) {
    const columns = [...new Set(integerParts.map((part) => part[1]))];
    const nullableColumns = columns.filter((column) => check.normalizedExpression.includes(`${column} IS NULL OR (`));
    return { ...common, templateId: 'integer-at-least-columns-v1', args: { columns, nullableColumns, minimum: Number(integerParts[0][2]) } };
  }

  const booleanMatch = check.normalizedExpression.match(/^typeof\(([a-z][a-z0-9_]*)\) = 'integer' AND \1 IN \(0, 1\)$/);
  if (booleanMatch) return { ...common, templateId: 'boolean-integer-v1', args: { column: booleanMatch[1] } };

  const digestColumns = [...check.normalizedExpression.matchAll(/length\(([a-z][a-z0-9_]*)\) = 71/g)].map((match) => match[1]);
  if (digestColumns.length > 0) {
    const columns = [...new Set(digestColumns)];
    const nullableColumns = columns.filter((column) => check.normalizedExpression.includes(`${column} IS NULL OR (`));
    return { ...common, templateId: 'digest-columns-v1', args: { columns, nullableColumns } };
  }

  const nonemptyColumns = [...check.normalizedExpression.matchAll(/typeof\(([a-z][a-z0-9_]*)\) = 'text' AND length\(trim\(\1\)\) > 0 AND instr\(\1, char\(0\)\) = 0/g)].map((match) => match[1]);
  if (nonemptyColumns.length > 0) return { ...common, templateId: 'nonempty-text-columns-v1', args: { columns: [...new Set(nonemptyColumns)] } };

  if (check.name === 'ck_candidates_score') return { ...common, templateId: 'nullable-bounded-numeric-v1', args: { column: 'score', minimum: '-1.7976931348623157e308', maximum: '1.7976931348623157e308' } };
  if (check.name.endsWith('_singleton')) return { ...common, templateId: 'literal-equality-v1', args: { column: 'id', value: 'primary' } };
  return { ...common, templateId: 'explicit-state-shape-v1', args: { expression: check.normalizedExpression } };
};

const contractMentionsBinding = (contractMarkdown: string, binding: G1BasePhysicalCheckBindingV1): boolean =>
  contractMarkdown.includes(binding.name) || (
    contractMarkdown.includes('#### 12.2.1 `CheckTemplateRegistryV1` 与 physical binding') &&
    binding.templateId !== 'explicit-state-shape-v1'
  );

export function buildG1SchemaBaseCheckDslSource(
  contractMarkdown: string,
  baseChecks: readonly G1SchemaCheckSource[],
): G1SchemaBaseCheckDslSource {
  const completenessIssues: G1CompletenessIssue[] = [];
  for (const marker of ['doc_id: AIR-CONTRACT-20260711-G1-SCHEMA-IMPLEMENTATION', '#### 12.2.1 `CheckTemplateRegistryV1` 与 physical binding']) {
    if (!contractMarkdown.includes(marker)) completenessIssues.push({ kind: 'source-document', key: marker, table: null, sourceSection: 'authority validation', missing: ['required contract marker'] });
  }
  const bindings = baseChecks.map(classifyBinding).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  const templateById = new Map(TEMPLATES.map((item) => [item.templateId, item]));
  const seen = new Set<string>();
  const verifiedChecks: G1VerifiedBaseCheckV1[] = [];
  for (let index = 0; index < bindings.length; index += 1) {
    const item = bindings[index];
    const expected = baseChecks.find((check) => check.name === item.name && check.table === item.table);
    if (seen.has(item.name)) completenessIssues.push({ kind: 'check', key: item.name, table: item.table, sourceSection: item.sourceSection, missing: ['duplicate base binding'] });
    seen.add(item.name);
    if (!contractMentionsBinding(contractMarkdown, item)) completenessIssues.push({ kind: 'check', key: item.name, table: item.table, sourceSection: item.sourceSection, missing: ['physical key or section-12.2.1 template-derived key absent from authority'] });
    if (!expected) { completenessIssues.push({ kind: 'check', key: item.name, table: item.table, sourceSection: item.sourceSection, missing: ['base check lookup failed'] }); continue; }
    const selected = templateById.get(item.templateId);
    if (!selected) { completenessIssues.push({ kind: 'check', key: item.name, table: item.table, sourceSection: item.sourceSection, missing: ['unknown template'] }); continue; }
    try {
      const reexpandedNormalizedExpression = normalizeSql(selected.expand(item.args));
      const byteEqual = reexpandedNormalizedExpression === expected.normalizedExpression;
      verifiedChecks.push({ binding: item, expected, reexpandedNormalizedExpression, byteEqual });
      if (!byteEqual) completenessIssues.push({ kind: 'check', key: item.name, table: item.table, sourceSection: item.sourceSection, missing: ['re-expansion is not byte-equal to base normalizedExpression'] });
    } catch (error) {
      completenessIssues.push({ kind: 'check', key: item.name, table: item.table, sourceSection: item.sourceSection, missing: [`template expansion failed: ${error instanceof Error ? error.message : String(error)}`] });
    }
  }
  if (baseChecks.length !== 125) completenessIssues.push({ kind: 'source-document', key: 'BaseCheckDslV1', table: null, sourceSection: '12.2.1', missing: [`expected 125 base checks, got ${baseChecks.length}`] });
  if (bindings.length !== 125) completenessIssues.push({ kind: 'source-document', key: 'BaseCheckDslV1', table: null, sourceSection: '12.2.1', missing: [`expected 125 bindings, got ${bindings.length}`] });
  if (verifiedChecks.length !== 125) completenessIssues.push({ kind: 'source-document', key: 'BaseCheckDslV1', table: null, sourceSection: '12.2.1', missing: [`expected 125 verified checks, got ${verifiedChecks.length}`] });
  completenessIssues.sort((left, right) => `${left.kind}:${left.key}` < `${right.kind}:${right.key}` ? -1 : `${left.kind}:${left.key}` > `${right.kind}:${right.key}` ? 1 : 0);
  return {
    sourceDocument: '2026-07-11_G1数据库Schema实施契约.md',
    sourceSections: ['3', '5.1-11.6', '12.2', '12.2.1'],
    templates: TEMPLATES,
    bindings,
    verifiedChecks,
    completenessIssues,
  };
}

export { normalizeSql as normalizeG1BaseCheckSql };
