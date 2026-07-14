import { lstat, readdir } from "node:fs/promises";
import * as path from "node:path";
import { digestCanonicalJson } from "@airoaming/shared";
import { getBlockedDbCapabilities } from "./db-capability-registry.js";
import { CutoverEvidenceStore, CUTOVER_EVIDENCE_STEPS, type CutoverEvidenceStep, type CutoverCompletionSeal } from "./cutover-evidence.service.js";
import { CutoverPlanService } from "./cutover-plan.service.js";
import type { CutoverPlanV1 } from "./cutover-plan.types.js";
import { loadReleaseSchemaIdentityV1 } from "../persistence/release-schema-identity.js";

export class DbCutoverError extends Error { constructor(readonly code: string) { super(code); } }
export interface CutoverActionContext { plan: CutoverPlanV1; step: CutoverEvidenceStep; }
export type CutoverAction = (context: CutoverActionContext) => Promise<{ artifactDigests?: Record<string, `sha256:${string}`>; summaryCode: string; completion?: CutoverCompletionSeal }>;

function digest(value: unknown): `sha256:${string}` { return digestCanonicalJson(value) as `sha256:${string}`; }

async function assertNoSymlinkAncestors(targetPath: string): Promise<void> {
  let current = path.resolve(targetPath);
  while (true) {
    const metadata = await lstat(current).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw error;
    });
    if (metadata?.isSymbolicLink() && current !== "/var" && current !== "/tmp") throw new DbCutoverError("CUTOVER_PLAN_ROOT_UNSAFE");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

export class DbCutoverService {
  constructor(private readonly plans = new CutoverPlanService()) {}

  async readPlan(planPath: string): Promise<CutoverPlanV1> { return this.plans.readAndVerify(planPath); }

  async status(planPath: string, evidenceRoot: string): Promise<{ plan: CutoverPlanV1; completedThrough: CutoverEvidenceStep | null; evidenceDigest: `sha256:${string}` | null }> {
    const plan = await this.readPlan(planPath);
    if (path.resolve(evidenceRoot) !== plan.evidenceRoot) throw new DbCutoverError("CUTOVER_EVIDENCE_ROOT_MISMATCH");
    const store = new CutoverEvidenceStore(evidenceRoot, this.identity(plan));
    const verified = await store.readVerified().catch((error) => {
      if (error instanceof Error && "code" in error && (error as { code?: unknown }).code === "CUTOVER_EVIDENCE_NOT_FOUND") return null;
      throw error;
    });
    return { plan, completedThrough: verified?.manifest.completedThrough ?? null, evidenceDigest: verified?.manifest.evidenceDigest ?? null };
  }

  async runStep(planPath: string, evidenceRoot: string, step: CutoverEvidenceStep, action: CutoverAction, authorizationFile?: string): Promise<{ code: string; step: CutoverEvidenceStep; replayed: boolean; evidenceDigest: string }> {
    if (!CUTOVER_EVIDENCE_STEPS.includes(step)) throw new DbCutoverError("CUTOVER_STEP_INVALID");
    const plan = await this.readPlan(planPath);
    if (path.resolve(evidenceRoot) !== plan.evidenceRoot) throw new DbCutoverError("CUTOVER_EVIDENCE_ROOT_MISMATCH");
    if (getBlockedDbCapabilities().length > 0) throw new DbCutoverError("MIGRATION_CAPABILITY_BLOCKED");
    await this.assertPlanRoots(plan, step);
    const store = new CutoverEvidenceStore(evidenceRoot, this.identity(plan));
    const previous = await store.readVerified().catch((error) => error instanceof Error && "code" in error && (error as { code?: unknown }).code === "CUTOVER_EVIDENCE_NOT_FOUND" ? null : Promise.reject(error));
    const index = CUTOVER_EVIDENCE_STEPS.indexOf(step);
    if (previous && index < previous.steps.length) {
      if (previous.steps[index]?.step === step) return { code: `CUTOVER_${step}_REPLAYED`, step, replayed: true, evidenceDigest: previous.manifest.evidenceDigest };
      throw new DbCutoverError("CUTOVER_EVIDENCE_ORDER_INVALID");
    }
    if (index > 0) {
      if (!previous || !previous.manifest.completedThrough || CUTOVER_EVIDENCE_STEPS.indexOf(previous.manifest.completedThrough) !== index - 1 || !authorizationFile) throw new DbCutoverError("CUTOVER_AUTH_REQUIRED");
      const scope = index <= 4 ? "AUTH-C1" : index <= 6 ? "AUTH-C5" : "AUTH-C7";
      const gateStep = index <= 4 ? "C0" : index <= 6 ? "C4" : "C6";
      await store.verifyAuthorization(authorizationFile, scope, await store.gateEvidenceDigest(gateStep));
    }
    const inputDigest = digest({ planDigest: plan.planDigest, step, previous: previous?.manifest.evidenceDigest ?? null });
    const result = await store.runStep(step, inputDigest, () => action({ plan, step }));
    const verified = await store.readVerified();
    return { code: result.replayed ? `CUTOVER_${step}_REPLAYED` : `CUTOVER_${step}_OK`, step, replayed: result.replayed, evidenceDigest: verified.manifest.evidenceDigest };
  }

