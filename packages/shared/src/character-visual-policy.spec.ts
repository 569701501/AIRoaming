import { describe, expect, it } from "vitest";
import type { ProjectCharacterEntityType, ProjectCharacterLevel } from "./dto.js";
import {
  characterVisualIdentityKey,
  referenceKindSatisfiesRequirement,
  requiredCharacterReferenceKind,
} from "./character-visual-policy.js";

const levels: ProjectCharacterLevel[] = ["lead", "recurring", "chapter", "minor", "extra"];

describe("角色视觉素材要求", () => {
  it.each([
    ["lead", "final_reference"],
    ["recurring", "final_reference"],
    ["chapter", "final_reference"],
    ["minor", "preview_front"],
    ["extra", "preview_front"],
  ] satisfies Array<[ProjectCharacterLevel, string]>) (
    "human/%s 在剧情结构阶段固定为 %s",
    (level, expected) => {
      expect(requiredCharacterReferenceKind({ level, entityType: "human" })).toBe(expected);
    },
  );

  it.each(["creature", "group"] satisfies ProjectCharacterEntityType[]) (
    "%s 不因角色层级升级成人物四视图",
    (entityType) => {
      for (const level of levels) {
        expect(requiredCharacterReferenceKind({ level, entityType })).toBe("preview_front");
      }
    },
  );

  it("voice 在所有层级都不要求图片", () => {
    for (const level of levels) {
      expect(requiredCharacterReferenceKind({ level, entityType: "voice" })).toBe("none");
    }
  });

  it("只允许高等级素材向下满足要求", () => {
    expect(referenceKindSatisfiesRequirement("preview_front", "preview_front")).toBe(true);
    expect(referenceKindSatisfiesRequirement("preview_front", "final_reference")).toBe(true);
    expect(referenceKindSatisfiesRequirement("final_reference", "preview_front")).toBe(false);
    expect(referenceKindSatisfiesRequirement("final_reference", "final_reference")).toBe(true);
    expect(referenceKindSatisfiesRequirement("none", "none")).toBe(true);
  });

  it("只为群体素材合并保守别名", () => {
    expect(characterVisualIdentityKey("商队众人", "group")).toBe("商队");
    expect(characterVisualIdentityKey("商队多人", "group")).toBe("商队");
    expect(characterVisualIdentityKey("商队众人", "human")).toBe("商队众人");
    expect(characterVisualIdentityKey("红心棺", "creature")).toBe("红心棺");
    expect(characterVisualIdentityKey("众人", "group")).toBe("众人");
  });
});
