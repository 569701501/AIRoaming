import type { ComicFormat } from "@airoaming/shared";

export type LegacyLayoutFormat = "vertical_comic" | "page_horizontal";

export function toLegacyLayoutFormatV1(
  comicFormat: ComicFormat,
): LegacyLayoutFormat {
  return comicFormat === "vertical_scroll" ? "vertical_comic" : "page_horizontal";
}
