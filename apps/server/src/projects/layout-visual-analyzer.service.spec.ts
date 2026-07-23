import { createHash } from "node:crypto";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LayoutCompositionTaskInputV1, LayoutDigest } from "@airoaming/shared";

import type { OpenCodeRuntimeService } from "../ai-runtime/opencode-runtime.service.js";
import type { PrismaService } from "../persistence/prisma.service.js";
import type { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { LayoutVisualAnalyzerService } from "./layout-visual-analyzer.service.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function digest(bytes: Buffer): LayoutDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function input(assetDigest: LayoutDigest, configured = true): LayoutCompositionTaskInputV1 {
  const sourceDigest = `sha256:${"a".repeat(64)}` as LayoutDigest;
  return {
    schemaVersion: 1,
    chapterId: "chapter_001",
    mode: "initial",
    intent: "standard",
    scope: null,
    scopeDigest: `sha256:${"b".repeat(64)}`,
    policySetDigest: `sha256:${"c".repeat(64)}`,
    sourceProjection: {} as LayoutCompositionTaskInputV1["sourceProjection"],
    sourceProjectionDigest: `sha256:${"d".repeat(64)}`,
    source: {
      schemaVersion: 1,
      projectId: "project_001",
      chapterId: "chapter_001",
      comicFormat: "paged_comic",
      storyboard: {
        versionId: "storyboard_001",
        documentDigest: `sha256:${"e".repeat(64)}`,
        document: {
          schemaVersion: 2,
          chapterId: "chapter_001",
          notes: "",
          shots: [{
            id: "shot_001",
            order: 1,
            beatId: "beat_001",
            sceneId: "scene_001",
            characterIds: ["character_001"],
            coreAction: "人物回头",
            emotion: "惊讶",
            shotType: "medium",
            cameraAngle: "eye_level",
            comic: {
              panelDescription: "人物站在画面右侧",
              composition: "左侧留白",
              dialogue: "谁在那里？",
              caption: "",
              panelRhythm: "normal",
            },
            motion: {
              visualDescription: "人物回头",
              compositionDesign: "人物在右",
              cameraMovement: "static",
              frameType: "dialogue",
              durationMs: 0,
              durationHint: "",
              voiceLines: [],
            },
            promptDraft: "",
          }],
        },
      },
      candidateLockSet: {
        digest: `sha256:${"f".repeat(64)}`,
        items: [{
          order: 1,
          source: {
            shotId: "shot_001",
            candidateId: "candidate_001",
            candidateLockRevisionId: "lock_001",
            assetId: "asset_001",
            sourceDigest,
          },
          assetDigest,
          width: 1,
          height: 1,
        }],
      },
      characterCatalog: {
        digest: `sha256:${"1".repeat(64)}`,
        items: [{ characterId: "character_001", name: "林医生" }],
      },
      fontPolicy: {
        defaultFontAssetId: "font_001",
        fallbackFontAssetIds: [],
      },
      typographyPreset: {
        policyVersion: "layout_typography_preset_v1",
        speech: { fontAssetId: "font_001", fontWeight: 400, fontStyle: "normal" },
        thought: { fontAssetId: "font_001", fontWeight: 400, fontStyle: "normal" },
        shout: { fontAssetId: "font_001", fontWeight: 700, fontStyle: "normal" },
        caption: { fontAssetId: "font_001", fontWeight: 400, fontStyle: "normal" },
      },
      profile: {
        kind: "paged",
        presetId: "portrait_3_4",
        width: 1800,
        height: 2400,
        safeArea: { top: 72, right: 72, bottom: 72, left: 72 },
        panelReadingDirection: "ltr_ttb",
      },
      visualAnalysisProvider: configured
        ? { providerId: "self", modelId: "vision-test" }
        : null,
      baseWorkingCopy: null,
      policy: {
        composition: "layout_composition_v1",
        dialogue: "layout_dialogue_v1",
        visualAnalysis: "layout_visual_analysis_v1",
        scoring: "layout_score_v1",
        automation: "layout_automation_v1",
      },
    },
  };
}

