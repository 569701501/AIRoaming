import { BadRequestException } from "@nestjs/common";
import type { ImageProviderType } from "@airoaming/shared";
import {
  buildCastIdentityBoard,
  CAST_IDENTITY_BOARD_MAX_CHARACTERS,
  inspectCandidateImage,
  prepareCandidateIdentityImage,
  type CandidateCharacterReferenceKind,
  type CastIdentityBoardEvidence,
  type PreparedCandidateIdentityImage,
} from "./candidate-reference-image.util.js";

export const CANDIDATE_REFERENCE_PLAN_COMPILER_VERSION = "candidate_reference_plan_v1" as const;

export type CandidateSourceReferenceKind = "character_identity" | "scene_environment";
export type CandidateProviderReferenceKind = CandidateSourceReferenceKind | "cast_identity_board";

export interface CandidateImageReferenceInput {
  assetId: string;
  kind: CandidateSourceReferenceKind;
  label: string;
  priority?: number;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  /** Candidate identity inputs must be single-person anchors; final sheets fail closed. */
  sourceReferenceKind: CandidateCharacterReferenceKind | "scene_background";
}

export interface CandidateProviderImageReferenceInput {
  assetId: string;
  kind: CandidateProviderReferenceKind;
  label: string;
  priority?: number;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  sourceAssetIds: string[];
}

export type CandidateDerivedReferenceEvidence = CastIdentityBoardEvidence;

export interface CandidateReferencePlanSlotEvidence {
  order: number;
  role: "direct_identity" | "cast_identity_board" | "scene_environment";
  providerReferenceId: string;
  label: string;
  covers: string[];
  derived?: CandidateDerivedReferenceEvidence;
}

export interface CandidateReferencePlanEvidence {
  schemaVersion: 1;
  compilerVersion: typeof CANDIDATE_REFERENCE_PLAN_COMPILER_VERSION;
  providerType: ImageProviderType;
  strategy: "none" | "direct" | "cast_identity_board";
  inputReferenceAssetIds: string[];
  usedReferenceAssetIds: string[];
  slots: CandidateReferencePlanSlotEvidence[];
  omittedRequired: string[];
  compositionCoverage: "prompt_only";
  warnings: string[];
}

export interface CompiledCandidateReferencePlan {
  references: CandidateProviderImageReferenceInput[];
  evidence: CandidateReferencePlanEvidence;
  warnings: string[];
}

const PROVIDER_REFERENCE_LIMITS: Record<ImageProviderType, number> = {
  grok: 3,
  openai: 16,
  doubao: 10,
  runware: 4,
};

interface PreparedSourceReference {
  source: CandidateImageReferenceInput;
  provider: CandidateProviderImageReferenceInput;
  identity?: PreparedCandidateIdentityImage;
}

