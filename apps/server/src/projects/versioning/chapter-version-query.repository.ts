import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@prisma/client";

import { PrismaService } from "../../persistence/prisma.service.js";
import type { VersionScopeV1 } from "./versioning-database.types.js";

export const CHAPTER_VERSION_QUERY_INCLUDE = {
  chapterScriptPendingByChapter: { include: { sourceBindings: { orderBy: { order: "asc" } } } },
  currentScriptVersion: true,
  currentStoryVersion: true,
  pendingStoryVersion: true,
  currentStoryboardVersion: true,
  pendingStoryboardVersion: true,
  currentPreflightRevision: true,
  chapterScriptVersionsByChapter: { orderBy: { version: "desc" } },
  storyVersionsByChapter: { orderBy: { version: "desc" } },
  storyboardVersionsByChapter: { orderBy: { version: "desc" } },
  preflightRevisionsByChapter: { orderBy: { version: "desc" } },
} satisfies Prisma.ChapterInclude;

export type ChapterVersionQueryRow = Prisma.ChapterGetPayload<{
  include: typeof CHAPTER_VERSION_QUERY_INCLUDE;
}>;

type ChapterReader = Pick<PrismaClient, "chapter">;

/** One scoped read of Chapter plus all version pointers/history needed by gates. */
@Injectable()
export class ChapterVersionQueryRepository {
  constructor(@Inject(PrismaService) private readonly prismaService: PrismaService) {}

  async findByScope(
    scope: VersionScopeV1,
    reader: ChapterReader = this.prismaService.database(),
  ): Promise<ChapterVersionQueryRow | null> {
    return reader.chapter.findFirst({
      where: { id: scope.chapterId, projectId: scope.projectId },
      include: CHAPTER_VERSION_QUERY_INCLUDE,
    });
  }
}
