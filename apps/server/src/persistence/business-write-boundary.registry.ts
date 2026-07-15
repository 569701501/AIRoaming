export interface BusinessWriteOwner {
  owner: string;
  source: string;
  boundary: "runBusinessTransaction";
  evidence: readonly string[];
}

/**
 * A1-3 mutation inventory.  This is intentionally data-only: it documents
 * the owner of each production business write family without creating a
 * second transaction implementation or an approval mechanism.
 */
export const BUSINESS_WRITE_OWNERS: readonly BusinessWriteOwner[] = [
  { owner: "project-repository", source: "projects/project-repository.service.ts", boundary: "runBusinessTransaction", evidence: ["M6A1-TX-03", "M6A1-TX-05"] },
  { owner: "project-script-command", source: "projects/project-script-command.repository.ts", boundary: "runBusinessTransaction", evidence: ["M6A1-TX-03", "M6A1-TX-06"] },
  { owner: "versioning", source: "projects/versioning/version-transaction-runner.service.ts", boundary: "runBusinessTransaction", evidence: ["M6A1-TX-01", "M6A1-TX-04"] },
  { owner: "persistent-task-repository", source: "tasks/persistent-task.repository.ts", boundary: "runBusinessTransaction", evidence: ["M6A1-TX-03", "M6A1-TX-07"] },
  { owner: "persistent-task-worker", source: "projects/persistent-task-worker.service.ts", boundary: "runBusinessTransaction", evidence: ["M6A1-TX-03", "M6A1-TX-05"] },
  { owner: "settings", source: "settings/settings.service.ts", boundary: "runBusinessTransaction", evidence: ["M6A1-TX-03", "SEC-10"] },
  { owner: "dialogue", source: "dialogue/dialogue.service.ts", boundary: "runBusinessTransaction", evidence: ["M6A1-TX-03", "M6A1-TX-06"] },
  { owner: "candidate-lock", source: "projects/candidate-lock.repository.ts", boundary: "runBusinessTransaction", evidence: ["G4-C", "M6A1-TX-05"] },
  { owner: "character-reference", source: "projects/character-reference.service.ts", boundary: "runBusinessTransaction", evidence: ["M6A1-TX-03", "M6A1-TX-06"] },
  { owner: "layout-working-copy", source: "projects/layout-working-copy.service.ts", boundary: "runBusinessTransaction", evidence: ["M6A1-TX-03", "G5-M4"] },
  { owner: "layout-publication", source: "projects/layout-publication.service.ts", boundary: "runBusinessTransaction", evidence: ["G5-M7"] },
  { owner: "asset-package", source: "projects/asset-package.service.ts", boundary: "runBusinessTransaction", evidence: ["M6A1-TX-03", "M6A1-TX-05"] },
  { owner: "project-delete-outbox", source: "projects/project-delete-outbox.service.ts", boundary: "runBusinessTransaction", evidence: ["M6A1-TX-03", "M6A1-TX-07"] },
] as const;

export const BUSINESS_WRITE_SYSTEM_ALLOWLIST = [
  "migration",
  "backup",
  "activate",
  "test-bootstrap",
] as const;
