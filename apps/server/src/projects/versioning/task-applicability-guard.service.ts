import { Inject, Injectable } from "@nestjs/common";
import type { Digest, FreshnessReasonCode, ChapterProductionState } from "@airoaming/shared";
import { NewWorkGateService, type GateReader, type NewWorkGateInput } from "./new-work-gate.service.js";
import type { G2VersionTaskType, VersionScopeV1 } from "./versioning-database.types.js";

export interface TaskApplicabilityInput extends NewWorkGateInput {
  readonly sourceDigest?: Digest;
}

export interface TaskApplicabilityResult {
  readonly applicability: "current" | "historical";
  readonly reasonCodes: readonly FreshnessReasonCode[];
  readonly productionState: ChapterProductionState;
}

function unique(values: readonly FreshnessReasonCode[]): FreshnessReasonCode[] { return [...new Set(values)]; }

/**
 * Completion-time fence for G2 tasks. It deliberately has no write authority:
 * the future persistent worker must call it immediately before its domain
 * repository applies an output, and record `historical` without changing a
 * current pointer when the source/target chain no longer matches.
 */
@Injectable()
export class TaskApplicabilityGuardService {
  constructor(@Inject(NewWorkGateService) private readonly newWorkGate: NewWorkGateService) {}

  async evaluate(scope: VersionScopeV1, operation: G2VersionTaskType, input: TaskApplicabilityInput = {}, reader?: GateReader): Promise<TaskApplicabilityResult> {
    const gate = await this.newWorkGate.check(scope, operation, input, reader);
    const reasons = [...gate.reasonCodes];
    if ((operation === "shot_prompt_generate" || operation === "image_generate") && input.sourceDigest !== undefined && gate.productionState.preflight.sourceDigest !== input.sourceDigest) {
      reasons.push("UPSTREAM_STALE");
    }
    const reasonCodes = unique(reasons);
    return { applicability: reasonCodes.length === 0 ? "current" : "historical", reasonCodes, productionState: gate.productionState };
  }

  async assertCurrent(scope: VersionScopeV1, operation: G2VersionTaskType, input: TaskApplicabilityInput = {}, reader?: GateReader): Promise<TaskApplicabilityResult> {
    const result = await this.evaluate(scope, operation, input, reader);
    if (result.applicability === "historical") return result;
    return result;
  }
}