describe("LayoutVisualAnalyzerService", () => {
  let directory: string | null = null;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = null;
  });

  async function harness(rawValue: unknown, configured = true) {
    directory = await mkdtemp(path.join(tmpdir(), "airoaming-layout-vision-"));
    const filePath = path.join(directory, "asset.png");
    await writeFile(filePath, png);
    const canonicalPath = await realpath(filePath);
    const assetDigest = digest(png);
    const generateStructured = vi.fn(async () => ({
      value: rawValue,
      content: "",
      model: { providerId: "self", modelId: "vision-test" },
    }));
    const prisma = {
      database: () => ({
        generationTask: { findMany: async () => [] },
        asset: {
          findMany: async () => [{
            id: "asset_001",
            sha256: assetDigest,
            bytes: png.byteLength,
            width: 1,
            height: 1,
            mimeType: "image/png",
            storageKey: "projects/project_001/assets/asset.png",
          }],
        },
      }),
    } as unknown as PrismaService;
    const workspace = {
      resolveVirtualPath: () => canonicalPath,
    } as unknown as WorkspacePathService;
    const runtime = { generateStructured } as unknown as OpenCodeRuntimeService;
    return {
      service: new LayoutVisualAnalyzerService(prisma, workspace, runtime),
      taskInput: input(assetDigest, configured),
      generateStructured,
    };
  }

  it("converts a structured provider result into a digest-bound visual analysis", async () => {
    const test = await harness({
      subjects: [{
        characterId: "character_001",
        bodyBox: { x: 0.55, y: 0.2, width: 0.35, height: 0.7 },
        faceBox: { x: 0.63, y: 0.22, width: 0.12, height: 0.12 },
        importance: 0.9,
        confidence: 0.92,
      }],
      focalRegions: [{
        box: { x: 0.6, y: 0.2, width: 0.2, height: 0.25 },
        weight: 0.9,
      }],
      textSafeRegions: [{
        box: { x: 0.05, y: 0.05, width: 0.35, height: 0.25 },
        score: 0.88,
      }],
      visualCenter: { x: 0.68, y: 0.45 },
    });

    const result = await test.service.analyze(test.taskInput);
    expect(result).toMatchObject({
      attemptedShotCount: 1,
      succeededShotCount: 1,
      reusedShotCount: 0,
      analyses: [{
        shotId: "shot_001",
        analysis: {
          mode: "vision",
          assetId: "asset_001",
          subjects: [{ id: "subject_001", characterId: "character_001" }],
        },
      }],
    });
    expect(result.analyses[0]!.analysis.analysisDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(test.generateStructured).toHaveBeenCalledWith(expect.objectContaining({
      model: { providerId: "self", modelId: "vision-test" },
      images: [expect.objectContaining({
        mimeType: "image/jpeg",
        dataUrl: expect.stringMatching(/^data:image\/jpeg;base64,/),
      })],
    }));
  });

  it("rejects an invented character mapping and falls back without failing composition", async () => {
    const test = await harness({
      subjects: [{
        characterId: "invented_character",
        bodyBox: { x: 0.1, y: 0.1, width: 0.5, height: 0.8 },
        faceBox: null,
        importance: 0.8,
        confidence: 0.8,
      }],
      focalRegions: [],
      textSafeRegions: [],
      visualCenter: { x: 0.5, y: 0.5 },
    });
    const result = await test.service.analyze(test.taskInput);
    expect(result.succeededShotCount).toBe(0);
    expect(result.analyses[0]!.analysis).toMatchObject({
      mode: "rule_fallback",
      warnings: ["visual_analysis_provider_failed"],
    });
  });

  it("does not contact a provider when visual analysis is not configured", async () => {
    const test = await harness({}, false);
    const result = await test.service.analyze(test.taskInput);
    expect(test.generateStructured).not.toHaveBeenCalled();
    expect(result.analyses[0]!.analysis).toMatchObject({
      mode: "rule_fallback",
      warnings: ["visual_analysis_not_configured"],
    });
  });
});
