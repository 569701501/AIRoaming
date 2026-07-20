import { describe, expect, it, vi } from "vitest";
import type { StoryboardJson, StoryStructureJson } from "@airoaming/shared";
import {
  buildStoryboardVisualBriefPrompt,
  buildStoryboardVisualBriefRepairPrompt,
  enrichStoryboardVisualBrief,
  parseAndApplyStoryboardVisualBrief,
} from "./storyboard-visual-brief.util.js";

function structure(): StoryStructureJson {
  return {
    schemaVersion: 1,
    chapterId: "chapter-1",
    chapterTitle: "雨夜仓库",
    sourceScriptVersionId: "script-v1",
    synopsis: "三人在旧港仓库争夺录音笔。",
    direction: {
      logline: "三人在追兵逼近前确认录音笔。",
      chapterGoal: "保住录音笔。",
      coreConflict: "三人的判断不同。",
      emotionalArc: "戒备转为合作。",
      endingHook: "仓库门被推开。",
    },
    characters: [
      { id: "character_01", projectCharacterId: "char-lin", name: "林舟", role: "主角", level: "lead", entityType: "human", motivation: "保住证据", relationship: "保护苏弥", visualTraits: "黑色短发，深色风衣", notes: "" },
      { id: "character_02", projectCharacterId: "char-su", name: "苏弥", role: "同伴", level: "recurring", entityType: "human", motivation: "确认真相", relationship: "信任林舟", visualTraits: "短发，浅色外套", notes: "" },
      { id: "character_03", projectCharacterId: "char-xu", name: "许澄", role: "证人", level: "chapter", entityType: "human", motivation: "交出证据", relationship: "仍然戒备", visualTraits: "长发，灰色大衣", notes: "" },
    ],
    scenes: [{ id: "scene_01", name: "旧港仓库", location: "旧港仓库门内", timeOfDay: "深夜", atmosphere: "冷雨与戒备", purpose: "完成证据交接" }],
    beats: [{ id: "beat_01", order: 1, title: "三人护住录音笔", summary: "三人同时把注意力集中在录音笔上。", conflict: "门外威胁逼近。", characters: ["character_01", "character_02", "character_03"], sceneId: "scene_01", visualFocus: "三只手围住录音笔", outcome: "三人暂时合作。" }],
    notes: "",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

function storyboard(): StoryboardJson {
  return {
    schemaVersion: 1,
    chapterId: "chapter-1",
    chapterTitle: "雨夜仓库",
    sourceStoryVersionId: "story-v1",
    shots: [{
      id: "shot-1",
      order: 1,
      beatId: "beat_01",
      sceneId: "scene_01",
      characterIds: ["char-lin", "char-su", "char-xu"],
      coreAction: "三人护住录音笔",
      emotion: "紧张而克制",
      shotType: "medium",
      cameraAngle: "eye_level",
      comic: { panelDescription: "三人围着录音笔", composition: "三人居中", dialogue: "", caption: "", panelRhythm: "impact" },
      motion: { visualDescription: "三人的手同时靠近录音笔。", compositionDesign: "三人从不同方向靠近桌面。", cameraMovement: "push_in", frameType: "action", durationMs: 3000, durationHint: "约 3s", voiceLines: [] },
      promptDraft: "三人在仓库保护录音笔",
      lockedCandidateId: null,
      status: "draft",
    }],
    notes: "保持三人关系清楚。",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

function validBrief(): Record<string, unknown> {
  return {
    shots: [{
      order: 1,
      visualDescription: "旧港仓库门内，林舟、苏弥和许澄三人围在同一张木桌旁，三只手停在桌面中央的录音笔周围，彼此的目光都压在亮起的指示灯上。",
      action: "林舟用右手护住录音笔，苏弥按住他的手腕，许澄的手掌停在道具另一侧，三人的动作对象清楚汇聚在桌面中央。",
      composition: "林舟位于左前景，苏弥居中，许澄位于右中景，三条手臂形成三角形，录音笔成为画面的唯一视觉中心。",
      promptDraft: "深夜旧港仓库门内，林舟、苏弥和许澄围桌护住录音笔，三人紧张克制，冷雨反光勾出轮廓，三角构图聚焦桌面道具。",
    }],
  };
}

describe("storyboard visual brief", () => {
  it("把三人关系整理成细化说明，同时冻结镜头骨架、对白和 motion", () => {
    const source = storyboard();
    const frozen = structuredClone(source);
    const result = parseAndApplyStoryboardVisualBrief(JSON.stringify(validBrief()), {
      storyboard: source,
      structure: structure(),
      comicFormat: "vertical_scroll",
      artStyle: "comic_style",
    });

    expect(result.shots[0]).toMatchObject({
      coreAction: expect.stringContaining("许澄的手掌"),
      comic: {
        panelDescription: expect.stringContaining("三人围在同一张木桌旁"),
        composition: expect.stringContaining("三角形"),
      },
      promptDraft: expect.stringContaining("林舟、苏弥和许澄"),
    });
    expect(result.shots[0]?.id).toBe(frozen.shots[0]?.id);
    expect(result.shots[0]?.beatId).toBe(frozen.shots[0]?.beatId);
    expect(result.shots[0]?.sceneId).toBe(frozen.shots[0]?.sceneId);
    expect(result.shots[0]?.characterIds).toEqual(frozen.shots[0]?.characterIds);
    expect(result.shots[0]?.comic.dialogue).toBe(frozen.shots[0]?.comic.dialogue);
    expect(result.shots[0]?.motion).toEqual(frozen.shots[0]?.motion);
    expect(result.notes).toBe(frozen.notes);
  });

  it("拒绝漏掉绑定角色、镜头换序和额外字段", () => {
    const invalid = validBrief() as { shots: Array<Record<string, unknown>> };
    invalid.shots[0]!.order = 2;
    invalid.shots[0]!.visualDescription = "旧港仓库门内，林舟与苏弥两人围在木桌旁，双手停在桌面中央的录音笔周围，目光都落在亮起的指示灯上。";
    invalid.shots[0]!.reason = "自行解释";

    expect(() => parseAndApplyStoryboardVisualBrief(JSON.stringify(invalid), {
      storyboard: storyboard(),
      structure: structure(),
    })).toThrow(/VISUAL_BRIEF_EXTRA_KEYS|VISUAL_BRIEF_ORDER_MISMATCH/);
  });

  it("双人镜头接受自然中文的“两人”总数表达", () => {
    const twoPersonStructure = structure();
    twoPersonStructure.characters = twoPersonStructure.characters.slice(0, 2);
    twoPersonStructure.beats[0]!.characters = ["character_01", "character_02"];
    const twoPersonStoryboard = storyboard();
    twoPersonStoryboard.shots[0]!.characterIds = ["char-lin", "char-su"];
    const brief = {
      shots: [{
        order: 1,
        visualDescription: "旧港仓库门内，林舟与苏弥两人围在同一张木桌旁，双手停在桌面中央的录音笔周围，彼此的目光都压在亮起的指示灯上。",
        action: "林舟用右手护住录音笔，苏弥按住他的手腕，两人的动作对象清楚汇聚在桌面中央。",
        composition: "林舟位于左前景，苏弥位于右中景，两条手臂形成对角线，录音笔成为画面的唯一视觉中心。",
        promptDraft: "深夜旧港仓库门内，林舟与苏弥两人围桌护住录音笔，神情紧张克制，冷雨反光勾出轮廓，对角构图聚焦桌面道具。",
      }],
    };

    expect(() => parseAndApplyStoryboardVisualBrief(JSON.stringify(brief), {
      storyboard: twoPersonStoryboard,
      structure: twoPersonStructure,
    })).not.toThrow();
  });

  it("整章整理失败时只返修一次，第二次合格后再交给总质量门", async () => {
    const send = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({ shots: [{ order: 1, visualDescription: "太短", action: "太短", composition: "太短", promptDraft: "太短" }] }))
      .mockResolvedValueOnce(JSON.stringify(validBrief()));
    const validate = vi.fn();

    const result = await enrichStoryboardVisualBrief({
      storyboard: storyboard(),
      structure: structure(),
      comicFormat: "vertical_scroll",
      artStyle: "comic_style",
      send,
      validate,
    });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0]).toContain("第二阶段");
    expect(send.mock.calls[1]?.[0]).toContain("VISUAL_BRIEF_TEXT_TOO_SHORT");
    expect(validate).toHaveBeenCalledTimes(1);
    expect(result.shots[0]?.comic.panelDescription).toContain("林舟、苏弥和许澄三人");
  });

  it("Prompt 只带作品样式、结构事实和冻结骨架，不读取项目管理名称", () => {
    const prompt = buildStoryboardVisualBriefPrompt({
      storyboard: storyboard(),
      structure: structure(),
      comicFormat: "vertical_scroll",
      artStyle: "comic_style",
    });
    expect(prompt).toContain("每个已绑定且不是纯声音的角色都要用角色名点明");
    expect(prompt).toContain("林舟");
    expect(prompt).toContain("comic_style");
    expect(prompt).not.toContain("PROJECT_NAME");
  });

  it("为群体镜头显式编译可执行的人数范围约束", () => {
    const groupStructure = structure();
    groupStructure.characters.push({
      id: "character_group",
      projectCharacterId: "char-group",
      name: "商队众人",
      role: "追兵",
      level: "extra",
      entityType: "group",
      motivation: "合围",
      relationship: "追捕主角",
      visualTraits: "商队护卫群体",
      notes: "",
    });
    const groupStoryboard = storyboard();
    groupStoryboard.shots[0]!.characterIds.push("char-group");

    const prompt = buildStoryboardVisualBriefPrompt({
      storyboard: groupStoryboard,
      structure: groupStructure,
    });

    expect(prompt).toContain('"groupName": "商队众人"');
    expect(prompt).toContain('"neutralRangeExample": "一群商队众人"');
    expect(prompt).toContain("只写群体名不算人数或范围");
  });

  it("把群体人数错误码翻译成返修模型能直接执行的指令", () => {
    const repairPrompt = buildStoryboardVisualBriefRepairPrompt({
      originalPrompt: "原任务含商队众人",
      invalidOutput: "铁锚、沈婆、哑巴与商队众人的压迫轮廓压在边角。",
      validationError: "候选图画面说明未通过校验：VISUAL_BRIEF_VISUAL_GROUP_COUNT_MISSING:shots[12]",
    });

    expect(repairPrompt).toContain("只写“商队众人”仍然不合格");
    expect(repairPrompt).toContain("一群商队众人");
    expect(repairPrompt).toContain("不得虚构精确人数");
  });
});
