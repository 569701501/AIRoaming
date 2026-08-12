import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { ProjectCharacter, WorkbenchAsset } from "@airoaming/shared";
import type { LocalProject } from "./local-types.js";
import { CharacterReferenceService } from "./character-reference.service.js";
import type { ImageProviderService } from "./image-provider.service.js";
import type { PrismaService } from "../persistence/prisma.service.js";
import type { ProjectRepository } from "./project-repository.service.js";
import type { ProjectStore } from "./project-store.service.js";
import type { WorkspacePathService } from "../workspace/workspace-path.service.js";
import type { SettingsService } from "../settings/settings.service.js";
import type { TasksService } from "../tasks/tasks.service.js";
import type { PersistentTaskRepository } from "../tasks/persistent-task.repository.js";

// ===== 内存版 fake(只覆盖本服务用到的方法) =====

interface FakeAssetRow {
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
  width: number | null;
  height: number | null;
  metadataJson: Record<string, string | number | null>;
}

interface FakeCharacterRow {
  id: string;
  projectId: string;
  anchorAssetId: string | null;
  rowVersion: number;
  updatedAt: Date;
}

function createFakeDb() {
  const state: { assets: FakeAssetRow[]; characters: FakeCharacterRow[] } = {
    assets: [],
    characters: [],
  };
  const db = {
    asset: {
      findFirst: vi.fn(async (args: { where: { id?: string; projectId?: string } }) =>
        state.assets.find((row) =>
          (args.where.id ? row.id === args.where.id : true)
          && (args.where.projectId ? row.projectId === args.where.projectId : true),
        ) ?? null,
      ),
      create: vi.fn(async (args: { data: Partial<FakeAssetRow> }) => {
        const row: FakeAssetRow = {
          id: args.data.id ?? `asset-fake-${state.assets.length + 1}`,
          projectId: args.data.projectId ?? "project-1",
          chapterId: args.data.chapterId ?? null,
          type: args.data.type ?? "image",
          role: args.data.role ?? "",
          mimeType: args.data.mimeType ?? "image/webp",
          storageKey: args.data.storageKey ?? "",
          status: args.data.status ?? "staged",
          sha256: args.data.sha256 ?? null,
          bytes: args.data.bytes ?? null,
          width: args.data.width ?? null,
          height: args.data.height ?? null,
          metadataJson: (args.data.metadataJson ?? {}) as FakeAssetRow["metadataJson"],
        };
        state.assets.push(row);
        return row;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Partial<FakeAssetRow> }) => {
        const index = state.assets.findIndex((row) => row.id === args.where.id);
        const row = { ...state.assets[index], ...args.data } as FakeAssetRow;
        state.assets[index] = row;
        return row;
      }),
    },
    character: {
      update: vi.fn(async (args: { where: { id: string }; data: Partial<FakeCharacterRow> }) => {
        const index = state.characters.findIndex((row) => row.id === args.where.id);
        const row = { ...state.characters[index], ...args.data } as FakeCharacterRow;
        state.characters[index] = row;
        return row;
      }),
    },
  };
  return { db, state };
}

function makeCharacter(overrides: Partial<ProjectCharacter> = {}): ProjectCharacter {
  return {
    id: "char-1",
    projectId: "project-1",
    name: "韩立",
    role: "主角",
    level: "lead",
    entityType: "human",
    status: "draft",
    appearance: "面色蜡黄的瘦弱少年，丹凤眼",
    personality: "",
    promptFragment: "",
    referenceAssetIds: [],
    previewReferenceAssetId: null,
    previewConfirmedAt: null,
    primaryReferenceAssetId: null,
    primaryReferenceKind: "preview_front",
    visualVersion: 0,
    source: "manual",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    finalizedAt: null,
    ...overrides,
  };
}

