import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { digestCanonicalJson } from "../versioning/canonical-json.js";
import {
  buildTaskSourceProjection,
  taskSourceProjectionDigest,
} from "../versioning/task-source-projection.js";
import {
  composeRuleBasedLayoutV1,
  digestLayoutCompositionScopeV1,
  encodeLayoutCompositionTaskOutputV1,
  parseCreateLayoutCompositionRequestV1,
  parseLayoutCompositionTaskInputV1,
  parseLayoutCompositionTaskOutputV1,
  type LayoutCompositionTaskInputV1,
} from "./index.js";

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/smart-layout/fixtures/fix-v01-vertical.json",
);

async function fixture(): Promise<any> {
  return JSON.parse(await readFile(fixturePath, "utf8"));
}

async function initialTaskInput(): Promise<LayoutCompositionTaskInputV1> {
  const sample = await fixture();
  const policy = {
    composition: "layout_composition_v1",
    dialogue: "layout_dialogue_v1",
    visualAnalysis: "layout_visual_analysis_v1",
    scoring: "layout_score_v1",
    automation: "layout_automation_v1",
  } as const;
  const characterItems = sample.inputs.characterCatalog.map((character: any) => ({
    characterId: character.id,
    name: character.name,
  }));
  const sourceItems = sample.inputs.sourceCatalog.items.map((item: any) => ({
    order: item.order,
    source: item.source,
    assetDigest: item.assetSha256,
    width: item.width,
    height: item.height,
  }));
  const policySetDigest = digestCanonicalJson({
    policyVersion: "layout_composition_policy_set_digest_v1",
    profile: sample.currentBaseline.layoutDocument.profile,
    fontPolicy: sample.currentBaseline.layoutDocument.fontPolicy,
    policy,
    intent: "standard",
  });
  const sourceProjection = buildTaskSourceProjection({
    policyVersion: "layout-compose-source-v1",
    projectId: sample.inputs.sourceCatalog.projectId,
    chapterId: sample.inputs.sourceCatalog.chapterId,
    consumerType: "layout_compose",
    sources: [
      {
        role: "storyboard",
        sourceType: "storyboard_version",
        sourceId: sample.inputs.storyboardVersion.id,
        sourceDigest: sample.inputs.storyboardVersion.documentDigest,
      },
      {
        role: "lock_set",
        sourceType: "lock_set",
        sourceId: sample.inputs.sourceCatalog.chapterId,
        sourceDigest: sample.inputs.sourceCatalog.sourceLockSetDigest,
      },
      {
        role: "policy",
        sourceType: "project",
        sourceId: sample.inputs.sourceCatalog.projectId,
        sourceDigest: policySetDigest,
      },
      ...sourceItems.flatMap((item: any) => [
        {
          role: "candidate_lock",
          sourceType: "candidate_lock_revision",
          sourceId: item.source.candidateLockRevisionId,
          sourceDigest: item.assetDigest,
        },
        {
          role: "image_asset",
          sourceType: "asset",
          sourceId: item.source.assetId,
          sourceDigest: item.assetDigest,
        },
      ]),
      {
        role: "font_asset",
        sourceType: "asset",
        sourceId: sample.inputs.fontAsset.assetId,
        sourceDigest: sample.inputs.fontAsset.sha256,
      },
      ...sample.inputs.characterCatalog.map((character: any) => ({
        role: "character",
        sourceType: "character",
        sourceId: character.projectCharacterId,
        sourceDigest: digestCanonicalJson({
          token: character.id,
          databaseId: character.projectCharacterId,
          name: character.name,
        }),
      })),
    ],
  });
  return parseLayoutCompositionTaskInputV1({
    schemaVersion: 1,
    chapterId: sample.inputs.sourceCatalog.chapterId,
    mode: "initial",
    intent: "standard",
    scope: null,
    scopeDigest: digestLayoutCompositionScopeV1(null),
    policySetDigest,
    sourceProjection,
    sourceProjectionDigest: taskSourceProjectionDigest(sourceProjection),
    source: {
      schemaVersion: 1,
      projectId: sample.inputs.sourceCatalog.projectId,
      chapterId: sample.inputs.sourceCatalog.chapterId,
      comicFormat: sample.variant.comicFormat,
      storyboard: {
        versionId: sample.inputs.storyboardVersion.id,
        documentDigest: sample.inputs.storyboardVersion.documentDigest,
        document: sample.inputs.storyboardVersion.document,
      },
      candidateLockSet: {
        digest: sample.inputs.sourceCatalog.sourceLockSetDigest,
        items: sourceItems,
      },
      characterCatalog: {
        digest: digestCanonicalJson(characterItems),
        items: characterItems,
      },
      fontPolicy: sample.currentBaseline.layoutDocument.fontPolicy,
      profile: sample.currentBaseline.layoutDocument.profile,
      baseWorkingCopy: null,
      policy,
    },
  });
}

