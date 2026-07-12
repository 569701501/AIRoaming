import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkG1PrismaSchemaV1,
  writeG1PrismaSchemaV1,
} from "./g1-prisma-schema.js";

const WORKSPACE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
if (
  process.argv.length !== 3 ||
  (process.argv[2] !== "--write" && process.argv[2] !== "--check")
) {
  process.stderr.write("G1_PRISMA_SCHEMA_CLI_USAGE\n");
  process.exitCode = 1;
} else {
  try {
    const mode = process.argv[2];
    const result =
      mode === "--write"
        ? await writeG1PrismaSchemaV1(WORKSPACE_ROOT)
        : await checkG1PrismaSchemaV1(WORKSPACE_ROOT);
    process.stdout.write(
      `G1_PRISMA_SCHEMA_${mode === "--write" ? "WRITTEN" : "OK"} manifest=${result.manifestDigest}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "G1_PRISMA_SCHEMA_CLI_UNKNOWN_ERROR"}\n`,
    );
    process.exitCode = 1;
  }
}
