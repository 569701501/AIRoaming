import { readFile } from "node:fs/promises";

export interface G1SchemaContractInspection {
  models: string[];
  modelFields: Record<string, string[]>;
  prismaVersion: string | null;
  prismaClientVersion: string | null;
}

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function inspectG1SchemaContract(input: {
  schemaPath: string;
  packageJsonPath: string;
}): Promise<G1SchemaContractInspection> {
  const [schema, packageJson] = await Promise.all([
    readFile(input.schemaPath, "utf8"),
    readFile(input.packageJsonPath, "utf8"),
  ]);
  const manifest = JSON.parse(packageJson) as PackageManifest;
  const modelEntries = [...schema.matchAll(/^model\s+([A-Za-z][A-Za-z0-9_]*)\s*\{([\s\S]*?)^\}/gm)]
    .map((match) => {
      const [, name, body] = match;
      const fields = [...body.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*)\s+/gm)]
        .map((fieldMatch) => fieldMatch[1])
        .filter((field) => !field.startsWith("@@"))
        .sort();
      return [name, fields] as const;
    });
  const models = modelEntries.map(([name]) => name).sort();

  return {
    models,
    modelFields: Object.fromEntries(modelEntries),
    prismaVersion: manifest.devDependencies?.prisma ?? null,
    prismaClientVersion: manifest.dependencies?.["@prisma/client"] ?? null,
  };
}
