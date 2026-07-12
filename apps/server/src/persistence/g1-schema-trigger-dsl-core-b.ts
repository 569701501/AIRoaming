import type {
  G1CompletenessIssue,
  G1SchemaTriggerSource,
} from './g1-schema-constraint-source.js';

export type G1TriggerArgValue = string | number | boolean | null | readonly string[];

export interface G1TriggerTemplateV1 {
  readonly templateId: string;
  readonly templateVersion: 1;
  readonly argsKeys: readonly string[];
  readonly sourceSection: string;
  readonly expand: (args: Readonly<Record<string, G1TriggerArgValue>>) => {
    readonly timing: 'BEFORE' | 'AFTER';
    readonly event: 'INSERT' | 'UPDATE' | 'DELETE';
    readonly updateColumns: readonly string[];
    readonly normalizedWhen: string;
    readonly normalizedBody: string;
    readonly errorCode: `AIR_G1:trg_${string}`;
  };
}

export interface G1PhysicalTriggerBindingV1 {
  readonly name: `trg_${string}`;
  readonly table: string;
  readonly ownerStage: 'G1';
  readonly templateId: string;
  readonly templateVersion: 1;
  readonly args: Readonly<Record<string, G1TriggerArgValue>>;
  readonly sourceSection: string;
}

export interface G1SchemaTriggerCoreBDslSource {
  readonly sourceDocument: '2026-07-11_G1数据库Schema实施契约.md';
  readonly sourceSections: readonly ['7.1-7.11', '8.1-8.5', '12.3', '12.3.1', '12.4'];
  readonly templates: readonly G1TriggerTemplateV1[];
  readonly bindings: readonly G1PhysicalTriggerBindingV1[];
  readonly triggers: readonly G1SchemaTriggerSource[];
  readonly completenessIssues: readonly G1CompletenessIssue[];
}

const normalizeSql = (sql: string): string => sql.replace(/[\t\n\v\f\r ]+/g, ' ').trim();

const qualifiedColumn = (alias: 'NEW' | 'OLD', column: string): string =>
  column === 'order' || column === 'index' ? `${alias}."${column}"` : `${alias}.${column}`;

const EXPLICIT_TEMPLATE: G1TriggerTemplateV1 = {
  templateId: 'explicit-trigger-v1',
  templateVersion: 1,
  argsKeys: ['timing', 'event', 'updateColumns', 'when', 'bodyStatements', 'errorCode'],
  sourceSection: '12.3,12.3.1',
  expand(args) {
    const expected = [...this.argsKeys].sort().join('\u0000');
    const actual = Object.keys(args).sort().join('\u0000');
    if (actual !== expected) throw new Error('explicit-trigger-v1 args mismatch');
    const timing = args.timing;
    const event = args.event;
    const updateColumns = args.updateColumns;
    const bodyStatements = args.bodyStatements;
    const errorCode = args.errorCode;
    if (timing !== 'BEFORE' && timing !== 'AFTER') throw new Error('invalid timing');
    if (event !== 'INSERT' && event !== 'UPDATE' && event !== 'DELETE') throw new Error('invalid event');
    if (!Array.isArray(updateColumns) || updateColumns.some((item) => typeof item !== 'string' || !/^[a-z][a-z0-9_]*$/.test(item))) throw new Error('invalid updateColumns');
    if (!Array.isArray(bodyStatements) || bodyStatements.length === 0 || bodyStatements.some((item) => typeof item !== 'string' || normalizeSql(item) !== item || item.length === 0)) throw new Error('invalid bodyStatements');
    if (typeof args.when !== 'string' || normalizeSql(args.when) !== args.when || args.when === '0') throw new Error('invalid WHEN');
    if (typeof errorCode !== 'string' || !/^AIR_G1:trg_[a-z0-9_]+$/.test(errorCode)) throw new Error('invalid errorCode');
    const normalizedBody = (bodyStatements as readonly string[]).join('; ');
    if (normalizedBody.includes('TBD') || normalizedBody.includes('CHECK(1)') || normalizedBody.endsWith(';')) throw new Error('invalid body');
    return {
      timing,
      event,
      updateColumns: updateColumns as readonly string[],
      normalizedWhen: args.when,
      normalizedBody,
      errorCode: errorCode as `AIR_G1:trg_${string}`,
    };
  },
};

const readStrings = (value: G1TriggerArgValue, key: string): readonly string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`${key} must be string[]`);
  return value as readonly string[];
};

const readEvent = (value: G1TriggerArgValue): 'INSERT' | 'UPDATE' | 'DELETE' => {
  if (value !== 'INSERT' && value !== 'UPDATE' && value !== 'DELETE') throw new Error('invalid event');
  return value;
};

const readCanonical = (value: G1TriggerArgValue, key: string): string => {
  if (typeof value !== 'string' || normalizeSql(value) !== value || value.length === 0) throw new Error(`${key} must be canonical SQL`);
  return value;
};

const readErrorCode = (value: G1TriggerArgValue): `AIR_G1:trg_${string}` => {
  if (typeof value !== 'string' || !/^AIR_G1:trg_[a-z0-9_]+$/.test(value)) throw new Error('invalid errorCode');
  return value as `AIR_G1:trg_${string}`;
};

const templateArgsExact = (args: Readonly<Record<string, G1TriggerArgValue>>, keys: readonly string[]): void => {
  const actual = Object.keys(args).sort().join('\u0000');
  const expected = [...keys].sort().join('\u0000');
  if (actual !== expected) throw new Error(`args mismatch for ${keys.join(',')}`);
};

const IDENTITY_IMMUTABLE_TEMPLATE: G1TriggerTemplateV1 = {
  templateId: 'identity-immutable-update-v1', templateVersion: 1,
  argsKeys: ['columns', 'when', 'errorCode'], sourceSection: '12.3.1',
  expand(args) {
    templateArgsExact(args, this.argsKeys);
    const columns = readStrings(args.columns, 'columns');
    if (columns.length === 0 || columns.some((column) => !/^[a-z][a-z0-9_]*$/.test(column))) throw new Error('invalid immutable columns');
    const when = readCanonical(args.when, 'when');
    const errorCode = readErrorCode(args.errorCode);
    return {
      timing: 'BEFORE', event: 'UPDATE', updateColumns: [], normalizedWhen: when,
      normalizedBody: `SELECT RAISE(ABORT, '${errorCode}') WHERE ${columns.map((column) => `${qualifiedColumn('NEW', column)} IS NOT ${qualifiedColumn('OLD', column)}`).join(' OR ')}`,
      errorCode,
    };
  },
};

const OWNER_SCOPE_TEMPLATE: G1TriggerTemplateV1 = {
  templateId: 'owner-scope-existence-v1', templateVersion: 1,
  argsKeys: ['event', 'updateColumns', 'when', 'violationPredicate', 'errorCode'], sourceSection: '12.3.1',
  expand(args) {
    templateArgsExact(args, this.argsKeys);
    const event = readEvent(args.event);
    const updateColumns = readStrings(args.updateColumns, 'updateColumns');
    const when = readCanonical(args.when, 'when');
    const predicate = readCanonical(args.violationPredicate, 'violationPredicate');
    const errorCode = readErrorCode(args.errorCode);
    return { timing: 'BEFORE', event, updateColumns, normalizedWhen: when, normalizedBody: `SELECT RAISE(ABORT, '${errorCode}') WHERE ${predicate}`, errorCode };
  },
};