function makeProject(characters: ProjectCharacter[], assets: WorkbenchAsset[] = []): LocalProject {
  return {
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
    characters,
    assets,
    chapters: [],
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
}

function makeAnchorCandidateAsset(id: string, characterId: string, seed = 1): WorkbenchAsset {
  return {
    id,
    chapterId: null,
    type: "image",
    name: "定妆候选",
    path: `projects/project-1/assets/characters/${characterId}/anchor-candidates/candidate-1-${seed}.webp`,
    sourceTaskId: null,
    meta: JSON.stringify({ characterId, kind: "anchor_candidate", seed, createdAt: "2026-08-11T00:00:00.000Z" }),
  };
}

describe("CharacterReferenceService 角色定妆", () => {
  let service: CharacterReferenceService;
  let tmpDir: string;
  let prismaService: {
    isDatabaseMode: () => boolean;
    database: () => unknown;
    runBusinessTransaction: (op: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
  };
  let projectStore: {
    getReadyProject: ReturnType<typeof vi.fn>;
    assertProjectStillActive: ReturnType<typeof vi.fn>;
    writeProjectFiles: ReturnType<typeof vi.fn>;
  };
  let repository: {
    setProject: ReturnType<typeof vi.fn>;
    refreshProjectFromDatabase: ReturnType<typeof vi.fn>;
  };
  let imageProvider: {
    generateImage: ReturnType<typeof vi.fn>;
    getActiveProviderType: () => "openai";
  };
  let dbState: ReturnType<typeof createFakeDb>["state"];
  let db: ReturnType<typeof createFakeDb>["db"];

  beforeEach(async () => {
    const { db: fakeDb, state } = createFakeDb();
    db = fakeDb;
    dbState = state;

    const tmpPath = path.join(os.tmpdir(), `character-reference-spec-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    tmpDir = (await mkdir(tmpPath, { recursive: true })) ?? tmpPath;

    prismaService = {
      isDatabaseMode: () => false,
      database: () => fakeDb,
      runBusinessTransaction: (op) => op(fakeDb),
    };
    projectStore = {
      getReadyProject: vi.fn(),
      assertProjectStillActive: vi.fn(),
      writeProjectFiles: vi.fn(),
    };
    repository = {
      setProject: vi.fn(),
      refreshProjectFromDatabase: vi.fn(),
    };
    imageProvider = {
      generateImage: vi.fn(async (_input: { prompt: string; size: string; seed?: number }) => Buffer.from("fake-image")),
      getActiveProviderType: () => "openai",
    };

    service = new CharacterReferenceService(
      { resolveVirtualPath: (input: string) => path.join(tmpDir, input.replace(/^\/workspace\//, "")) } as unknown as WorkspacePathService,
      repository as unknown as ProjectRepository,
      projectStore as unknown as ProjectStore,
      imageProvider as unknown as ImageProviderService,
      {} as unknown as TasksService,
      {
        getRuntimeImageProviderSettings: () => ({ type: "openai", providerId: "openai", modelId: "gpt-image-1", baseUrl: null, apiKey: "test" }),
      } as unknown as SettingsService,
      prismaService as unknown as PrismaService,
      {} as unknown as PersistentTaskRepository,
    );
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ===== generateAnchorCandidates:file 模式 =====

  describe("generateAnchorCandidates(file 模式)", () => {
    it("默认生成 3 张候选,seed 互不相同,并发出图", async () => {
      const project = makeProject([makeCharacter()]);
      projectStore.getReadyProject.mockResolvedValue(project);
      imageProvider.generateImage.mockImplementation(async (input: { seed?: number }) => Buffer.from(`img-${input.seed}`));

      const candidates = await service.generateAnchorCandidates("project-1", "char-1", {});

      expect(candidates).toHaveLength(3);
      expect(imageProvider.generateImage).toHaveBeenCalledTimes(3);
      const seeds = candidates.map((asset) => JSON.parse(asset.meta).seed as number);
      expect(new Set(seeds).size).toBe(3);
      // 候选写入 project.assets 但不进 referenceAssetIds
      expect(projectStore.writeProjectFiles).toHaveBeenCalledWith(expect.objectContaining({
        assets: expect.arrayContaining(candidates),
      }));
      expect((projectStore.writeProjectFiles.mock.calls[0]?.[0] as LocalProject).characters[0]?.referenceAssetIds).toEqual([]);
    });

    it("customPrompt 优先于 appearance 构建提示词", async () => {
      const project = makeProject([makeCharacter()]);
      projectStore.getReadyProject.mockResolvedValue(project);

      await service.generateAnchorCandidates("project-1", "char-1", { customPrompt: "穿金色道袍、仙风道骨" });

      expect(imageProvider.generateImage).toHaveBeenCalledWith(expect.objectContaining({ prompt: "穿金色道袍、仙风道骨" }));
    });

    it("无 customPrompt 时降级用 appearance,appearance 为空时用 角色名+角色定位", async () => {
      const project = makeProject([
        makeCharacter(),
        makeCharacter({ id: "char-2", name: "墨彩环", role: "女配", appearance: "" }),
      ]);
      projectStore.getReadyProject.mockResolvedValue(project);

      await service.generateAnchorCandidates("project-1", "char-1", {});
      expect(imageProvider.generateImage).toHaveBeenCalledWith(expect.objectContaining({ prompt: "面色蜡黄的瘦弱少年，丹凤眼" }));

      await service.generateAnchorCandidates("project-1", "char-2", {});
      expect(imageProvider.generateImage).toHaveBeenCalledWith(expect.objectContaining({ prompt: "墨彩环，女配" }));
    });

    it("count 钳制:0→3,7→6,2→2", async () => {
      const project = makeProject([makeCharacter()]);
      projectStore.getReadyProject.mockResolvedValue(project);

      expect(await service.generateAnchorCandidates("project-1", "char-1", { count: 0 })).toHaveLength(3);
      imageProvider.generateImage.mockClear();
      expect(await service.generateAnchorCandidates("project-1", "char-1", { count: 7 })).toHaveLength(6);
      imageProvider.generateImage.mockClear();
      expect(await service.generateAnchorCandidates("project-1", "char-1", { count: 2 })).toHaveLength(2);
    });

    it("角色不存在抛 CHARACTER_NOT_FOUND", async () => {
      projectStore.getReadyProject.mockResolvedValue(makeProject([makeCharacter()]));
      await expect(service.generateAnchorCandidates("project-1", "char-missing", {}))
        .rejects.toThrow("CHARACTER_NOT_FOUND");
    });
  });

  // ===== generateAnchorCandidates:DB 模式 =====

  describe("generateAnchorCandidates(DB 模式)", () => {
    it("资产行落库(role=character_anchor_candidate,metadata 含 characterId/kind/seed),status=ready", async () => {
      prismaService.isDatabaseMode = () => true;
      repository.refreshProjectFromDatabase.mockResolvedValue(makeProject([makeCharacter()]));

      const candidates = await service.generateAnchorCandidates("project-1", "char-1", {});

      expect(candidates).toHaveLength(3);
      expect(db.asset.create).toHaveBeenCalledTimes(3);
      const rows = dbState.assets;
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.role).toBe("character_anchor_candidate");
        expect(row.status).toBe("ready");
        expect(row.metadataJson.kind).toBe("anchor_candidate");
        expect(row.metadataJson.characterId).toBe("char-1");
        expect(row.sha256).toMatch(/^sha256:/);
      }
      const seeds = rows.map((row) => row.metadataJson.seed as number);
      expect(new Set(seeds).size).toBe(3);
    });
  });

  // ===== confirmAnchor:file 模式 =====

  describe("confirmAnchor(file 模式)", () => {
    it("校验通过后写入 anchorAssetId 并返回更新后的角色", async () => {
      const candidate = makeAnchorCandidateAsset("asset-c1", "char-1", 11);
      const project = makeProject([makeCharacter()], [candidate]);
      projectStore.getReadyProject.mockResolvedValue(project);

      const updated = await service.confirmAnchor("project-1", "char-1", "asset-c1");

      expect(updated.anchorAssetId).toBe("asset-c1");
      const saved = projectStore.writeProjectFiles.mock.calls[0]?.[0] as LocalProject;
      expect(saved.characters[0]?.anchorAssetId).toBe("asset-c1");
      expect(repository.setProject).toHaveBeenCalled();
    });

    it("角色不存在抛 CHARACTER_NOT_FOUND", async () => {
      projectStore.getReadyProject.mockResolvedValue(makeProject([makeCharacter()]));
      await expect(service.confirmAnchor("project-1", "char-missing", "asset-c1"))
        .rejects.toThrow("CHARACTER_NOT_FOUND");
    });

    it("资产不存在抛 ASSET_NOT_FOUND", async () => {
      projectStore.getReadyProject.mockResolvedValue(makeProject([makeCharacter()]));
      await expect(service.confirmAnchor("project-1", "char-1", "asset-missing"))
        .rejects.toThrow("ASSET_NOT_FOUND");
    });

    it("资产不属于该角色(其他角色候选)抛 ASSET_NOT_FOUND", async () => {
      const otherCandidate = makeAnchorCandidateAsset("asset-other", "char-2", 22);
      projectStore.getReadyProject.mockResolvedValue(makeProject([makeCharacter()], [otherCandidate]));
      await expect(service.confirmAnchor("project-1", "char-1", "asset-other"))
        .rejects.toThrow("ASSET_NOT_FOUND");
    });

    it("非定妆候选资产(普通参考图)抛 ASSET_NOT_FOUND", async () => {
      const referenceAsset: WorkbenchAsset = {
        id: "asset-ref",
        chapterId: null,
        type: "image",
        name: "预览图",
        path: "projects/project-1/assets/characters/char-1/preview.webp",
        sourceTaskId: null,
        meta: JSON.stringify({ characterId: "char-1", referenceKind: "preview_front", createdAt: "2026-08-11T00:00:00.000Z" }),
      };
      projectStore.getReadyProject.mockResolvedValue(makeProject([makeCharacter()], [referenceAsset]));
      await expect(service.confirmAnchor("project-1", "char-1", "asset-ref"))
        .rejects.toThrow("ASSET_NOT_FOUND");
    });
  });

  // ===== confirmAnchor:DB 模式 =====

  describe("confirmAnchor(DB 模式)", () => {
    beforeEach(() => {
      prismaService.isDatabaseMode = () => true;
    });

    it("更新 character.anchorAssetId 并刷新缓存返回角色", async () => {
      const candidate = makeAnchorCandidateAsset("asset-c1", "char-1", 11);
      dbState.assets.push({
        id: "asset-c1",
        projectId: "project-1",
        chapterId: null,
        type: "image",
        role: "character_anchor_candidate",
        mimeType: "image/webp",
        storageKey: candidate.path,
        status: "ready",
        sha256: "sha256:abc",
        bytes: 10,
        width: null,
        height: null,
        metadataJson: JSON.parse(candidate.meta) as Record<string, string | number | null>,
      });
      dbState.characters.push({ id: "char-1", projectId: "project-1", anchorAssetId: null, rowVersion: 0, updatedAt: new Date() });
      repository.refreshProjectFromDatabase.mockResolvedValue(makeProject([makeCharacter({ anchorAssetId: "asset-c1" })]));

      const updated = await service.confirmAnchor("project-1", "char-1", "asset-c1");

      expect(updated.anchorAssetId).toBe("asset-c1");
      expect(db.character.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "char-1" },
        data: expect.objectContaining({ anchorAssetId: "asset-c1", rowVersion: { increment: 1 } }),
      }));
      expect(repository.refreshProjectFromDatabase).toHaveBeenCalledWith("project-1");
    });

    it("资产不存在或不属于该角色抛 ASSET_NOT_FOUND", async () => {
      dbState.characters.push({ id: "char-1", projectId: "project-1", anchorAssetId: null, rowVersion: 0, updatedAt: new Date() });
      repository.refreshProjectFromDatabase.mockResolvedValue(makeProject([makeCharacter()]));

      await expect(service.confirmAnchor("project-1", "char-1", "asset-missing"))
        .rejects.toThrow("ASSET_NOT_FOUND");

      dbState.assets.push({
        id: "asset-other",
        projectId: "project-1",
        chapterId: null,
        type: "image",
        role: "character_anchor_candidate",
        mimeType: "image/webp",
        storageKey: "projects/project-1/assets/characters/char-2/anchor-candidates/candidate-1-1.webp",
        status: "ready",
        sha256: "sha256:abc",
        bytes: 10,
        width: null,
        height: null,
        metadataJson: { characterId: "char-2", kind: "anchor_candidate", seed: 1, createdAt: "2026-08-11T00:00:00.000Z" },
      });
      await expect(service.confirmAnchor("project-1", "char-1", "asset-other"))
        .rejects.toThrow("ASSET_NOT_FOUND");
    });
  });
});
