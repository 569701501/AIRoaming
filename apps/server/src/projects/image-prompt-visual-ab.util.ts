import { createHash } from "node:crypto";
import type { ImageProviderType } from "@airoaming/shared";
import type { ImagePromptBaselineReport } from "./image-prompt-baseline.util.js";

export type VisualAbSlotStatus =
  | "pending"
  | "started"
  | "completed"
  | "failed"
  | "skipped"
  | "manual_review_required";

export interface VisualAbSlot {
  slotId: string;
  providerType: ImageProviderType;
  caseId: string;
  variant: number;
  status: VisualAbSlotStatus;
}

export interface VisualAbLedger {
  schemaVersion: 1;
  suiteId: string;
  planDigest: string;
  maxProviderRequests: number;
  createdAt: string;
  updatedAt: string;
  slots: VisualAbSlot[];
}

export function buildVisualAbSlots(report: ImagePromptBaselineReport): VisualAbSlot[] {
  const slots: VisualAbSlot[] = [];
  const providers = report.candidateCases[0]?.providerProfiles.map((profile) => profile.providerType) ?? [];
  for (const providerType of providers) {
    for (const candidate of report.candidateCases) {
      const variants = candidate.runtimeRubric.variantsPerProvider;
      for (let variant = 1; variant <= variants; variant += 1) {
        slots.push({
          slotId: `${providerType}:${candidate.caseId}:v${variant}`,
          providerType,
          caseId: candidate.caseId,
          variant,
          status: "pending",
        });
      }
    }
  }
  if (slots.length !== report.summary.runtimeImageCountWhenAuthorized || slots.length !== 30) {
    throw new Error(`VISUAL_AB_REQUEST_BUDGET_MISMATCH:${slots.length}`);
  }
  if (new Set(slots.map((slot) => slot.slotId)).size !== slots.length) {
    throw new Error("VISUAL_AB_SLOT_ID_DUPLICATE");
  }
  return slots;
}

export function visualAbPlanDigest(report: ImagePromptBaselineReport, slots: VisualAbSlot[]): string {
  const promptDigests = report.candidateCases.flatMap((candidate) =>
    candidate.providerProfiles.map((profile) => ({
      caseId: candidate.caseId,
      providerType: profile.providerType,
      profileId: profile.profileId,
      promptDigest: createHash("sha256").update(profile.prompt, "utf8").digest("hex"),
      specDigest: candidate.generationSpec.digest,
    })),
  );
  return createHash("sha256")
    .update(JSON.stringify({ suiteId: report.suiteId, slots: slots.map(({ slotId }) => slotId), promptDigests }), "utf8")
    .digest("hex");
}

export function createVisualAbLedger(
  report: ImagePromptBaselineReport,
  now = new Date().toISOString(),
): VisualAbLedger {
  const slots = buildVisualAbSlots(report);
  return {
    schemaVersion: 1,
    suiteId: report.suiteId,
    planDigest: visualAbPlanDigest(report, slots),
    maxProviderRequests: slots.length,
    createdAt: now,
    updatedAt: now,
    slots,
  };
}

export function providerSize(
  requested: { width: number; height: number },
  providerType: ImageProviderType,
): string {
  if (providerType === "doubao") {
    if (requested.width === requested.height) return "2048x2048";
    return requested.width > requested.height ? "2560x1440" : "1440x2560";
  }
  return `${requested.width}x${requested.height}`;
}

export function extensionForMime(mimeType: string): "png" | "jpg" | "webp" {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  throw new Error(`VISUAL_AB_UNSUPPORTED_IMAGE_MIME:${mimeType}`);
}

export function shouldStopProviderAfterFailure(errorMessage: string): boolean {
  return errorMessage.includes("IMAGE_PROVIDER_")
    || errorMessage.includes("fetch failed")
    || errorMessage.includes("UND_ERR_")
    || errorMessage.includes("ETIMEDOUT");
}

export function summarizeVisualAbLedger(ledger: VisualAbLedger): Record<VisualAbSlotStatus, number> {
  const summary: Record<VisualAbSlotStatus, number> = {
    pending: 0,
    started: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    manual_review_required: 0,
  };
  for (const slot of ledger.slots) summary[slot.status] += 1;
  return summary;
}