const PROJECT_PURGE_TEMPLATE: G1TriggerTemplateV1 = {
  templateId: 'project-purge-delete-guard-v1', templateVersion: 1,
  argsKeys: ['projectIdExpression', 'when', 'errorCode'], sourceSection: '12.3.1,12.4',
  expand(args) {
    templateArgsExact(args, this.argsKeys);
    const projectIdExpression = readCanonical(args.projectIdExpression, 'projectIdExpression');
    const when = readCanonical(args.when, 'when');
    const errorCode = readErrorCode(args.errorCode);
    const allowed = projectPurgeAllowed(projectIdExpression);
    return { timing: 'BEFORE', event: 'DELETE', updateColumns: [], normalizedWhen: when, normalizedBody: `SELECT RAISE(ABORT, '${errorCode}') WHERE NOT (${allowed})`, errorCode };
  },
};

const PARENT_TERMINAL_TEMPLATE: G1TriggerTemplateV1 = {
  templateId: 'parent-terminal-set-guard-v1', templateVersion: 1,
  argsKeys: ['event', 'parentFormalPredicate', 'projectIdExpression', 'when', 'errorCode'], sourceSection: '12.3.1,12.4',
  expand(args) {
    templateArgsExact(args, this.argsKeys);
    const event = readEvent(args.event);
    const formal = readCanonical(args.parentFormalPredicate, 'parentFormalPredicate');
    const projectIdExpression = readCanonical(args.projectIdExpression, 'projectIdExpression');
    const when = readCanonical(args.when, 'when');
    const errorCode = readErrorCode(args.errorCode);
    const predicate = event === 'DELETE' ? `(${formal}) AND NOT (${projectPurgeAllowed(projectIdExpression)})` : formal;
    return { timing: 'BEFORE', event, updateColumns: [], normalizedWhen: when, normalizedBody: `SELECT RAISE(ABORT, '${errorCode}') WHERE ${predicate}`, errorCode };
  },
};

const TEMPLATES = [EXPLICIT_TEMPLATE, IDENTITY_IMMUTABLE_TEMPLATE, OWNER_SCOPE_TEMPLATE, PROJECT_PURGE_TEMPLATE, PARENT_TERMINAL_TEMPLATE] as const;

const CORE_B_TABLES = new Set([
  'story_versions', 'story_scene_projections', 'story_beat_projections', 'chapter_scenes', 'scene_visuals',
  'storyboard_versions', 'shots', 'storyboard_shot_projections', 'storyboard_shot_characters', 'preflight_revisions',
  'characters', 'character_visuals', 'assets', 'candidates', 'candidate_lock_revisions',
]);

const raiseStatement = (name: `trg_${string}`, predicate: string): string =>
  normalizeSql(`SELECT RAISE(ABORT, 'AIR_G1:${name}') WHERE ${predicate}`);

const triggerBinding = (
  table: string,
  name: `trg_${string}`,
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  predicate: string,
  sourceSection: string,
  when = '1',
  updateColumns: readonly string[] = [],
): G1PhysicalTriggerBindingV1 => ({
  name,
  table,
  ownerStage: 'G1',
  templateId: 'explicit-trigger-v1',
  templateVersion: 1,
  args: {
    timing: 'BEFORE', event, updateColumns,
    when: normalizeSql(when),
    bodyStatements: [raiseStatement(name, normalizeSql(predicate))],
    errorCode: `AIR_G1:${name}`,
  },
  sourceSection,
});

const immutablePredicate = (columns: readonly string[]): string =>
  columns.map((column) => `${qualifiedColumn('NEW', column)} IS NOT ${qualifiedColumn('OLD', column)}`).join(' OR ');

const projectPurgeAllowed = (projectIdExpression: string): string => normalizeSql(`
  EXISTS (
    SELECT 1 FROM projects AS purge_project
    WHERE purge_project.id = ${projectIdExpression}
      AND purge_project.lifecycle_status = 'deleting'
      AND EXISTS (
        SELECT 1 FROM outbox_events AS purge_event
        WHERE purge_event.event_type = 'project.delete_files'
          AND purge_event.aggregate_type = 'project'
          AND purge_event.aggregate_id = purge_project.id
          AND purge_event.status = 'processed'
      )
      AND NOT EXISTS (
        SELECT 1 FROM generation_tasks AS purge_task
        WHERE purge_task.project_id = purge_project.id
          AND purge_task.record_kind = 'runtime'
          AND purge_task.status IN ('queued', 'running', 'retrying')
      )
  )
`);

const scopeBinding = (
  table: string,
  name: `trg_${string}`,
  event: 'INSERT' | 'UPDATE',
  violationPredicate: string,
  sourceSection: string,
  when = '1',
): G1PhysicalTriggerBindingV1 => ({
  name, table, ownerStage: 'G1', templateId: 'owner-scope-existence-v1', templateVersion: 1,
  args: { event, updateColumns: [], when: normalizeSql(when), violationPredicate: normalizeSql(violationPredicate), errorCode: `AIR_G1:${name}` },
  sourceSection,
});

const identityBinding = (
  table: string,
  name: `trg_${string}`,
  columns: readonly string[],
  sourceSection: string,
  when = '1',
): G1PhysicalTriggerBindingV1 => ({
  name, table, ownerStage: 'G1', templateId: 'identity-immutable-update-v1', templateVersion: 1,
  args: { columns, when: normalizeSql(when), errorCode: `AIR_G1:${name}` }, sourceSection,
});

const purgeBinding = (
  table: string,
  name: `trg_${string}`,
  projectIdExpression: string,
  sourceSection: string,
  when = '1',
): G1PhysicalTriggerBindingV1 => ({
  name, table, ownerStage: 'G1', templateId: 'project-purge-delete-guard-v1', templateVersion: 1,
  args: { projectIdExpression: normalizeSql(projectIdExpression), when: normalizeSql(when), errorCode: `AIR_G1:${name}` }, sourceSection,
});

const parentTerminalBinding = (
  table: string,
  name: `trg_${string}`,
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  parentFormalPredicate: string,
  projectIdExpression: string,
  sourceSection: string,
): G1PhysicalTriggerBindingV1 => ({
  name, table, ownerStage: 'G1', templateId: 'parent-terminal-set-guard-v1', templateVersion: 1,
  args: { event, parentFormalPredicate: normalizeSql(parentFormalPredicate), projectIdExpression: normalizeSql(projectIdExpression), when: '1', errorCode: `AIR_G1:${name}` }, sourceSection,
});

const storyScopeViolation = (row: 'NEW' | 'OLD'): string => normalizeSql(`
  NOT EXISTS (
    SELECT 1 FROM chapters AS chapter
    JOIN projects AS project ON project.id = chapter.project_id
    WHERE chapter.id = ${row}.chapter_id
      AND chapter.project_id = ${row}.project_id
      AND project.id = ${row}.project_id
  )
  OR (${row}.source_script_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM chapter_script_versions AS script_version
    JOIN chapters AS source_chapter ON source_chapter.id = script_version.chapter_id
    WHERE script_version.id = ${row}.source_script_version_id
      AND source_chapter.id = ${row}.chapter_id
      AND source_chapter.project_id = ${row}.project_id
  ))
`);

const storyboardScopeViolation = (row: 'NEW' | 'OLD'): string => normalizeSql(`
  NOT EXISTS (
    SELECT 1 FROM chapters AS chapter
    JOIN projects AS project ON project.id = chapter.project_id
    WHERE chapter.id = ${row}.chapter_id
      AND chapter.project_id = ${row}.project_id
      AND project.id = ${row}.project_id
  )
  OR (${row}.source_story_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM story_versions AS story
    WHERE story.id = ${row}.source_story_version_id
      AND story.project_id = ${row}.project_id
      AND story.chapter_id = ${row}.chapter_id
      AND story.status = 'confirmed'
  ))
`);

