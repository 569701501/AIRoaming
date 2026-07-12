import { digestCanonicalJson } from "@airoaming/shared";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../persistence/prisma.service.js";
import { PrismaMigrationLedgerRepository } from "./prisma-migration-ledger.repository.js";
import { ProjectChapterShadowImporter } from "./project-chapter-shadow-importer.js";
import { ScriptOutlineShadowImporter } from "./script-outline-shadow-importer.js";
import { ScriptPendingRevisionShadowImporter } from "./script-pending-revision-shadow-importer.js";
import { StoryShadowImporter } from "./story-shadow-importer.js";
import { StoryboardShadowImporter } from "./storyboard-shadow-importer.js";
import { CharacterShadowImporter } from "./character-shadow-importer.js";
import { AssetShadowImporter } from "./asset-shadow-importer.js";
import { AssetVisualShadowImporter } from "./asset-visual-shadow-importer.js";
import { PreflightShadowImporter } from "./preflight-shadow-importer.js";
import { TaskShadowImporter } from "./task-shadow-importer.js";
import { CandidateShadowImporter } from "./candidate-shadow-importer.js";
import { CandidateLockShadowImporter } from "./candidate-lock-shadow-importer.js";
import { LayoutShadowImporter } from "./layout-shadow-importer.js";
import { ExportShadowImporter } from "./export-shadow-importer.js";
import { ProviderShadowImporter } from "./provider-shadow-importer.js";
import { DialogueShadowImporter } from "./dialogue-shadow-importer.js";
import type { ComicFormatReport } from "./migration-report.js";

export const FULL_SHADOW_SLICE_ORDER = [
  "project-chapter",
  "script-outline",
  "script-pending-revision",
  "story",
  "storyboard",
  "characters",
  "assets",
  "asset-visuals",
  "preflight",
  "tasks",
  "candidates",
  "candidate-locks",
  "layout",
  "exports",
  "dialogue",
  "providers",
] as const;

export type FullShadowSlice = (typeof FULL_SHADOW_SLICE_ORDER)[number];

export interface FullShadowSliceResult {
  slice: FullShadowSlice;
  runId: string;
  status: string;
  reportDigest: string | null;
  counts: Record<string, unknown> | null;
  report?: ComicFormatReport;
}

export interface FullShadowImportResult {
  schemaVersion: 1;
  kind: "airoaming_full_shadow_import_v1";
  status: "succeeded" | "blocked";
  slices: FullShadowSliceResult[];
  reportDigest: `sha256:${string}`;
}

/**
 * 全量 shadow 编排器：只负责按依赖顺序调用已完成的切片，不创建 final run，
 * 也不改变 persistence mode。每个切片仍保留独立 MigrationRun，便于回滚和审计。
 */
export class FullShadowImporter {
  private readonly ledger: PrismaMigrationLedgerRepository;

  constructor(private readonly prisma: PrismaService, ledger?: PrismaMigrationLedgerRepository) {
    this.ledger = ledger ?? new PrismaMigrationLedgerRepository(prisma);
  }

  async import(
    snapshotPath: string,
    decisionsPath: string,
    options: { workspaceRoot: string; runIdPrefix?: string } = { workspaceRoot: process.cwd() },
  ): Promise<FullShadowImportResult> {
    const results: FullShadowSliceResult[] = [];
    const runIdPrefix = options.runIdPrefix ?? `full-shadow-${randomUUID()}`;
    for (const [index, slice] of FULL_SHADOW_SLICE_ORDER.entries()) {
      const runId = `${runIdPrefix}-${String(index + 1).padStart(2, "0")}-${slice}`;
      let result: Awaited<ReturnType<FullShadowImporter["importSlice"]>>;
      try {
        result = await this.importSlice(slice, snapshotPath, decisionsPath, options.workspaceRoot, runId);
      } catch (error) {
        // Individual importers keep their original throw behavior, but the
        // full orchestrator must preserve a failed terminal run in its own
        // aggregate and stop before creating downstream empty runs.
        try {
          const failedRun = await this.ledger.getRun(runId);
          if (failedRun.status !== "failed") throw error;
          results.push({ slice, runId: failedRun.id, status: failedRun.status, reportDigest: failedRun.reportDigest, counts: failedRun.counts });
          break;
        } catch {
          throw error;
        }
      }
      results.push({
        slice,
        runId: result.run.id,
        status: result.run.status,
        reportDigest: result.report.reportDigest,
        counts: result.run.counts,
        report: result.report,
      });
      // A downstream slice cannot produce a trustworthy shadow when its
      // prerequisite is blocked/failed. Stop at the first non-successful
      // run instead of creating misleading empty/successful child runs.
      if (result.run.status !== "succeeded") break;
    }
    const status: "succeeded" | "blocked" = results.some((result) => result.status !== "succeeded") ? "blocked" : "succeeded";
    const digestInput = {
      schemaVersion: 1 as const,
      kind: "airoaming_full_shadow_import_v1" as const,
      status,
      slices: results.map(({ slice, status: sliceStatus, reportDigest, counts }) => ({ slice, status: sliceStatus, reportDigest, counts })),
    };
    return { ...digestInput, slices: results, reportDigest: digestCanonicalJson(digestInput) };
  }

  private async importSlice(slice: FullShadowSlice, snapshotPath: string, decisionsPath: string, workspaceRoot: string, runId?: string): Promise<{ run: { id: string; status: string; counts: Record<string, unknown> | null }; report: ComicFormatReport }> {
    const options = runId ? { runId } : {};
    switch (slice) {
      case "project-chapter": return new ProjectChapterShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "script-outline": return new ScriptOutlineShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "script-pending-revision": return new ScriptPendingRevisionShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "story": return new StoryShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "storyboard": return new StoryboardShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "characters": return new CharacterShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "assets": return new AssetShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "asset-visuals": return new AssetVisualShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, { ...options, workspaceRoot });
      case "preflight": return new PreflightShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "tasks": return new TaskShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "candidates": return new CandidateShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "candidate-locks": return new CandidateLockShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "layout": return new LayoutShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "exports": return new ExportShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "providers": return new ProviderShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
      case "dialogue": return new DialogueShadowImporter(this.prisma, this.ledger).import(snapshotPath, decisionsPath, options);
    }
  }
}
