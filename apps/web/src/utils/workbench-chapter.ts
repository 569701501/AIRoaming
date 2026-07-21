import type {
  ChapterDetail,
  ChapterListItem,
  ChapterStoryboard,
  ChapterStoryStructure,
  ProjectListItem,
  WorkbenchSnapshot,
} from "@airoaming/shared";

export function getCurrentChapterSourceText(snapshot: WorkbenchSnapshot): string {
  return snapshot.currentChapter?.sourceText ?? snapshot.story.sourceText;
}

export function getCurrentChapterId(snapshot: WorkbenchSnapshot): string | null {
  return snapshot.currentChapter?.id ?? snapshot.story.chapterId ?? null;
}

/** ChapterDetail → ChapterListItem(章节列表展示用字段裁剪)。 */
export function toChapterListItem(chapter: ChapterDetail): ChapterListItem {
  return {
    id: chapter.id,
    projectId: chapter.projectId,
    slug: chapter.slug,
    order: chapter.order,
    title: chapter.title,
    status: chapter.status,
    storyboardStatus: chapter.storyboardStatus,
    currentScriptVersionId: chapter.currentScriptVersionId,
    currentStoryVersionId: chapter.currentStoryVersionId,
    summary: chapter.summary,
    sourceTextPreview: chapter.sourceTextPreview,
    lastScriptRevision: chapter.lastScriptRevision,
    createdAt: chapter.createdAt,
    updatedAt: chapter.updatedAt,
    completedAt: chapter.completedAt,
  };
}

/** 合并章节列表:用最新章节详情覆盖对应条目。 */
export function resolveChapterList(
  existingChapters: ChapterListItem[],
  nextChapters: ChapterListItem[] | null,
  currentChapter: ChapterDetail,
): ChapterListItem[] {
  if (nextChapters && nextChapters.length > 0) {
    return nextChapters
      .map((chapter) => (chapter.id === currentChapter.id ? toChapterListItem(currentChapter) : chapter))
      .sort((left, right) => left.order - right.order);
  }

  const byId = new Map(existingChapters.map((chapter) => [chapter.id, chapter]));
  byId.set(currentChapter.id, toChapterListItem(currentChapter));
  return [...byId.values()].sort((left, right) => left.order - right.order);
}

/** 根据章节状态推导项目列表状态。 */
export function getProjectStatusFromChapter(chapter: ChapterDetail, charactersReady = false): ProjectListItem["status"] {
  if (charactersReady) {
    return "characters_ready";
  }
  return chapter.sourceText.trim().length > 0 ? "story_ready" : "draft";
}

/** 按场景 id 查场景名。 */
export function getSceneName(storyStructure: ChapterStoryStructure | null, sceneId: string | null): string {
  if (!storyStructure || !sceneId) {
    return "";
  }

  return storyStructure.structureJson.scenes.find((scene) => scene.id === sceneId)?.name ?? "";
}

/** 把分镜 shots 映射为工作台快照 shots(补 sceneName/characters)。 */
export function mapStoryboardShots(storyboard: ChapterStoryboard | null, storyStructure: ChapterStoryStructure | null, chapterId: string): WorkbenchSnapshot["shots"] {
  if (!storyboard) {
    return [];
  }

  return storyboard.storyboardJson.shots.map((shot) => {
    const scene = storyStructure?.structureJson.scenes.find((item) => item.id === shot.sceneId) ?? null;
    const beat = storyStructure?.structureJson.beats.find((item) => item.id === shot.beatId) ?? null;
    return {
      ...shot,
      chapterId,
      sceneName: scene?.name ?? "",
      characterIds: shot.characterIds,
      characters: shot.characterIds.length > 0 ? shot.characterIds : beat?.characters ?? [],
    };
  });
}
