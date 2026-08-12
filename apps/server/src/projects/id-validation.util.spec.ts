import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  assertJsonObjectBody,
  assertOptionalStringField,
  assertRequiredNonBlankString,
  assertRouteId,
} from "./id-validation.util.js";

describe("id-validation.util", () => {
  describe("assertRouteId", () => {
    it("接受项目内实际存在的 ID 格式", () => {
      expect(() => assertRouteId("projectId", "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d")).not.toThrow();
      expect(() => assertRouteId("characterId", "char_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d")).not.toThrow();
      expect(() => assertRouteId("stageId", "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d")).not.toThrow();
      expect(() => assertRouteId("characterId", "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d_chapter_001")).not.toThrow();
    });

    it("空串、空白与超长拒绝", () => {
      expect(() => assertRouteId("projectId", "")).toThrow(BadRequestException);
      expect(() => assertRouteId("projectId", "   ")).toThrow("INVALID_PROJECT_ID_FORMAT");
      expect(() => assertRouteId("characterId", "a".repeat(129))).toThrow("INVALID_CHARACTER_ID_FORMAT");
      expect(() => assertRouteId("stageId", "a".repeat(200))).toThrow("INVALID_STAGE_ID_FORMAT");
    });

    it("路径分隔符、相对路径片段与非白名单字符拒绝", () => {
      for (const bad of ["../etc/passwd", "a/b", "a\\b", "a b", "a.b", "a@b", "a#b", "a?b", "a%2Fb"]) {
        expect(() => assertRouteId("projectId", bad)).toThrow("INVALID_PROJECT_ID_FORMAT");
      }
    });
  });

  describe("assertJsonObjectBody", () => {
    it("普通对象通过", () => {
      expect(() => assertJsonObjectBody({})).not.toThrow();
      expect(() => assertJsonObjectBody({ name: "练气期" })).not.toThrow();
    });

    it("null/数组/原始值拒绝", () => {
      for (const bad of [null, undefined, [], "text", 42, true]) {
        expect(() => assertJsonObjectBody(bad)).toThrow("INVALID_JSON_BODY");
      }
    });
  });

  describe("assertOptionalStringField", () => {
    it("缺省返回 undefined，字符串裁剪返回", () => {
      expect(assertOptionalStringField(undefined, "name")).toBeUndefined();
      expect(assertOptionalStringField("  练气期  ", "name")).toBe("练气期");
    });

    it("非字符串或空白字符串拒绝", () => {
      expect(() => assertOptionalStringField(42, "name")).toThrow("INVALID_NAME_TYPE");
      expect(() => assertOptionalStringField(null, "fromChapterId")).toThrow("INVALID_FROM_CHAPTER_ID_TYPE");
      expect(() => assertOptionalStringField("   ", "name")).toThrow("INVALID_NAME_TYPE");
    });
  });

  describe("assertRequiredNonBlankString", () => {
    it("非空字符串裁剪返回", () => {
      expect(assertRequiredNonBlankString("  金色道袍  ")).toBe("金色道袍");
    });

    it("缺省/空白/非字符串拒绝为 CHARACTER_STAGE_VISUAL_DELTA_REQUIRED", () => {
      for (const bad of [undefined, null, "", "   ", 42, ["a"]]) {
        expect(() => assertRequiredNonBlankString(bad)).toThrow("CHARACTER_STAGE_VISUAL_DELTA_REQUIRED");
      }
    });
  });
});
