import type { WorkbenchSnapshot } from "@airoaming/shared";

export function getCurrentChapterSourceText(snapshot: WorkbenchSnapshot): string {
  return snapshot.currentChapter?.sourceText ?? snapshot.story.sourceText;
}

export function getCurrentChapterTitle(snapshot: WorkbenchSnapshot): string {
  return snapshot.currentChapter?.title || snapshot.story.title || snapshot.project.name || "当前剧本";
}

export function getCurrentChapterId(snapshot: WorkbenchSnapshot): string | null {
  return snapshot.currentChapter?.id ?? snapshot.story.chapterId ?? null;
}
