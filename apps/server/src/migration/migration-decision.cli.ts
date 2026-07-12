import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import * as path from "node:path";
import { normalizeMigrationDecisionArtifact } from "./migration-decision.js";
import type { Digest } from "./migration-issue.js";

function required(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error("MIGRATION_DECISION_ARGS_INVALID");
  return value;
}

async function main(): Promise<void> {
  const snapshot = path.resolve(required("--snapshot"));
  const inputPath = path.resolve(required("--input"));
  const outputPath = path.resolve(required("--output"));
  const format = process.argv.includes("--format") ? process.argv[process.argv.indexOf("--format") + 1] : undefined;
  if (format !== undefined && format !== "json") throw new Error("MIGRATION_DECISION_ARGS_INVALID");

  const sealed = JSON.parse(await readFile(path.join(snapshot, "SEALED"), "utf8")) as { kind?: string; sourceManifestDigest?: Digest };
  if (sealed.kind !== "airoaming_snapshot_sealed_v1" || typeof sealed.sourceManifestDigest !== "string") throw new Error("MIGRATION_SNAPSHOT_NOT_SEALED");
  const input = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const artifact = normalizeMigrationDecisionArtifact(input, sealed.sourceManifestDigest);
  await writePrivateJson(outputPath, artifact);
  process.stdout.write(`${JSON.stringify({ code: "MIGRATION_DECISIONS_OK", decisionsDigest: artifact.decisionsDigest })}\n`);
}

async function writePrivateJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, filePath);
  try { await unlink(temporary); } catch { /* rename completed */ }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "MIGRATION_DECISION_FAILED"}\n`);
  process.exitCode = 1;
});