const storyFormalizeViolation = normalizeSql(`
  NOT (
    OLD.status = 'pending_confirmation'
    AND NEW.status IN ('confirmed', 'archived')
    AND ((NEW.status = 'confirmed' AND NEW.confirmed_at IS NOT NULL AND NEW.archived_at IS NULL)
      OR (NEW.status = 'archived' AND NEW.confirmed_at IS NULL AND NEW.archived_at IS NOT NULL))
  )
  OR (NEW.status = 'confirmed' AND (
    NEW.source_script_version_id IS NULL OR NEW.source_policy_version IS NULL OR NEW.source_digest IS NULL
    OR json_type(NEW.document_json, '$.schemaVersion') <> 'integer'
    OR json_extract(NEW.document_json, '$.schemaVersion') <> NEW.schema_version
    OR NEW.schema_version NOT IN (1, 2)
    OR json_type(NEW.document_json, '$.chapterId') <> 'text'
    OR json_extract(NEW.document_json, '$.chapterId') <> NEW.chapter_id
    OR json_type(NEW.document_json, '$.scenes') <> 'array'
    OR json_type(NEW.document_json, '$.beats') <> 'array'
    OR (NEW.schema_version = 1 AND NEW.origin <> 'legacy_import' AND json_extract(NEW.document_json, '$.sourceScriptVersionId') IS NOT NEW.source_script_version_id)
    OR (NEW.schema_version = 1 AND NEW.origin = 'legacy_import' AND json_extract(NEW.document_json, '$.sourceScriptVersionId') IS NOT NULL AND json_extract(NEW.document_json, '$.sourceScriptVersionId') IS NOT NEW.source_script_version_id)
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.document_json, '$.scenes') AS scene_json
      WHERE json_type(scene_json.value, '$.id') <> 'text'
        OR length(trim(json_extract(scene_json.value, '$.id'))) = 0
        OR json_type(scene_json.value, '$.name') <> 'text'
        OR length(trim(json_extract(scene_json.value, '$.name'))) = 0
        OR NOT EXISTS (
          SELECT 1 FROM story_scene_projections AS scene_projection
          JOIN chapter_scenes AS chapter_scene ON chapter_scene.id = scene_projection.chapter_scene_id
          WHERE scene_projection.story_version_id = NEW.id
            AND scene_projection.scene_key = json_extract(scene_json.value, '$.id')
            AND scene_projection."order" = CAST(scene_json.key AS INTEGER) + 1
            AND scene_projection.name = json_extract(scene_json.value, '$.name')
            AND chapter_scene.project_id = NEW.project_id
            AND chapter_scene.chapter_id = NEW.chapter_id
            AND chapter_scene.scene_key = json_extract(scene_json.value, '$.id')
        )
    )
    OR EXISTS (
      SELECT 1 FROM story_scene_projections AS scene_projection
      WHERE scene_projection.story_version_id = NEW.id
        AND NOT EXISTS (
          SELECT 1 FROM json_each(NEW.document_json, '$.scenes') AS scene_json
          WHERE scene_projection.scene_key = json_extract(scene_json.value, '$.id')
            AND scene_projection."order" = CAST(scene_json.key AS INTEGER) + 1
            AND scene_projection.name = json_extract(scene_json.value, '$.name')
        )
    )
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.document_json, '$.beats') AS beat_json
      WHERE json_type(beat_json.value, '$.id') <> 'text'
        OR length(trim(json_extract(beat_json.value, '$.id'))) = 0
        OR json_type(beat_json.value, '$.order') <> 'integer'
        OR json_extract(beat_json.value, '$.order') <> CAST(beat_json.key AS INTEGER) + 1
        OR json_type(beat_json.value, '$.summary') <> 'text'
        OR length(trim(json_extract(beat_json.value, '$.summary'))) = 0
        OR NOT EXISTS (
          SELECT 1 FROM story_beat_projections AS beat_projection
          WHERE beat_projection.story_version_id = NEW.id
            AND beat_projection.beat_key = json_extract(beat_json.value, '$.id')
            AND beat_projection."order" = CAST(beat_json.key AS INTEGER) + 1
            AND beat_projection.summary = json_extract(beat_json.value, '$.summary')
            AND ((json_extract(beat_json.value, '$.sceneId') IS NULL AND beat_projection.chapter_scene_id IS NULL)
              OR EXISTS (
                SELECT 1 FROM chapter_scenes AS beat_scene
                WHERE beat_scene.id = beat_projection.chapter_scene_id
                  AND beat_scene.project_id = NEW.project_id
                  AND beat_scene.chapter_id = NEW.chapter_id
                  AND beat_scene.scene_key = json_extract(beat_json.value, '$.sceneId')
              ))
        )
    )
    OR EXISTS (
      SELECT 1 FROM story_beat_projections AS beat_projection
      WHERE beat_projection.story_version_id = NEW.id
        AND NOT EXISTS (
          SELECT 1 FROM json_each(NEW.document_json, '$.beats') AS beat_json
          WHERE beat_projection.beat_key = json_extract(beat_json.value, '$.id')
            AND beat_projection."order" = CAST(beat_json.key AS INTEGER) + 1
            AND beat_projection.summary = json_extract(beat_json.value, '$.summary')
        )
    )
  ))
`);

