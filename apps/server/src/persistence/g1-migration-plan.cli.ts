import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkG1MigrationArtifactTreeV1,
  writeG1MigrationPlanV1,
} from "./g1-migration-plan.js";

const WORKSPACE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);

if (
  process.argv.length !== 3 ||
  (process.argv[2] !== "--write" && process.argv[2] !== "--check")
) {
  process.stderr.write("G1_MIGRATION_CLI_USAGE\n");
  process.exitCode = 1;
} else {
  try {
    const mode = process.argv[2];
    const plan =
      mode === "--write"
        ? await writeG1MigrationPlanV1(WORKSPACE_ROOT)
        : await checkG1MigrationArtifactTreeV1(WORKSPACE_ROOT);
    process.stdout.write(
      `G1_MIGRATIONS_${mode === "--write" ? "WRITTEN" : "OK"} manifest=${plan.manifestDigest} migrations=${plan.counts.migrations} checks=${plan.counts.checks} triggers=${plan.counts.triggers}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "G1_MIGRATION_CLI_UNKNOWN_ERROR"}\n`,
    );
    process.exitCode = 1;
  }
}
