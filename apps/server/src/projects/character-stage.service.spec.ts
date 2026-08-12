import { BadRequestException } from "@nestjs/common";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { LocalProject } from "./local-types.js";
import { CharacterStageService } from "./character-stage.service.js";
import type { ImageProviderService } from "./image-provider.service.js";
import type { PrismaService } from "../persistence/prisma.service.js";
import type { ProjectStore } from "./project-store.service.js";
import type { WorkspacePathService } from "../workspace/workspace-path.service.js";

// ===== 内存版 Prisma fake(只覆盖本服务用到的模型与方法) =====

interface StageRow {
  id: string;
  projectId: string;
  characterId: string;
  stageOrder: number;
  name: string | null;
  fromChapterId: string | null;
  toChapterId: string | null;
  visualDelta: string;
  previewAssetId: string | null;
  finalAssetId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AssetRow {
  id: string;
  projectId: string;
  chapterId: string | null;
  type: string;
  role: string;
  mimeType: string;
  storageKey: string;
  status: string;
  sha256: string | null;
  bytes: number | null;
  sourceTaskId: string | null;
}

interface CharacterRow {
  id: string;
  projectId: string;
  name: string;
  anchorAssetId: string | null;
  primaryVisual: { assetId: string } | null;
  previewVisual: { assetId: string } | null;
}

interface FakePrismaService {
  isDatabaseMode(): boolean;
  database(): unknown;
  runBusinessTransaction(operation: (tx: unknown) => Promise<unknown>): Promise<unknown>;
}

function createFakeDb() {
  const state: { stages: StageRow[]; assets: AssetRow[]; characters: CharacterRow[]; chapters: { id: string; projectId: string }[] } = {
    stages: [],
    assets: [],
    characters: [],
    chapters: [],
  };
  const db = {
    characterStage: {
      findFirst: vi.fn(async (args: { where?: { characterId?: string; stageOrder?: { lt: number } }; orderBy?: { stageOrder: "asc" | "desc" } }) => {
        const rows = state.stages
          .filter((row) => (args.where?.characterId ? row.characterId === args.where.characterId : true))
          .filter((row) => (args.where?.stageOrder?.lt !== undefined ? row.stageOrder < args.where.stageOrder.lt : true));
        rows.sort((a, b) => a.stageOrder - b.stageOrder);
        return (args.orderBy?.stageOrder === "desc" ? rows.at(-1) : rows[0]) ?? null;
      }),
      findMany: vi.fn(async (args: { where?: { characterId?: string }; orderBy?: { stageOrder: "asc" | "desc" } }) => {
        const rows = state.stages.filter((row) => (args.where?.characterId ? row.characterId === args.where.characterId : true));
        rows.sort((a, b) => (args.orderBy?.stageOrder === "desc" ? b.stageOrder - a.stageOrder : a.stageOrder - b.stageOrder));
        return rows;
      }),
      findUnique: vi.fn(async (args: { where: { id: string } }) => state.stages.find((row) => row.id === args.where.id) ?? null),
      create: vi.fn(async (args: { data: StageRow }): Promise<StageRow> => {
        const row: StageRow = {
          ...args.data,
          id: args.data.id ?? `stage-fake-${state.stages.length + 1}`,
          createdAt: args.data.createdAt ?? new Date(),
          updatedAt: args.data.updatedAt ?? new Date(),
        };
        state.stages.push(row);
        return row;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<StageRow> }) => {
        const index = state.stages.findIndex((row) => row.id === args.where.id);
        const row = { ...state.stages[index], ...args.data } as StageRow;
        state.stages[index] = row;
        return row;
      }),
      delete: vi.fn(async (args: { where: { id: string } }) => {
        const index = state.stages.findIndex((row) => row.id === args.where.id);
        const [removed] = state.stages.splice(index, 1);
        return removed;
      }),
    },
    asset: {
      findFirst: vi.fn(async (args: { where: { id?: string; projectId?: string; status?: string } }) => {
        const row = state.assets.find((item) =>
          (args.where.id ? item.id === args.where.id : true)
          && (args.where.projectId ? item.projectId === args.where.projectId : true)
          && (args.where.status ? item.status === args.where.status : true),
        );
        return row ? { ...row } : null;
      }),
      create: vi.fn(async (args: { data: AssetRow }) => {
        state.assets.push(args.data);
        return args.data;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<AssetRow> }) => {
        const index = state.assets.findIndex((row) => row.id === args.where.id);
        state.assets[index] = { ...state.assets[index], ...args.data } as AssetRow;
        return state.assets[index];
      }),
      delete: vi.fn(async (args: { where: { id: string } }) => {
        const index = state.assets.findIndex((row) => row.id === args.where.id);
        const [removed] = state.assets.splice(index, 1);
        return removed;
      }),
    },
    character: {
      findFirst: vi.fn(async (args: { where?: { id?: string; projectId?: string }; include?: unknown; select?: unknown }) => {
        const row = state.characters.find((item) =>
          (args.where?.id ? item.id === args.where.id : true)
          && (args.where?.projectId ? item.projectId === args.where.projectId : true),
        );
        return row ?? null;
      }),
    },
    chapter: {
      findFirst: vi.fn(async (args: { where: { id: string; projectId: string } }) =>
        state.chapters.find((item) => item.id === args.where.id && item.projectId === args.where.projectId) ?? null),
    },
  };
  return { db, state };
}

