import {
  ART_STYLES,
  CHAPTER_STATUSES,
  COMIC_FORMATS,
  PROJECT_TYPES,
  type ArtStyle,
  type ChapterStatus,
  type ComicFormat,
  type ProjectCharacter,
  type ProjectCharacterLevel,
  type ProjectType,
} from "@airoaming/shared";
import type { LocalChapter, LocalProject } from "./local-types.js";

/**
 * 项目领域纯函数与常量(从 projects.service 抽出,供 ProjectRepository / Service 共用)。
 * 见任务 2026-06-21_ProjectsService拆分 阶段①子步 1b-pre。
 */

export const DEFAULT_CHAPTER_ID = "chapter_001";
export const DEFAULT_CHAPTER_SLUG = "chapter-001";
export const getDefaultChapterTitle = (order: number): string => `第 ${order} 章`;
export const DEFAULT_CHAPTER_TITLE = getDefaultChapterTitle(1);

/** 角色层级重要性顺序(数字越小越重要)。sort 和 resolveMoreImportantCharacterLevel 共用,避免漂移(见 task 2026-06-21_角色分层双维度)。 */
export const CHARACTER_LEVEL_ORDER: Record<ProjectCharacterLevel, number> = {
  lead: 0,
  recurring: 1,
  chapter: 2,
  minor: 3,
  extra: 4,
};

export function sortChapters(chapters: LocalChapter[]): LocalChapter[] {
  return [...chapters].sort((left, right) => left.order - right.order);
}

export function sortProjectCharacters(characters: ProjectCharacter[]): ProjectCharacter[] {
  return [...characters].sort((left, right) => {
    const levelDelta = CHARACTER_LEVEL_ORDER[left.level] - CHARACTER_LEVEL_ORDER[right.level];
    if (levelDelta !== 0) return levelDelta;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function normalizeProjectType(input: unknown): ProjectType {
  return typeof input === "string" && PROJECT_TYPES.includes(input as ProjectType) ? input as ProjectType : "comic";
}

export function normalizeComicFormat(input: ComicFormat | undefined): ComicFormat {
  return input && COMIC_FORMATS.includes(input) ? input : "vertical_scroll";
}

export function normalizeArtStyle(input: ArtStyle | undefined): ArtStyle {
  return input && ART_STYLES.includes(input) ? input : "dark_realistic";
}

export function normalizeChapterStatus(input: unknown): ChapterStatus {
  return typeof input === "string" && CHAPTER_STATUSES.includes(input as ChapterStatus) ? input as ChapterStatus : "draft";
}

export function createDefaultChapter(projectId: string, sourceText: string, now: string): LocalChapter {
  return {
    id: DEFAULT_CHAPTER_ID,
    projectId,
    slug: DEFAULT_CHAPTER_SLUG,
    order: 1,
    title: DEFAULT_CHAPTER_TITLE,
    status: "draft",
    currentScriptVersionId: null,
    currentStoryVersionId: null,
    sourceText,
    summary: "",
    storyStructure: null,
    storyboard: null,
    pendingStoryboard: null,
    pendingSourceText: null,
    imagePreflight: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    scriptVersions: [],
    lastScriptRevision: null,
  };
}

export function getCurrentChapter(project: LocalProject): LocalChapter | null {
  return project.chapters.find((chapter) => chapter.id === project.currentChapterId)
    ?? project.chapters[0]
    ?? null;
}