const storyboardFormalizeViolation = normalizeSql(`
  NOT (
    OLD.status = 'pending_confirmation'
    AND NEW.status IN ('confirmed', 'archived')
    AND ((NEW.status = 'confirmed' AND NEW.confirmed_at IS NOT NULL AND NEW.archived_at IS NULL)
      OR (NEW.status = 'archived' AND NEW.confirmed_at IS NULL AND NEW.archived_at IS NOT NULL))
  )
  OR (NEW.status = 'confirmed' AND (
    NEW.source_story_version_id IS NULL OR NEW.source_policy_version IS NULL OR NEW.source_digest IS NULL
    OR json_type(NEW.document_json, '$.schemaVersion') <> 'integer'
    OR json_extract(NEW.document_json, '$.schemaVersion') <> NEW.schema_version
    OR NEW.schema_version NOT IN (1, 2)
    OR json_type(NEW.document_json, '$.chapterId') <> 'text'
    OR json_extract(NEW.document_json, '$.chapterId') <> NEW.chapter_id
    OR json_type(NEW.document_json, '$.shots') <> 'array'
    OR (NEW.schema_version = 1 AND NEW.origin <> 'legacy_import' AND json_extract(NEW.document_json, '$.sourceStoryVersionId') IS NOT NEW.source_story_version_id)
    OR (NEW.schema_version = 1 AND NEW.origin = 'legacy_import' AND json_extract(NEW.document_json, '$.sourceStoryVersionId') IS NOT NULL AND json_extract(NEW.document_json, '$.sourceStoryVersionId') IS NOT NEW.source_story_version_id)
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.document_json, '$.shots') AS shot_json
      WHERE json_type(shot_json.value, '$.id') <> 'text'
        OR length(trim(json_extract(shot_json.value, '$.id'))) = 0
        OR json_type(shot_json.value, '$.order') <> 'integer'
        OR json_extract(shot_json.value, '$.order') <> CAST(shot_json.key AS INTEGER) + 1
        OR json_type(shot_json.value, '$.characterIds') <> 'array'
        OR NOT EXISTS (
          SELECT 1 FROM storyboard_shot_projections AS shot_projection
          JOIN shots AS shot ON shot.id = shot_projection.shot_id
          WHERE shot_projection.storyboard_version_id = NEW.id
            AND shot_projection.shot_id = json_extract(shot_json.value, '$.id')
            AND shot_projection."order" = CAST(shot_json.key AS INTEGER) + 1
            AND shot.project_id = NEW.project_id
            AND shot.chapter_id = NEW.chapter_id
            AND ((json_extract(shot_json.value, '$.beatId') IS NULL AND shot_projection.story_beat_projection_id IS NULL)
              OR EXISTS (
                SELECT 1 FROM story_beat_projections AS beat_projection
                WHERE beat_projection.id = shot_projection.story_beat_projection_id
                  AND beat_projection.story_version_id = NEW.source_story_version_id
                  AND beat_projection.beat_key = json_extract(shot_json.value, '$.beatId')
              ))
            AND ((json_extract(shot_json.value, '$.sceneId') IS NULL AND shot_projection.chapter_scene_id IS NULL)
              OR EXISTS (
                SELECT 1 FROM chapter_scenes AS shot_scene
                WHERE shot_scene.id = shot_projection.chapter_scene_id
                  AND shot_scene.project_id = NEW.project_id
                  AND shot_scene.chapter_id = NEW.chapter_id
                  AND shot_scene.scene_key = json_extract(shot_json.value, '$.sceneId')
              ))
            AND NOT EXISTS (
              SELECT 1 FROM json_each(shot_json.value, '$.characterIds') AS character_json
              WHERE character_json.type <> 'text'
                OR length(trim(character_json.value)) = 0
                OR NOT EXISTS (
                  SELECT 1 FROM storyboard_shot_characters AS shot_character
                  WHERE shot_character.storyboard_shot_projection_id = shot_projection.id
                    AND shot_character."order" = CAST(character_json.key AS INTEGER) + 1
                    AND shot_character.source_token = character_json.value
                    AND ((NEW.schema_version = 1 AND (
                      (EXISTS (
                        SELECT 1 FROM characters AS resolved_character
                        WHERE resolved_character.id = character_json.value
                          AND resolved_character.project_id = NEW.project_id
                      ) AND shot_character.character_id IS character_json.value)
                      OR (NOT EXISTS (
                        SELECT 1 FROM characters AS legacy_character
                        WHERE legacy_character.id = character_json.value
                          AND legacy_character.project_id = NEW.project_id
                      ) AND shot_character.character_id IS NULL)
                    )) OR (NEW.schema_version = 2 AND EXISTS (
                      SELECT 1 FROM characters AS character
                      WHERE character.id = shot_character.character_id
                        AND character.project_id = NEW.project_id
                        AND character.id = character_json.value
                    )))
                )
            )
            AND NOT EXISTS (
              SELECT 1 FROM storyboard_shot_characters AS shot_character
              WHERE shot_character.storyboard_shot_projection_id = shot_projection.id
                AND NOT EXISTS (
                  SELECT 1 FROM json_each(shot_json.value, '$.characterIds') AS character_json
                  WHERE shot_character."order" = CAST(character_json.key AS INTEGER) + 1
                    AND shot_character.source_token = character_json.value
                )
            )
        )
    )
    OR EXISTS (
      SELECT 1 FROM storyboard_shot_projections AS shot_projection
      WHERE shot_projection.storyboard_version_id = NEW.id
        AND NOT EXISTS (
          SELECT 1 FROM json_each(NEW.document_json, '$.shots') AS shot_json
          WHERE shot_projection.shot_id = json_extract(shot_json.value, '$.id')
            AND shot_projection."order" = CAST(shot_json.key AS INTEGER) + 1
        )
    )
  ))
`);

const storyProjectionProject = '(SELECT project_id FROM story_versions WHERE id = OLD.story_version_id)';
const storyboardProjectionProject = '(SELECT project_id FROM storyboard_versions WHERE id = OLD.storyboard_version_id)';
const storyboardCharacterProject = '(SELECT storyboard.project_id FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id WHERE projection.id = OLD.storyboard_shot_projection_id)';

