import { describe, expect, it } from "vitest";
import type { StoryboardShot } from "@airoaming/shared";
import {
  buildCandidateGenerationSpec,
  createCandidateGenerationSpec,
  createCandidateGenerationTaskInput,
} from "./candidate-generation-spec.js";

describe("buildCandidateGenerationSpec", () => {
  it("把历史整页漫画输入收口为单镜头干净底图规格", () => {
    const spec = buildCandidateGenerationSpec({
      projectId: "project_hunter",
      chapterId: "chapter_001",
      chapterTitle: "第1章：黑色念痕",
      comicFormat: "vertical_scroll",
      artStyle: "dark_realistic",
      shot: {
        id: "shot_015",
        order: 15,
        beatId: "beat_005",
        sceneId: "scene_ward",
        characterIds: ["char_kurapika", "char_killua"],
        coreAction: "四人站在病床前，注视窗外延伸进来的黑色念线",
        emotion: "压抑、警觉",
        shotType: "wide",
        cameraAngle: "eye_level",
        comic: {
          panelDescription: "昏暗病房内，四人站在病床与窗户之间，黑色念线贯穿画面。",
          composition: "横向群像构图，病床在前景，人物位于中景，窗户在背景。",
          dialogue: "这些黑痕和海那边还连在一起。",
          caption: "真正的边界不是线。它是某个瞬间。",
          panelRhythm: "impact",
        },
        motion: {
          visualDescription: "镜头从病床缓慢推向窗外海面，再切回众人反应。",
          compositionDesign: "动态推镜与三段画面转换。",
          cameraMovement: "push_in",
          frameType: "action",
          durationMs: 4000,
          durationHint: "约 4s",
          voiceLines: [{ characterId: "char_kurapika", name: "酷拉皮卡", line: "这就是真相吗？", voiceStyle: "低沉" }],
        },
        promptDraft: "comic panel，第1章：黑色念痕，加入对白气泡并按竖滑条漫分格",
        lockedCandidateId: null,
        status: "ready_for_image",
      },
      scene: {
        id: "scene_ward",
        name: "海边病房",
        location: "临海医院的旧病房",
        timeOfDay: "阴天白昼",
        atmosphere: "低照度、潮湿、压迫",
      },
      characters: [
        { id: "character_kurapika", name: "酷拉皮卡", appearance: "金色短发，黑色西装", promptFragment: "冷静克制" },
        { id: "character_killua", name: "奇犽", appearance: "银白刺发，深色便装", promptFragment: "少年体型" },
      ],
      references: [],
      requestedSize: { width: 1024, height: 1536 },
    });

    expect(spec.purpose).toBe("shot_clean_plate");
    expect(spec.positivePrompt).toContain("昏暗病房内");
    expect(spec.positivePrompt).toContain("one scene, one static moment");
    expect(spec.negativePrompt).toContain("speech bubbles");

    for (const forbidden of [
      "第1章：黑色念痕",
      "这些黑痕和海那边还连在一起",
      "真正的边界不是线",
      "这就是真相吗",
      "镜头从病床缓慢推向窗外",
      "vertical_scroll",
      "comic panel",
    ]) {
      expect(spec.positivePrompt).not.toContain(forbidden);
    }
  });

  it("只选择当前镜头角色的已确认单人预览图和当前场景图", () => {
    const now = "2026-07-10T00:00:00.000Z";
    const shot: StoryboardShot = {
      id: "shot_015",
      order: 15,
      beatId: null,
      sceneId: "scene_ward",
      characterIds: ["story_char_kurapika"],
      coreAction: "酷拉皮卡站在病床前观察黑色念线",
      emotion: "警觉",
      shotType: "medium",
      cameraAngle: "eye_level",
      comic: {
        panelDescription: "酷拉皮卡独自站在病床前，黑色念线从床单延伸至窗外。",
        composition: "人物居中，病床前景，窗户背景。",
        dialogue: "不要进入图片",
        caption: "不要进入图片",
        panelRhythm: "normal",
      },
      motion: {
        visualDescription: "动态描述不要进入图片",
        compositionDesign: "",
        cameraMovement: "static",
        frameType: "detail",
        durationMs: 3000,
        durationHint: "3s",
        voiceLines: [],
      },
      promptDraft: "旧 prompt 不可信",
      lockedCandidateId: null,
      status: "ready_for_image",
    };

    const spec = createCandidateGenerationSpec({
      project: {
        id: "project_hunter",
        comicFormat: "vertical_scroll",
        artStyle: "dark_realistic",
        characters: [
          {
            id: "project_char_kurapika",
            name: "酷拉皮卡",
            appearance: "金色短发，黑色西装；本章承担悬疑判断功能，不应进入视觉提示。",
            promptFragment: "金色短发，黑色西装；本章承担悬疑判断功能，不应进入视觉提示。",
            previewReferenceAssetId: "asset_kurapika_preview",
            previewConfirmedAt: now,
            primaryReferenceAssetId: "asset_kurapika_four_panel_final",
          },
          {
            id: "project_char_killua",
            name: "奇犽",
            appearance: "银白刺发",
            promptFragment: "少年",
            previewReferenceAssetId: "asset_killua_preview",
            previewConfirmedAt: now,
            primaryReferenceAssetId: "asset_killua_final",
          },
        ],
        assets: [
          { id: "asset_kurapika_preview", path: "characters/kurapika/preview.webp" },
          { id: "asset_kurapika_four_panel_final", path: "characters/kurapika/final-reference.webp" },
          { id: "asset_killua_preview", path: "characters/killua/preview.webp" },
          { id: "asset_killua_final", path: "characters/killua/final-reference.webp" },
          { id: "asset_ward", path: "scenes/ward.webp" },
        ],
      },
      chapter: {
        id: "chapter_001",
        title: "第1章：黑色念痕",
        storyStructure: {
          structureJson: {
            characters: [
              {
                id: "story_char_kurapika",
                projectCharacterId: "project_char_kurapika",
                name: "酷拉皮卡",
                visualTraits: "金色短发",
              },
              {
                id: "story_char_killua",
                projectCharacterId: "project_char_killua",
                name: "奇犽",
                visualTraits: "银白刺发",
              },
            ],
            scenes: [
              {
                id: "scene_ward",
                name: "海边病房",
                location: "临海医院",
                timeOfDay: "阴天白昼",
                atmosphere: "压抑潮湿",
                referenceAssetId: "asset_ward",
              },
            ],
          },
        },
      },
      shot,
    });

    expect(spec.references.map((reference) => reference.assetId)).toEqual([
      "asset_kurapika_preview",
      "asset_ward",
    ]);
    expect(spec.references.map((reference) => ({
      assetId: reference.assetId,
      priority: reference.priority,
    }))).toEqual([
      { assetId: "asset_kurapika_preview", priority: 100 },
      { assetId: "asset_ward", priority: 90 },
    ]);
    expect(spec.positivePrompt).toContain("酷拉皮卡");
    expect(spec.positivePrompt).not.toContain("本章承担悬疑判断功能");
    expect(spec.positivePrompt).not.toContain("奇犽");
    expect(spec.references.map((reference) => reference.assetId)).not.toContain("asset_kurapika_four_panel_final");
    expect(spec.references.map((reference) => reference.assetId)).not.toContain("asset_killua_preview");
  });

  it("用服务端规格替换客户端提交的旧 prompt、全章引用和尺寸", () => {
    const spec = buildCandidateGenerationSpec({
      projectId: "project_hunter",
      chapterId: "chapter_001",
      chapterTitle: "不应进入 prompt",
      comicFormat: "vertical_scroll",
      artStyle: "dark_realistic",
      shot: {
        id: "shot_015",
        order: 15,
        beatId: null,
        sceneId: null,
        characterIds: [],
        coreAction: "一个角色观察病床上的黑色痕迹",
        emotion: "紧张",
        shotType: "close_up",
        cameraAngle: "high_angle",
        comic: {
          panelDescription: "角色的手停在黑色痕迹上方。",
          composition: "手部与痕迹占据画面中心。",
          dialogue: "旧对白",
          caption: "旧旁白",
          panelRhythm: "slow",
        },
        motion: {
          visualDescription: "旧动态描述",
          compositionDesign: "",
          cameraMovement: "push_in",
          frameType: "detail",
          durationMs: 3000,
          durationHint: "3s",
          voiceLines: [],
        },
        promptDraft: "旧的整页漫画 prompt",
        lockedCandidateId: null,
        status: "ready_for_image",
      },
      scene: null,
      characters: [],
      references: [],
      requestedSize: { width: 1024, height: 1536 },
    });

    const taskInput = createCandidateGenerationTaskInput(spec, {
      candidateCount: 99,
      positivePrompt: "第1章 comic panel dialogue caption vertical_scroll",
      negativePrompt: "客户端可以清空",
      referenceAssetIds: ["asset_unrelated_character"],
      preflightCharacterReferenceAssetIds: ["asset_first_four_panel"],
      image: { width: 4096, height: 1024 },
    });

    expect(taskInput.candidateCount).toBe(6);
    expect(taskInput.candidateGenerationSpec).toEqual(spec);
    expect(taskInput.generationPurpose).toBe("shot_clean_plate");
    expect(taskInput.generationSpecVersion).toBe(2);
    expect(taskInput.generationSpecDigest).toBe(spec.digest);
    expect(taskInput.image).toEqual({
      width: 1024,
      height: 1536,
      sizePolicyVersion: "legacy_generation_default_v1",
    });
    expect(taskInput).not.toHaveProperty("positivePrompt");
    expect(taskInput).not.toHaveProperty("negativePrompt");
    expect(taskInput).not.toHaveProperty("referenceAssetIds");
    expect(taskInput).not.toHaveProperty("preflightCharacterReferenceAssetIds");
  });
});
