import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildG1SchemaModelSource } from "./g1-schema-model-source.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  "文档/04_方案与决策/2026-07-11_G1数据库Schema实施契约.md",
);

describe("G1 Pass 2 model source", () => {
  it("expands only the authoritative contract to 44/556/105/210", async () => {
    const source = buildG1SchemaModelSource(await readFile(CONTRACT_PATH, "utf8"));

    expect(source.completenessIssues).toEqual([]);
    expect(source.modelCount).toBe(44);
    expect(source.scalarFieldCount).toBe(556);
    expect(source.foreignKeyCount).toBe(105);
    expect(source.relationFieldCount).toBe(210);
    expect(source.primaryKeyCount).toBe(44);
    expect(source.uniqueConstraintCount).toBe(70);
    expect(source.indexCount).toBe(60);
    expect(source.models.flatMap((model) => model.fields)).toHaveLength(556);
    expect(source.models.flatMap((model) => model.relationFields)).toHaveLength(210);
  });

  it("keeps closed values atomic and every String field classified once", async () => {
    const source = buildG1SchemaModelSource(await readFile(CONTRACT_PATH, "utf8"));
    const project = source.models.find((model) => model.model === "Project");
    const comicFormat = project?.stringClassification.find(
      (classification) => classification.field === "comicFormat",
    );

    expect(comicFormat).toEqual({
      field: "comicFormat",
      kind: "closed",
      enumName: "ComicFormat",
      closedValues: ["vertical_scroll", "paged_comic"],
    });
    for (const model of source.models) {
      expect(model.stringClassification).toHaveLength(
        model.fields.filter((field) => field.type === "String").length,
      );
      for (const classification of model.stringClassification) {
        if (classification.kind === "closed") {
          expect(classification.closedValues.every((value) => !value.includes("/"))).toBe(true);
        }
      }
    }
  });

  it("emits one local and one opposite navigation for every explicit FK", async () => {
    const source = buildG1SchemaModelSource(await readFile(CONTRACT_PATH, "utf8"));
    const relations = source.models.flatMap((model) =>
      model.relationFields.map((relation) => ({ owner: model.model, ...relation })),
    );

    for (const relation of relations.filter((item) => item.fields.length > 0)) {
      const opposite = relations.filter(
        (item) =>
          item.relationName === relation.relationName &&
          item.owner === relation.oppositeModel &&
          item.oppositeModel === relation.owner &&
          item.fields.length === 0,
      );
      expect(opposite, relation.relationName).toHaveLength(1);
    }
  });

  it("uses exact relation fields, not a unique subset, to infer inverse singularity", async () => {
    const source = buildG1SchemaModelSource(await readFile(CONTRACT_PATH, "utf8"));
    const subsetOnlyRelations: string[] = [];

    for (const model of source.models) {
      for (const relation of model.relationFields.filter(
        (candidate) => candidate.fields.length > 0,
      )) {
        const localColumns = relation.fields.map((fieldName) => {
          const field = model.fields.find((candidate) => candidate.name === fieldName);
          expect(field, `${model.model}.${relation.name}.${fieldName}`).toBeDefined();
          return field!.column;
        });
        const localColumnSet = new Set(localColumns);
        const hasStrictSubsetUnique = model.uniques.some(
          (unique) =>
            unique.columns.length < localColumns.length &&
            unique.columns.every((column) => localColumnSet.has(column)),
        );
        const hasExactUnique = model.uniques.some(
          (unique) =>
            unique.columns.length === localColumns.length &&
            unique.columns.every((column) => localColumnSet.has(column)),
        );
        if (hasStrictSubsetUnique && !hasExactUnique) {
          subsetOnlyRelations.push(`${model.model}.${relation.name}`);
        }
      }
    }

    expect(subsetOnlyRelations).toEqual(["Candidate.asset"]);
    const asset = source.models.find((model) => model.model === "Asset");
    expect(
      asset?.relationFields.find(
        (relation) => relation.relationName === "Candidate_asset_Asset",
      ),
    ).toMatchObject({
      name: "candidatesByAsset",
      type: "Candidate",
      list: true,
      optional: false,
      fields: [],
      references: [],
    });
  });

  it("fails closed if a scalar field disappears from the authority document", async () => {
    const contract = await readFile(CONTRACT_PATH, "utf8");
    const source = buildG1SchemaModelSource(
      contract.replace("comicFormat:String@comic_format\n", ""),
    );

    expect(source.scalarFieldCount).toBe(556 - 1);
    expect(source.completenessIssues.map((issue) => issue.code)).toContain(
      "SCALAR_FIELD_COUNT_MISMATCH",
    );
  });
});
