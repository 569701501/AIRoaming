import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  assertG1PrismaManifestCounts,
  assertG1PrismaForeignKeyContract,
  assertG1PrismaSchemaEmbeddedV1,
  assertG1PrismaSchemaMatchesManifestV1,
  buildG1PrismaSchema,
  checkG1PrismaSchemaV1,
  g1PhysicalForeignKeyName,
  writeG1PrismaSchemaV1,
  type G1PrismaManifest,
} from "./g1-prisma-schema.js";

const SERVER_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const REPO_ROOT = path.resolve(SERVER_ROOT, "../..");

async function runSchemaCli(argument: "--check" | "--write"): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "apps/server/src/persistence/g1-prisma-schema.cli.ts",
        argument,
      ],
      { cwd: REPO_ROOT, env: { ...process.env } },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function loadInputs(): Promise<{
  manifest: G1PrismaManifest;
  schema: string;
}> {
  const [manifestSource, schema] = await Promise.all([
    readFile(
      path.join(SERVER_ROOT, "prisma/contracts/g1-schema-manifest.json"),
      "utf8",
    ),
    readFile(path.join(SERVER_ROOT, "prisma/schema.prisma"), "utf8"),
  ]);
  return {
    manifest: JSON.parse(manifestSource) as G1PrismaManifest,
    schema,
  };
}

describe("SCH-00 exact manifest to Prisma contract", () => {
  it("refuses count drift before rendering the accepted manifest", async () => {
    const { manifest } = await loadInputs();
    expect(() => assertG1PrismaManifestCounts(manifest)).not.toThrow();
    expect(manifest.counts).toMatchObject({
      models: 44,
      scalarFields: 556,
      relationFields: 210,
      primaryKeys: 44,
      uniqueConstraints: 70,
      indexes: 60,
      foreignKeys: 105,
    });
  });

  it("matches the deterministic field, mapping, relation, action and index rendering", async () => {
    const { manifest, schema } = await loadInputs();
    expect(() => assertG1PrismaSchemaEmbeddedV1(manifest, schema)).not.toThrow();
    expect(schema).not.toBe(buildG1PrismaSchema(manifest));
    expect(schema).toMatch(
      /candidatesByAsset\s+Candidate\[\]\s+@relation\("Candidate_asset_Asset"\)/,
    );
    expect(schema).not.toMatch(/@relation\([^\n]*\bmap:/);
    expect(() =>
      assertG1PrismaSchemaMatchesManifestV1(
        manifest,
        `${schema}\n// unsigned mutation\n`,
      ),
    ).toThrow(/G1_PRISMA_SCHEMA_NOT_CURRENT/);
  });

  it("consumes all 105 FK contracts exactly once with formula-derived physical names", async () => {
    const { manifest } = await loadInputs();
    expect(() => assertG1PrismaForeignKeyContract(manifest)).not.toThrow();

    const names = new Set<string>();
    let foreignKeyCount = 0;
    for (const model of manifest.models) {
      for (const foreignKey of model.foreignKeys) {
        expect(foreignKey.name).toBe(
          g1PhysicalForeignKeyName(
            model.table,
            foreignKey.localColumns,
            foreignKey.targetTable,
          ),
        );
        expect(names.has(foreignKey.name), foreignKey.name).toBe(false);
        names.add(foreignKey.name);
        foreignKeyCount += 1;
      }
    }
    expect(foreignKeyCount).toBe(105);
    expect(names.size).toBe(105);
  });

  it("fails closed on Candidate→Asset FK name, local/ref/action, duplicate and unconsumed mutations", async () => {
    const { manifest } = await loadInputs();
    const mutateCandidateAsset = (
      mutate: (candidate: any, asset: any, foreignKey: any) => void,
    ): G1PrismaManifest => {
      const changed = structuredClone(manifest) as any;
      const candidate = changed.models.find((model: any) => model.model === "Candidate");
      const asset = changed.models.find((model: any) => model.model === "Asset");
      const foreignKey = candidate.foreignKeys.find(
        (item: any) => item.targetTable === "assets",
      );
      mutate(candidate, asset, foreignKey);
      return changed as G1PrismaManifest;
    };

    for (const name of ["fk_wrong_but_nonempty", ""]) {
      expect(() =>
        assertG1PrismaForeignKeyContract(
          mutateCandidateAsset((_candidate, _asset, foreignKey) => {
            foreignKey.name = name;
          }),
        ),
      ).toThrow(/G1_PRISMA_FK_NAME_NOT_EXACT:Candidate/);
    }

    const exactMutations = [
      (foreignKey: any) => foreignKey.localColumns.reverse(),
      (foreignKey: any) => foreignKey.targetColumns.reverse(),
      (foreignKey: any) => {
        foreignKey.onDelete = "Cascade";
      },
      (foreignKey: any) => {
        foreignKey.onUpdate = "Cascade";
      },
    ];
    for (const mutate of exactMutations) {
      expect(() =>
        assertG1PrismaForeignKeyContract(
          mutateCandidateAsset((_candidate, _asset, foreignKey) =>
            mutate(foreignKey),
          ),
        ),
      ).toThrow(/G1_PRISMA_(?:FK_NAME_NOT_EXACT|RELATION_FK_NOT_EXACT):Candidate/);
    }

    expect(() =>
      assertG1PrismaForeignKeyContract(
        mutateCandidateAsset((candidate, _asset, foreignKey) => {
          candidate.foreignKeys.push(structuredClone(foreignKey));
        }),
      ),
    ).toThrow(/G1_PRISMA_FK_NAME_DUPLICATE/);

    expect(() =>
      assertG1PrismaForeignKeyContract(
        mutateCandidateAsset((candidate) => {
          candidate.relationFields = candidate.relationFields.filter(
            (relation: any) => relation.name !== "asset",
          );
        }),
      ),
    ).toThrow(/G1_PRISMA_FK_UNCONSUMED:Candidate/);
  });

  it("allows an idempotent atomic write only from the directly verified current manifest", async () => {
    const schemaPath = path.join(SERVER_ROOT, "prisma/schema.prisma");
    const before = await readFile(schemaPath, "utf8");
    await expect(checkG1PrismaSchemaV1(REPO_ROOT)).resolves.toMatchObject({
      schema: before,
    });
    await expect(writeG1PrismaSchemaV1(REPO_ROOT)).resolves.toMatchObject({
      schema: before,
    });
    const cli = await runSchemaCli("--write");
    expect(cli.code, cli.stderr).toBe(0);
    expect(cli.stdout).toContain("G1_PRISMA_SCHEMA_WRITTEN");
    expect(cli.stderr).toBe("");
    expect(await readFile(schemaPath, "utf8")).toBe(before);
    expect(
      (await readdir(path.join(SERVER_ROOT, "prisma"))).filter((entry) =>
        entry.startsWith(".g1-schema-stage-"),
      ),
    ).toEqual([]);
  });
});