  private identity(plan: CutoverPlanV1) { return { cutoverId: plan.cutoverId, appCommit: plan.appCommit, planDigest: plan.planDigest, runId: plan.runId, effectiveSchemaManifestDigest: plan.effectiveSchemaManifestDigest }; }
  private async assertPlanRoots(plan: CutoverPlanV1, step: CutoverEvidenceStep): Promise<void> {
    const roots = [plan.releaseRoot, plan.sourceWorkspaceRoot, plan.targetDataRoot, plan.targetWorkspaceRoot, plan.snapshotRoot, plan.backupRoot, plan.restoreDataRoot, plan.restoreWorkspaceRoot, plan.archiveRoot, plan.evidenceRoot];
    for (const root of roots) {
      await assertNoSymlinkAncestors(root);
      const metadata = await lstat(root).catch(() => null);
      if (metadata?.isSymbolicLink()) throw new DbCutoverError("CUTOVER_PLAN_ROOT_UNSAFE");
    }
    for (const filePath of [plan.decisionsPath, plan.finalReportPath, plan.maintenanceTokenFile, plan.runtimeBundlePath]) {
      await assertNoSymlinkAncestors(filePath);
      const metadata = await lstat(filePath).catch(() => null);
      if (metadata?.isSymbolicLink()) throw new DbCutoverError("CUTOVER_PLAN_ROOT_UNSAFE");
    }
    if (step === "C0") {
      const release = await loadReleaseSchemaIdentityV1(plan.releaseRoot).catch(() => { throw new DbCutoverError("CUTOVER_RELEASE_INVALID"); });
      if (release.effectiveSchemaManifestDigest !== plan.effectiveSchemaManifestDigest) throw new DbCutoverError("CUTOVER_RELEASE_IDENTITY_MISMATCH");
      for (const root of [plan.releaseRoot, plan.sourceWorkspaceRoot]) {
        const metadata = await lstat(root).catch(() => null);
        if (!metadata || metadata.isSymbolicLink() || !metadata.isDirectory()) throw new DbCutoverError("CUTOVER_PLAN_ROOT_INVALID");
      }
      const token = await lstat(plan.maintenanceTokenFile).catch(() => null);
      if (!token || token.isSymbolicLink() || !token.isFile() || (token.mode & 0o077) !== 0 || token.size === 0) throw new DbCutoverError("CUTOVER_TOKEN_INVALID");
      for (const root of [plan.targetDataRoot, plan.targetWorkspaceRoot, plan.snapshotRoot, plan.backupRoot, plan.restoreDataRoot, plan.restoreWorkspaceRoot, plan.archiveRoot, plan.evidenceRoot]) {
        const metadata = await lstat(root).catch(() => null);
        if (metadata && !metadata.isDirectory()) throw new DbCutoverError("CUTOVER_TARGET_NOT_EMPTY");
        if (metadata?.isDirectory() && (await readdir(root)).length > 0) throw new DbCutoverError("CUTOVER_TARGET_NOT_EMPTY");
      }
    }
  }
}
