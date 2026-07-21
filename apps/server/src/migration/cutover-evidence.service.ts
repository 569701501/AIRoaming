import { chmod, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import * as path from "node:path";
import { digestCanonicalJson } from "@airoaming/shared";
import type { SnapshotDigest } from "./snapshot.types.js";

export const CUTOVER_EVIDENCE_STEPS = ["C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7"] as const;
export type CutoverEvidenceStep = (typeof CUTOVER_EVIDENCE_STEPS)[number];

export interface CutoverEvidenceIdentity { cutoverId: string; appCommit: string; planDigest: SnapshotDigest; runId: string; effectiveSchemaManifestDigest: SnapshotDigest; }
export interface CutoverEvidenceStepV1 extends CutoverEvidenceIdentity { schemaVersion: 1; kind: "airoaming_cutover_step_v1"; step: CutoverEvidenceStep; status: "passed"; startedAt: string; finishedAt: string; inputDigest: SnapshotDigest; previousStepDigest: SnapshotDigest | null; artifactDigests: Record<string, SnapshotDigest>; summaryCode: string; stepDigest: SnapshotDigest; }
export interface CutoverEvidenceManifestV1 extends CutoverEvidenceIdentity { schemaVersion: 1; kind: "airoaming_cutover_evidence_v1"; sourceManifestDigest: SnapshotDigest | null; snapshotManifestDigest: SnapshotDigest | null; decisionsDigest: SnapshotDigest | null; completedThrough: CutoverEvidenceStep | null; stepDigests: Array<{ step: CutoverEvidenceStep; digest: SnapshotDigest }>; evidenceDigest: SnapshotDigest; }
export interface CutoverAuthorizationV1 extends CutoverEvidenceIdentity { schemaVersion: 1; kind: "airoaming_cutover_authorization_v1"; scope: "AUTH-C1" | "AUTH-C5" | "AUTH-C7"; evidenceDigest: SnapshotDigest; authorizedAt: string; authorizedBy: string; acknowledgement: string; authorizationDigest: SnapshotDigest; }
export interface CutoverCompletionSeal { activatedAt: string; firstBusinessWriteAt: null; }

export class CutoverEvidenceError extends Error { constructor(readonly code: string) { super(code); } }
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ACK: Record<CutoverAuthorizationV1["scope"], string> = {
  "AUTH-C1": "我确认 C0 证据、plan、release、备份与回滚责任人，授权进入 C1 并按 plan 执行 C3 凭据验证；未授权 C5/C7。",
  "AUTH-C5": "我确认 final/ready/pre-cutover backup 与 materialize 恢复均通过，授权关闭旧 file 进程并进入 C5/C6；未授权 C7 激活。",
  "AUTH-C7": "我确认 C5 关闭态 DB smoke 与 C6 archive 通过，理解首次 DB 写后禁止 file-only 回退，授权执行 C7 激活。",
};

function abs(value: string): string { if (!path.isAbsolute(value) || value.includes("\0")) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_ROOT_INVALID"); return path.resolve(value); }
function digest(value: unknown): SnapshotDigest { return digestCanonicalJson(value) as SnapshotDigest; }

async function assertNoSymlinkAncestors(targetPath: string): Promise<void> {
  let current = path.resolve(targetPath);
  while (true) {
    const metadata = await lstat(current).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw error;
    });
    if (metadata?.isSymbolicLink() && current !== "/var" && current !== "/tmp") throw new CutoverEvidenceError("CUTOVER_EVIDENCE_PATH_UNSAFE");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function writeAtomic(filePath: string, value: unknown): Promise<void> {
  await assertNoSymlinkAncestors(filePath);
  const parent = path.dirname(filePath);
  const existingParent = await lstat(parent).catch(() => null);
  if (existingParent?.isSymbolicLink() || (existingParent && !existingParent.isDirectory())) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_PATH_UNSAFE");
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const verifiedParent = await lstat(parent).catch(() => null);
  if (!verifiedParent || verifiedParent.isSymbolicLink() || !verifiedParent.isDirectory()) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_PATH_UNSAFE");
  const existingFile = await lstat(filePath).catch(() => null);
  if (existingFile && (existingFile.isSymbolicLink() || !existingFile.isFile())) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_PATH_UNSAFE");
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`; const handle = await open(tmp, "wx", 0o600);
  try {
    try { await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8"); await handle.sync(); }
    catch (error) { await handle.close().catch(() => undefined); await rm(tmp, { force: true }).catch(() => undefined); throw error; }
    await handle.close();
  } catch (error) { await rm(tmp, { force: true }).catch(() => undefined); throw error; }
  try {
    await chmod(tmp, 0o600); await rename(tmp, filePath);
    const parentHandle = await open(parent, "r"); try { await parentHandle.sync(); } finally { await parentHandle.close(); }
  } catch (error) { await rm(tmp, { force: true }).catch(() => undefined); throw error; }
}

export class CutoverEvidenceStore {
  private readonly root: string;
  constructor(root: string, private readonly identity: CutoverEvidenceIdentity) { this.root = abs(root); }
  private manifestPath() { return path.join(this.root, "cutover-evidence.json"); }
  private stepPath(step: CutoverEvidenceStep) { return path.join(this.root, "steps", `${step}.json`); }
  async readVerified(): Promise<{ manifest: CutoverEvidenceManifestV1; steps: CutoverEvidenceStepV1[] }> {
    await assertNoSymlinkAncestors(this.root);
    let raw: CutoverEvidenceManifestV1;
    const metadata = await lstat(this.manifestPath()).catch(() => null);
    if (metadata && (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0)) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_INVALID");
    let bytes: string;
    try { bytes = await readFile(this.manifestPath(), "utf8"); } catch { throw new CutoverEvidenceError("CUTOVER_EVIDENCE_NOT_FOUND"); }
    try { raw = JSON.parse(bytes) as CutoverEvidenceManifestV1; } catch { throw new CutoverEvidenceError("CUTOVER_EVIDENCE_INVALID"); }
    if (raw.schemaVersion !== 1 || raw.kind !== "airoaming_cutover_evidence_v1" || !Array.isArray(raw.stepDigests)) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_INVALID");
    if (!sameIdentity(raw, this.identity) || !DIGEST.test(raw.evidenceDigest)) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_IDENTITY_MISMATCH");
    const { evidenceDigest, ...unsigned } = raw; if (digest(unsigned) !== evidenceDigest) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_DIGEST_MISMATCH");
    const stepsRoot = path.join(this.root, "steps");
    const stepsMetadata = await lstat(stepsRoot).catch(() => null);
    if (stepsMetadata?.isSymbolicLink() || (stepsMetadata && !stepsMetadata.isDirectory())) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_PATH_UNSAFE");
    const steps: CutoverEvidenceStepV1[] = [];
    for (let i = 0; i < CUTOVER_EVIDENCE_STEPS.indexOf(raw.completedThrough ?? "C0") + (raw.completedThrough ? 1 : 0); i += 1) {
      const step = CUTOVER_EVIDENCE_STEPS[i]; let item: CutoverEvidenceStepV1; let stepBytes: string;
      const stepMetadata = await lstat(this.stepPath(step)).catch(() => null);
      if (!stepMetadata || stepMetadata.isSymbolicLink() || !stepMetadata.isFile() || (stepMetadata.mode & 0o077) !== 0) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_PATH_UNSAFE");
      try { stepBytes = await readFile(this.stepPath(step), "utf8"); } catch { throw new CutoverEvidenceError("CUTOVER_EVIDENCE_STEP_MISSING"); }
      try { item = JSON.parse(stepBytes) as CutoverEvidenceStepV1; } catch { throw new CutoverEvidenceError("CUTOVER_EVIDENCE_STEP_INVALID"); }
      if (!sameIdentity(item, this.identity)) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_IDENTITY_MISMATCH");
      if (item.step !== step || item.status !== "passed" || !DIGEST.test(item.stepDigest) || (i === 0 ? item.previousStepDigest !== null : item.previousStepDigest !== steps[i - 1]?.stepDigest)) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_STEP_INVALID");
      const { stepDigest, ...stepUnsigned } = item; if (digest(stepUnsigned) !== stepDigest) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_STEP_DIGEST_MISMATCH");
      steps.push(item);
    }
    if (raw.completedThrough !== null && !CUTOVER_EVIDENCE_STEPS.includes(raw.completedThrough)) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_INVALID");
    if (raw.stepDigests.length !== steps.length || raw.stepDigests.some((entry, i) => !entry || !CUTOVER_EVIDENCE_STEPS.includes(entry.step) || !DIGEST.test(entry.digest) || entry.step !== steps[i]?.step || entry.digest !== steps[i]?.stepDigest)) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_CHAIN_INVALID");
    if (raw.completedThrough === "C6" || raw.completedThrough === "C7") await this.verifyMarker(path.join(this.root, "C6_READY"), "airoaming_cutover_c6_ready_v1", "C6", raw.completedThrough === "C7" ? this.digestAt(raw, steps, 6) : raw.evidenceDigest);
    if (raw.completedThrough === "C7") await this.verifyMarker(path.join(this.root, "COMPLETED"), "airoaming_cutover_completed_v1", "C7", raw.evidenceDigest);
    return { manifest: raw, steps };
  }
  async runStep(step: CutoverEvidenceStep, inputDigest: SnapshotDigest, action: () => Promise<{ artifactDigests?: Record<string, SnapshotDigest>; summaryCode: string; completion?: CutoverCompletionSeal }>, now = () => new Date().toISOString()): Promise<{ step: CutoverEvidenceStepV1; replayed: boolean }> {
    const existing = await this.readVerified().catch((error) => {
      if (error instanceof CutoverEvidenceError && error.code === "CUTOVER_EVIDENCE_NOT_FOUND") return null;
      if (error instanceof CutoverEvidenceError && error.code === "CUTOVER_EVIDENCE_IDENTITY_MISMATCH") throw new CutoverEvidenceError("CUTOVER_RESUME_CONFLICT");
      return Promise.reject(error);
    });
    const steps = existing?.steps ?? []; const index = CUTOVER_EVIDENCE_STEPS.indexOf(step);
    if (index !== steps.length) { if (index < steps.length && steps[index].inputDigest === inputDigest) return { step: steps[index], replayed: true }; throw new CutoverEvidenceError("CUTOVER_EVIDENCE_ORDER_INVALID"); }
    const startedAt = now(); const result = await action(); const finishedAt = now();
    if (step === "C7" && (!result.completion || !result.completion.activatedAt || result.completion.firstBusinessWriteAt !== null)) throw new CutoverEvidenceError("CUTOVER_COMPLETION_SEAL_REQUIRED");
    const unsigned = { ...this.identity, schemaVersion: 1 as const, kind: "airoaming_cutover_step_v1" as const, step, status: "passed" as const, startedAt, finishedAt, inputDigest, previousStepDigest: steps.at(-1)?.stepDigest ?? null, artifactDigests: result.artifactDigests ?? {}, summaryCode: result.summaryCode };
    const evidenceStep = { ...unsigned, stepDigest: digest(unsigned) } as CutoverEvidenceStepV1;
    const manifestUnsigned = { ...this.identity, schemaVersion: 1 as const, kind: "airoaming_cutover_evidence_v1" as const, sourceManifestDigest: result.artifactDigests?.sourceManifestDigest ?? existing?.manifest.sourceManifestDigest ?? null, snapshotManifestDigest: result.artifactDigests?.snapshotManifestDigest ?? existing?.manifest.snapshotManifestDigest ?? null, decisionsDigest: result.artifactDigests?.decisionsDigest ?? existing?.manifest.decisionsDigest ?? null, completedThrough: step, stepDigests: [...steps, evidenceStep].map((item) => ({ step: item.step, digest: item.stepDigest })) };
    const manifest = { ...manifestUnsigned, evidenceDigest: digest(manifestUnsigned) } as CutoverEvidenceManifestV1;
    await writeAtomic(this.stepPath(step), evidenceStep);
    if (step === "C6") await writeAtomic(path.join(this.root, "C6_READY"), { schemaVersion: 1, kind: "airoaming_cutover_c6_ready_v1", step: "C6", ...this.identity, evidenceDigest: manifest.evidenceDigest });
    if (step === "C7") await writeAtomic(path.join(this.root, "COMPLETED"), { schemaVersion: 1, kind: "airoaming_cutover_completed_v1", step: "C7", ...this.identity, ...result.completion, evidenceDigest: manifest.evidenceDigest });
    await writeAtomic(this.manifestPath(), manifest);
    return { step: evidenceStep, replayed: false };
  }
  async gateEvidenceDigest(completedThrough: CutoverEvidenceStep): Promise<SnapshotDigest> {
    const verified = await this.readVerified();
    const end = CUTOVER_EVIDENCE_STEPS.indexOf(completedThrough);
    if (end < 0 || verified.steps.length <= end) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_GATE_MISSING");
    let sourceManifestDigest: SnapshotDigest | null = null;
    let snapshotManifestDigest: SnapshotDigest | null = null;
    let decisionsDigest: SnapshotDigest | null = null;
    for (const item of verified.steps.slice(0, end + 1)) {
      sourceManifestDigest = item.artifactDigests.sourceManifestDigest ?? sourceManifestDigest;
      snapshotManifestDigest = item.artifactDigests.snapshotManifestDigest ?? snapshotManifestDigest;
      decisionsDigest = item.artifactDigests.decisionsDigest ?? decisionsDigest;
    }
    return this.digestAt({ ...verified.manifest, sourceManifestDigest, snapshotManifestDigest, decisionsDigest }, verified.steps, end);
  }
  async verifyAuthorization(filePath: string, scope: CutoverAuthorizationV1["scope"], evidenceDigest: SnapshotDigest): Promise<CutoverAuthorizationV1> {
    const authPath = abs(filePath); let auth: CutoverAuthorizationV1;
    const metadata = await lstat(authPath).catch(() => null);
    if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) throw new CutoverEvidenceError("CUTOVER_AUTH_INVALID");
    try { auth = JSON.parse(await readFile(authPath, "utf8")) as CutoverAuthorizationV1; } catch { throw new CutoverEvidenceError("CUTOVER_AUTH_INVALID"); }
    const { authorizationDigest, ...unsigned } = auth;
    if (auth.schemaVersion !== 1 || auth.kind !== "airoaming_cutover_authorization_v1" || auth.scope !== scope || auth.evidenceDigest !== evidenceDigest || auth.acknowledgement !== ACK[scope] || !auth.authorizedAt || !auth.authorizedBy || !sameIdentity(auth, this.identity) || digest(unsigned) !== authorizationDigest) throw new CutoverEvidenceError("CUTOVER_AUTH_INVALID");
    return auth;
  }
  private async verifyMarker(filePath: string, kind: string, step: CutoverEvidenceStep, evidenceDigest: SnapshotDigest): Promise<void> {
    const metadata = await lstat(filePath).catch(() => null);
    if (!metadata || !metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_SEAL_INVALID");
    let marker: Record<string, unknown>;
    try { marker = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>; } catch { throw new CutoverEvidenceError("CUTOVER_EVIDENCE_SEAL_INVALID"); }
    if (marker.schemaVersion !== 1 || marker.kind !== kind || marker.step !== step || marker.evidenceDigest !== evidenceDigest || !sameIdentity(marker, this.identity)) throw new CutoverEvidenceError("CUTOVER_EVIDENCE_SEAL_INVALID");
  }
  private digestAt(manifest: CutoverEvidenceManifestV1, steps: CutoverEvidenceStepV1[], end: number): SnapshotDigest {
    const unsigned = { ...this.identity, schemaVersion: 1 as const, kind: "airoaming_cutover_evidence_v1" as const, sourceManifestDigest: manifest.sourceManifestDigest, snapshotManifestDigest: manifest.snapshotManifestDigest, decisionsDigest: manifest.decisionsDigest, completedThrough: CUTOVER_EVIDENCE_STEPS[end], stepDigests: steps.slice(0, end + 1).map((item) => ({ step: item.step, digest: item.stepDigest })) };
    return digest(unsigned);
  }
}

function sameIdentity(value: Partial<CutoverEvidenceIdentity>, identity: CutoverEvidenceIdentity): boolean {
  return value.cutoverId === identity.cutoverId && value.appCommit === identity.appCommit && value.planDigest === identity.planDigest && value.runId === identity.runId && value.effectiveSchemaManifestDigest === identity.effectiveSchemaManifestDigest;
}
