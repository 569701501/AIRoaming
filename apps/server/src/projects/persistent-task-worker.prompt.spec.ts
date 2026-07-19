import { describe, expect, it, vi } from "vitest";
import type { StoryboardDocumentV2, StoryDocumentV2 } from "@airoaming/shared";
import {
  PersistentTaskWorkerService,
  type PersistentTaskHandlerContext,
} from "./persistent-task-worker.service.js";

describe("PersistentTaskWorkerService storyboard Prompt", () => {
  it("shot_generate 复用完整分镜 Skill，并由后端分配 ID 和映射角色引用", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "chapter-1",
      title: "雨夜交易",
      milestoneStatus: "story_structured",
      project: {
        name: "管理代号-1111",
        storyTitle: "追光者",
        comicFormat: "vertical_scroll",
        artStyle: "comic_style",
      },
      currentStoryVersion: {
        id: "story-version-1",
        sourceScriptVersionId: "script-version-1",
        sourceScriptVersion: { sourceText: "普通章节正文，当前没有可稳定解析的对白候选。" },
        createdAt: new Date("2026-07-18T00:00:00.000Z"),
        updatedAt: new Date("2026-07-18T00:00:00.000Z"),
        documentJson: {
          schemaVersion: 2,
          chapterId: "chapter-1",
          synopsis: "林舟在雨夜仓库发现真相。",
          direction: {
            logline: "林舟追查失踪证人。",
            chapterGoal: "找到证人。",
            coreConflict: "追兵逼近。",
            emotionalArc: "怀疑转为决断。",
            endingHook: "旧录音出现。",
          },
          characters: [{
            id: "character_01",
            projectCharacterId: "project-character-lin",
            name: "林舟",
            role: "主角",
            level: "lead",
            entityType: "human",
            motivation: "寻找真相",
            relationship: "独自调查",
            visualTraits: "黑色短发，深色风衣",
            notes: "",
          }],
          scenes: [{
            id: "scene_01",
            name: "雨夜仓库",
            location: "旧港仓库",
            timeOfDay: "深夜",
            atmosphere: "压迫",
            purpose: "揭示线索",
          }],
          beats: [{
            id: "beat_01",
            order: 1,
            title: "发现录音",
            summary: "林舟找到旧录音。",
            conflict: "追兵正在接近。",
            characters: ["character_01"],
            sceneId: "scene_01",
            visualFocus: "录音机亮起指示灯",
            outcome: "林舟决定带走录音。",
          }],
          notes: "",
        },
      },
    });
    const createSession = vi.fn().mockResolvedValue("session-1");
    const sendMessage = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        shots: [{
          order: 1,
          beatId: "beat_01",
          sceneId: "scene_01",
          characterIds: ["character_01"],
          coreAction: "林舟握住刚找到的录音机，回头望向仓库入口",
          emotion: "警觉而坚定",
          shotType: "medium",
          cameraAngle: "eye_level",
          comic: {
            panelDescription: "林舟将发亮的录音机护在胸前，雨水从仓库门外斜落",
            composition: "林舟位于左侧，右侧入口形成视线通道",
            dialogue: "",
            caption: "",
            panelRhythm: "impact",
          },
          motion: {
            visualDescription: "林舟从低头检查录音机开始，听见门外动静后抬头转向入口，最终将录音机收紧在胸前",
            compositionDesign: "人物由画面左下抬头转向右侧入口，结束时入口保持压迫性负空间",
            cameraMovement: "push_in",
            frameType: "reaction",
            durationMs: 3200,
            durationHint: "约 3.2s",
            voiceLines: [],
          },
          promptDraft: "雨夜旧港仓库，黑发风衣青年护住发亮录音机并警觉回望入口",
        }],
        notes: "用入口负空间维持追兵逼近的压力。",
      }),
    });
    const service = new PersistentTaskWorkerService(
      { database: () => ({ chapter: { findUnique } }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { createSession, sendMessage } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const runShotProvider = (service as unknown as {
      runShotProvider(context: PersistentTaskHandlerContext): Promise<StoryboardDocumentV2>;
    }).runShotProvider.bind(service);

    const result = await runShotProvider({
      task: {} as never,
      input: { chapterId: "chapter-1", instruction: "生成当前章节分镜" },
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0].content).toContain("漫画 / 漫剧双轨一致性边界");
    expect(sendMessage.mock.calls[0]?.[0].content).toContain("当前剧情结构版本：story-version-1");
    expect(sendMessage.mock.calls[0]?.[0].content).not.toContain("管理代号-1111");
    expect(result).toMatchObject({ schemaVersion: 2, chapterId: "chapter-1" });
    expect(result.shots[0]?.id).toBeTruthy();
    expect(result.shots[0]?.id).not.toBe("shot_001");
    expect(result.shots[0]?.characterIds).toEqual(["project-character-lin"]);
  });
});