describe("CharacterStageService", () => {
  let service: CharacterStageService;
  let fakeDb: ReturnType<typeof createFakeDb>["db"];
  let state: ReturnType<typeof createFakeDb>["state"];
  let prismaService: FakePrismaService;
  let projectStore: Pick<ProjectStore, "getReadyProject" | "assertProjectStillActive">;
  let imageProvider: Pick<ImageProviderService, "editImage" | "getActiveProviderType">;
  let workspacePathService: Pick<WorkspacePathService, "resolveVirtualPath" | "ensureReady">;
  let tmpDir: string;

  const project: LocalProject = {
    id: "project-1",
    name: "测试项目",
    type: "comic",
    currentChapterId: "chapter-1",
    storyTitle: "测试故事",
    genreTags: [],
    comicFormat: "vertical_scroll",
    artStyle: "comic_style",
    description: "",
    sourceText: "正文",
    scriptOutline: null,
    characters: [],
    assets: [],
    chapters: [],
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  };

  beforeEach(async () => {
    const { db, state: s } = createFakeDb();
    fakeDb = db;
    state = s;
    state.characters.push({ id: "char-1", projectId: "project-1", name: "韩立", anchorAssetId: null, primaryVisual: null, previewVisual: null });
    state.chapters.push({ id: "chapter-1", projectId: "project-1" });
    state.assets.push({
      id: "asset-anchor",
      projectId: "project-1",
      chapterId: null,
      type: "image",
      role: "character_reference",
      mimeType: "image/webp",
      storageKey: "projects/project-1/assets/characters/char-1/anchor.webp",
      status: "ready",
      sha256: "sha256:abc",
      bytes: 10,
      sourceTaskId: null,
    });
    const tmpPath = path.join(os.tmpdir(), `character-stage-spec-${Date.now()}`);
    tmpDir = (await mkdir(tmpPath, { recursive: true })) ?? tmpPath;

    prismaService = {
      isDatabaseMode: () => true,
      database: () => fakeDb,
      runBusinessTransaction: (op) => op(fakeDb),
    };
    projectStore = {
      getReadyProject: vi.fn().mockResolvedValue(project),
      assertProjectStillActive: vi.fn(),
    };
    imageProvider = {
      getActiveProviderType: () => "openai" as const,
      editImage: vi.fn().mockResolvedValue(Buffer.from("fake-image-bytes")),
    };
    workspacePathService = {
      resolveVirtualPath: vi.fn((input: string) => path.join(tmpDir, input.replace(/^\/workspace\//, ""))),
      ensureReady: vi.fn(),
    };

    // 参考图文件落盘（readReferenceAssetFile 需要真实文件）
    const anchorPath = path.join(tmpDir, "projects/project-1/assets/characters/char-1/anchor.webp");
    await mkdir(path.dirname(anchorPath), { recursive: true });
    await writeFile(anchorPath, Buffer.from("reference-image"));

    service = new CharacterStageService(
      prismaService as PrismaService,
      projectStore as ProjectStore,
      imageProvider as ImageProviderService,
      workspacePathService as WorkspacePathService,
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ===== createCharacterStage =====

  it("创建阶段:visualDelta 必填", async () => {
    await expect(service.createCharacterStage("project-1", "char-1", { visualDelta: "  " }))
      .rejects.toThrow(BadRequestException);
  });

  it("创建阶段:角色不存在抛 PROJECT_CHARACTER_NOT_FOUND", async () => {
    await expect(service.createCharacterStage("project-1", "char-missing", { visualDelta: "换装" }))
      .rejects.toThrow("PROJECT_CHARACTER_NOT_FOUND");
  });

  it("创建阶段:起始章节不存在抛 CHAPTER_NOT_FOUND", async () => {
    await expect(service.createCharacterStage("project-1", "char-1", { visualDelta: "换装", fromChapterId: "chapter-missing" }))
      .rejects.toThrow("CHAPTER_NOT_FOUND");
  });

  it("创建阶段:stageOrder 从 1 自动递增", async () => {
    const first = await service.createCharacterStage("project-1", "char-1", { name: "练气期", visualDelta: "粗布麻衣" });
    expect(first.stage.stageOrder).toBe(1);
    const second = await service.createCharacterStage("project-1", "char-1", { name: "筑基期", visualDelta: "青衫" });
    expect(second.stage.stageOrder).toBe(2);
    const stages = await service.getCharacterStages("project-1", "char-1");
    expect(stages.map((item) => item.stageOrder)).toEqual([1, 2]);
  });

  it("创建阶段:无参考图时不生成垫图", async () => {
    state.characters[0] = { ...state.characters[0], anchorAssetId: null, primaryVisual: null, previewVisual: null };
    const result = await service.createCharacterStage("project-1", "char-1", { visualDelta: "换装" });
    expect(result.previewAsset).toBeNull();
    expect(imageProvider.editImage).not.toHaveBeenCalled();
  });

  it("创建阶段:参考图优先级 anchorAssetId > primaryReference", async () => {
    state.characters[0] = {
      ...state.characters[0],
      anchorAssetId: "asset-anchor",
      primaryVisual: { assetId: "asset-primary" },
    };
    await service.createCharacterStage("project-1", "char-1", { visualDelta: "金袍" });
    expect(imageProvider.editImage).toHaveBeenCalledTimes(1);
    const input = vi.mocked(imageProvider.editImage).mock.calls[0][0];
    expect(input.referenceImage.fileName).toBe("anchor.webp");
    expect(input.prompt).toContain("韩立");
    expect(input.prompt).toContain("金袍");
  });

  it("创建阶段:参考图优先级 上一阶段图 > 锚点图", async () => {
    state.characters[0] = { ...state.characters[0], anchorAssetId: "asset-anchor" };
    state.stages.push({
      id: "stage-1", projectId: "project-1", characterId: "char-1", stageOrder: 1,
      name: "练气期", fromChapterId: null, toChapterId: null, visualDelta: "粗布麻衣",
      previewAssetId: "asset-stage1-preview", finalAssetId: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    state.assets.push({
      id: "asset-stage1-preview", projectId: "project-1", chapterId: null, type: "image",
      role: "character_stage_preview", mimeType: "image/webp",
      storageKey: "projects/project-1/assets/characters/char-1/stages/stage-1/preview.webp",
      status: "ready", sha256: null, bytes: 10, sourceTaskId: null,
    });
    const stage1Path = path.join(tmpDir, "projects/project-1/assets/characters/char-1/stages/stage-1/preview.webp");
    await mkdir(path.dirname(stage1Path), { recursive: true });
    await writeFile(stage1Path, Buffer.from("stage1-preview"));

    const result = await service.createCharacterStage("project-1", "char-1", { visualDelta: "金丹期金袍" });
    const input = vi.mocked(imageProvider.editImage).mock.calls[0][0];
    expect(input.referenceImage.fileName).toBe("preview.webp");
    expect(result.previewAsset).not.toBeNull();
    expect(result.previewAsset?.path).toContain(`stages/${result.stage.id}/preview.webp`);
    // 预览资产落库 + previewAssetId 回填
    expect(state.assets.some((item) => item.role === "character_stage_preview" && item.id === result.previewAsset?.id)).toBe(true);
    const stage2 = state.stages.find((item) => item.stageOrder === 2);
    expect(stage2?.previewAssetId).toBe(result.previewAsset?.id);
  });

  it("创建阶段:参考图资产文件缺失抛 PROJECT_ASSET_FILE_NOT_FOUND", async () => {
    state.characters[0] = { ...state.characters[0], anchorAssetId: "asset-anchor" };
    await rm(path.join(tmpDir, "projects/project-1/assets/characters/char-1/anchor.webp"), { force: true });
    await expect(service.createCharacterStage("project-1", "char-1", { visualDelta: "金袍" }))
      .rejects.toThrow("PROJECT_ASSET_FILE_NOT_FOUND");
  });

  // ===== getCharacterStages / updateCharacterStage / deleteCharacterStage =====

  it("getCharacterStages:角色不存在抛 PROJECT_CHARACTER_NOT_FOUND", async () => {
    await expect(service.getCharacterStages("project-1", "char-missing")).rejects.toThrow("PROJECT_CHARACTER_NOT_FOUND");
  });

  it("getCharacterStages:角色不属于该项目时同样抛 PROJECT_CHARACTER_NOT_FOUND", async () => {
    await expect(service.getCharacterStages("project-2", "char-1")).rejects.toThrow("PROJECT_CHARACTER_NOT_FOUND");
  });

  it("getCharacterStages:按 stageOrder 升序返回", async () => {
    state.stages.push(
      { id: "stage-1", projectId: "project-1", characterId: "char-1", stageOrder: 1, name: "练气期", fromChapterId: null, toChapterId: null, visualDelta: "a", previewAssetId: null, finalAssetId: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "stage-2", projectId: "project-1", characterId: "char-1", stageOrder: 2, name: "金丹期", fromChapterId: null, toChapterId: null, visualDelta: "b", previewAssetId: null, finalAssetId: null, createdAt: new Date(), updatedAt: new Date() },
    );
    const stages = await service.getCharacterStages("project-1", "char-1");
    expect(stages.map((item) => item.id)).toEqual(["stage-1", "stage-2"]);
    expect(stages[0]).toMatchObject({ name: "练气期", visualDelta: "a", previewAssetId: undefined, finalAssetId: undefined });
  });

  it("updateCharacterStage:阶段不存在抛 CHARACTER_STAGE_NOT_FOUND", async () => {
    await expect(service.updateCharacterStage("project-1", "char-1", "stage-missing", { name: "x" })).rejects.toThrow("CHARACTER_STAGE_NOT_FOUND");
  });

  it("updateCharacterStage:阶段属于其他项目/角色时同样抛 CHARACTER_STAGE_NOT_FOUND", async () => {
    state.stages.push({ id: "stage-1", projectId: "project-1", characterId: "char-1", stageOrder: 1, name: "练气期", fromChapterId: null, toChapterId: null, visualDelta: "a", previewAssetId: null, finalAssetId: null, createdAt: new Date(), updatedAt: new Date() });
    await expect(service.updateCharacterStage("project-2", "char-1", "stage-1", { name: "x" })).rejects.toThrow("CHARACTER_STAGE_NOT_FOUND");
    await expect(service.updateCharacterStage("project-1", "char-2", "stage-1", { name: "x" })).rejects.toThrow("CHARACTER_STAGE_NOT_FOUND");
  });

  it("updateCharacterStage:更新 name/visualDelta/fromChapterId", async () => {
    state.stages.push({ id: "stage-1", projectId: "project-1", characterId: "char-1", stageOrder: 1, name: "练气期", fromChapterId: null, toChapterId: null, visualDelta: "a", previewAssetId: null, finalAssetId: null, createdAt: new Date(), updatedAt: new Date() });
    const updated = await service.updateCharacterStage("project-1", "char-1", "stage-1", { name: "炼气期", visualDelta: "新道袍", fromChapterId: "chapter-1" });
    expect(updated).toMatchObject({ name: "炼气期", visualDelta: "新道袍", fromChapterId: "chapter-1" });
  });

  it("updateCharacterStage:visualDelta 不允许清空", async () => {
    state.stages.push({ id: "stage-1", projectId: "project-1", characterId: "char-1", stageOrder: 1, name: "练气期", fromChapterId: null, toChapterId: null, visualDelta: "a", previewAssetId: null, finalAssetId: null, createdAt: new Date(), updatedAt: new Date() });
    await expect(service.updateCharacterStage("project-1", "char-1", "stage-1", { visualDelta: "  " })).rejects.toThrow(BadRequestException);
  });

  it("updateCharacterStage:fromChapterId 不属于项目抛 CHAPTER_NOT_FOUND", async () => {
    state.stages.push({ id: "stage-1", projectId: "project-1", characterId: "char-1", stageOrder: 1, name: "练气期", fromChapterId: null, toChapterId: null, visualDelta: "a", previewAssetId: null, finalAssetId: null, createdAt: new Date(), updatedAt: new Date() });
    await expect(service.updateCharacterStage("project-1", "char-1", "stage-1", { fromChapterId: "chapter-missing" })).rejects.toThrow("CHAPTER_NOT_FOUND");
  });

  it("deleteCharacterStage:阶段不存在抛 CHARACTER_STAGE_NOT_FOUND", async () => {
    await expect(service.deleteCharacterStage("project-1", "char-1", "stage-missing")).rejects.toThrow("CHARACTER_STAGE_NOT_FOUND");
  });

  it("deleteCharacterStage:阶段属于其他项目/角色时同样抛 CHARACTER_STAGE_NOT_FOUND", async () => {
    state.stages.push({ id: "stage-1", projectId: "project-1", characterId: "char-1", stageOrder: 1, name: "练气期", fromChapterId: null, toChapterId: null, visualDelta: "a", previewAssetId: null, finalAssetId: null, createdAt: new Date(), updatedAt: new Date() });
    await expect(service.deleteCharacterStage("project-2", "char-1", "stage-1")).rejects.toThrow("CHARACTER_STAGE_NOT_FOUND");
    await expect(service.deleteCharacterStage("project-1", "char-2", "stage-1")).rejects.toThrow("CHARACTER_STAGE_NOT_FOUND");
  });

  it("deleteCharacterStage:删除阶段并回收本阶段预览资产(行+文件)", async () => {
    state.stages.push({ id: "stage-1", projectId: "project-1", characterId: "char-1", stageOrder: 1, name: "练气期", fromChapterId: null, toChapterId: null, visualDelta: "a", previewAssetId: "asset-stage-preview", finalAssetId: null, createdAt: new Date(), updatedAt: new Date() });
    state.assets.push({ id: "asset-stage-preview", projectId: "project-1", chapterId: null, type: "image", role: "character_stage_preview", mimeType: "image/webp", storageKey: "projects/project-1/assets/characters/char-1/stages/stage-1/preview.webp", status: "ready", sha256: null, bytes: 10, sourceTaskId: null });
    const previewPath = path.join(tmpDir, "projects/project-1/assets/characters/char-1/stages/stage-1/preview.webp");
    await mkdir(path.dirname(previewPath), { recursive: true });
    await writeFile(previewPath, Buffer.from("preview"));

    await service.deleteCharacterStage("project-1", "char-1", "stage-1");
    expect(state.stages).toHaveLength(0);
    expect(state.assets.some((item) => item.id === "asset-stage-preview")).toBe(false);
    await expect(import("node:fs/promises").then((fs) => fs.access(previewPath))).rejects.toThrow();
  });

  it("deleteCharacterStage:非阶段角色资产不删除", async () => {
    state.stages.push({ id: "stage-1", projectId: "project-1", characterId: "char-1", stageOrder: 1, name: "练气期", fromChapterId: null, toChapterId: null, visualDelta: "a", previewAssetId: "asset-anchor", finalAssetId: null, createdAt: new Date(), updatedAt: new Date() });
    await service.deleteCharacterStage("project-1", "char-1", "stage-1");
    expect(state.assets.some((item) => item.id === "asset-anchor")).toBe(true);
  });

  // ===== regenerateStagePreview =====

  it("regenerateStagePreview:阶段不存在抛 CHARACTER_STAGE_NOT_FOUND", async () => {
    await expect(service.regenerateStagePreview("project-1", "char-1", "stage-missing")).rejects.toThrow("CHARACTER_STAGE_NOT_FOUND");
  });

  it("regenerateStagePreview:阶段属于其他项目/角色时同样抛 CHARACTER_STAGE_NOT_FOUND", async () => {
    state.stages.push({ id: "stage-1", projectId: "project-1", characterId: "char-1", stageOrder: 1, name: "练气期", fromChapterId: null, toChapterId: null, visualDelta: "a", previewAssetId: null, finalAssetId: null, createdAt: new Date(), updatedAt: new Date() });
    await expect(service.regenerateStagePreview("project-2", "char-1", "stage-1")).rejects.toThrow("CHARACTER_STAGE_NOT_FOUND");
    await expect(service.regenerateStagePreview("project-1", "char-2", "stage-1")).rejects.toThrow("CHARACTER_STAGE_NOT_FOUND");
  });

  it("regenerateStagePreview:优先用本阶段定稿图作为参考", async () => {
    state.stages.push({ id: "stage-1", projectId: "project-1", characterId: "char-1", stageOrder: 1, name: "练气期", fromChapterId: null, toChapterId: null, visualDelta: "粗布麻衣", previewAssetId: null, finalAssetId: "asset-final", createdAt: new Date(), updatedAt: new Date() });
    state.assets.push({ id: "asset-final", projectId: "project-1", chapterId: null, type: "image", role: "character_stage_final", mimeType: "image/webp", storageKey: "projects/project-1/assets/characters/char-1/stages/stage-1/final.webp", status: "ready", sha256: null, bytes: 10, sourceTaskId: null });
    const finalPath = path.join(tmpDir, "projects/project-1/assets/characters/char-1/stages/stage-1/final.webp");
    await mkdir(path.dirname(finalPath), { recursive: true });
    await writeFile(finalPath, Buffer.from("final"));

    const result = await service.regenerateStagePreview("project-1", "char-1", "stage-1");
    expect(imageProvider.editImage).toHaveBeenCalledTimes(1);
    const input = vi.mocked(imageProvider.editImage).mock.calls[0][0];
    expect(input.referenceImage.fileName).toBe("final.webp");
    expect(result.previewAsset).not.toBeNull();
    expect(state.stages[0].previewAssetId).toBe(result.previewAsset?.id);
  });
});