export async function compileCandidateReferencePlan(input: {
  providerType: ImageProviderType;
  references: readonly CandidateImageReferenceInput[];
}): Promise<CompiledCandidateReferencePlan> {
  assertUniqueRequiredReferences(input.references);
  const inputReferenceAssetIds = input.references.map((reference) => reference.assetId);
  if (input.references.length === 0) {
    const evidence: CandidateReferencePlanEvidence = {
      schemaVersion: 1,
      compilerVersion: CANDIDATE_REFERENCE_PLAN_COMPILER_VERSION,
      providerType: input.providerType,
      strategy: "none",
      inputReferenceAssetIds: [],
      usedReferenceAssetIds: [],
      slots: [],
      omittedRequired: [],
      compositionCoverage: "prompt_only",
      warnings: [],
    };
    return { references: [], evidence, warnings: [] };
  }

  const prepared = await Promise.all(input.references.map((reference) => prepareSourceReference(reference)));
  const limit = PROVIDER_REFERENCE_LIMITS[input.providerType];
  if (prepared.length <= limit) {
    const references = prepared.map((item) => item.provider);
    const slots = prepared.map((item, index): CandidateReferencePlanSlotEvidence => ({
      order: index + 1,
      role: item.source.kind === "character_identity" ? "direct_identity" : "scene_environment",
      providerReferenceId: item.provider.assetId,
      label: item.provider.label,
      covers: [item.source.assetId],
    }));
    const evidence = completeEvidence({
      providerType: input.providerType,
      strategy: "direct",
      inputReferenceAssetIds,
      references,
      slots,
      warnings: [],
    });
    return { references, evidence, warnings: evidence.warnings };
  }

  const characters = prepared.filter((item) => item.source.kind === "character_identity");
  const environments = prepared.filter((item) => item.source.kind === "scene_environment");
  if (characters.length < 2) {
    throw new BadRequestException(
      `CANDIDATE_REQUIRED_REFERENCES_EXCEED_PROVIDER_CAPACITY:${input.providerType}:${prepared.length}:${limit}`,
    );
  }
  if (characters.length > CAST_IDENTITY_BOARD_MAX_CHARACTERS) {
    throw new BadRequestException(
      `CANDIDATE_CAST_IDENTITY_BOARD_CAPACITY_EXCEEDED:${characters.length}:${CAST_IDENTITY_BOARD_MAX_CHARACTERS}`,
    );
  }

  const board = await buildCastIdentityBoard(characters.map((item) => item.identity!));
  const boardReferenceId = `derived:cast-identity-board:${board.evidence.sha256.slice("sha256:".length)}`;
  const boardReference: CandidateProviderImageReferenceInput = {
    assetId: boardReferenceId,
    kind: "cast_identity_board",
    label: `角色身份板：${characters.map((item) => item.source.label).join("、")}`,
    priority: Math.max(...characters.map((item) => item.source.priority ?? 0)),
    buffer: board.buffer,
    mimeType: board.mimeType,
    fileName: board.fileName,
    sourceAssetIds: characters.map((item) => item.source.assetId),
  };
  const references = [boardReference, ...environments.map((item) => item.provider)];
  if (references.length > limit) {
    throw new BadRequestException(
      `CANDIDATE_REQUIRED_REFERENCES_EXCEED_PROVIDER_CAPACITY:${input.providerType}:${references.length}:${limit}`,
    );
  }

  const warnings = [
    `candidate_references_packed:${input.providerType}:cast_identity_board:${characters.length}`,
    `candidate_cast_identity_board_visual_quality_unverified:${characters.length}`,
  ];
  const slots: CandidateReferencePlanSlotEvidence[] = [
    {
      order: 1,
      role: "cast_identity_board",
      providerReferenceId: boardReference.assetId,
      label: boardReference.label,
      covers: [...boardReference.sourceAssetIds],
      derived: board.evidence,
    },
    ...environments.map((item, index): CandidateReferencePlanSlotEvidence => ({
      order: index + 2,
      role: "scene_environment",
      providerReferenceId: item.provider.assetId,
      label: item.provider.label,
      covers: [item.source.assetId],
    })),
  ];
  const evidence = completeEvidence({
    providerType: input.providerType,
    strategy: "cast_identity_board",
    inputReferenceAssetIds,
    references,
    slots,
    warnings,
  });
  return { references, evidence, warnings };
}

export function parseCandidateReferencePlanEvidence(value: unknown): CandidateReferencePlanEvidence | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new TypeError("providerOutput.referencePlan must be an object");
  if (value.schemaVersion !== 1 || value.compilerVersion !== CANDIDATE_REFERENCE_PLAN_COMPILER_VERSION) {
    throw new TypeError("providerOutput.referencePlan version is unsupported");
  }
  if (value.providerType !== "openai" && value.providerType !== "doubao" && value.providerType !== "grok" && value.providerType !== "runware") {
    throw new TypeError("providerOutput.referencePlan.providerType is unsupported");
  }
  if (value.strategy !== "none" && value.strategy !== "direct" && value.strategy !== "cast_identity_board") {
    throw new TypeError("providerOutput.referencePlan.strategy is unsupported");
  }
  for (const field of ["inputReferenceAssetIds", "usedReferenceAssetIds", "omittedRequired", "warnings"] as const) {
    if (!isStringArray(value[field])) throw new TypeError(`providerOutput.referencePlan.${field} must be string[]`);
  }
  if (value.compositionCoverage !== "prompt_only" || !Array.isArray(value.slots)) {
    throw new TypeError("providerOutput.referencePlan coverage is invalid");
  }
  value.slots.forEach((slot, index) => {
    if (!isRecord(slot)
      || slot.order !== index + 1
      || (slot.role !== "direct_identity" && slot.role !== "cast_identity_board" && slot.role !== "scene_environment")
      || typeof slot.providerReferenceId !== "string"
      || typeof slot.label !== "string"
      || !isStringArray(slot.covers)) {
      throw new TypeError(`providerOutput.referencePlan.slots[${index}] is invalid`);
    }
  });
  return JSON.parse(JSON.stringify(value)) as CandidateReferencePlanEvidence;
}