describe("PersistentTaskWorkerService shot prompt optimization", () => {
  it("shot_prompt_generate 调用窄 Skill，格式或单帧质量失败时只修复一次", async () => {
    const createSession = vi.fn().mockResolvedValue("session-shot-prompt");
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          visualDescription: "林舟先撑门，随后苏弥跑到车厢另一端。",
          action: "两人行动。",
          composition: "两人居中。",
          mustShow: [],
          warnings: [],
        }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          visualDescription: "林舟和苏弥同时按住即将合拢的旧车门，雨水凝在两人的肩头。",
          action: "林舟在门外用右手撑门，苏弥从门内抓住他的左腕。",
          composition: "林舟位于左前景，苏弥位于右中景，交握的手位于视觉中心。",
          mustShow: ["两人同时入画", "交握的手"],
          warnings: [],
        }),
      });
    const service = new PersistentTaskWorkerService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { createSession, sendMessage } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const runShotPromptProvider = (service as unknown as {
      runShotPromptProvider(context: PersistentTaskHandlerContext): Promise<Record<string, unknown>>;
    }).runShotPromptProvider.bind(service);
    const input = {
      chapterId: "chapter-1",
      shotId: "shot-1",
      generationSpecDigest: `sha256:${"a".repeat(64)}`,
      instruction: "把多人动作关系写清楚",
      promptSpec: {
        schemaVersion: 2,
        sizePolicyVersion: "legacy_generation_default_v1",
        shotId: "shot-1",
        positivePrompt: "provider-neutral prompt",
        providerPrompt: "provider-specific prompt",
        negativePrompt: "text, logo",
        image: { width: 1024, height: 1536, sizePolicyVersion: "legacy_generation_default_v1" },
        sections: [
          { key: "visual", label: "画面", value: "两人撑门" },
          { key: "action", label: "动作", value: "他们互动" },
        ],
        systemConstraints: ["one scene, one static moment"],
        visualIssues: [{ code: "VISUAL_ACTOR_RELATION_UNCLEAR", severity: "warning", field: "action", message: "多人关系不清" }],
        visualContext: {
          characters: [
            { name: "林舟", entityType: "human" },
            { name: "苏弥", entityType: "human" },
          ],
        },
      },
    };

    const result = await runShotPromptProvider({ task: {} as never, input });

    expect(createSession).toHaveBeenCalledWith("shot_prompt_generate:shot-1");
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[0]?.[0].content).toContain("结果只供用户选择采用");
    expect(sendMessage.mock.calls[0]?.[0].content).toContain("把多人动作关系写清楚");
    expect(sendMessage.mock.calls[1]?.[0].content).toContain("VISUAL_MULTIPLE_MOMENTS");
    expect(result).toMatchObject({
      targetId: "shot-1",
      visualDescription: expect.stringContaining("同时按住"),
      action: expect.stringContaining("苏弥从门内"),
      composition: expect.stringContaining("视觉中心"),
      visualIssues: [],
    });
  });
});