const BINDINGS: readonly G1PhysicalTriggerBindingV1[] = [
  scopeBinding('story_versions', 'trg_story_versions_scope_insert', 'INSERT', storyScopeViolation('NEW'), '7.1,12.3'),
  scopeBinding('story_versions', 'trg_story_versions_scope_update', 'UPDATE', storyScopeViolation('NEW'), '7.1,12.3'),
  triggerBinding('story_versions', 'trg_story_versions_unconfirmed_insert', 'INSERT', "NEW.status <> 'pending_confirmation' OR NEW.confirmed_at IS NOT NULL OR NEW.archived_at IS NOT NULL", '7.1,12.3'),
  triggerBinding('story_versions', 'trg_story_versions_formalize_guard', 'UPDATE', storyFormalizeViolation, '7.1,7.11,12.3', "NEW.status IS NOT OLD.status"),
  identityBinding('story_versions', 'trg_story_versions_formal_immutable_update', ['id', 'project_id', 'chapter_id', 'version', 'status', 'source_script_version_id', 'source_policy_version', 'source_digest', 'document_json', 'schema_version', 'document_digest', 'origin', 'created_at', 'confirmed_at', 'archived_at'], '7.1,12.3', "OLD.status IN ('confirmed', 'archived')"),
  purgeBinding('story_versions', 'trg_story_versions_formal_immutable_delete', 'OLD.project_id', '7.1,12.3,12.4', "OLD.status IN ('confirmed', 'archived')"),

  scopeBinding('story_scene_projections', 'trg_story_scene_projections_scope_insert', 'INSERT', 'NOT EXISTS (SELECT 1 FROM story_versions AS story JOIN chapter_scenes AS scene ON scene.id = NEW.chapter_scene_id WHERE story.id = NEW.story_version_id AND scene.project_id = story.project_id AND scene.chapter_id = story.chapter_id)', '7.2,12.3'),
  scopeBinding('story_scene_projections', 'trg_story_scene_projections_scope_update', 'UPDATE', 'NEW.story_version_id IS NOT OLD.story_version_id OR NOT EXISTS (SELECT 1 FROM story_versions AS story JOIN chapter_scenes AS scene ON scene.id = NEW.chapter_scene_id WHERE story.id = NEW.story_version_id AND scene.project_id = story.project_id AND scene.chapter_id = story.chapter_id)', '7.2,12.3'),
  parentTerminalBinding('story_scene_projections', 'trg_story_scene_projections_parent_formal_insert', 'INSERT', "EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = NEW.story_version_id AND story.status IN ('confirmed', 'archived'))", '(SELECT project_id FROM story_versions WHERE id = NEW.story_version_id)', '7.2,12.3'),
  parentTerminalBinding('story_scene_projections', 'trg_story_scene_projections_parent_formal_update', 'UPDATE', "EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = NEW.story_version_id AND story.status IN ('confirmed', 'archived'))", '(SELECT project_id FROM story_versions WHERE id = NEW.story_version_id)', '7.2,12.3'),
  parentTerminalBinding('story_scene_projections', 'trg_story_scene_projections_parent_formal_delete', 'DELETE', "EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = OLD.story_version_id AND story.status IN ('confirmed', 'archived'))", storyProjectionProject, '7.2,12.3,12.4'),

  scopeBinding('story_beat_projections', 'trg_story_beat_projections_scope_insert', 'INSERT', 'NOT EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = NEW.story_version_id) OR (NEW.chapter_scene_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM story_versions AS story JOIN chapter_scenes AS scene ON scene.id = NEW.chapter_scene_id WHERE story.id = NEW.story_version_id AND scene.project_id = story.project_id AND scene.chapter_id = story.chapter_id))', '7.3,12.3'),
  scopeBinding('story_beat_projections', 'trg_story_beat_projections_scope_update', 'UPDATE', 'NEW.story_version_id IS NOT OLD.story_version_id OR NOT EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = NEW.story_version_id) OR (NEW.chapter_scene_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM story_versions AS story JOIN chapter_scenes AS scene ON scene.id = NEW.chapter_scene_id WHERE story.id = NEW.story_version_id AND scene.project_id = story.project_id AND scene.chapter_id = story.chapter_id))', '7.3,12.3'),
  parentTerminalBinding('story_beat_projections', 'trg_story_beat_projections_parent_formal_insert', 'INSERT', "EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = NEW.story_version_id AND story.status IN ('confirmed', 'archived'))", '(SELECT project_id FROM story_versions WHERE id = NEW.story_version_id)', '7.3,12.3'),
  parentTerminalBinding('story_beat_projections', 'trg_story_beat_projections_parent_formal_update', 'UPDATE', "EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = NEW.story_version_id AND story.status IN ('confirmed', 'archived'))", '(SELECT project_id FROM story_versions WHERE id = NEW.story_version_id)', '7.3,12.3'),
  parentTerminalBinding('story_beat_projections', 'trg_story_beat_projections_parent_formal_delete', 'DELETE', "EXISTS (SELECT 1 FROM story_versions AS story WHERE story.id = OLD.story_version_id AND story.status IN ('confirmed', 'archived'))", storyProjectionProject, '7.3,12.3,12.4'),

  scopeBinding('chapter_scenes', 'trg_chapter_scenes_scope_insert', 'INSERT', "NOT EXISTS (SELECT 1 FROM chapters AS chapter JOIN projects AS project ON project.id = chapter.project_id WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id AND project.id = NEW.project_id AND project.lifecycle_status = 'active')", '7.4,12.3'),
  scopeBinding('chapter_scenes', 'trg_chapter_scenes_scope_update', 'UPDATE', "NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.scene_key IS NOT OLD.scene_key OR NEW.created_at IS NOT OLD.created_at OR NOT EXISTS (SELECT 1 FROM chapters AS chapter WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id)", '7.4,12.3'),
  scopeBinding('chapter_scenes', 'trg_chapter_scenes_current_visual_scope_insert', 'INSERT', "NEW.current_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scene_visuals AS visual JOIN assets AS asset ON asset.id = visual.asset_id JOIN projects AS project ON project.id = NEW.project_id WHERE visual.id = NEW.current_visual_id AND visual.chapter_scene_id = NEW.id AND asset.project_id = NEW.project_id AND asset.chapter_id = NEW.chapter_id AND asset.status = 'ready' AND project.lifecycle_status = 'active')", '7.4,12.3'),
  scopeBinding('chapter_scenes', 'trg_chapter_scenes_current_visual_scope_update', 'UPDATE', "NEW.current_visual_id IS NOT OLD.current_visual_id AND (NEW.current_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM scene_visuals AS visual JOIN assets AS asset ON asset.id = visual.asset_id JOIN projects AS project ON project.id = NEW.project_id WHERE visual.id = NEW.current_visual_id AND visual.chapter_scene_id = NEW.id AND asset.project_id = NEW.project_id AND asset.chapter_id = NEW.chapter_id AND asset.status = 'ready' AND project.lifecycle_status = 'active'))", '7.4,12.3'),
  purgeBinding('chapter_scenes', 'trg_chapter_scenes_purge_delete_guard', 'OLD.project_id', '7.4,12.3,12.4'),

  scopeBinding('scene_visuals', 'trg_scene_visuals_scope_insert', 'INSERT', "NOT EXISTS (SELECT 1 FROM chapter_scenes AS scene JOIN assets AS asset ON asset.id = NEW.asset_id JOIN projects AS project ON project.id = scene.project_id WHERE scene.id = NEW.chapter_scene_id AND asset.project_id = scene.project_id AND asset.chapter_id = scene.chapter_id AND project.lifecycle_status = 'active') OR (NEW.source_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM chapter_scenes AS scene JOIN generation_tasks AS task ON task.id = NEW.source_task_id WHERE scene.id = NEW.chapter_scene_id AND task.project_id = scene.project_id AND task.chapter_id = scene.chapter_id))", '7.5,12.3'),
  scopeBinding('scene_visuals', 'trg_scene_visuals_scope_update', 'UPDATE', "NEW.id IS NOT OLD.id OR NEW.chapter_scene_id IS NOT OLD.chapter_scene_id OR NEW.asset_id IS NOT OLD.asset_id OR NEW.source_task_id IS NOT OLD.source_task_id OR NEW.version IS NOT OLD.version OR NEW.created_at IS NOT OLD.created_at OR NOT EXISTS (SELECT 1 FROM chapter_scenes AS scene JOIN assets AS asset ON asset.id = NEW.asset_id WHERE scene.id = NEW.chapter_scene_id AND asset.project_id = scene.project_id AND asset.chapter_id = scene.chapter_id) OR (NEW.source_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM chapter_scenes AS scene JOIN generation_tasks AS task ON task.id = NEW.source_task_id WHERE scene.id = NEW.chapter_scene_id AND task.project_id = scene.project_id AND task.chapter_id = scene.chapter_id))", '7.5,12.3'),
  purgeBinding('scene_visuals', 'trg_scene_visuals_purge_delete_guard', '(SELECT project_id FROM chapter_scenes WHERE id = OLD.chapter_scene_id)', '7.5,12.3,12.4'),

  scopeBinding('storyboard_versions', 'trg_storyboard_versions_scope_insert', 'INSERT', storyboardScopeViolation('NEW'), '7.6,12.3'),
  scopeBinding('storyboard_versions', 'trg_storyboard_versions_scope_update', 'UPDATE', storyboardScopeViolation('NEW'), '7.6,12.3'),
  triggerBinding('storyboard_versions', 'trg_storyboard_versions_unconfirmed_insert', 'INSERT', "NEW.status <> 'pending_confirmation' OR NEW.confirmed_at IS NOT NULL OR NEW.archived_at IS NOT NULL", '7.6,12.3'),
  triggerBinding('storyboard_versions', 'trg_storyboard_versions_formalize_guard', 'UPDATE', storyboardFormalizeViolation, '7.6,7.11,12.3', "NEW.status IS NOT OLD.status"),
  identityBinding('storyboard_versions', 'trg_storyboard_versions_formal_immutable_update', ['id', 'project_id', 'chapter_id', 'version', 'status', 'source_story_version_id', 'source_policy_version', 'source_digest', 'document_json', 'schema_version', 'document_digest', 'origin', 'created_at', 'confirmed_at', 'archived_at'], '7.6,12.3', "OLD.status IN ('confirmed', 'archived')"),
  purgeBinding('storyboard_versions', 'trg_storyboard_versions_formal_immutable_delete', 'OLD.project_id', '7.6,12.3,12.4', "OLD.status IN ('confirmed', 'archived')"),

  scopeBinding('shots', 'trg_shots_scope_insert', 'INSERT', "NOT EXISTS (SELECT 1 FROM chapters AS chapter JOIN projects AS project ON project.id = chapter.project_id WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id AND project.lifecycle_status = 'active')", '7.7,12.3'),
  scopeBinding('shots', 'trg_shots_scope_update', 'UPDATE', 'NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.created_at IS NOT OLD.created_at OR NOT EXISTS (SELECT 1 FROM chapters AS chapter WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id)', '7.7,12.3'),
  scopeBinding('shots', 'trg_shots_current_lock_scope_insert', 'INSERT', "NEW.current_candidate_lock_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM candidate_lock_revisions AS lock_revision JOIN projects AS project ON project.id = NEW.project_id WHERE lock_revision.id = NEW.current_candidate_lock_revision_id AND lock_revision.project_id = NEW.project_id AND lock_revision.chapter_id = NEW.chapter_id AND lock_revision.shot_id = NEW.id AND lock_revision.action IN ('lock', 'replace') AND project.lifecycle_status = 'active')", '7.7,12.3'),
  scopeBinding('shots', 'trg_shots_current_lock_scope_update', 'UPDATE', "NEW.current_candidate_lock_revision_id IS NOT OLD.current_candidate_lock_revision_id AND (NEW.current_candidate_lock_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM candidate_lock_revisions AS lock_revision JOIN projects AS project ON project.id = NEW.project_id WHERE lock_revision.id = NEW.current_candidate_lock_revision_id AND lock_revision.project_id = NEW.project_id AND lock_revision.chapter_id = NEW.chapter_id AND lock_revision.shot_id = NEW.id AND lock_revision.action IN ('lock', 'replace') AND project.lifecycle_status = 'active'))", '7.7,12.3'),
  purgeBinding('shots', 'trg_shots_purge_delete_guard', 'OLD.project_id', '7.7,12.3,12.4'),

  scopeBinding('storyboard_shot_projections', 'trg_storyboard_shot_projections_scope_insert', 'INSERT', 'NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard JOIN shots AS shot ON shot.id = NEW.shot_id WHERE storyboard.id = NEW.storyboard_version_id AND shot.project_id = storyboard.project_id AND shot.chapter_id = storyboard.chapter_id) OR (NEW.story_beat_projection_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard JOIN story_beat_projections AS beat ON beat.id = NEW.story_beat_projection_id WHERE storyboard.id = NEW.storyboard_version_id AND beat.story_version_id = storyboard.source_story_version_id)) OR (NEW.chapter_scene_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard JOIN chapter_scenes AS scene ON scene.id = NEW.chapter_scene_id WHERE storyboard.id = NEW.storyboard_version_id AND scene.project_id = storyboard.project_id AND scene.chapter_id = storyboard.chapter_id))', '7.8,12.3'),
  scopeBinding('storyboard_shot_projections', 'trg_storyboard_shot_projections_scope_update', 'UPDATE', 'NEW.storyboard_version_id IS NOT OLD.storyboard_version_id OR NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard JOIN shots AS shot ON shot.id = NEW.shot_id WHERE storyboard.id = NEW.storyboard_version_id AND shot.project_id = storyboard.project_id AND shot.chapter_id = storyboard.chapter_id) OR (NEW.story_beat_projection_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard JOIN story_beat_projections AS beat ON beat.id = NEW.story_beat_projection_id WHERE storyboard.id = NEW.storyboard_version_id AND beat.story_version_id = storyboard.source_story_version_id)) OR (NEW.chapter_scene_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard JOIN chapter_scenes AS scene ON scene.id = NEW.chapter_scene_id WHERE storyboard.id = NEW.storyboard_version_id AND scene.project_id = storyboard.project_id AND scene.chapter_id = storyboard.chapter_id))', '7.8,12.3'),
  parentTerminalBinding('storyboard_shot_projections', 'trg_storyboard_shot_projections_parent_formal_insert', 'INSERT', "EXISTS (SELECT 1 FROM storyboard_versions AS storyboard WHERE storyboard.id = NEW.storyboard_version_id AND storyboard.status IN ('confirmed', 'archived'))", '(SELECT project_id FROM storyboard_versions WHERE id = NEW.storyboard_version_id)', '7.8,12.3'),
  parentTerminalBinding('storyboard_shot_projections', 'trg_storyboard_shot_projections_parent_formal_update', 'UPDATE', "EXISTS (SELECT 1 FROM storyboard_versions AS storyboard WHERE storyboard.id = NEW.storyboard_version_id AND storyboard.status IN ('confirmed', 'archived'))", '(SELECT project_id FROM storyboard_versions WHERE id = NEW.storyboard_version_id)', '7.8,12.3'),
  parentTerminalBinding('storyboard_shot_projections', 'trg_storyboard_shot_projections_parent_formal_delete', 'DELETE', "EXISTS (SELECT 1 FROM storyboard_versions AS storyboard WHERE storyboard.id = OLD.storyboard_version_id AND storyboard.status IN ('confirmed', 'archived'))", storyboardProjectionProject, '7.8,12.3,12.4'),

  scopeBinding('storyboard_shot_characters', 'trg_storyboard_shot_characters_scope_insert', 'INSERT', 'NOT EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection WHERE projection.id = NEW.storyboard_shot_projection_id) OR (NEW.character_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id JOIN characters AS character ON character.id = NEW.character_id WHERE projection.id = NEW.storyboard_shot_projection_id AND character.project_id = storyboard.project_id))', '7.9,12.3'),
  scopeBinding('storyboard_shot_characters', 'trg_storyboard_shot_characters_scope_update', 'UPDATE', 'NEW.storyboard_shot_projection_id IS NOT OLD.storyboard_shot_projection_id OR NOT EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection WHERE projection.id = NEW.storyboard_shot_projection_id) OR (NEW.character_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id JOIN characters AS character ON character.id = NEW.character_id WHERE projection.id = NEW.storyboard_shot_projection_id AND character.project_id = storyboard.project_id))', '7.9,12.3'),
  parentTerminalBinding('storyboard_shot_characters', 'trg_storyboard_shot_characters_parent_formal_insert', 'INSERT', "EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id WHERE projection.id = NEW.storyboard_shot_projection_id AND storyboard.status IN ('confirmed', 'archived'))", '(SELECT storyboard.project_id FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id WHERE projection.id = NEW.storyboard_shot_projection_id)', '7.9,12.3'),
  parentTerminalBinding('storyboard_shot_characters', 'trg_storyboard_shot_characters_parent_formal_update', 'UPDATE', "EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id WHERE projection.id = NEW.storyboard_shot_projection_id AND storyboard.status IN ('confirmed', 'archived'))", '(SELECT storyboard.project_id FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id WHERE projection.id = NEW.storyboard_shot_projection_id)', '7.9,12.3'),
  parentTerminalBinding('storyboard_shot_characters', 'trg_storyboard_shot_characters_parent_formal_delete', 'DELETE', "EXISTS (SELECT 1 FROM storyboard_shot_projections AS projection JOIN storyboard_versions AS storyboard ON storyboard.id = projection.storyboard_version_id WHERE projection.id = OLD.storyboard_shot_projection_id AND storyboard.status IN ('confirmed', 'archived'))", storyboardCharacterProject, '7.9,12.3,12.4'),

  scopeBinding('preflight_revisions', 'trg_preflight_revisions_scope_insert', 'INSERT', "NOT EXISTS (SELECT 1 FROM chapters AS chapter JOIN projects AS project ON project.id = chapter.project_id JOIN storyboard_versions AS storyboard ON storyboard.id = NEW.source_storyboard_version_id WHERE chapter.id = NEW.chapter_id AND chapter.project_id = NEW.project_id AND project.lifecycle_status = 'active' AND storyboard.project_id = NEW.project_id AND storyboard.chapter_id = NEW.chapter_id AND storyboard.status = 'confirmed') OR NEW.source_policy_version IS NULL OR NEW.source_digest IS NULL OR NEW.schema_version NOT IN (1, 2) OR json_type(NEW.document_json, '$.schemaVersion') <> 'integer' OR json_extract(NEW.document_json, '$.schemaVersion') <> NEW.schema_version OR json_extract(NEW.document_json, '$.chapterId') <> NEW.chapter_id OR json_type(NEW.document_json, '$.ready') NOT IN ('true', 'false') OR json_extract(NEW.document_json, '$.ready') <> NEW.ready OR (NEW.schema_version = 1 AND json_extract(NEW.document_json, '$.sourceStoryboardId') IS NOT NEW.source_storyboard_version_id) OR (NEW.schema_version = 2 AND (json_extract(NEW.document_json, '$.policyVersion') IS NOT NEW.source_policy_version OR json_type(NEW.document_json, '$.sourceSnapshot') <> 'object' OR json_extract(NEW.document_json, '$.sourceSnapshot.schemaVersion') <> 1 OR json_extract(NEW.document_json, '$.sourceSnapshot.projectId') IS NOT NEW.project_id OR json_extract(NEW.document_json, '$.sourceSnapshot.chapterId') IS NOT NEW.chapter_id OR json_extract(NEW.document_json, '$.sourceSnapshot.consumerType') <> 'preflight_revision' OR json_extract(NEW.document_json, '$.sourceSnapshot.policyVersion') IS NOT NEW.source_policy_version OR json_extract(NEW.document_json, '$.sourceSnapshot.storyboard.id') IS NOT NEW.source_storyboard_version_id OR NOT EXISTS (SELECT 1 FROM storyboard_versions AS storyboard WHERE storyboard.id = NEW.source_storyboard_version_id AND json_extract(NEW.document_json, '$.sourceSnapshot.storyboard.digest') IS storyboard.document_digest)))", '7.10,7.11,12.3'),
  identityBinding('preflight_revisions', 'trg_preflight_revisions_immutable_update', ['id', 'project_id', 'chapter_id', 'version', 'status', 'source_storyboard_version_id', 'source_policy_version', 'source_digest', 'document_json', 'schema_version', 'document_digest', 'ready', 'created_at', 'confirmed_at'], '7.10,12.3'),
  purgeBinding('preflight_revisions', 'trg_preflight_revisions_immutable_delete', 'OLD.project_id', '7.10,12.3,12.4'),

  scopeBinding('characters', 'trg_characters_current_visual_scope_insert', 'INSERT', "NOT EXISTS (SELECT 1 FROM projects AS project WHERE project.id = NEW.project_id AND project.lifecycle_status = 'active') OR (NEW.preview_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM character_visuals AS visual JOIN assets AS asset ON asset.id = visual.asset_id WHERE visual.id = NEW.preview_visual_id AND visual.character_id = NEW.id AND visual.kind = 'preview_front' AND visual.status = 'available' AND asset.project_id = NEW.project_id AND asset.status = 'ready')) OR (NEW.primary_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM character_visuals AS visual JOIN assets AS asset ON asset.id = visual.asset_id WHERE visual.id = NEW.primary_visual_id AND visual.character_id = NEW.id AND visual.kind = 'final_reference' AND visual.status = 'available' AND asset.project_id = NEW.project_id AND asset.status = 'ready'))", '8.1,12.3'),
  scopeBinding('characters', 'trg_characters_current_visual_scope_update', 'UPDATE', "(NEW.preview_visual_id IS NOT OLD.preview_visual_id OR NEW.primary_visual_id IS NOT OLD.primary_visual_id) AND (NOT EXISTS (SELECT 1 FROM projects AS project WHERE project.id = NEW.project_id AND project.lifecycle_status = 'active') OR (NEW.preview_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM character_visuals AS visual JOIN assets AS asset ON asset.id = visual.asset_id WHERE visual.id = NEW.preview_visual_id AND visual.character_id = NEW.id AND visual.kind = 'preview_front' AND visual.status = 'available' AND asset.project_id = NEW.project_id AND asset.status = 'ready')) OR (NEW.primary_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM character_visuals AS visual JOIN assets AS asset ON asset.id = visual.asset_id WHERE visual.id = NEW.primary_visual_id AND visual.character_id = NEW.id AND visual.kind = 'final_reference' AND visual.status = 'available' AND asset.project_id = NEW.project_id AND asset.status = 'ready'))) ", '8.1,12.3'),
  purgeBinding('characters', 'trg_characters_purge_delete_guard', 'OLD.project_id', '8.1,12.3,12.4'),

  scopeBinding('character_visuals', 'trg_character_visuals_asset_scope_insert', 'INSERT', "NOT EXISTS (SELECT 1 FROM characters AS character JOIN assets AS asset ON asset.id = NEW.asset_id JOIN projects AS project ON project.id = character.project_id WHERE character.id = NEW.character_id AND asset.project_id = character.project_id AND asset.status = 'ready' AND project.lifecycle_status = 'active') OR (NEW.source_visual_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM character_visuals AS source_visual WHERE source_visual.id = NEW.source_visual_id AND source_visual.character_id = NEW.character_id))", '8.2,12.3'),
  scopeBinding('character_visuals', 'trg_character_visuals_asset_scope_update', 'UPDATE', "NEW.id IS NOT OLD.id OR NEW.character_id IS NOT OLD.character_id OR NEW.asset_id IS NOT OLD.asset_id OR NEW.kind IS NOT OLD.kind OR NEW.version IS NOT OLD.version OR NEW.source_visual_id IS NOT OLD.source_visual_id OR NEW.created_at IS NOT OLD.created_at OR NOT EXISTS (SELECT 1 FROM characters AS character JOIN assets AS asset ON asset.id = NEW.asset_id WHERE character.id = NEW.character_id AND asset.project_id = character.project_id AND asset.status = 'ready')", '8.2,12.3'),
  triggerBinding('character_visuals', 'trg_character_visuals_current_reverse_update', 'UPDATE', "NEW.status IS NOT OLD.status AND NEW.status <> 'available' AND EXISTS (SELECT 1 FROM characters AS character WHERE character.preview_visual_id = OLD.id OR character.primary_visual_id = OLD.id)", '8.1,8.2,12.3'),
  purgeBinding('character_visuals', 'trg_character_visuals_purge_delete_guard', '(SELECT project_id FROM characters WHERE id = OLD.character_id)', '8.2,12.3,12.4'),

  scopeBinding('assets', 'trg_assets_source_scope_insert', 'INSERT', "NEW.source_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM generation_tasks AS task WHERE task.id = NEW.source_task_id AND task.project_id = NEW.project_id AND (task.chapter_id IS NULL OR NEW.chapter_id IS NULL OR task.chapter_id = NEW.chapter_id))", '8.3,12.3'),
  scopeBinding('assets', 'trg_assets_source_scope_update', 'UPDATE', "NEW.id IS NOT OLD.id OR NEW.project_id IS NOT OLD.project_id OR NEW.chapter_id IS NOT OLD.chapter_id OR NEW.source_task_id IS NOT OLD.source_task_id OR NEW.created_at IS NOT OLD.created_at OR (NEW.source_task_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM generation_tasks AS task WHERE task.id = NEW.source_task_id AND task.project_id = NEW.project_id AND (task.chapter_id IS NULL OR NEW.chapter_id IS NULL OR task.chapter_id = NEW.chapter_id)))", '8.3,12.3'),
  triggerBinding('assets', 'trg_assets_unready_insert', 'INSERT', "NEW.status = 'ready' OR NEW.ready_at IS NOT NULL OR NOT EXISTS (SELECT 1 FROM projects AS project WHERE project.id = NEW.project_id AND project.lifecycle_status = 'active')", '8.3,12.3'),
  triggerBinding('assets', 'trg_assets_ready_transition', 'UPDATE', "(NEW.status IS NOT OLD.status AND NOT ((OLD.status = 'staged' AND NEW.status IN ('ready', 'failed', 'deleting')) OR (OLD.status = 'ready' AND NEW.status IN ('missing', 'deleting')) OR (OLD.status = 'missing' AND NEW.status IN ('ready', 'deleting')))) OR (OLD.status = 'staged' AND NEW.status = 'ready' AND (OLD.ready_at IS NOT NULL OR NEW.ready_at IS NULL OR NOT EXISTS (SELECT 1 FROM projects AS project WHERE project.id = NEW.project_id AND project.lifecycle_status = 'active'))) OR (OLD.status = 'missing' AND NEW.status = 'ready' AND NEW.ready_at IS NOT OLD.ready_at) OR (OLD.status = 'deleting' AND NEW.status <> 'deleting')", '8.3,12.3'),
  identityBinding('assets', 'trg_assets_ready_core_immutable_update', ['project_id', 'chapter_id', 'type', 'role', 'created_at', 'ready_at', 'storage_key', 'sha256', 'bytes', 'mime_type', 'width', 'height', 'duration_ms', 'source_task_id', 'metadata_json', 'metadata_schema_version', 'metadata_digest'], '8.3,12.3', 'OLD.ready_at IS NOT NULL'),
  purgeBinding('assets', 'trg_assets_ready_core_immutable_delete', 'OLD.project_id', '8.3,12.3,12.4', 'OLD.ready_at IS NOT NULL'),

  triggerBinding('candidates', 'trg_candidates_task_provenance_insert', 'INSERT', "NOT EXISTS (SELECT 1 FROM projects AS project WHERE project.id = NEW.project_id AND project.lifecycle_status = 'active') OR NOT EXISTS (SELECT 1 FROM generation_tasks AS task WHERE task.id = NEW.task_id AND task.project_id = NEW.project_id AND task.chapter_id = NEW.chapter_id AND ((task.record_kind = 'runtime' AND NEW.generation_purpose = 'shot_clean_plate' AND NEW.prompt_digest IS NOT NULL AND NEW.generation_spec_version IS NOT NULL AND NEW.generation_spec_digest IS NOT NULL) OR (task.record_kind IN ('legacy_imported', 'legacy_stub') AND NEW.generation_purpose = 'legacy_unspecified')))", '8.4,12.3'),
  identityBinding('candidates', 'trg_candidates_identity_immutable_update', ['project_id', 'chapter_id', 'shot_id', 'task_id', 'asset_id', 'index', 'prompt_digest', 'generation_purpose', 'generation_spec_version', 'generation_spec_digest', 'created_at'], '8.4,12.3'),
  purgeBinding('candidates', 'trg_candidates_history_delete', 'OLD.project_id', '8.4,12.3,12.4'),

  triggerBinding('candidate_lock_revisions', 'trg_candidate_lock_revisions_initial_insert', 'INSERT', "NOT EXISTS (SELECT 1 FROM projects AS project WHERE project.id = NEW.project_id AND project.lifecycle_status = 'active') OR NOT EXISTS (SELECT 1 FROM shots AS shot WHERE shot.id = NEW.shot_id AND shot.project_id = NEW.project_id AND shot.chapter_id = NEW.chapter_id) OR (NEW.candidate_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM candidates AS candidate WHERE candidate.id = NEW.candidate_id AND candidate.project_id = NEW.project_id AND candidate.chapter_id = NEW.chapter_id AND candidate.shot_id = NEW.shot_id)) OR (NEW.previous_revision_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM candidate_lock_revisions AS previous_revision WHERE previous_revision.id = NEW.previous_revision_id AND previous_revision.project_id = NEW.project_id AND previous_revision.chapter_id = NEW.chapter_id AND previous_revision.shot_id = NEW.shot_id))", '8.5,12.3'),
  identityBinding('candidate_lock_revisions', 'trg_candidate_lock_revisions_immutable_update', ['id', 'project_id', 'chapter_id', 'shot_id', 'revision', 'action', 'candidate_id', 'previous_revision_id', 'origin', 'reason', 'decided_at', 'recorded_at'], '8.5,12.3'),
  purgeBinding('candidate_lock_revisions', 'trg_candidate_lock_revisions_immutable_delete', 'OLD.project_id', '8.5,12.3,12.4'),
].sort((left, right) => left.table < right.table ? -1 : left.table > right.table ? 1 : left.name < right.name ? -1 : left.name > right.name ? 1 : 0);

