import { lstat, readFile } from "node:fs/promises";
import * as path from "node:path";
import { digestCanonicalJson } from "@airoaming/shared";
import type { CutoverPlanV1 } from "./cutover-plan.types.js";

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PATH_KEYS = ["releaseRoot", "sourceWorkspaceRoot", "targetDataRoot", "targetWorkspaceRoot", "snapshotRoot", "decisionsPath", "finalReportPath", "maintenanceTokenFile", "runtimeBundlePath", "backupRoot", "restoreDataRoot", "restoreWorkspaceRoot", "archiveRoot", "evidenceRoot", "shadowGatePath"] as const;

export class CutoverPlanError extends Error { constructor(readonly code: string) { super(code); } }

function absolute(value: unknown): string {
  if (typeof value !== "string" || !path.isAbsolute(value) || value.includes("\0")) throw new CutoverPlanError("CUTOVER_PLAN_PATH_INVALID");
  return path.resolve(value);
}

function digestPlan(plan: Omit<CutoverPlanV1, "planDigest">): `sha256:${string}` {
  return digestCanonicalJson(plan) as `sha256:${string}`;
}

export class CutoverPlanService {
  async readAndVerify(filePath: string): Promise<CutoverPlanV1> {
    const planPath = absolute(filePath);
    const stat = await lstat(planPath).catch(() => null);
    if (!stat || stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o077) !== 0) throw new CutoverPlanError("CUTOVER_PLAN_FILE_INVALID");
    let raw: unknown;
    try { raw = JSON.parse(await readFile(planPath, "utf8")); } catch { throw new CutoverPlanError("CUTOVER_PLAN_INVALID"); }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CutoverPlanError("CUTOVER_PLAN_INVALID");
    const plan = raw as Partial<CutoverPlanV1>;
    if (plan.schemaVersion !== 1 || plan.kind !== "airoaming_cutover_plan_v1" || !plan.cutoverId?.trim() || !plan.appCommit?.trim() || !plan.runId?.trim()) throw new CutoverPlanError("CUTOVER_PLAN_INVALID");
    if (!DIGEST.test(String(plan.effectiveSchemaManifestDigest)) || !DIGEST.test(String(plan.planDigest))) throw new CutoverPlanError("CUTOVER_PLAN_INVALID");
    if (!String(plan.targetDatabaseUrl).startsWith("file:") || !path.isAbsolute(String(plan.targetDatabaseUrl).slice(5))) throw new CutoverPlanError("CUTOVER_PLAN_INVALID");
    for (const key of PATH_KEYS) if (plan[key] !== undefined) absolute(plan[key]);
    if (!/^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(String(plan.maintenanceBaseUrl))) throw new CutoverPlanError("CUTOVER_PLAN_MAINTENANCE_URL_INVALID");
    if (plan.settingsStartState !== "already_sanitized" && plan.settingsStartState !== "legacy_plaintext_requires_two_phase") throw new CutoverPlanError("CUTOVER_PLAN_INVALID");
    if (plan.credentialAction !== "verify_existing" && plan.credentialAction !== "prestage_legacy") throw new CutoverPlanError("CUTOVER_PLAN_INVALID");
    const { planDigest: supplied, ...unsigned } = plan as CutoverPlanV1;
    if (digestPlan(unsigned) !== supplied) throw new CutoverPlanError("CUTOVER_PLAN_DIGEST_MISMATCH");
    const roots = PATH_KEYS.filter((key) => plan[key] !== undefined).map((key) => absolute(plan[key]));
    for (let i = 0; i < roots.length; i += 1) for (let j = i + 1; j < roots.length; j += 1) {
      if (roots[i] === roots[j] || roots[i].startsWith(`${roots[j]}${path.sep}`) || roots[j].startsWith(`${roots[i]}${path.sep}`)) throw new CutoverPlanError("CUTOVER_PLAN_ROOT_OVERLAP");
    }
    const databasePath = path.resolve(String(plan.targetDatabaseUrl).slice("file:".length));
    const dataRoot = path.resolve(String(plan.targetDataRoot));
    if (databasePath === dataRoot || !databasePath.startsWith(`${dataRoot}${path.sep}`)) throw new CutoverPlanError("CUTOVER_PLAN_DATABASE_ROOT_OVERLAP");
    return plan as CutoverPlanV1;
  }
}