describe("PersistentTaskWorkerService story structure Prompt", () => {
  it("story_parse 复用剧情结构 Skill，并由后端补本地 ID 和待解析角色引用", async () => {
    const sourceDigest = `sha256:${"a".repeat(64)}`;
    const sourceText = "林舟在旧港仓库找到旧录音，追兵正在接近，他决定带走录音。";
    const chapterFindUnique = vi.fn().mockResolvedValue({
      id: "chapter-1",
      title: "雨夜交易",
      milestoneStatus: "script_done",
      project: {
        name: "管理代号-1111",
        storyTitle: "追光者",
        currentScriptOutline: { sourceText: "第 1 章让林舟找到父亲留下的旧录音。" },
      },
    });
    const scriptFindFirst = vi.fn().mockResolvedValue({
      id: "script-version-1",
      chapterId: "chapter-1",
      sourceText,
      sourceDigest,
    });
    const createSession = vi.fn().mockResolvedValue("session-1");
    const sendMessage = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        synopsis: "林舟在追兵逼近时找到旧录音并决定带走。",
        direction: {
          logline: "林舟冒险带走父亲留下的旧录音。",
          chapterGoal: "找到并保住旧录音。",
          coreConflict: "追兵逼近，林舟必须立即选择。",
          emotionalArc: "警觉转为坚定。",
          endingHook: "录音内容仍未揭晓。",
        },
        characters: [{
          name: "林舟",
          role: "寻找真相的主角",
          level: "lead",
          entityType: "human",
          motivation: "带走父亲留下的录音",
          relationship: "独自面对追兵",
          visualTraits: "",
          notes: "",
        }],
        scenes: [{
          name: "旧港仓库",
          location: "旧港仓库",
          timeOfDay: "深夜",
          atmosphere: "紧迫",
          purpose: "让林舟发现并带走关键线索",
        }],
        beats: [{
          order: 1,
          title: "发现录音",
          summary: "林舟找到父亲留下的旧录音。",
          conflict: "追兵正在接近仓库。",
          characters: ["林舟"],
          sceneName: "旧港仓库",
          visualFocus: "林舟握紧旧录音并望向入口。",
          outcome: "林舟决定带走录音。",
        }],
        notes: "后续分镜需保持追兵逼近的压力。",
      }),
    });
    const service = new PersistentTaskWorkerService(
      {
        database: () => ({
          chapter: { findUnique: chapterFindUnique },
          chapterScriptVersion: { findFirst: scriptFindFirst },
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { createSession, sendMessage } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const runStoryProvider = (service as unknown as {
      runStoryProvider(context: PersistentTaskHandlerContext): Promise<StoryDocumentV2>;
    }).runStoryProvider.bind(service);

    const result = await runStoryProvider({
      task: {} as never,
      input: {
        chapterId: "chapter-1",
        instruction: "生成当前章节剧情结构",
        sourceProjection: {
          schemaVersion: 1,
          policyVersion: "story-source-v1",
          projectId: "project-1",
          chapterId: "chapter-1",
          consumerType: "story_parse",
          sources: [{
            role: "source",
            order: 1,
            sourceType: "chapter_script_version",
            sourceId: "script-version-1",
            sourceDigest,
          }],
        },
      },
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[0].content).toContain("skill：structure-story-parse");
    expect(sendMessage.mock.calls[0]?.[0].content).toContain("当前剧本版本：script-version-1");
    expect(sendMessage.mock.calls[0]?.[0].content).not.toContain("管理代号-1111");
    expect(sendMessage.mock.calls[0]?.[0].content).not.toContain("StoryDocumentV2");
    expect(result).toMatchObject({ schemaVersion: 2, chapterId: "chapter-1" });
    expect(result.characters[0]).toMatchObject({
      id: "character_01",
      projectCharacterId: "unresolved-story-character:character_01",
      name: "林舟",
    });
    expect(result.scenes[0]?.id).toBe("scene_01");
    expect(result.beats[0]).toMatchObject({
      id: "beat_01",
      sceneId: "scene_01",
      characters: ["character_01"],
    });
  });
});
