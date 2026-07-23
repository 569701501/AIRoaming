import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  createLayoutImageAnalysisV1,
  createRuleFallbackLayoutImageAnalysisV1,
  parseLayoutCompositionTaskOutputV1,
  type LayoutCompositionTaskInputV1,
  type LayoutDigest,
  type LayoutImageAnalysisV1,
  type LayoutShotVisualAnalysisV1,
  type LayoutVisualEvidenceInputV1,
} from "@airoaming/shared";

import {
  OpenCodeRuntimeService,
  type OpenCodeStructuredImageMimeType,
} from "../ai-runtime/opencode-runtime.service.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";

const SOURCE_IMAGE_MIME_TYPES = new Set<OpenCodeStructuredImageMimeType>([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_SOURCE_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_ANALYSIS_EDGE = 1536;

const RECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y", "width", "height"],
  properties: {
    x: { type: "number", minimum: 0, maximum: 1 },
    y: { type: "number", minimum: 0, maximum: 1 },
    width: { type: "number", exclusiveMinimum: 0, maximum: 1 },
    height: { type: "number", exclusiveMinimum: 0, maximum: 1 },
  },
} as const;

const VISUAL_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subjects", "focalRegions", "textSafeRegions", "visualCenter"],
  properties: {
    subjects: {
      type: "array",
      maxItems: 32,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["characterId", "bodyBox", "faceBox", "importance", "confidence"],
        properties: {
          characterId: { anyOf: [{ type: "string" }, { type: "null" }] },
          bodyBox: RECT_SCHEMA,
          faceBox: { anyOf: [RECT_SCHEMA, { type: "null" }] },
          importance: { type: "number", minimum: 0, maximum: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    focalRegions: {
      type: "array",
      maxItems: 32,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["box", "weight"],
        properties: {
          box: RECT_SCHEMA,
          weight: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    textSafeRegions: {
      type: "array",
      maxItems: 32,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["box", "score"],
        properties: {
          box: RECT_SCHEMA,
          score: { type: "number", minimum: 0, maximum: 1 },
        },
      },
    },
    visualCenter: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y"],
      properties: {
        x: { type: "number", minimum: 0, maximum: 1 },
        y: { type: "number", minimum: 0, maximum: 1 },
      },
    },
  },
} as const;

interface RawVisualAnalysisV1 {
  subjects: Array<{
    characterId: string | null;
    bodyBox: { x: number; y: number; width: number; height: number };
    faceBox: { x: number; y: number; width: number; height: number } | null;
    importance: number;
    confidence: number;
  }>;
  focalRegions: Array<{
    box: { x: number; y: number; width: number; height: number };
    weight: number;
  }>;
  textSafeRegions: Array<{
    box: { x: number; y: number; width: number; height: number };
    score: number;
  }>;
  visualCenter: { x: number; y: number };
}

export interface LayoutVisualAnalysisRunV1 {
  visualEvidence: LayoutVisualEvidenceInputV1[];
  analyses: LayoutShotVisualAnalysisV1[];
  attemptedShotCount: number;
  succeededShotCount: number;
  reusedShotCount: number;
}

function sha256(bytes: Buffer): LayoutDigest {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function timeoutMs(): number {
  const configured = Number(process.env.LAYOUT_VISUAL_ANALYSIS_TIMEOUT_MS ?? 25_000);
  if (!Number.isFinite(configured)) return 25_000;
  return Math.max(1_000, Math.min(60_000, Math.round(configured)));
}

function fallback(
  assetId: string,
  assetDigest: LayoutDigest,
  warning: string,
): LayoutImageAnalysisV1 {
  return createRuleFallbackLayoutImageAnalysisV1({
    assetId,
    assetDigest,
    warning,
  });
}

function promptFor(
  source: LayoutCompositionTaskInputV1["source"],
  shotId: string,
): string {
  const shot = source.storyboard.document.shots.find((item) => item.id === shotId);
  if (!shot) throw new Error(`LAYOUT_VISUAL_ANALYSIS_SHOT_MISSING:${shotId}`);
  const characterById = new Map(source.characterCatalog.items.map((item) => [
    item.characterId,
    item.name,
  ]));
  const characters = shot.characterIds.map((characterId) => ({
    characterId,
    name: characterById.get(characterId) ?? characterId,
  }));
  return [
    "分析附件中的漫画候选图，只返回给定 JSON Schema。",
    "所有坐标均以原图左上角为 (0,0)、右下角为 (1,1) 的归一化坐标。",
    "subjects：标出可见人物的身体范围和可见脸部；无法可靠对应角色时 characterId 必须为 null，不能猜。",
    "focalRegions：标出脸、手、武器、关键动作或关键物体等不应被裁掉或遮住的区域。",
    "textSafeRegions：只标出适合放对白且不遮挡脸、主体、关键动作的空白区域。",
    "visualCenter：画面叙事重点的中心。confidence 和 importance 必须诚实反映不确定性。",
    `允许使用的角色：${JSON.stringify(characters)}`,
    `分镜语义：${JSON.stringify({
      shotId: shot.id,
      frameType: shot.motion.frameType,
      shotType: shot.shotType,
      cameraAngle: shot.cameraAngle,
      coreAction: shot.coreAction,
      emotion: shot.emotion,
      panelDescription: shot.comic.panelDescription,
      composition: shot.comic.composition,
    })}`,
  ].join("\n");
}

@Injectable()
export class LayoutVisualAnalyzerService {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(WorkspacePathService) private readonly workspacePath: WorkspacePathService,
    @Inject(OpenCodeRuntimeService) private readonly runtime: OpenCodeRuntimeService,
  ) {}

  async analyze(
    input: LayoutCompositionTaskInputV1,
    requestedShotIds?: ReadonlySet<string>,
  ): Promise<LayoutVisualAnalysisRunV1> {
    const cached = await this.cachedAnalyses(input);
    const assets = await this.resolveAssets(input);
    const analyses: LayoutShotVisualAnalysisV1[] = [];
    let attemptedShotCount = 0;
    let succeededShotCount = 0;
    let reusedShotCount = 0;

    for (const item of input.source.candidateLockSet.items) {
      const shotId = item.source.shotId;
      const prior = cached.get(`${item.source.assetId}\0${item.assetDigest}`);
      let analysis: LayoutImageAnalysisV1;
      if (prior) {
        analysis = prior;
        reusedShotCount += 1;
      } else if (!input.source.visualAnalysisProvider) {
        analysis = fallback(item.source.assetId, item.assetDigest, "visual_analysis_not_configured");
      } else if (requestedShotIds && !requestedShotIds.has(shotId)) {
        analysis = fallback(item.source.assetId, item.assetDigest, "visual_analysis_outside_requested_scope");
      } else {
        attemptedShotCount += 1;
        const result = await this.analyzeOne(input, item, assets.get(item.source.assetId)!);
        analysis = result.analysis;
        if (result.succeeded) succeededShotCount += 1;
      }
      analyses.push({
        shotId,
        sourceDigest: item.source.sourceDigest,
        analysis,
      });
    }
    return {
      visualEvidence: analyses.map((entry) => ({
        shotId: entry.shotId,
        assetId: entry.analysis.assetId,
        assetDigest: entry.analysis.assetDigest,
        analysis: entry.analysis,
      })),
      analyses,
      attemptedShotCount,
      succeededShotCount,
      reusedShotCount,
    };
  }

  private async cachedAnalyses(
    input: LayoutCompositionTaskInputV1,
  ): Promise<Map<string, LayoutImageAnalysisV1>> {
    const result = new Map<string, LayoutImageAnalysisV1>();
    const rows = await this.prismaService.database().generationTask.findMany({
      where: {
        projectId: input.source.projectId,
        chapterId: input.chapterId,
        type: "layout_compose",
        recordKind: "runtime",
        status: "succeeded",
        outputJson: { not: Prisma.DbNull },
      },
      select: { outputJson: true },
      orderBy: { finishedAt: "desc" },
      take: 30,
    });
    for (const row of rows) {
      try {
        const output = parseLayoutCompositionTaskOutputV1(row.outputJson);
        for (const entry of output.visualAnalyses) {
          if (entry.analysis.mode !== "vision") continue;
          const key = `${entry.analysis.assetId}\0${entry.analysis.assetDigest}`;
          if (!result.has(key)) result.set(key, entry.analysis);
        }
      } catch {
        // Older or damaged historical task output is never trusted as a cache.
      }
    }
    return result;
  }

  private async resolveAssets(
    input: LayoutCompositionTaskInputV1,
  ): Promise<Map<string, {
    mimeType: OpenCodeStructuredImageMimeType;
    fileName: string;
    bytes: Buffer;
  }>> {
    const expected = input.source.candidateLockSet.items;
    const rows = await this.prismaService.database().asset.findMany({
      where: {
        id: { in: expected.map((item) => item.source.assetId) },
        projectId: input.source.projectId,
        status: "ready",
      },
      select: {
        id: true,
        sha256: true,
        bytes: true,
        width: true,
        height: true,
        mimeType: true,
        storageKey: true,
      },
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const result = new Map<string, {
      mimeType: OpenCodeStructuredImageMimeType;
      fileName: string;
      bytes: Buffer;
    }>();
    for (const item of expected) {
      const row = rowById.get(item.source.assetId);
      if (
        !row
        || !SOURCE_IMAGE_MIME_TYPES.has(row.mimeType as OpenCodeStructuredImageMimeType)
        || !row.bytes
        || row.bytes < 1
        || row.bytes > MAX_SOURCE_IMAGE_BYTES
        || row.sha256 !== item.assetDigest
        || row.width !== item.width
        || row.height !== item.height
      ) {
        throw new Error(`LAYOUT_VISUAL_ANALYSIS_ASSET_INVALID:${item.source.assetId}`);
      }
      const absolute = this.workspacePath.resolveVirtualPath(`/workspace/${row.storageKey}`);
      const canonical = await realpath(absolute).catch(() => {
        throw new Error(`LAYOUT_VISUAL_ANALYSIS_ASSET_INVALID:${item.source.assetId}`);
      });
      if (canonical !== absolute) {
        throw new Error(`LAYOUT_VISUAL_ANALYSIS_ASSET_INVALID:${item.source.assetId}`);
      }
      const bytes = await readFile(absolute);
      if (bytes.byteLength !== row.bytes || sha256(bytes) !== item.assetDigest) {
        throw new Error(`LAYOUT_VISUAL_ANALYSIS_ASSET_INVALID:${item.source.assetId}`);
      }
      result.set(item.source.assetId, {
        mimeType: row.mimeType as OpenCodeStructuredImageMimeType,
        fileName: path.basename(row.storageKey),
        bytes,
      });
    }
    return result;
  }

  private async analyzeOne(
    input: LayoutCompositionTaskInputV1,
    item: LayoutCompositionTaskInputV1["source"]["candidateLockSet"]["items"][number],
    asset: {
      mimeType: OpenCodeStructuredImageMimeType;
      fileName: string;
      bytes: Buffer;
    },
  ): Promise<{ analysis: LayoutImageAnalysisV1; succeeded: boolean }> {
    const provider = input.source.visualAnalysisProvider;
    if (!provider) {
      return {
        analysis: fallback(item.source.assetId, item.assetDigest, "visual_analysis_not_configured"),
        succeeded: false,
      };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs());
    try {
      const rendition = await sharp(asset.bytes, { failOn: "error" })
        .rotate()
        .resize({
          width: MAX_ANALYSIS_EDGE,
          height: MAX_ANALYSIS_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 86, chromaSubsampling: "4:2:0" })
        .toBuffer();
      const response = await this.runtime.generateStructured({
        title: `漫画画面分析 ${item.order}`,
        content: promptFor(input.source, item.source.shotId),
        schema: VISUAL_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
        images: [{
          mimeType: "image/jpeg",
          fileName: `${path.parse(asset.fileName).name || `shot-${item.order}`}.analysis.jpg`,
          dataUrl: `data:image/jpeg;base64,${rendition.toString("base64")}`,
        }],
        model: provider,
        signal: controller.signal,
      });
      const raw = response.value as RawVisualAnalysisV1;
      const allowedCharacters = new Set(
        input.source.storyboard.document.shots
          .find((shot) => shot.id === item.source.shotId)
          ?.characterIds ?? [],
      );
      if (
        !raw
        || !Array.isArray(raw.subjects)
        || raw.subjects.some((subject) => (
          subject.characterId !== null && !allowedCharacters.has(subject.characterId)
        ))
      ) {
        throw new Error("LAYOUT_VISUAL_ANALYSIS_PROVIDER_MAPPING_INVALID");
      }
      const warnings = [
        ...(allowedCharacters.size > 0 && raw.subjects.length === 0
          ? ["visual_analysis_subject_not_detected"]
          : []),
        ...(raw.textSafeRegions.length === 0
          ? ["visual_analysis_text_safe_region_not_detected"]
          : []),
      ];
      const analysis = createLayoutImageAnalysisV1({
        schemaVersion: 1,
        policyVersion: "layout_visual_analysis_v1",
        assetId: item.source.assetId,
        assetDigest: item.assetDigest,
        mode: "vision",
        subjects: raw.subjects.map((subject, index) => ({
          id: `subject_${String(index + 1).padStart(3, "0")}`,
          characterId: subject.characterId,
          bodyBox: subject.bodyBox,
          faceBox: subject.faceBox,
          importance: subject.importance,
          confidence: subject.confidence,
        })),
        focalRegions: raw.focalRegions,
        textSafeRegions: raw.textSafeRegions,
        visualCenter: raw.visualCenter,
        warnings,
      });
      return { analysis, succeeded: true };
    } catch {
      return {
        analysis: fallback(
          item.source.assetId,
          item.assetDigest,
          controller.signal.aborted
            ? "visual_analysis_timeout"
            : "visual_analysis_provider_failed",
        ),
        succeeded: false,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
