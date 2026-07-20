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

export const VISUAL_AB_EVALUATION_POLICY = {
  schemaVersion: 2,
  providerExceptions: [
    {
      providerType: "grok",
      caseId: "candidate-no-character-establishing",
      condition: "single scene reference is used; output aspect ratio follows the source image",
      requiredWarning: "grok_single_reference_output_aspect_ratio_follows_input",
      excludeFromCrossProviderChecks: ["requested_aspect_ratio"],
      stillEvaluateChecks: ["environment", "clean_plate", "empty_scene"],
    },
    {
      providerType: "grok",
      caseId: "candidate-group-staging",
      condition: "four character references are deterministically packed into one cast identity board while the scene stays independent",
      requiredWarning: "candidate_references_packed:grok:cast_identity_board:4",
      excludeFromCrossProviderChecks: [],
      stillEvaluateChecks: ["identity", "environment", "clean_plate", "staging"],
    },
  ],
} as const;

export const VISUAL_AB_MAX_PROVIDER_REQUESTS = 40;

export interface VisualAbSlot {
  slotId: string;
  promptVersion: "v1" | "v2";
  providerType: ImageProviderType;
  caseId: string;
  variant: number;
  status: VisualAbSlotStatus;
}

export interface VisualAbLedger {
  schemaVersion: 2;
  suiteId: string;
  promptVersion: "v1" | "v2";
  planDigest: string;
  maxProviderRequests: number;
  createdAt: string;
  updatedAt: string;
  slots: VisualAbSlot[];
}

export function buildVisualAbSlots(report: ImagePromptBaselineReport): VisualAbSlot[] {
  const slots: VisualAbSlot[] = [];
  const promptVersion = report.productionBaseline.promptVersion;
  const providers = report.candidateCases[0]?.providerProfiles.map((profile) => profile.providerType) ?? [];
  for (const providerType of providers) {
    for (const candidate of report.candidateCases) {
      const variants = candidate.runtimeRubric.variantsPerProvider;
      for (let variant = 1; variant <= variants; variant += 1) {
        slots.push({
          slotId: `${promptVersion}:${providerType}:${candidate.caseId}:v${variant}`,
          promptVersion,
          providerType,
          caseId: candidate.caseId,
          variant,
          status: "pending",
        });
      }
    }
  }
  if (slots.length !== report.summary.runtimeImageCountWhenAuthorized || slots.length !== VISUAL_AB_MAX_PROVIDER_REQUESTS) {
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
    .update(JSON.stringify({
      suiteId: report.suiteId,
      promptVersion: report.productionBaseline.promptVersion,
      slots: slots.map(({ slotId }) => slotId),
      promptDigests,
    }), "utf8")
    .digest("hex");
}

export function createVisualAbLedger(
  report: ImagePromptBaselineReport,
  now = new Date().toISOString(),
): VisualAbLedger {
  const slots = buildVisualAbSlots(report);
  return {
    schemaVersion: 2,
    suiteId: report.suiteId,
    promptVersion: report.productionBaseline.promptVersion,
    planDigest: visualAbPlanDigest(report, slots),
    maxProviderRequests: slots.length,
    createdAt: now,
    updatedAt: now,
    slots,
  };
}

export function providerSize(
  requested: { width: number; height: number },
  _providerType: ImageProviderType,
): string {
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