async function prepareSourceReference(reference: CandidateImageReferenceInput): Promise<PreparedSourceReference> {
  if (!reference.assetId.trim() || !reference.label.trim() || !reference.fileName.trim()) {
    throw new BadRequestException("CANDIDATE_REFERENCE_DESCRIPTOR_INVALID");
  }
  if (reference.kind === "character_identity" && reference.sourceReferenceKind !== "preview_front") {
    throw new BadRequestException(`CANDIDATE_FINAL_REFERENCE_SINGLE_IDENTITY_ANCHOR_REQUIRED:${reference.assetId}`);
  }
  if (reference.kind === "scene_environment" && reference.sourceReferenceKind !== "scene_background") {
    throw new BadRequestException(`CANDIDATE_SCENE_REFERENCE_KIND_INVALID:${reference.assetId}`);
  }
  try {
    if (reference.kind === "character_identity") {
      const identity = await prepareCandidateIdentityImage({
        assetId: reference.assetId,
        label: reference.label,
        buffer: reference.buffer,
        fileName: reference.fileName,
      });
      return {
        source: reference,
        identity,
        provider: {
          assetId: reference.assetId,
          kind: "character_identity",
          label: reference.label,
          priority: reference.priority,
          buffer: identity.buffer,
          mimeType: identity.mimeType,
          fileName: identity.fileName,
          sourceAssetIds: [reference.assetId],
        },
      };
    }

    const inspection = await inspectCandidateImage(reference.buffer);
    return {
      source: reference,
      provider: {
        assetId: reference.assetId,
        kind: "scene_environment",
        label: reference.label,
        priority: reference.priority,
        buffer: reference.buffer,
        mimeType: inspection.mimeType,
        fileName: reference.fileName,
        sourceAssetIds: [reference.assetId],
      },
    };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(`CANDIDATE_REFERENCE_IMAGE_INVALID:${reference.assetId}`);
  }
}

function assertUniqueRequiredReferences(references: readonly CandidateImageReferenceInput[]): void {
  const seen = new Set<string>();
  for (const reference of references) {
    if (seen.has(reference.assetId)) {
      throw new BadRequestException(`CANDIDATE_REFERENCE_DUPLICATE_ASSET_ID:${reference.assetId}`);
    }
    seen.add(reference.assetId);
  }
}

function completeEvidence(input: {
  providerType: ImageProviderType;
  strategy: CandidateReferencePlanEvidence["strategy"];
  inputReferenceAssetIds: string[];
  references: CandidateProviderImageReferenceInput[];
  slots: CandidateReferencePlanSlotEvidence[];
  warnings: string[];
}): CandidateReferencePlanEvidence {
  const covered = new Set(input.slots.flatMap((slot) => slot.covers));
  const omittedRequired = input.inputReferenceAssetIds.filter((assetId) => !covered.has(assetId));
  if (omittedRequired.length > 0) {
    throw new BadRequestException(`CANDIDATE_REQUIRED_REFERENCES_UNCOVERED:${omittedRequired.join(",")}`);
  }
  const physicallyCovered = new Set(input.references.flatMap((reference) => reference.sourceAssetIds));
  const notPhysicallyCovered = input.inputReferenceAssetIds.filter((assetId) => !physicallyCovered.has(assetId));
  if (notPhysicallyCovered.length > 0) {
    throw new BadRequestException(`CANDIDATE_REFERENCE_PLAN_PHYSICAL_COVERAGE_INVALID:${notPhysicallyCovered.join(",")}`);
  }
  return {
    schemaVersion: 1,
    compilerVersion: CANDIDATE_REFERENCE_PLAN_COMPILER_VERSION,
    providerType: input.providerType,
    strategy: input.strategy,
    inputReferenceAssetIds: [...input.inputReferenceAssetIds],
    usedReferenceAssetIds: [...input.inputReferenceAssetIds],
    slots: input.slots,
    omittedRequired: [],
    compositionCoverage: "prompt_only",
    warnings: [...input.warnings],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
