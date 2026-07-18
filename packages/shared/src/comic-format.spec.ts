import { describe, expect, it } from "vitest";
import {
  COMIC_FORMAT_DEFINITIONS,
  COMIC_FORMATS,
  getComicFormatDefinition,
  getComicFormatLabel,
  isComicFormat,
} from "./comic-format.js";

describe("comic format catalog", () => {
  it("contains only the two canonical values in stable order", () => {
    expect(COMIC_FORMATS).toEqual(["vertical_scroll", "paged_comic"]);
    expect(COMIC_FORMAT_DEFINITIONS.map((item) => item.value)).toEqual([...COMIC_FORMATS]);
  });

  it("accepts canonical values and rejects legacy aliases", () => {
    expect(isComicFormat("vertical_scroll")).toBe(true);
    expect(isComicFormat("paged_comic")).toBe(true);
    expect(isComicFormat("page_horizontal")).toBe(false);
    expect(isComicFormat("four_panel")).toBe(false);
    expect(isComicFormat(null)).toBe(false);
    expect(isComicFormat({})).toBe(false);
  });

  it("provides one display label and description per canonical value", () => {
    expect(getComicFormatLabel("vertical_scroll")).toBe("竖向条漫");
    expect(getComicFormatDefinition("paged_comic")).toMatchObject({
      label: "分页漫画",
      description: expect.stringContaining("按页阅读"),
    });
  });
});
