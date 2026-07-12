import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  encodePreflightDocumentV2,
  type ConfirmChapterPreflightRequest,
  type ConfirmChapterPreflightResponse,
  type GetChapterPreflightPreviewResponse,
  type PreflightRevisionDto,
} from "@airoaming/shared";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../persistence/prisma.service.js";
import { createG2DatabaseError, G2DatabaseError, mapG2DatabaseError } from "./g2-database-error.mapper.js";
import { ChapterProductionQueryService } from "./chapter-production-query.service.js";
import { SourceSnapshotBuilderService } from "./source-snapshot-builder.service.js";
import { VersionTransactionRunner } from "./version-transaction-runner.service.js";
import type { VersionScopeV1 } from "./versioning-database.types.js";

function iso(value: Date): string { return value.toISOString(); }

@Injectable()
export class PreflightRevisionRepository {
  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(VersionTransactionRunner) private readonly transactionRunner: VersionTransactionRunner,
    @Inject(SourceSnapshotBuilderService) private readonly snapshotBuilder: SourceSnapshotBuilderService,
    @Inject(ChapterProductionQueryService) private readonly productionQuery: ChapterProductionQueryService,
  ) {}

  async getPreview(scope: VersionScopeV1, notes = ""): Promise<GetChapterPreflightPreviewResponse> {
    this.assertDatabaseMode();
    const result = await this.snapshotBuilder.build(scope, notes);
    return { preview: result.document, sourceDigest: result.sourceDigest, chapterRowVersion: result.chapter.rowVersion };
  }

  async confirm(scope: VersionScopeV1, request: ConfirmChapterPreflightRequest): Promise<ConfirmChapterPreflightResponse> {
    this.assertDatabaseMode();
    return this.run(async (tx) => {
      const current = await this.snapshotBuilder.build(scope, request.notes?.trim() ?? "", tx);
      const existing = current.chapter.currentPreflightRevision;
      if (
        existing &&
        current.chapter.rowVersion === request.expectedChapterRowVersion + 1 &&
        current.sourceStoryboardVersionId === request.expectedSourceStoryboardVersionId &&
        current.sourceDigest === request.expectedSourceDigest &&
        existing.sourceDigest === request.expectedSourceDigest
      ) {
        return { preflight: this.toDto(existing), productionState: (await this.productionQuery.readScoped(scope, tx)).productionState, chapterRowVersion: current.chapter.rowVersion, replayed: true };
      }
      if (current.chapter.rowVersion !== request.expectedChapterRowVersion) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      if (current.sourceStoryboardVersionId !== request.expectedSourceStoryboardVersionId || current.sourceDigest !== request.expectedSourceDigest) throw createG2DatabaseError(409, "PREFLIGHT_SOURCE_CHANGED", { expected: request.expectedSourceDigest, actual: current.sourceDigest });
      if (!current.document.ready) throw createG2DatabaseError(422, "SOURCE_UNRESOLVED", { issues: current.document.issues });

      const previous = await tx.preflightRevision.findFirst({ where: { chapterId: scope.chapterId }, orderBy: { version: "desc" }, select: { version: true } });
      const now = new Date();
      const encoded = encodePreflightDocumentV2(current.document);
      const created = await tx.preflightRevision.create({
        data: {
          id: randomUUID(), projectId: scope.projectId, chapterId: scope.chapterId, version: (previous?.version ?? 0) + 1,
          status: "confirmed", sourceStoryboardVersionId: current.sourceStoryboardVersionId, sourcePolicyVersion: "preflight-source-v1",
          sourceDigest: current.sourceDigest, documentJson: encoded.value as unknown as Prisma.InputJsonValue, schemaVersion: 2,
          documentDigest: encoded.digest, ready: true, createdAt: now, confirmedAt: now,
        },
      });
      const updated = await tx.chapter.updateMany({ where: { id: scope.chapterId, projectId: scope.projectId, rowVersion: request.expectedChapterRowVersion }, data: { currentPreflightRevisionId: created.id, rowVersion: { increment: 1 } } });
      if (updated.count !== 1) throw createG2DatabaseError(409, "CHAPTER_VERSION_CONFLICT");
      const after = await this.productionQuery.readScoped(scope, tx);
      return { preflight: this.toDto(created), productionState: after.productionState, chapterRowVersion: after.row.rowVersion, replayed: false };
    });
  }

  private toDto(row: { id: string; chapterId: string; version: number; sourceStoryboardVersionId: string; sourceDigest: string; documentDigest: string; documentJson: Prisma.JsonValue; createdAt: Date; confirmedAt: Date | null }): PreflightRevisionDto {
    const encoded = encodePreflightDocumentV2(row.documentJson);
    if (!row.confirmedAt) throw createG2DatabaseError(500, "G2_DATABASE_CONTRACT_VIOLATION");
    return { id: row.id, chapterId: row.chapterId, version: row.version, lifecycle: "confirmed", sourceStoryboardVersionId: row.sourceStoryboardVersionId, sourceDigest: row.sourceDigest as `sha256:${string}`, documentDigest: row.documentDigest as `sha256:${string}`, document: encoded.value, createdAt: iso(row.createdAt), confirmedAt: iso(row.confirmedAt) };
  }

  private assertDatabaseMode(): void {
    if (!this.prismaService.isDatabaseMode()) throw createG2DatabaseError(409, "G2_DB_MODE_REQUIRED", { actualMode: this.prismaService.mode, requiredMode: "db" });
  }

  private async run<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try { return await this.transactionRunner.run(operation); }
    catch (error) { if (error instanceof G2DatabaseError) throw error; throw new G2DatabaseError(mapG2DatabaseError(error)); }
  }
}
