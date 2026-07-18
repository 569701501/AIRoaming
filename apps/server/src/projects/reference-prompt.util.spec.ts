import { describe, expect, it } from "vitest";
import type { LocalProject } from "./local-types.js";
import { buildCharacterReferencePrompt, buildScenePrompt } from "./reference-prompt.util.js";

const project = {
  id: "project-1",
  name: "管理代号-1111",
  storyTitle: "雨夜证人",
  type: "comic",
  genreTags: ["都市", "悬疑"],
  comicFormat: "vertical_scroll",
  artStyle: "comic_style",
} as LocalProject;

describe("P23/P24 reference prompts", () => {
  it("角色预览图建立单角色身份锚点，不生成真人或场景", () => {
    const prompt = buildCharacterReferencePrompt(project, {
      id: "char-1",
      projectId: "project-1",
      name: "林舟",
      role: "调查记者",
      level: "lead",
      entityType: "human",
      appearance: "黑色短发，灰蓝风衣，左眉浅疤",
      personality: "克制警觉",
      promptFragment: "窄长眼型，旧银色录音笔",
    } as never, "preview_front");
    expect(prompt).toContain("IDENTITY SEED");
    expect(prompt).toContain("Exactly one character");
    expect(prompt).toContain("左眉浅疤");
    expect(prompt).toContain("No text labels");
    expect(prompt).toContain("not photorealism");
    expect(prompt).toContain("作品名：雨夜证人");
    expect(prompt).not.toContain("管理代号-1111");
  });

  it("角色定稿固定四视图、同服装和同一比例", () => {
    const prompt = buildCharacterReferencePrompt(project, {
      id: "char-1",
      projectId: "project-1",
      name: "林舟",
      role: "调查记者",
      level: "lead",
      entityType: "human",
      appearance: "黑色短发，灰蓝风衣",
      personality: "克制警觉",
      promptFragment: "左眉浅疤",
    } as never, "final_reference");
    expect(prompt).toContain("IDENTITY LOCK");
    expect(prompt).toContain("exactly four");
    expect(prompt).toContain("front half-body portrait");
    expect(prompt).toContain("back full-body");
    expect(prompt).toContain("same outfit");
  });

  it("场景参考图是无人无字、空间稳定的可复用背景", () => {
    const prompt = buildScenePrompt({
      name: "雨夜旧港",
      location: "废弃货运码头",
      timeOfDay: "深夜",
      atmosphere: "冷雨、低照度、危险",
      purpose: "线索交接与追逐前的建立镜头",
    }, project);
    expect(prompt).toContain("reusable environment reference image");
    expect(prompt).toContain("foreground, midground, and background");
    expect(prompt).toContain("wide establishing viewpoint");
    expect(prompt).toContain("exactly zero people");
    expect(prompt).toContain("No text");
    expect(prompt).toContain("雨夜旧港");
  });

  it("V1 参考 Prompt 仍可单独编译，供后续同语料 A/B", () => {
    const prompt = buildScenePrompt({
      name: "雨夜旧港",
      location: "废弃货运码头",
      timeOfDay: "深夜",
      atmosphere: "冷雨",
      purpose: "建立空间",
    }, project, "v1");
    expect(prompt).toContain("This is a clean background asset");
    expect(prompt).not.toContain("INTENDED USE");
  });

  it("故事标题为空或只是项目管理名称的历史副本时都不进入 Prompt", () => {
    const prompt = buildCharacterReferencePrompt({ ...project, storyTitle: project.name }, {
      id: "char-1",
      projectId: "project-1",
      name: "林舟",
      role: "调查记者",
      level: "lead",
      entityType: "human",
      appearance: "黑色短发",
      personality: "克制警觉",
      promptFragment: "",
    } as never, "preview_front");

    expect(prompt).not.toContain("管理代号-1111");
    expect(prompt).toContain("作品名：（未确认）");
  });
});
