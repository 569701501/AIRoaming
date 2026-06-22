import {
  ART_STYLES,
  CHAPTER_STATUSES,
  COMIC_FORMATS,
  PROJECT_TYPES,
  stripChapterScriptName,
  type ArtStyle,
  type ChapterDetail,
  type ChapterListItem,
  type ChapterScriptVersionItem,
  type ChapterStatus,
  type ComicFormat,
  type ProjectCharacter,
  type ProjectCharacterLevel,
  type ProjectType,
} from "@airoaming/shared";
import type { LocalChapter, LocalChapterScriptVersion, LocalProject } from "./local-types.js";

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

export function getComicFormatLabel(format: ComicFormat): string {
  const labels: Record<ComicFormat, string> = {
    vertical_scroll: "竖版条漫 / vertical scrolling webcomic",
    page_horizontal: "页漫 / page-based comic",
    four_panel: "四格漫画 / four-panel comic",
  };
  return labels[format] ?? "竖版条漫 / vertical scrolling webcomic";
}

export function getArtStyleLabel(style: ArtStyle): string {
  const labels: Record<ArtStyle, string> = {
    dark_realistic: "暗调漫画写实 / dark cinematic comic realism, non-photorealistic",
    semi_realistic: "半写实漫画 / semi-realistic comic illustration, non-photorealistic",
    japanese_realistic: "日系漫画写实 / Japanese manga-realistic illustration, non-photorealistic",
    comic_style: "漫画风格 / clean comic and manhua illustration",
    cyberpunk: "赛博朋克漫画 / cyberpunk comic illustration",
    custom: "自定义漫画美术 / custom comic illustration style",
  };
  return labels[style] ?? "漫画风格 / clean comic and manhua illustration";
}

export function toChapterListItem(chapter: LocalChapter): ChapterListItem {
  const sourceText = stripChapterScriptName(chapter.sourceText);
  return {
    id: chapter.id,
    projectId: chapter.projectId,
    slug: chapter.slug,
    order: chapter.order,
    title: chapter.title,
    status: chapter.status,
    storyboardStatus: chapter.pendingStoryboard?.status ?? chapter.storyboard?.status ?? null,
    currentScriptVersionId: chapter.currentScriptVersionId,
    currentStoryVersionId: chapter.currentStoryVersionId,
    summary: chapter.summary,
    sourceTextPreview: sourceText.slice(0, 96),
    lastScriptRevision: chapter.lastScriptRevision,
    createdAt: chapter.createdAt,
    updatedAt: chapter.updatedAt,
    completedAt: chapter.completedAt,
  };
}

export function toChapterDetail(chapter: LocalChapter): ChapterDetail {
  const sourceText = stripChapterScriptName(chapter.sourceText);
  return {
    ...toChapterListItem(chapter),
    sourceText,
    pendingSourceText: chapter.pendingSourceText
      ? {
          ...chapter.pendingSourceText,
          sourceText: stripChapterScriptName(chapter.pendingSourceText.sourceText),
        }
      : null,
    scriptPath: `projects/${chapter.projectId}/chapters/${chapter.slug}/script.md`,
  };
}

export function toChapterScriptVersionItem(version: LocalChapterScriptVersion): ChapterScriptVersionItem {
  return {
    id: version.id,
    projectId: version.projectId,
    chapterId: version.chapterId,
    version: version.version,
    sourcePath: version.sourcePath,
    status: version.status,
    createdAt: version.createdAt,
  };
}
