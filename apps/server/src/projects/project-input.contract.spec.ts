import { describe, expect, it } from "vitest";
import {
  parseCreateProjectRequestV1,
  parseUpdateProjectDraftRequestV1,
  ProjectInputException,
} from "./project-input.contract.js";

function expectCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectInputException);
    expect((error as ProjectInputException).code).toBe(code);
  }
}

describe("project input contract", () => {
  it("requires a canonical comic format on create", () => {
    expectCode(() => parseCreateProjectRequestV1({ name: "demo", type: "comic" }), "COMIC_FORMAT_REQUIRED");
    expectCode(() => parseCreateProjectRequestV1({ name: "demo", type: "comic", comicFormat: "" }), "COMIC_FORMAT_REQUIRED");
    expectCode(() => parseCreateProjectRequestV1({ name: "demo", type: "comic", comicFormat: "page_horizontal" }), "COMIC_FORMAT_INVALID");
    expect(parseCreateProjectRequestV1({ name: "demo", type: "comic", comicFormat: "paged_comic" })).toMatchObject({
      name: "demo",
      comicFormat: "paged_comic",
    });
  });

  it("rejects unknown create fields without echoing values", () => {
    try {
      parseCreateProjectRequestV1({ name: "demo", type: "comic", comicFormat: "vertical_scroll", secret: "hidden" });
      throw new Error("expected unsupported field");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectInputException);
      expect((error as ProjectInputException).getResponse()).toEqual({
        success: false,
        error: {
          code: "PROJECT_INPUT_FIELD_UNSUPPORTED",
          message: "请求包含不支持的字段",
          details: { fields: ["secret"] },
        },
      });
    }
  });

  it("rejects comicFormat before any update allowlist or persistence gate", () => {
    expectCode(() => parseUpdateProjectDraftRequestV1({ comicFormat: "vertical_scroll" }), "COMIC_FORMAT_IMMUTABLE");
    expectCode(() => parseUpdateProjectDraftRequestV1({ name: "next", comicFormat: null }), "COMIC_FORMAT_IMMUTABLE");
    expect(parseUpdateProjectDraftRequestV1({ name: "next" })).toEqual({ name: "next" });
  });
});