describe("Smart layout M4 persistent composition contract", () => {
  it("strictly separates initial composition from full/scoped reflow", () => {
    expect(parseCreateLayoutCompositionRequestV1({
      schemaVersion: 1,
      mode: "initial",
      intent: "standard",
      scope: null,
      expectedWorkingCopyRowVersion: null,
      expectedDocumentDigest: null,
    })).toMatchObject({ mode: "initial", scope: null });

    expect(() => parseCreateLayoutCompositionRequestV1({
      schemaVersion: 1,
      mode: "initial",
      intent: "more_compact",
      scope: null,
      expectedWorkingCopyRowVersion: null,
      expectedDocumentDigest: null,
    })).toThrow(/initial mode requires standard intent/);
    expect(() => parseCreateLayoutCompositionRequestV1({
      schemaVersion: 1,
      mode: "full_reflow",
      intent: "standard",
      scope: { canvasIds: ["canvas_1"], elementIds: [], shotIds: [] },
      expectedWorkingCopyRowVersion: 1,
      expectedDocumentDigest: `sha256:${"a".repeat(64)}`,
    })).toThrow(/full_reflow requires null scope/);
    expect(() => parseCreateLayoutCompositionRequestV1({
      schemaVersion: 1,
      mode: "scoped_reflow",
      intent: "dialogue_readability",
      scope: { canvasIds: [], elementIds: [], shotIds: [] },
      expectedWorkingCopyRowVersion: 1,
      expectedDocumentDigest: `sha256:${"a".repeat(64)}`,
    })).toThrow(/requires at least one target/);
  });

  it("seals source, scope and policy digests before the task is accepted", async () => {
    const input = await initialTaskInput();
    expect(input.source.candidateLockSet.items).toHaveLength(6);
    expect(input.sourceProjection.sources.some((item) => item.role === "font_asset")).toBe(true);

    expect(() => parseLayoutCompositionTaskInputV1({
      ...input,
      scopeDigest: `sha256:${"0".repeat(64)}`,
    })).toThrow(/does not match scope/);
    expect(() => parseLayoutCompositionTaskInputV1({
      ...input,
      policySetDigest: `sha256:${"0".repeat(64)}`,
    })).toThrow(/does not match policy set/);
    expect(() => parseLayoutCompositionTaskInputV1({
      ...input,
      sourceProjectionDigest: `sha256:${"0".repeat(64)}`,
    })).toThrow(/does not match sourceProjection/);
  });

  it("freezes the semantic typography preset and keeps legacy tasks readable", async () => {
    const legacy = await initialTaskInput();
    expect(legacy.source.typographyPreset).toMatchObject({
      policyVersion: "layout_typography_preset_v1",
      speech: { fontAssetId: legacy.source.fontPolicy.defaultFontAssetId, fontWeight: 400 },
      shout: { fontAssetId: legacy.source.fontPolicy.defaultFontAssetId, fontWeight: 700 },
    });

    const typographyPreset = {
      policyVersion: "layout_typography_preset_v1",
      speech: { fontAssetId: "font_regular", fontWeight: 400, fontStyle: "normal" },
      thought: { fontAssetId: "font_regular", fontWeight: 400, fontStyle: "normal" },
      shout: { fontAssetId: "font_black", fontWeight: 900, fontStyle: "normal" },
      caption: { fontAssetId: "font_medium", fontWeight: 500, fontStyle: "normal" },
    } as const;
    const source = { ...legacy.source, typographyPreset };
    const policySetDigest = digestCanonicalJson({
      policyVersion: "layout_composition_policy_set_digest_v1",
      profile: source.profile,
      fontPolicy: source.fontPolicy,
      typographyPreset,
      policy: source.policy,
      intent: legacy.intent,
      visualAnalysisProvider: source.visualAnalysisProvider,
    });
    const parsed = parseLayoutCompositionTaskInputV1({
      ...legacy,
      source,
      policySetDigest,
    });
    expect(parsed.source.typographyPreset).toEqual(typographyPreset);
  });

  it("emits one canonical initial V2 document and rejects mixed or sensitive output", async () => {
    const input = await initialTaskInput();
    const source = input.source;
    const plan = composeRuleBasedLayoutV1({
      projectId: source.projectId,
      chapterId: source.chapterId,
      comicFormat: source.comicFormat,
      profile: source.profile,
      fontPolicy: source.fontPolicy,
      storyboardVersion: {
        id: source.storyboard.versionId,
        documentDigest: source.storyboard.documentDigest,
        document: source.storyboard.document,
      },
      sourceLockSetDigest: source.candidateLockSet.digest,
      sources: source.candidateLockSet.items.map((item) => ({
        order: item.order,
        source: item.source,
        width: item.width,
        height: item.height,
      })),
      characterCatalog: source.characterCatalog.items,
    });
    const output = {
      schemaVersion: 1,
      mode: "initial",
      sourceProjectionDigest: input.sourceProjectionDigest,
      baseDocumentDigest: null,
      result: {
        kind: "initial_document",
        document: plan.document,
        commandBatch: null,
      },
      report: {
        planDigest: plan.planDigest,
        analysisMode: "rule_fallback",
        candidateCount: 3,
        selectedScore: 100,
        scoreBreakdown: { coverage: 100 },
        shotCoverage: plan.report.shotCoverage,
        dialogueCoverage: {
          expected: plan.report.dialogueCoverage.expected,
          placedOriginal: plan.report.dialogueCoverage.placedOriginal,
          userModified: plan.report.dialogueCoverage.userModified,
          userSuppressed: plan.report.dialogueCoverage.userSuppressed,
        },
        issues: [],
      },
    } as const;
    const first = encodeLayoutCompositionTaskOutputV1(output);
    const second = encodeLayoutCompositionTaskOutputV1(structuredClone(output));
    expect(first.digest).toBe(second.digest);
    expect(first.value.result.document?.kind).toBe("layout_document_v2");

    expect(() => parseLayoutCompositionTaskOutputV1({
      ...output,
      result: {
        kind: "command_batch",
        document: plan.document,
        commandBatch: {
          schemaVersion: 2,
          batchId: "mixed_result",
          label: "不允许混合结果",
          commands: [{
            schemaVersion: 2,
            commandId: "mixed_result_command",
            type: "layout.resize_profile",
            label: "不允许混合结果",
            actor: "smart",
            payload: {
              profile: plan.document.profile,
              canvases: plan.document.canvases,
            },
          }],
        },
      },
    })).toThrow(/inconsistent/);
    expect(() => parseLayoutCompositionTaskOutputV1({
      ...output,
      report: {
        ...output.report,
        scoreBreakdown: { apiKey: 1 },
      },
    })).toThrow(/sensitive or runtime-only/);
  });
});
