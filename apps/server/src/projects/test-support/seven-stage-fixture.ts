import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { vi, type MockInstance } from "vitest";
import type {
  CompleteChapterResponse,
  CreateGenerationTaskRequest,
  GenerationTaskItem,
  StoryboardJson,
  StoryStructureJson,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { TasksService } from "../../tasks/tasks.service.js";
import { ImageProviderService } from "../image-provider.service.js";
import { ProjectsModule } from "../projects.module.js";
import { ProjectsService } from "../projects.service.js";

const FIXTURE_TIME = "2026-07-11T00:00:00.000Z";
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export interface SevenStageProjectRef {
  projectId: string;
  chapterId: string;
}

export interface StoryFixtureOptions {
  withLeadCharacter?: boolean;
  shotCount?: number;
  shotOrder?: number[];
}

/**
 * 七阶段 Service characterization 的最小运行壳。
 *
 * 业务动作只走 ProjectsService / TasksService；只有真正会出公网的图片
 * provider 被替换为确定性 fake。workspace、Repository、Nest 生命周期和文件读写均为真实实现。
 */
export class SevenStageFixture {
  readonly workspaceRoot: string;

  private app: INestApplicationContext | null = null;
  private providerSpies: MockInstance[] = [];
  private readonly previousWorkspaceRoot = process.env.AIROAMING_WORKSPACE_ROOT;
  private readonly previousOpenCodeAutoStart = process.env.OPENCODE_AUTO_START;

  projects!: ProjectsService;
  tasks!: TasksService;

  constructor(workspaceRoot = path.join(
    tmpdir(),
    `airoaming-seven-stage-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )) {
    this.workspaceRoot = workspaceRoot;
  }

  async start(): Promise<this> {
    process.env.AIROAMING_WORKSPACE_ROOT = this.workspaceRoot;
    process.env.OPENCODE_AUTO_START = "false";
    this.app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
    this.projects = this.app.get(ProjectsService);
    this.tasks = this.app.get(TasksService);

    const imageProvider = this.app.get(ImageProviderService);
    this.providerSpies = [
      vi.spyOn(imageProvider, "getActiveProviderType").mockReturnValue("grok"),
      vi.spyOn(imageProvider, "generateCandidateImage").mockResolvedValue({
        buffer: ONE_PIXEL_PNG,
        generationMode: "image_generation",
        usedReferenceAssetIds: [],
        warnings: [],
      }),
    ];
    return this;
  }

  async reopen(): Promise<void> {
    await this.closeApplication();
    await this.start();
  }

  async dispose(): Promise<void> {
    await this.closeApplication();
    if (this.previousWorkspaceRoot === undefined) {
      delete process.env.AIROAMING_WORKSPACE_ROOT;
    } else {
      process.env.AIROAMING_WORKSPACE_ROOT = this.previousWorkspaceRoot;
    }
    if (this.previousOpenCodeAutoStart === undefined) {
      delete process.env.OPENCODE_AUTO_START;
    } else {
      process.env.OPENCODE_AUTO_START = this.previousOpenCodeAutoStart;
    }
    await rm(this.workspaceRoot, { recursive: true, force: true });
  }

  async createProject(name = "七阶段行为刻画项目"): Promise<SevenStageProjectRef> {
    const project = await this.projects.createProject({
      name,
      type: "comic",
      storyTitle: "雨夜来信",
      comicFormat: "vertical_scroll",
      artStyle: "comic_style",
      description: "用于锁定七阶段当前正确行为",
    });
    const snapshot = await this.projects.getWorkbenchSnapshot(project.id);
    if (!snapshot.currentChapter) {
      throw new Error("FIXTURE_DEFAULT_CHAPTER_MISSING");
    }
    return { projectId: project.id, chapterId: snapshot.currentChapter.id };
  }

  async completeScript(ref: SevenStageProjectRef): Promise<CompleteChapterResponse> {
    return this.projects.completeChapter(ref.projectId, ref.chapterId, {
      sourceText: "# 第一章：雨夜来信\n\n阿澈在雨夜收到一封没有署名的信。",
      title: "第一章：雨夜来信",
      summary: "匿名信引导阿澈前往旧站",
      createNextChapter: false,
    });
  }

  async confirmStructure(ref: SevenStageProjectRef, options: StoryFixtureOptions = {}): Promise<void> {
    await this.projects.confirmChapterStoryStructure(ref.projectId, ref.chapterId, {
      structureJson: buildStoryStructure(ref.chapterId, options.withLeadCharacter ?? false),
    });
  }

  async savePendingStoryboard(
    ref: SevenStageProjectRef,
    options: StoryFixtureOptions = {},
  ): Promise<StoryboardJson> {
    const storyboardJson = await this.buildStoryboard(ref, options);
    await this.projects.savePendingChapterStoryboard(ref.projectId, ref.chapterId, { storyboardJson });
    return storyboardJson;
  }

  async confirmStoryboard(
    ref: SevenStageProjectRef,
    options: StoryFixtureOptions = {},
  ): Promise<StoryboardJson> {
    const storyboardJson = await this.buildStoryboard(ref, options);
    await this.projects.confirmChapterStoryboard(ref.projectId, ref.chapterId, { storyboardJson });
    return storyboardJson;
  }

  async confirmPendingStoryboard(ref: SevenStageProjectRef): Promise<void> {
    const pending = await this.projects.getPendingChapterStoryboard(ref.projectId, ref.chapterId);
    if (!pending) {
      throw new Error("FIXTURE_PENDING_STORYBOARD_MISSING");
    }
    await this.projects.confirmChapterStoryboard(ref.projectId, ref.chapterId, {
      storyboardJson: pending.storyboardJson,
    });
  }

  async generateCandidate(
    ref: SevenStageProjectRef,
    shotId: string,
  ): Promise<GenerationTaskItem> {
    const request: CreateGenerationTaskRequest = {
      projectId: ref.projectId,
      type: "image_generate",
      target: { type: "shot", id: shotId, chapterId: ref.chapterId },
      input: { chapterId: ref.chapterId, shotId, candidateCount: 1 },
    };
    const created = await this.tasks.create(request);
    return waitForTerminalTask(this.tasks, created.id);
  }

  async snapshot(ref: SevenStageProjectRef): Promise<WorkbenchSnapshot> {
    return this.projects.getWorkbenchSnapshot(ref.projectId, ref.chapterId);
  }

  private async buildStoryboard(
    ref: SevenStageProjectRef,
    options: StoryFixtureOptions,
  ): Promise<StoryboardJson> {
    const snapshot = await this.snapshot(ref);
    const characterId = options.withLeadCharacter
      ? snapshot.storyStructure?.structureJson.characters[0]?.projectCharacterId ?? null
      : null;
    if (options.withLeadCharacter && !characterId) {
      throw new Error("FIXTURE_LEAD_CHARACTER_MISSING");
    }
    return buildStoryboard(
      ref.chapterId,
      options.shotCount ?? 1,
      characterId,
      options.shotOrder,
    );
  }

  private async closeApplication(): Promise<void> {
    for (const spy of this.providerSpies) {
      spy.mockRestore();
    }
    this.providerSpies = [];
    await this.app?.close();
    this.app = null;
  }
}

export function buildStoryStructure(chapterId: string, withLeadCharacter: boolean): StoryStructureJson {
  return {
    schemaVersion: 1,
    chapterId,
    chapterTitle: "第一章：雨夜来信",
    sourceScriptVersionId: null,
    synopsis: "阿澈循着匿名信寻找雨夜里的真相。",
    direction: {
      logline: "一封匿名信引出旧案线索。",
      chapterGoal: "找到寄信人留下的第一条线索。",
      coreConflict: "阿澈必须在暴雨冲掉痕迹前赶到旧站。",
      emotionalArc: "疑惑到警觉。",
      endingHook: "信封背面浮现新的地址。",
    },
    characters: withLeadCharacter ? [{
      id: "structure_character_001",
      projectCharacterId: null,
      name: "阿澈",
      role: "调查者",
      level: "lead",
      entityType: "human",
      motivation: "查清匿名信来源",
      relationship: "本章主角",
      visualTraits: "黑色短发，深色雨衣",
      notes: "需要稳定角色形象",
    }] : [],
    scenes: [{
      id: "scene_station",
      name: "废弃车站",
      location: "城郊旧车站",
      timeOfDay: "雨夜",
      atmosphere: "潮湿、空旷、警觉",
      purpose: "发现匿名信线索",
      referenceAssetId: null,
    }],
    beats: [{
      id: "beat_letter",
      order: 1,
      title: "追到旧站",
      summary: "阿澈依据信件来到废弃车站。",
      conflict: "暴雨即将冲掉地面的线索。",
      characters: withLeadCharacter ? ["阿澈"] : [],
      sceneId: "scene_station",
      visualFocus: "雨幕中的站台与信封",
      outcome: "阿澈发现下一处地址。",
    }],
    notes: "确定性测试结构",
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
}

export function buildStoryboard(
  chapterId: string,
  shotCount: number,
  leadCharacterId: string | null,
  shotOrder?: number[],
): StoryboardJson {
  const orders = shotOrder ?? Array.from({ length: shotCount }, (_, index) => index + 1);
  return {
    schemaVersion: 1,
    chapterId,
    chapterTitle: "第一章：雨夜来信",
    sourceStoryVersionId: null,
    shots: Array.from({ length: shotCount }, (_, index) => {
      const number = index + 1;
      return {
        id: `shot_${String(number).padStart(3, "0")}`,
        order: orders[index] ?? number,
        beatId: "beat_letter",
        sceneId: "scene_station",
        characterIds: leadCharacterId ? [leadCharacterId] : [],
        coreAction: number === 1 ? "阿澈踏上雨夜站台" : "镜头转向信封背面的地址",
        emotion: "警觉",
        shotType: number === 1 ? "wide" : "close_up",
        cameraAngle: "eye_level",
        comic: {
          panelDescription: number === 1 ? "雨幕中的废弃站台" : "被雨滴打湿的信封特写",
          composition: "主体位于画面中央，留出环境叙事空间",
          dialogue: leadCharacterId ? "阿澈：这里还有字。" : "",
          caption: "雨声盖住了远处的脚步。",
          panelRhythm: number === 1 ? "slow" : "normal",
        },
        motion: {
          visualDescription: "镜头保持克制，突出雨夜线索。",
          compositionDesign: "前景雨滴，中景主体，背景站台。",
          cameraMovement: "static",
          frameType: number === 1 ? "atmosphere" : "detail",
          durationMs: 3000,
          durationHint: "约 3s",
          voiceLines: [],
        },
        promptDraft: "雨夜废弃车站，干净漫画画格，不含文字和气泡",
        lockedCandidateId: null,
        status: "ready_for_image",
      };
    }),
    notes: "确定性测试分镜",
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
}

export async function waitForTerminalTask(
  tasks: TasksService,
  taskId: string,
): Promise<GenerationTaskItem> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const task = tasks.get(taskId);
    if (["succeeded", "failed", "cancelled"].includes(task.status)) {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`TASK_DID_NOT_FINISH:${taskId}`);
}
