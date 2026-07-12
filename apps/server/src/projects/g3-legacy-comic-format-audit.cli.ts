import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { readLegacyProjectComicFormatV1 } from "./legacy-project-comic-format.js";
import { readJsonFormat } from "../cli-format.js";

interface AuditSummary {
  schemaVersion: 1;
  policyVersion: "g3-file-comic-format-read-v1";
  counts: {
    canonical: number;
    autoMappedReadOnly: number;
    decisionRequired: number;
  };
  issues: Array<{
    projectId: string;
    reason: "FOUR_PANEL" | "MISSING" | "INVALID";
    safeValueKind: string;
  }>;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<number> {
  const workspaceRoot = arg("--workspace-root");
  try {
    readJsonFormat(process.argv, () => new Error("G3_LEGACY_AUDIT_ARGS_INVALID"));
  } catch {
    process.stderr.write("G3_LEGACY_AUDIT_ARGS_INVALID\n");
    return 1;
  }
  if (!workspaceRoot) {
    process.stderr.write("G3_LEGACY_AUDIT_ARGS_INVALID\n");
    return 1;
  }
  const projectsRoot = path.join(path.resolve(workspaceRoot), "projects");
  const summary: AuditSummary = {
    schemaVersion: 1,
    policyVersion: "g3-file-comic-format-read-v1",
    counts: { canonical: 0, autoMappedReadOnly: 0, decisionRequired: 0 },
    issues: [],
  };
  let entries;
  try {
    entries = await readdir(projectsRoot, { withFileTypes: true });
  } catch {
    process.stderr.write("G3_LEGACY_AUDIT_IO_ERROR\n");
    return 1;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectId = entry.name;
    let metadata: unknown;
    try {
      metadata = JSON.parse(
        await readFile(path.join(projectsRoot, projectId, "project.json"), "utf8"),
      );
    } catch {
      process.stderr.write("G3_LEGACY_AUDIT_PROJECT_READ_ERROR:" + projectId + "\n");
      return 1;
    }
    const value =
      typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
        ? (metadata as Record<string, unknown>).comicFormat
        : undefined;
    const result = readLegacyProjectComicFormatV1(value);
    if (result.status === "canonical") summary.counts.canonical += 1;
    else if (result.status === "auto_mapped_read_only") summary.counts.autoMappedReadOnly += 1;
    else {
      summary.counts.decisionRequired += 1;
      if (summary.issues.length < 100) {
        summary.issues.push({
          projectId,
          reason: result.reason,
          safeValueKind: result.safeValueKind,
        });
      }
    }
  }
  process.stdout.write(JSON.stringify(summary) + "\n");
  return summary.counts.decisionRequired > 0 ? 2 : 0;
}

process.exitCode = await main();
