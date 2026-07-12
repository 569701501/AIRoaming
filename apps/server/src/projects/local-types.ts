import type {
  ArtStyle,
  ChapterImagePreflight,
  ChapterLayout,
  ChapterPendingSourceText,
  ChapterScriptVersionItem,
  ChapterStatus,
  ChapterStoryboard,
  ChapterStoryStructure,
  ComicFormat,
  ProjectCandidate,
  ProjectCharacter,
  ProjectScriptOutline,
  ProjectType,
  ScriptRevisionItem,
  WorkbenchAsset,
} from "@airoaming/shared";

/**
 * server 本地持久化模型(从 projects.service 抽出,供 ProjectRepository / domain util / Service 共用)。
 * 见任务 2026-06-21_ProjectsService拆分 阶段①子步 1b-pre。
 */

export interface LocalChapterScriptVersion extends ChapterScriptVersionItem {
  sourceText: string;
}

export interface LocalChapter {
  id: string;
  projectId: string;
  slug: string;
  order: number;
  title: string;
  status: ChapterStatus;
  currentScriptVersionId: string | null;
  currentStoryVersionId: string | null;
  sourceText: string;
  summary: string;
  storyStructure: ChapterStoryStructure | null;
  storyboard: ChapterStoryboard | null;
  pendingStoryboard?: ChapterStoryboard | null;
  /** AI 生成的章节正文草稿缓冲(见 ADR-0008)。确认前不覆盖正式 sourceText。 */
  pendingSourceText: ChapterPendingSourceText | null;
  imagePreflight: ChapterImagePreflight | null;
  /** 本章候选图正式记录，对应 candidates.json */
  candidates: ProjectCandidate[];
  /** 本章排版，对应 layout/layout.json */
  layout: ChapterLayout | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  scriptVersions: LocalChapterScriptVersion[];
  lastScriptRevision: ScriptRevisionItem | null;
}

export interface LocalProjectPersistenceCompatibility {
  comicFormatSource:
    | { kind: "canonical" }
    | {
        kind: "legacy_alias";
        rawValue: "page_horizontal";
        policyVersion: "g3-file-comic-format-read-v1";
      };
}

export interface LocalProject {
  id: string;
  name: string;
  type: ProjectType;
  currentChapterId: string | null;
  storyTitle: string;
  genreTags: string[];
  comicFormat: ComicFormat;
  artStyle: ArtStyle;
  description: string;
  sourceText: string;
  scriptOutline: ProjectScriptOutline | null;
  characters: ProjectCharacter[];
  assets: WorkbenchAsset[];
  chapters: LocalChapter[];
  createdAt: string;
  updatedAt: string;
  persistenceCompatibility?: LocalProjectPersistenceCompatibility;
}
