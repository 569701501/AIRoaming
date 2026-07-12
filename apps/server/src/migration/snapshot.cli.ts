import { SnapshotError, SnapshotService } from "./snapshot.service.js";

function required(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new SnapshotError("SNAPSHOT_ARGS_INVALID");
  return value;
}

async function main(): Promise<void> {
  const result = await new SnapshotService().createSnapshot({
    workspaceRoot: required("--workspace-root"),
    stagingRoot: required("--staging-root"),
    runtimeBundle: required("--runtime-bundle"),
  });
  const output = {
    code: "SNAPSHOT_SEALED",
    sourceManifestDigest: result.sourceManifest.manifestDigest,
    snapshotManifestDigest: result.snapshotManifest.manifestDigest,
    runtimeBundleDigest: result.runtimeBundleDigest,
    transformDigest: result.transformDigest,
  };
  if (process.argv.includes("--format") && process.argv[process.argv.indexOf("--format") + 1] === "json") {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } else {
    process.stdout.write("SNAPSHOT_SEALED\n");
  }
}

main().catch((error) => {
  const code = error instanceof SnapshotError ? error.code : "SNAPSHOT_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
