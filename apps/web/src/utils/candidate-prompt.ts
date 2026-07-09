/**
 * 候选图 prompt 拼装与出图参数纯函数(从 workbench-store.ts 抽出)。
 *
 * 这些函数只读参数,不依赖 store 状态。供 store 的 generateImageCandidates 和
 * 候选图工作台 prompt 预览区共用,让用户在生成前能看到完整 prompt。
 * 见 P0 任务 C:prompt 可见。
 */
import type { WorkbenchSnapshot } from "@airoaming/shared";

export type WorkbenchShotForPrompt = WorkbenchSnapshot["shots"][number];

/** 拼装候选图正向 prompt:画面描述 + 构图 + 对白 + 场景 + 角色 + 风格。 */
export function buildCandidatePositivePrompt(shot: WorkbenchShotForPrompt, snapshot: WorkbenchSnapshot): string {
  return [
    "comic panel",
    snapshot.currentChapter?.title ? `chapter: ${snapshot.currentChapter.title}` : "",
    shot.promptDraft,
    shot.comic.panelDescription,
    shot.comic.composition,
    shot.comic.dialogue ? `dialogue: ${shot.comic.dialogue}` : "",
    shot.comic.caption ? `caption: ${shot.comic.caption}` : "",
    shot.motion.visualDescription,
    shot.sceneName ? `scene: ${shot.sceneName}` : "",
    shot.characters.length > 0 ? `characters: ${shot.characters.join(", ")}` : "",
    `format: ${snapshot.project.comicFormat}`,
    `style: ${snapshot.project.artStyle}`,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

/** 按 comicFormat 推导候选图尺寸。 */
export function getCandidateImageSize(snapshot: WorkbenchSnapshot): { width: number; height: number } {
  if (snapshot.project.comicFormat === "page_horizontal") {
    return { width: 1536, height: 1024 };
  }
  if (snapshot.project.comicFormat === "four_panel") {
    return { width: 1024, height: 1024 };
  }
  return { width: 1024, height: 1536 };
}

/** 从出图准备记录里提取已定稿角色的参考图资产 id。 */
export function getPreflightReferenceAssetIds(snapshot: WorkbenchSnapshot): string[] {
  return snapshot.imagePreflight?.preflightJson.characterChecks
    .map((check) => check.referenceAssetId)
    .filter((assetId): assetId is string => Boolean(assetId)) ?? [];
}

/** prompt 预览的结构化分段,供 UI 折叠展示。 */
export interface PromptPreviewSection {
  label: string;
  value: string;
}

/** 把镜头的出图上下文拆成结构化分段,供 UI 可读展示。 */
export function buildPromptPreviewSections(shot: WorkbenchShotForPrompt, snapshot: WorkbenchSnapshot): PromptPreviewSection[] {
  const sections: PromptPreviewSection[] = [
    { label: "画面描述", value: shot.comic.panelDescription || shot.promptDraft || "" },
    { label: "构图", value: shot.comic.composition || shot.motion.compositionDesign || "" },
    { label: "角色", value: shot.characters.length > 0 ? shot.characters.join("、") : "" },
    { label: "对白", value: shot.comic.dialogue || "" },
    { label: "旁白", value: shot.comic.caption || "" },
    { label: "场景", value: shot.sceneName || "" },
    { label: "风格", value: `${getComicFormatLabel(snapshot.project.comicFormat)} / ${getArtStyleLabel(snapshot.project.artStyle)}` },
  ];
  return sections.filter((item) => item.value.trim());
}

/** 漫画形式中文标签(与组件内一致)。 */
export function getComicFormatLabel(format: WorkbenchSnapshot["project"]["comicFormat"]): string {
  switch (format) {
    case "vertical_scroll":
      return "竖滑条漫";
    case "page_horizontal":
      return "横版页漫";
    case "four_panel":
      return "四格漫画";
  }
}

/** 美术风格中文标签(与组件内一致)。 */
export function getArtStyleLabel(style: WorkbenchSnapshot["project"]["artStyle"]): string {
  switch (style) {
    case "dark_realistic":
      return "暗黑写实漫画";
    case "semi_realistic":
      return "半写实漫画";
    case "japanese_realistic":
      return "日系写实漫画";
    case "comic_style":
      return "漫画风";
    case "cyberpunk":
      return "赛博朋克";
    case "custom":
      return "自定义画风";
  }
}
