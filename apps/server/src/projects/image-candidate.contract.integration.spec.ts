import type { INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ChapterStoryboard,
  ChapterStoryStructure,
  GenerationTaskItem,
  ProjectCharacter,
  WorkbenchAsset,
} from "@airoaming/shared";
import { TasksService } from "../tasks/tasks.service.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { buildImagePreflightJson } from "./image-preflight.util.js";
import { ImageProviderService } from "./image-provider.service.js";
import type { LocalChapter, LocalProject } from "./local-types.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectsModule } from "./projects.module.js";
import { ProjectsService } from "./projects.service.js";
import { buildProjectWorkflow } from "./workflow.util.js";

const NOW = "2026-07-10T00:00:00.000Z";
const PROJECT_ID = "project_candidate_contract";
const CHAPTER_ID = "chapter_001";
const SHOT_ID = "shot_001";
const CHARACTER_ID = "character_001";
const CHARACTER_PREVIEW_ASSET_ID = "asset_character_preview";
const CHARACTER_FINAL_ASSET_ID = "asset_character_final";
const SCENE_ASSET_ID = "asset_scene";
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("候选图生成契约端到端", () => {
  let workspaceRoot: string;
  let app: INestApplicationContext | null;

  beforeEach(async () => {
    workspaceRoot = path.join(tmpdir(), `airoaming-candidate-contract-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.AIROAMING_WORKSPACE_ROOT = workspaceRoot;
    await seedReadyProject(workspaceRoot);
    app = await NestFactory.createApplicationContext(ProjectsModule, { logger: false });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
    app = null;
    delete process.env.AIROAMING_WORKSPACE_ROOT;
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  it("从服务端预览生成同一规格，并把候选、资产、任务证据和比例异常一起持久化", async () => {
    const projects = app!.get(ProjectsService);
    const tasks = app!.get(TasksService);
    const imageProvider = app!.get(ImageProviderService);
    const preview = await projects.getCandidateGenerationPreview(PROJECT_ID, CHAPTER_ID, SHOT_ID);
    const beforeGeneration = await projects.getWorkbenchSnapshot(PROJECT_ID, CHAPTER_ID);

    expect(beforeGeneration.imagePreflight?.preflightJson.issues).toEqual([]);
    expect(beforeGeneration.imagePreflight?.preflightJson.ready).toBe(true);
    expect(beforeGeneration.imagePreflight?.sourceStoryboardId).toBe(beforeGeneration.storyboard?.id);
    expect(beforeGeneration.imagePreflight?.sourceStoryboardUpdatedAt).toBe(beforeGeneration.storyboard?.updatedAt);

    vi.spyOn(imageProvider, "getActiveProviderType").mockReturnValue("grok");
    vi.spyOn(imageProvider, "generateCandidateImage").mockResolvedValue({
      buffer: ONE_PIXEL_PNG,
      generationMode: "multi_image_edit",
      usedReferenceAssetIds: [CHARACTER_PREVIEW_ASSET_ID, SCENE_ASSET_ID],
      referencePlan: {
        schemaVersion: 1,
        compilerVersion: "candidate_reference_plan_v1",
        providerType: "grok",
        strategy: "direct",
        inputReferenceAssetIds: [CHARACTER_PREVIEW_ASSET_ID, SCENE_ASSET_ID],
        usedReferenceAssetIds: [CHARACTER_PREVIEW_ASSET_ID, SCENE_ASSET_ID],
        slots: [
          {
            order: 1,
            role: "direct_identity",
            providerReferenceId: CHARACTER_PREVIEW_ASSET_ID,
            label: "角色",
            covers: [CHARACTER_PREVIEW_ASSET_ID],
          },
          {
            order: 2,
            role: "scene_environment",
            providerReferenceId: SCENE_ASSET_ID,
            label: "场景",
            covers: [SCENE_ASSET_ID],
          },
        ],
        omittedRequired: [],
        compositionCoverage: "prompt_only",
        warnings: [],
      },
      warnings: [],
    });

    const created = await tasks.create({
      projectId: PROJECT_ID,
      type: "image_generate",
      target: { type: "shot", id: SHOT_ID, chapterId: CHAPTER_ID },
      input: {
        chapterId: CHAPTER_ID,
        shotId: SHOT_ID,
        candidateCount: 1,
        positivePrompt: "第1章 comic panel dialogue caption vertical_scroll",
        referenceAssetIds: [CHARACTER_FINAL_ASSET_ID],
        image: { width: 4096, height: 1024 },
      },
    });
    const task = await waitForTerminalTask(tasks, created.id);

    expect(task.status).toBe("succeeded");
    expect(task.input.candidateGenerationSpec).toEqual(preview.spec);
    expect(task.input.generationSpecDigest).toBe(preview.spec.digest);
    expect(task.input).not.toHaveProperty("positivePrompt");
    expect(task.input).not.toHaveProperty("referenceAssetIds");

    const snapshot = await projects.getWorkbenchSnapshot(PROJECT_ID, CHAPTER_ID);
    const candidate = snapshot.candidates.find((item) => item.taskId === task.id);
    expect(candidate).toMatchObject({
      shotId: SHOT_ID,
      generationPurpose: "shot_clean_plate",
      generationSpecVersion: 2,
      generationSpecDigest: preview.spec.digest,
    });

    const asset = snapshot.assets.find((item) => item.sourceTaskId === task.id);
    expect(asset).toBeDefined();
    const assetMeta = JSON.parse(asset!.meta) as Record<string, unknown>;
    expect(assetMeta).toMatchObject({
      generationSpecDigest: preview.spec.digest,
      requestedSize: { width: 1024, height: 1536 },
      actualSize: { width: 1, height: 1 },
      referenceAssetIds: [CHARACTER_PREVIEW_ASSET_ID, SCENE_ASSET_ID],
      referencePlan: {
        strategy: "direct",
        omittedRequired: [],
        compositionCoverage: "prompt_only",
      },
    });

    expect(task.output?.warnings).toContain("candidate_output_aspect_ratio_mismatch:1024x1536:1x1");
    expect(assetMeta.warnings).toContain("candidate_output_aspect_ratio_mismatch:1024x1536:1x1");

    const taskDir = path.join(workspaceRoot, "projects", PROJECT_ID, "tasks");
    const inputArtifact = JSON.parse(await readFile(path.join(taskDir, `${task.id}.input.json`), "utf8")) as GenerationTaskItem;
    const outputArtifact = JSON.parse(await readFile(path.join(taskDir, `${task.id}.output.json`), "utf8")) as Record<string, unknown>;
    expect(inputArtifact.input.generationSpecDigest).toBe(preview.spec.digest);
    expect(outputArtifact.generationSpecDigest).toBe(preview.spec.digest);
    expect(outputArtifact.warnings).toContain("candidate_output_aspect_ratio_mismatch:1024x1536:1x1");
  });
});

async function waitForTerminalTask(tasks: TasksService, taskId: string): Promise<GenerationTaskItem> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const task = tasks.get(taskId);
    if (["succeeded", "failed", "cancelled"].includes(task.status)) {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("TASK_DID_NOT_FINISH");
}

async function seedReadyProject(workspaceRoot: string): Promise<void> {
  const character: ProjectCharacter = {
    id: CHARACTER_ID,
    projectId: PROJECT_ID,
    name: "酷拉皮卡",
    role: "主角",
    level: "lead",
    entityType: "human",
    status: "finalized",
    appearance: "金色短发，黑色西装",
    personality: "冷静克制",
    promptFragment: "金色短发，黑色西装",
    referenceAssetIds: [CHARACTER_PREVIEW_ASSET_ID, CHARACTER_FINAL_ASSET_ID],
    previewReferenceAssetId: CHARACTER_PREVIEW_ASSET_ID,
    previewConfirmedAt: NOW,
    primaryReferenceAssetId: CHARACTER_FINAL_ASSET_ID,
    primaryReferenceKind: "final_reference",
    visualVersion: 1,
    source: "manual",
    createdAt: NOW,
    updatedAt: NOW,
    finalizedAt: NOW,
  };
  const assets: WorkbenchAsset[] = [
    {
      id: CHARACTER_PREVIEW_ASSET_ID,
      type: "image",
      name: "酷拉皮卡单人预览",
      path: `projects/${PROJECT_ID}/characters/kurapika/preview.png`,
      sourceTaskId: null,
      meta: "{}",
    },
    {
      id: CHARACTER_FINAL_ASSET_ID,
      type: "image",
      name: "酷拉皮卡四分格定稿",
      path: `projects/${PROJECT_ID}/characters/kurapika/final-reference.png`,
      sourceTaskId: null,
      meta: "{}",
    },
    {
      id: SCENE_ASSET_ID,
      chapterId: CHAPTER_ID,
      type: "image",
      name: "病房场景",
      path: `projects/${PROJECT_ID}/chapters/chapter-001/scenes/ward.png`,
      sourceTaskId: null,
      meta: "{}",
    },
  ];
  const storyStructure: ChapterStoryStructure = {
    id: "story_001",
    projectId: PROJECT_ID,
    chapterId: CHAPTER_ID,
    version: 1,
    status: "structured",
    structurePath: `projects/${PROJECT_ID}/chapters/chapter-001/structure.json`,
    sourceScriptVersionId: null,
    structureJson: {
      schemaVersion: 1,
      chapterId: CHAPTER_ID,
      chapterTitle: "第1章：黑色念痕",
      sourceScriptVersionId: null,
      synopsis: "众人在病房观察异常黑痕。",
      direction: {
        logline: "黑痕指向窗外。",
        chapterGoal: "揭示异常",
        coreConflict: "未知念痕",
        emotionalArc: "警觉到压迫",
        endingHook: "黑痕指向海面",
      },
      characters: [{
        id: "story_character_001",
        projectCharacterId: CHARACTER_ID,
        name: "酷拉皮卡",
        role: "调查者",
        level: "lead",
        entityType: "human",
        motivation: "查明真相",
        relationship: "调查同伴",
        visualTraits: "金色短发",
        notes: "",
      }],
      scenes: [{
        id: "scene_001",
        name: "海边病房",
        location: "临海医院旧病房",
        timeOfDay: "阴天白昼",
        atmosphere: "低照度、潮湿、压迫",
        purpose: "发现异常",
        referenceAssetId: SCENE_ASSET_ID,
      }],
      beats: [{
        id: "beat_001",
        order: 1,
        title: "观察黑痕",
        summary: "酷拉皮卡观察病床黑痕。",
        conflict: "黑痕突然转向",
        characters: ["酷拉皮卡"],
        sceneId: "scene_001",
        visualFocus: "病床与窗户",
        outcome: "黑痕指向海面",
      }],
      notes: "",
      createdAt: NOW,
      updatedAt: NOW,
    },
    createdAt: NOW,
    updatedAt: NOW,
    confirmedAt: NOW,
  };
  const storyboard: ChapterStoryboard = {
    id: "storyboard_001",
    projectId: PROJECT_ID,
    chapterId: CHAPTER_ID,
    version: 1,
    status: "storyboard_done",
    storyboardPath: `projects/${PROJECT_ID}/chapters/chapter-001/storyboard.json`,
    sourceStoryVersionId: null,
    storyboardJson: {
      schemaVersion: 1,
      chapterId: CHAPTER_ID,
      chapterTitle: "第1章：黑色念痕",
      sourceStoryVersionId: null,
      shots: [{
        id: SHOT_ID,
        order: 1,
        beatId: "beat_001",
        sceneId: "scene_001",
        characterIds: [CHARACTER_ID],
        coreAction: "酷拉皮卡站在病床前观察黑色念线",
        emotion: "警觉",
        shotType: "medium",
        cameraAngle: "eye_level",
        comic: {
          panelDescription: "酷拉皮卡独自站在病床前，黑色念线从床单延伸至窗外。",
          composition: "人物居中，病床前景，窗户背景。",
          dialogue: "这句对白不能进入图片",
          caption: "这段旁白不能进入图片",
          panelRhythm: "normal",
        },
        motion: {
          visualDescription: "镜头缓慢推向窗外海面。",
          compositionDesign: "动态推镜",
          cameraMovement: "push_in",
          frameType: "detail",
          durationMs: 3000,
          durationHint: "3s",
          voiceLines: [],
        },
        promptDraft: "comic panel，第1章，加入气泡并按竖滑条漫分格",
        lockedCandidateId: null,
        status: "ready_for_image",
      }],
      notes: "",
      createdAt: NOW,
      updatedAt: NOW,
    },
    createdAt: NOW,
    updatedAt: NOW,
    confirmedAt: NOW,
  };
  const chapter: LocalChapter = {
    id: CHAPTER_ID,
    projectId: PROJECT_ID,
    slug: "chapter-001",
    order: 1,
    title: "第1章：黑色念痕",
    status: "storyboard_done",
    currentScriptVersionId: null,
    currentStoryVersionId: null,
    sourceText: "# 第1章：黑色念痕\n\n病房内出现黑色念痕。",
    summary: "调查黑色念痕",
    storyStructure,
    storyboard,
    pendingStoryboard: null,
    pendingSourceText: null,
    imagePreflight: null,
    candidates: [],
    layout: null,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    scriptVersions: [],
    lastScriptRevision: null,
  };
  const project: LocalProject = {
    id: PROJECT_ID,
    name: "候选图契约测试项目",
    type: "comic",
    currentChapterId: CHAPTER_ID,
    storyTitle: "测试故事",
    genreTags: [],
    comicFormat: "vertical_scroll",
    artStyle: "dark_realistic",
    description: "测试候选图干净底图契约",
    sourceText: chapter.sourceText,
    scriptOutline: null,
    characters: [character],
    assets,
    chapters: [chapter],
    createdAt: NOW,
    updatedAt: NOW,
  };
  const preflightJson = buildImagePreflightJson(project, chapter, "测试已确认", NOW, () => false);
  chapter.imagePreflight = {
    id: "preflight_001",
    projectId: PROJECT_ID,
    chapterId: CHAPTER_ID,
    version: 1,
    status: "confirmed",
    preflightPath: `projects/${PROJECT_ID}/chapters/chapter-001/preflight.json`,
    sourceStoryboardId: storyboard.id,
    sourceStoryboardUpdatedAt: storyboard.updatedAt,
    preflightJson,
    createdAt: NOW,
    updatedAt: NOW,
    confirmedAt: NOW,
  };

  const workspacePath = new WorkspacePathService();
  const repository = new ProjectRepository(workspacePath);
  await repository.saveProject(project, buildProjectWorkflow(project, chapter, true));
  for (const asset of assets) {
    const absolutePath = path.join(workspaceRoot, asset.path.replace(/^projects\//, "projects/"));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, ONE_PIXEL_PNG);
  }
}
