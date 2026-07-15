import { randomUUID } from "node:crypto";
import {
  lstat,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";

import { loadCurrentG1SchemaManifestV1 } from "./g1-schema-manifest-source.js";

export const G1_PRISMA_MANIFEST_PATH =
  "apps/server/prisma/contracts/g1-schema-manifest.json" as const;

export const G1_PRISMA_SCHEMA_PATH =
  "apps/server/prisma/schema.prisma" as const;

export interface G1PrismaManifestField {
  readonly name: string;
  readonly type: "String" | "Int" | "DateTime" | "Json" | "Boolean" | "Float";
  readonly nullable: boolean;
  readonly default: string | number | boolean | null;
  readonly column: string;
  readonly primaryKey: boolean;
}

export interface G1PrismaManifestRelationField {
  readonly name: string;
  readonly type: string;
  readonly list: boolean;
  readonly optional: boolean;
  readonly relationName: string;
  readonly fields: readonly string[];
  readonly references: readonly string[];
  readonly onDelete: string | null;
  readonly onUpdate: string | null;
}

export interface G1PrismaManifestUnique {
  readonly name: string;
  readonly columns: readonly string[];
}

export interface G1PrismaManifestIndex {
  readonly name: string;
  readonly unique: boolean;
  readonly columns: readonly {
    readonly name: string;
    readonly direction: "ASC" | "DESC";
  }[];
}

export interface G1PrismaManifestForeignKey {
  readonly name: string;
  readonly localColumns: readonly string[];
  readonly targetTable: string;
  readonly targetColumns: readonly string[];
  readonly onDelete: string;
  readonly onUpdate: string;
}

export interface G1PrismaManifestModel {
  readonly model: string;
  readonly table: string;
  readonly migration: string;
  readonly fields: readonly G1PrismaManifestField[];
  readonly relationFields: readonly G1PrismaManifestRelationField[];
  readonly uniques: readonly G1PrismaManifestUnique[];
  readonly indexes: readonly G1PrismaManifestIndex[];
  readonly foreignKeys: readonly G1PrismaManifestForeignKey[];
}

export interface G1PrismaManifest {
  readonly prismaVersion: string;
  readonly counts: {
    readonly models: number;
    readonly scalarFields: number;
    readonly relationFields: number;
    readonly primaryKeys: number;
    readonly uniqueConstraints: number;
    readonly indexes: number;
    readonly foreignKeys: number;
  };
  readonly models: readonly G1PrismaManifestModel[];
}

const PRISMA_HEADER = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}`;

function invariant(condition: unknown, code: string): asserts condition {
  if (!condition) {
    throw new Error(code);
  }
}

function quote(value: string): string {
  return JSON.stringify(value);
}

export function g1PhysicalForeignKeyName(
  localTable: string,
  orderedLocalColumns: readonly string[],
  targetTable: string,
): string {
  invariant(localTable.length > 0, "G1_PRISMA_FK_LOCAL_TABLE_EMPTY");
  invariant(orderedLocalColumns.length > 0, "G1_PRISMA_FK_LOCAL_COLUMNS_EMPTY");
  invariant(targetTable.length > 0, "G1_PRISMA_FK_TARGET_TABLE_EMPTY");
  return `fk_${localTable}_${orderedLocalColumns.join("_")}__${targetTable}`;
}

function renderDefault(field: G1PrismaManifestField): string[] {
  const value = field.default;
  if (value === null) return [];
  if (value === "@updatedAt") return ["@updatedAt"];
  if (value === "uuid()" || value === "now()") {
    return [`@default(${value})`];
  }
  if (typeof value === "string") {
    return [`@default(${quote(value)})`];
  }
  return [`@default(${String(value)})`];
}

function fieldNameForColumn(
  model: G1PrismaManifestModel,
  column: string,
): string {
  const field = model.fields.find((candidate) => candidate.column === column);
  invariant(field !== undefined, `G1_PRISMA_UNKNOWN_COLUMN:${model.model}:${column}`);
  return field.name;
}

function renderScalarField(field: G1PrismaManifestField): string {
  const attributes: string[] = [];
  if (field.primaryKey) attributes.push("@id");
  attributes.push(...renderDefault(field));
  if (field.column !== field.name) {
    attributes.push(`@map(${quote(field.column)})`);
  }
  const type = `${field.type}${field.nullable ? "?" : ""}`;
  return `  ${field.name} ${type}${attributes.length > 0 ? ` ${attributes.join(" ")}` : ""}`;
}

function matchingForeignKey(
  manifest: G1PrismaManifest,
  model: G1PrismaManifestModel,
  relation: G1PrismaManifestRelationField,
): G1PrismaManifestForeignKey {
  const target = manifest.models.find(
    (candidate) => candidate.model === relation.type,
  );
  invariant(
    target !== undefined,
    `G1_PRISMA_UNKNOWN_RELATION_TARGET:${model.model}:${relation.name}`,
  );
  const localColumns = relation.fields.map((name) => {
    const field = model.fields.find((candidate) => candidate.name === name);
    invariant(
      field !== undefined,
      `G1_PRISMA_UNKNOWN_RELATION_FIELD:${model.model}:${relation.name}:${name}`,
    );
    return field.column;
  });
  const targetColumns = relation.references.map((name) => {
    const field = target.fields.find((candidate) => candidate.name === name);
    invariant(
      field !== undefined,
      `G1_PRISMA_UNKNOWN_RELATION_REFERENCE:${model.model}:${relation.name}:${name}`,
    );
    return field.column;
  });
  const matches = model.foreignKeys.filter(
    (foreignKey) =>
      foreignKey.targetTable === target.table &&
      JSON.stringify(foreignKey.localColumns) === JSON.stringify(localColumns) &&
      JSON.stringify(foreignKey.targetColumns) === JSON.stringify(targetColumns) &&
      foreignKey.onDelete === relation.onDelete &&
      foreignKey.onUpdate === relation.onUpdate,
  );
  invariant(
    matches.length === 1,
    `G1_PRISMA_RELATION_FK_NOT_EXACT:${model.model}:${relation.name}:${matches.length}`,
  );
  return matches[0];
}

export function assertG1PrismaForeignKeyContract(
  manifest: G1PrismaManifest,
): void {
  const consumed = new Map<G1PrismaManifestForeignKey, number>();
  const physicalNames = new Set<string>();

  for (const model of manifest.models) {
    for (const foreignKey of model.foreignKeys) {
      const expectedName = g1PhysicalForeignKeyName(
        model.table,
        foreignKey.localColumns,
        foreignKey.targetTable,
      );
      invariant(
        foreignKey.name === expectedName,
        `G1_PRISMA_FK_NAME_NOT_EXACT:${model.model}:${foreignKey.name}:${expectedName}`,
      );
      invariant(
        !physicalNames.has(foreignKey.name),
        `G1_PRISMA_FK_NAME_DUPLICATE:${foreignKey.name}`,
      );
      physicalNames.add(foreignKey.name);
      consumed.set(foreignKey, 0);
    }
  }

  for (const model of manifest.models) {
    for (const relation of model.relationFields) {
      if (relation.fields.length === 0) continue;
      const foreignKey = matchingForeignKey(manifest, model, relation);
      consumed.set(foreignKey, (consumed.get(foreignKey) ?? 0) + 1);
    }
  }

  for (const model of manifest.models) {
    for (const foreignKey of model.foreignKeys) {
      const count = consumed.get(foreignKey) ?? 0;
      invariant(
        count === 1,
        count === 0
          ? `G1_PRISMA_FK_UNCONSUMED:${model.model}:${foreignKey.name}`
          : `G1_PRISMA_FK_CONSUMED_MULTIPLE:${model.model}:${foreignKey.name}:${count}`,
      );
    }
  }
}

function renderRelationField(
  manifest: G1PrismaManifest,
  model: G1PrismaManifestModel,
  relation: G1PrismaManifestRelationField,
): string {
  const type = relation.list
    ? `${relation.type}[]`
    : `${relation.type}${relation.optional ? "?" : ""}`;
  const arguments_: string[] = [quote(relation.relationName)];
  if (relation.fields.length > 0) {
    // SQLite's Prisma connector rejects named relation foreign keys. Match the
    // signed physical FK exactly here, then render its name only in migration SQL.
    matchingForeignKey(manifest, model, relation);
    arguments_.push(`fields: [${relation.fields.join(", ")}]`);
    arguments_.push(`references: [${relation.references.join(", ")}]`);
    arguments_.push(`onDelete: ${relation.onDelete}`);
    arguments_.push(`onUpdate: ${relation.onUpdate}`);
  } else {
    invariant(
      relation.references.length === 0 &&
        relation.onDelete === null &&
        relation.onUpdate === null,
      `G1_PRISMA_REVERSE_RELATION_SHAPE:${model.model}:${relation.name}`,
    );
  }
  return `  ${relation.name} ${type} @relation(${arguments_.join(", ")})`;
}

function renderModel(
  manifest: G1PrismaManifest,
  model: G1PrismaManifestModel,
): string {
  const primaryKeys = model.fields.filter((field) => field.primaryKey);
  invariant(
    primaryKeys.length === 1,
    `G1_PRISMA_MODEL_PRIMARY_KEY_COUNT:${model.model}:${primaryKeys.length}`,
  );
  const lines = [
    `model ${model.model} {`,
    ...model.fields.map(renderScalarField),
    "",
    ...model.relationFields.map((relation) =>
      renderRelationField(manifest, model, relation),
    ),
  ];
  if (model.relationFields.length > 0) lines.push("");
  for (const unique of model.uniques) {
    const fields = unique.columns.map((column) => fieldNameForColumn(model, column));
    lines.push(`  @@unique([${fields.join(", ")}], map: ${quote(unique.name)})`);
  }
  for (const index of model.indexes) {
    invariant(!index.unique, `G1_PRISMA_UNEXPECTED_UNIQUE_INDEX:${index.name}`);
    const fields = index.columns.map((column) => {
      const name = fieldNameForColumn(model, column.name);
      const direction = column.direction === "DESC" ? "Desc" : "Asc";
      return `${name}(sort: ${direction})`;
    });
    lines.push(`  @@index([${fields.join(", ")}], map: ${quote(index.name)})`);
  }
  lines.push(`  @@map(${quote(model.table)})`);
  lines.push("}");
  return lines.join("\n");
}

export function assertG1PrismaManifestCounts(
  manifest: G1PrismaManifest,
): void {
  const actual = {
    models: manifest.models.length,
    scalarFields: manifest.models.reduce((sum, model) => sum + model.fields.length, 0),
    relationFields: manifest.models.reduce(
      (sum, model) => sum + model.relationFields.length,
      0,
    ),
    primaryKeys: manifest.models.reduce(
      (sum, model) => sum + model.fields.filter((field) => field.primaryKey).length,
      0,
    ),
    uniqueConstraints: manifest.models.reduce(
      (sum, model) => sum + model.uniques.length,
      0,
    ),
    indexes: manifest.models.reduce((sum, model) => sum + model.indexes.length, 0),
    foreignKeys: manifest.models.reduce(
      (sum, model) => sum + model.foreignKeys.length,
      0,
    ),
  };
  for (const [key, value] of Object.entries(actual)) {
    invariant(
      value === manifest.counts[key as keyof typeof actual],
      `G1_PRISMA_MANIFEST_COUNT_MISMATCH:${key}:${value}`,
    );
  }
  invariant(actual.models === 44, `G1_PRISMA_EXPECTED_44_MODELS:${actual.models}`);
  invariant(
    actual.scalarFields === 556,
    `G1_PRISMA_EXPECTED_556_SCALARS:${actual.scalarFields}`,
  );
  invariant(
    actual.relationFields === actual.foreignKeys * 2,
    `G1_PRISMA_RELATION_PAIR_MISMATCH:${actual.relationFields}:${actual.foreignKeys}`,
  );
}

export function buildG1PrismaSchema(manifest: G1PrismaManifest): string {
  invariant(
    manifest.prismaVersion === "6.19.3",
    `G1_PRISMA_VERSION_MISMATCH:${manifest.prismaVersion}`,
  );
  assertG1PrismaManifestCounts(manifest);
  assertG1PrismaForeignKeyContract(manifest);
  const modelNames = new Set(manifest.models.map((model) => model.model));
  const tableNames = new Set(manifest.models.map((model) => model.table));
  invariant(modelNames.size === 44, "G1_PRISMA_DUPLICATE_MODEL");
  invariant(tableNames.size === 44, "G1_PRISMA_DUPLICATE_TABLE");
  return `${PRISMA_HEADER}\n\n${manifest.models
    .map((model) => renderModel(manifest, model))
    .join("\n\n")}\n`;
}

export function assertG1PrismaSchemaMatchesManifestV1(
  manifest: G1PrismaManifest,
  schema: string,
): string {
  const expected = buildG1PrismaSchema(manifest);
  invariant(schema === expected, "G1_PRISMA_SCHEMA_NOT_CURRENT");
  return expected;
}

function prismaModelBlock(schema: string, modelName: string): string {
  const escaped = modelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = schema.match(new RegExp(`^model\\s+${escaped}\\s*\\{([\\s\\S]*?)^\\}`, "m"));
  invariant(match !== null, `G1_PRISMA_BASE_MODEL_MISSING:${modelName}`);
  return match[1] ?? "";
}

function normalizedPrismaLines(block: string): string[] {
  return block.split("\n").map((line) => line.trim().replace(/\s+/g, " ")).filter(Boolean);
}

/**
 * Forward migrations after the frozen G1 baseline may append models, fields,
 * relations and indexes. Every original G1 line must still be present exactly;
 * additions are governed by their own small migration contracts.
 */
export function assertG1PrismaSchemaEmbeddedV1(
  manifest: G1PrismaManifest,
  schema: string,
): string {
  const expected = buildG1PrismaSchema(manifest);
  invariant(schema.startsWith(`${PRISMA_HEADER}\n`), "G1_PRISMA_HEADER_NOT_CURRENT");
  for (const model of manifest.models) {
    const expectedLines = normalizedPrismaLines(prismaModelBlock(expected, model.model));
    const actualLines = new Set(normalizedPrismaLines(prismaModelBlock(schema, model.model)));
    for (const line of expectedLines) {
      invariant(actualLines.has(line), `G1_PRISMA_BASE_LINE_MISSING:${model.model}:${line}`);
    }
  }
  return schema;
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function assertExactSchemaStage(
  stagePath: string,
  expectedSchema: string,
): Promise<void> {
  const pathFacts = await lstat(stagePath, { bigint: true });
  invariant(
    pathFacts.isFile() && !pathFacts.isSymbolicLink() && pathFacts.nlink === 1n,
    "G1_PRISMA_SCHEMA_STAGE_INVALID",
  );
  const handle = await open(stagePath, "r");
  try {
    const before = await handle.stat({ bigint: true });
    const bytes = await handle.readFile("utf8");
    const after = await handle.stat({ bigint: true });
    const pathAfter = await lstat(stagePath, { bigint: true });
    invariant(
      before.isFile() &&
        before.nlink === 1n &&
        before.dev === pathFacts.dev &&
        before.ino === pathFacts.ino &&
        after.dev === before.dev &&
        after.ino === before.ino &&
        after.size === before.size &&
        after.mtimeNs === before.mtimeNs &&
        after.nlink === 1n &&
        pathAfter.dev === before.dev &&
        pathAfter.ino === before.ino &&
        pathAfter.size === before.size &&
        pathAfter.mtimeNs === before.mtimeNs &&
        pathAfter.nlink === 1n &&
        bytes === expectedSchema,
      "G1_PRISMA_SCHEMA_STAGE_CHANGED",
    );
  } finally {
    await handle.close();
  }
}

async function loadAuthorizedExpected(workspaceRoot: string): Promise<{
  readonly manifest: G1PrismaManifest & { readonly manifestDigest: string };
  readonly expectedSchema: string;
}> {
  const current = await loadCurrentG1SchemaManifestV1(workspaceRoot);
  const manifest = current.manifest as G1PrismaManifest & {
    readonly manifestDigest: string;
  };
  return { manifest, expectedSchema: buildG1PrismaSchema(manifest) };
}

export async function checkG1PrismaSchemaV1(
  workspaceRoot: string,
): Promise<{
  readonly manifestDigest: string;
  readonly schema: string;
}> {
  const canonicalRoot = await realpath(path.resolve(workspaceRoot));
  const state = await loadAuthorizedExpected(canonicalRoot);
  const currentSchema = await readFile(
    path.join(canonicalRoot, G1_PRISMA_SCHEMA_PATH),
    "utf8",
  );
  assertG1PrismaSchemaEmbeddedV1(state.manifest, currentSchema);
  return {
    manifestDigest: state.manifest.manifestDigest,
    schema: currentSchema,
  };
}

export async function writeG1PrismaSchemaV1(
  workspaceRoot: string,
): Promise<{
  readonly manifestDigest: string;
  readonly schema: string;
}> {
  const canonicalRoot = await realpath(path.resolve(workspaceRoot));
  const first = await loadAuthorizedExpected(canonicalRoot);

  const currentSchema = await readFile(
    path.join(canonicalRoot, G1_PRISMA_SCHEMA_PATH),
    "utf8",
  );
  assertG1PrismaSchemaEmbeddedV1(first.manifest, currentSchema);
  if (currentSchema !== first.expectedSchema) {
    return { manifestDigest: first.manifest.manifestDigest, schema: currentSchema };
  }

  const prismaRoot = path.join(canonicalRoot, "apps/server/prisma");
  const schemaPath = path.join(canonicalRoot, G1_PRISMA_SCHEMA_PATH);
  const stagePath = path.join(
    prismaRoot,
    `.g1-schema-stage-${randomUUID()}`,
  );
  let renamed = false;
  try {
    const handle = await open(stagePath, "wx", 0o600);
    try {
      await handle.writeFile(first.expectedSchema, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    const final = await loadAuthorizedExpected(canonicalRoot);
    invariant(
      final.manifest.manifestDigest === first.manifest.manifestDigest &&
        final.expectedSchema === first.expectedSchema,
      "G1_PRISMA_SCHEMA_INPUTS_CHANGED_DURING_WRITE",
    );
    await assertExactSchemaStage(stagePath, first.expectedSchema);
    await rename(stagePath, schemaPath);
    renamed = true;
    await syncDirectory(prismaRoot);
    return {
      manifestDigest: first.manifest.manifestDigest,
      schema: first.expectedSchema,
    };
  } finally {
    if (!renamed) {
      try {
        await unlink(stagePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}
