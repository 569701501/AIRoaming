import { lstat, readFile } from "node:fs/promises";
import * as path from "node:path";
import { digestCanonicalJson } from "@airoaming/shared";
import type { SnapshotDigest } from "./snapshot.types.js";

export const CUTOVER_SHADOW_CHECKS = ["SH-01", "SH-02", "SH-03", "SH-04", "SH-05", "SH-06", "SH-07", "SH-08", "SH-09", "SH-10"] as const;
export type CutoverShadowCheck = (typeof CUTOVER_SHADOW_CHECKS)[number];

export interface CutoverShadowGateV1 {
  schemaVersion: 1;
  kind: "airoaming_cutover_shadow_gate_v1";
  cutoverId: string;
  appCommit: string;
  planDigest: SnapshotDigest;
  runId: string;
  effectiveSchemaManifestDigest: SnapshotDigest;
  checks: Record<CutoverShadowCheck, { status: "passed"; evidenceDigest: SnapshotDigest }>;
  migrationReportDigest: SnapshotDigest;
  humanReviewer: { reviewerId: string; signedAt: string };
  gateDigest: SnapshotDigest;
}

export class CutoverShadowGateError extends Error {
  constructor(readonly code: string) { super(code); }
}

const DIGEST = /^sha256:[0-9a-f]{64}$/;

async function assertNoSymlinkAncestors(targetPath: string): Promise<void> {
  let current = path.resolve(targetPath);
  while (true) {
    const metadata = await lstat(current).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw error;
    });
    if (metadata?.isSymbolicLink() && current !== "/var" && current !== "/tmp") throw new CutoverShadowGateError("CUTOVER_C0_SHADOW_GATE_UNSAFE");
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function readVerifiedCutoverShadowGate(filePath: string, identity: Pick<CutoverShadowGateV1, "cutoverId" | "appCommit" | "planDigest" | "runId" | "effectiveSchemaManifestDigest">): Promise<CutoverShadowGateV1> {
  if (!path.isAbsolute(filePath) || filePath.includes("\0")) throw new CutoverShadowGateError("CUTOVER_C0_SHADOW_GATE_INVALID");
  await assertNoSymlinkAncestors(filePath);
  const metadata = await lstat(filePath).catch(() => null);
  if (!metadata || metadata.isSymbolicLink() || !metadata.isFile() || (metadata.mode & 0o077) !== 0) throw new CutoverShadowGateError("CUTOVER_C0_SHADOW_GATE_INVALID");
  let value: unknown;
  try { value = JSON.parse(await readFile(filePath, "utf8")); } catch { throw new CutoverShadowGateError("CUTOVER_C0_SHADOW_GATE_INVALID"); }
  if (!isRecord(value) || value.schemaVersion !== 1 || value.kind !== "airoaming_cutover_shadow_gate_v1") throw new CutoverShadowGateError("CUTOVER_C0_SHADOW_GATE_INVALID");
  const gate = value as unknown as CutoverShadowGateV1;
  if (gate.cutoverId !== identity.cutoverId || gate.appCommit !== identity.appCommit || gate.planDigest !== identity.planDigest || gate.runId !== identity.runId || gate.effectiveSchemaManifestDigest !== identity.effectiveSchemaManifestDigest || !DIGEST.test(gate.migrationReportDigest) || !gate.humanReviewer?.reviewerId || !gate.humanReviewer.signedAt || !DIGEST.test(gate.gateDigest) || !isRecord(gate.checks)) throw new CutoverShadowGateError("CUTOVER_C0_SHADOW_GATE_INVALID");
  for (const check of CUTOVER_SHADOW_CHECKS) {
    const entry = gate.checks[check];
    if (!entry || entry.status !== "passed" || !DIGEST.test(entry.evidenceDigest)) throw new CutoverShadowGateError("CUTOVER_C0_SHADOW_GATE_INVALID");
  }
  const { gateDigest, ...unsigned } = gate;
  if (digestCanonicalJson(unsigned) !== gateDigest) throw new CutoverShadowGateError("CUTOVER_C0_SHADOW_GATE_DIGEST_MISMATCH");
  return gate;
}
