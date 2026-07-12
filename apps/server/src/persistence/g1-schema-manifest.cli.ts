import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  G1_SCHEMA_MANIFEST_ARTIFACT_PATH,
  buildG1SchemaManifestFromSources,
  loadCurrentG1SchemaManifestV1,
  loadG1SchemaManifestSourceInput,
} from "./g1-schema-manifest-source.js";
import { assertG1SchemaManifestReady } from "./g1-schema-manifest.js";

const WORKSPACE_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
export const G1_SCHEMA_MANIFEST_OUTPUT_PATH = G1_SCHEMA_MANIFEST_ARTIFACT_PATH;

async function main(): Promise<void> {
  const modes = process.argv.slice(2);
  if (
    modes.length !== 1 ||
    (modes[0] !== "--write" && modes[0] !== "--check")
  ) {
    throw new Error(
      "usage: tsx src/persistence/g1-schema-manifest.cli.ts --write|--check",
    );
  }
  const outputPath = resolve(WORKSPACE_ROOT, G1_SCHEMA_MANIFEST_OUTPUT_PATH);

  if (modes[0] === "--write") {
    const manifest = buildG1SchemaManifestFromSources(
      await loadG1SchemaManifestSourceInput(WORKSPACE_ROOT),
    );
    assertG1SchemaManifestReady(manifest);
    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
    process.stdout.write(
      `G1_SCHEMA_MANIFEST_WRITTEN ${G1_SCHEMA_MANIFEST_OUTPUT_PATH} ${manifest.manifestDigest}\n`,
    );
    return;
  }

  const { manifest } = await loadCurrentG1SchemaManifestV1(WORKSPACE_ROOT);
  process.stdout.write(
    `G1_SCHEMA_MANIFEST_OK ${G1_SCHEMA_MANIFEST_OUTPUT_PATH} ${manifest.manifestDigest}\n`,
  );
}

await main();
