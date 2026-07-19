import { describe, expect, it } from "vitest";
import { normalizeCharacterIdentityKey } from "./character-domain.util.js";

describe("角色身份键", () => {
  it("只为 group 归并保守的群体后缀别名", () => {
    expect(normalizeCharacterIdentityKey("商队众人", "group")).toBe("商队");
    expect(normalizeCharacterIdentityKey("商队多人", "group")).toBe("商队");
    expect(normalizeCharacterIdentityKey("商队一行人", "group")).toBe("商队");
  });

  it("human/creature/voice 保持精确名称，不做猜测式合并", () => {
    expect(normalizeCharacterIdentityKey("商队众人", "human")).toBe("商队众人");
    expect(normalizeCharacterIdentityKey("红心棺", "creature")).toBe("红心棺");
    expect(normalizeCharacterIdentityKey("神秘声音", "voice")).toBe("神秘声音");
  });

  it("过短或纯后缀 group 名称不折叠为空", () => {
    expect(normalizeCharacterIdentityKey("众人", "group")).toBe("众人");
    expect(normalizeCharacterIdentityKey("人群", "group")).toBe("人群");
  });
});
