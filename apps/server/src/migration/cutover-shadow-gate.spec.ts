import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { digestCanonicalJson } from "@airoaming/shared";
import { CUTOVER_SHADOW_CHECKS, readVerifiedCutoverShadowGate } from "./cutover-shadow-gate.js";

const identity = { cutoverId: "c0", appCommit: "abc", planDigest: `sha256:${"1".repeat(64)}` as `sha256:${string}`, runId: "r0", effectiveSchemaManifestDigest: `sha256:${"2".repeat(64)}` as `sha256:${string}` };

function gate() {
  const checks = Object.fromEntries(CUTOVER_SHADOW_CHECKS.map((check) => [check, { status: "passed", evidenceDigest: `sha256:${"a".repeat(64)}` }])) as Record<string, { status: "passed"; evidenceDigest: `sha256:${string}` }>;
  const unsigned = { schemaVersion: 1 as const, kind: "airoaming_cutover_shadow_gate_v1" as const, ...identity, checks, migrationReportDigest: `sha256:${"b".repeat(64)}` as `sha256:${string}`, humanReviewer: { reviewerId: "human-reviewer", signedAt: "2026-07-14T00:00:00.000Z" } };
  return { ...unsigned, gateDigest: digestCanonicalJson(unsigned) };
}

describe("Cutover shadow gate", () => {
  it("RCUT-C0-01 verifies all SH checks and the human-bound digest", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-shadow-gate-"));
    const file = path.join(root, "gate.json");
    await writeFile(file, `${JSON.stringify(gate())}\n`, { mode: 0o600 });
    await expect(readVerifiedCutoverShadowGate(file, identity)).resolves.toMatchObject({ kind: "airoaming_cutover_shadow_gate_v1", humanReviewer: { reviewerId: "human-reviewer" } });
  });

  it("RCUT-C0-02 rejects missing SH checks, digest tamper and symlink paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "airoaming-shadow-gate-"));
    const file = path.join(root, "gate.json");
    const invalid = gate() as Record<string, unknown>;
    const checks = { ...(invalid.checks as Record<string, unknown>) };
    delete checks["SH-10"];
    invalid.checks = checks;
    await writeFile(file, `${JSON.stringify(invalid)}\n`, { mode: 0o600 });
    await expect(readVerifiedCutoverShadowGate(file, identity)).rejects.toMatchObject({ code: "CUTOVER_C0_SHADOW_GATE_INVALID" });
    await writeFile(file, `${JSON.stringify({ ...gate(), gateDigest: `sha256:${"f".repeat(64)}` })}\n`, { mode: 0o600 });
    await expect(readVerifiedCutoverShadowGate(file, identity)).rejects.toMatchObject({ code: "CUTOVER_C0_SHADOW_GATE_DIGEST_MISMATCH" });
    const link = path.join(root, "gate-link.json");
    await symlink(file, link);
    await expect(readVerifiedCutoverShadowGate(link, identity)).rejects.toMatchObject({ code: "CUTOVER_C0_SHADOW_GATE_UNSAFE" });
  });
});