const contractMentionsBinding = (contractMarkdown: string, name: string): boolean => {
  if (contractMarkdown.includes(name)) return true;
  const suffixes = ['_insert', '_update', '_delete'] as const;
  const suffix = suffixes.find((candidate) => name.endsWith(candidate));
  if (!suffix) return false;
  const base = name.slice(0, -suffix.length);
  return [
    `${base}_insert/update`,
    `${base}_update/delete`,
    `${base}_insert/update/delete`,
  ].some((compressed) => contractMarkdown.includes(compressed));
};

export function buildG1SchemaTriggerCoreBDslSource(
  contractMarkdown: string,
  constraintIssues: readonly G1CompletenessIssue[],
): G1SchemaTriggerCoreBDslSource {
  const completenessIssues: G1CompletenessIssue[] = [];
  const requiredMarkers = [
    'doc_id: AIR-CONTRACT-20260711-G1-SCHEMA-IMPLEMENTATION',
    '#### 12.3.1 `TriggerTemplateRegistryV1` 与 physical binding',
  ];
  for (const marker of requiredMarkers) {
    if (!contractMarkdown.includes(marker)) completenessIssues.push({ kind: 'source-document', key: marker, table: null, sourceSection: 'authority validation', missing: ['required contract marker'] });
  }
  const input = constraintIssues.filter((item) => item.kind === 'trigger' && item.table !== null && CORE_B_TABLES.has(item.table));
  const inputByName = new Map(input.map((item) => [item.key, item]));
  const bindingByName = new Map<string, G1PhysicalTriggerBindingV1>();
  const templateById = new Map<string, G1TriggerTemplateV1>(TEMPLATES.map((item) => [item.templateId, item]));
  const triggers: G1SchemaTriggerSource[] = [];
  for (const item of BINDINGS) {
    if (bindingByName.has(item.name)) completenessIssues.push({ kind: 'trigger', key: item.name, table: item.table, sourceSection: item.sourceSection, missing: ['duplicate binding'] });
    bindingByName.set(item.name, item);
    if (!inputByName.has(item.name)) completenessIssues.push({ kind: 'trigger', key: item.name, table: item.table, sourceSection: item.sourceSection, missing: ['binding has no matching input issue'] });
    if (!contractMentionsBinding(contractMarkdown, item.name)) {
      completenessIssues.push({ kind: 'trigger', key: item.name, table: item.table, sourceSection: item.sourceSection, missing: ['physical key or section-12.3 compressed key absent from authority'] });
    }
    try {
      const selectedTemplate = templateById.get(item.templateId);
      if (!selectedTemplate || selectedTemplate.templateVersion !== item.templateVersion) throw new Error('unknown template/version');
      const expanded = selectedTemplate.expand(item.args);
      if (expanded.errorCode !== `AIR_G1:${item.name}`) throw new Error('errorCode does not match physical key');
      const expected = inputByName.get(item.name)?.known;
      if (expected?.timing && expected.timing !== expanded.timing) throw new Error(`timing mismatch: ${expanded.timing}`);
      if (expected?.event && expected.event !== expanded.event) throw new Error(`event mismatch: ${expanded.event}`);
      triggers.push({ ownerStage: item.ownerStage, table: item.table, name: item.name, timing: expanded.timing, event: expanded.event, updateColumns: expanded.updateColumns, normalizedWhen: expanded.normalizedWhen, normalizedBody: expanded.normalizedBody, errorCode: expanded.errorCode, sourceSection: item.sourceSection });
    } catch (error) {
      completenessIssues.push({ kind: 'trigger', key: item.name, table: item.table, sourceSection: item.sourceSection, missing: [`expansion failed: ${error instanceof Error ? error.message : String(error)}`] });
    }
  }
  for (const item of input) if (!bindingByName.has(item.key)) completenessIssues.push({ kind: 'trigger', key: item.key, table: item.table, sourceSection: item.sourceSection, missing: ['missing Core B binding'] });
  if (BINDINGS.length !== 67) completenessIssues.push({ kind: 'source-document', key: 'TriggerCoreB', table: null, sourceSection: '12.3.1', missing: [`expected 67 bindings, got ${BINDINGS.length}`] });
  const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
  completenessIssues.sort((left, right) => compare(`${left.kind}:${left.key}`, `${right.kind}:${right.key}`));
  return {
    sourceDocument: '2026-07-11_G1数据库Schema实施契约.md',
    sourceSections: ['7.1-7.11', '8.1-8.5', '12.3', '12.3.1', '12.4'],
    templates: TEMPLATES,
    bindings: BINDINGS,
    triggers,
    completenessIssues,
  };
}
