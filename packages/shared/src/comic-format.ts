export const COMIC_FORMATS = ["vertical_scroll", "paged_comic"] as const;
export type ComicFormat = (typeof COMIC_FORMATS)[number];

export interface ComicFormatDefinition {
  value: ComicFormat;
  label: "竖向条漫" | "分页漫画";
  description: string;
  referencePromptHint: string;
}

export const COMIC_FORMAT_DEFINITIONS = [
  {
    value: "vertical_scroll",
    label: "竖向条漫",
    description: "连续纵向阅读；页面规格在后续排版阶段确定。",
    referencePromptHint: "vertical-scroll comic reading format",
  },
  {
    value: "paged_comic",
    label: "分页漫画",
    description: "按页阅读；不预设页面横竖方向。",
    referencePromptHint: "page-based comic reading format; orientation unspecified",
  },
] as const satisfies readonly ComicFormatDefinition[];

export function isComicFormat(value: unknown): value is ComicFormat {
  return typeof value === "string" && (COMIC_FORMATS as readonly string[]).includes(value);
}

export function getComicFormatDefinition(value: ComicFormat): ComicFormatDefinition {
  const definition = COMIC_FORMAT_DEFINITIONS.find((item) => item.value === value);
  if (!definition) {
    throw new Error(`Unknown comic format: ${value}`);
  }
  return definition;
}

export function getComicFormatLabel(value: ComicFormat): ComicFormatDefinition["label"] {
  return getComicFormatDefinition(value).label;
}
