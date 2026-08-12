import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { digestCanonicalJson } from "@airoaming/shared";
import type {
  CharacterStage,
  CreateCharacterStageRequest,
  ImageProviderType,
  ProjectCharacter,
  WorkbenchAsset,
} from "@airoaming/shared";
import type { LocalProject } from "./local-types.js";
import { buildCharacterReferenceStyleGuide } from "./reference-prompt.util.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { ProjectStore } from "./project-store.service.js";
import { ImageProviderService } from "./image-provider.service.js";
import { PrismaService } from "../persistence/prisma.service.js";

/** 阶段预览图资产的角色(asset.role)；删除阶段时仅回收该角色的资产。 */
const STAGE_PREVIEW_ASSET_ROLE = "character_stage_preview";

/** 更新角色阶段请求：只允许改 name/visualDelta/fromChapterId。 */
export interface UpdateCharacterStageInput {
  name?: string;
  visualDelta?: string;
  fromChapterId?: string;
}

/**
 * 角色阶段编排(角色图生成与阶段管理,见任务 2026-08-11_角色图生成与阶段管理)。
 *
 * 阶段是角色随时间变化的形象切片(如"练气期""金丹期")，stageOrder 从 1 自动递增。
 * 新阶段创建时按"上一阶段图 > 锚点图 > 定稿参考 > 预览参考"的优先级选参考图，
 * 调用 ImageProviderService.editImage 做"保脸换装"垫图，产物落盘为阶段预览图资产。
 *
 * 数据模型 CharacterStage 只存在于 Prisma schema(character_stages 表)，
 * 本服务是 DB 模式专用：file 模式下所有入口抛 DB_PERSISTENCE_REQUIRED_FOR_CHARACTER_STAGE_SERVICE。
 *
 * 依赖：PrismaService(阶段/资产/角色/章节读写)、ProjectStore(项目存在性与活跃校验)、
 * ImageProvider(垫图)、WorkspacePath(资产文件 IO)。
 * 所有业务写操作走 runBusinessTransaction（见 persistence/business-write-boundary.registry.ts）。
 */
@Injectable()
export class CharacterStageService {
  private readonly logger = new Logger(CharacterStageService.name);

  constructor(
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(ImageProviderService) private readonly imageProvider: ImageProviderService,
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
  ) {}

  private requireDatabaseMode(): void {
    if (!this.prismaService.isDatabaseMode()) {
      throw new Error("DB_PERSISTENCE_REQUIRED_FOR_CHARACTER_STAGE_SERVICE");
    }
  }

  // ====== 创建阶段 ======

  /**
   * 创建角色阶段。
   *
   * 流程：
   * 1. 校验项目/角色/起始章节；
   * 2. 获取上一阶段(stageOrder 最大)，stageOrder = 上一阶段 + 1；
   * 3. 确定参考图优先级：上一阶段图 > anchorAssetId > primaryReference > preview；
   * 4. 创建阶段记录；
   * 5. 有参考图时调用 generateStagePreview 生成垫图并回填 previewAssetId。
   */
  async createCharacterStage(
    projectId: string,
    characterId: string,
    input: CreateCharacterStageRequest,
  ): Promise<{ stage: CharacterStage; previewAsset: WorkbenchAsset | null }> {
    this.requireDatabaseMode();
    const visualDelta = input.visualDelta?.trim();
    if (!visualDelta) {
      throw new BadRequestException("CHARACTER_STAGE_VISUAL_DELTA_REQUIRED");
    }
    const project = await this.projectStore.getReadyProject(projectId);
    const characterRow = await this.loadCharacterRow(projectId, characterId);
    const fromChapterId = input.fromChapterId?.trim() || null;
    if (fromChapterId) {
      await this.assertChapterInProject(projectId, fromChapterId);
    }

    // 1. 获取上一阶段(stageOrder 最大)
    const previousStage = await this.prismaService.database().characterStage.findFirst({
      where: { characterId },
      orderBy: { stageOrder: "desc" },
    });

    // 2. 参考图优先级：上一阶段图 > 锚点图 > 定稿参考 > 预览参考
    const referenceAssetId = this.resolveReferenceAssetId(previousStage, characterRow);

    // 3. 创建阶段记录(stageOrder 自动递增；并发撞唯一键时重试)
    const stageRow = await this.createStageRow(projectId, characterId, {
      name: input.name?.trim() || null,
      fromChapterId,
      visualDelta,
    });
    const stage = this.toCharacterStage(stageRow);

    // 4. 有参考图则生成垫图
    if (!referenceAssetId) {
      return { stage, previewAsset: null };
    }
    const previewAsset = await this.generateStagePreview(
      project,
      { id: characterRow.id, name: characterRow.name },
      stage,
      referenceAssetId,
    );
    return { stage, previewAsset };
  }

  /** 创建阶段行：事务内重读最大 stageOrder，P2002(characterId,stageOrder 唯一)并发冲突时重试。 */
  private async createStageRow(
    projectId: string,
    characterId: string,
    data: { name: string | null; fromChapterId: string | null; visualDelta: string },
  ): Promise<StageRow> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prismaService.runBusinessTransaction(async (tx) => {
          const previous = await tx.characterStage.findFirst({
            where: { characterId },
            orderBy: { stageOrder: "desc" },
          });
          return tx.characterStage.create({
            data: {
              projectId,
              characterId,
              stageOrder: (previous?.stageOrder ?? 0) + 1,
              name: data.name,
              fromChapterId: data.fromChapterId,
              visualDelta: data.visualDelta,
            },
          });
        });
      } catch (error) {
        if (this.isUniqueConstraintError(error) && attempt < 2) {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  // ====== 垫图生成 ======

  /**
   * 生成阶段预览图（垫图）：以参考图为底做"保脸换装"。
   *
   * 1. 加载参考图资产（asset 行 + workspace 文件）；
   * 2. 调用 imageProvider.editImage（图生图，prompt = 角色名 + visualDelta + 项目画风）；
   * 3. 产物写盘并落库（asset.role = character_stage_preview）；
   * 4. 回填阶段记录 previewAssetId，返回 WorkbenchAsset。
   */
  async generateStagePreview(
    project: LocalProject,
    character: Pick<ProjectCharacter, "id" | "name">,
    stage: CharacterStage,
    referenceAssetId: string,
  ): Promise<WorkbenchAsset> {
    this.requireDatabaseMode();
    const reference = await this.readReferenceAssetFile(project.id, referenceAssetId);
    const prompt = this.buildStagePreviewPrompt(project, character, stage);

    const providerType = this.imageProvider.getActiveProviderType();
    const size = providerType === "doubao" ? "1920x1920" : "1536x2048";
    const generated = await this.imageProvider.editImage({
      prompt,
      size,
      quality: "high",
      outputFormat: "webp",
      referenceImage: reference,
    });

    this.projectStore.assertProjectStillActive(project.id);
    const storageKey = `projects/${project.id}/assets/characters/${character.id}/stages/${stage.id}/preview.webp`;
    const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${storageKey}`);
    await this.workspacePathService.ensureReady();
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, generated);

    try {
      return await this.persistStagePreviewAsset(project.id, character.id, stage, referenceAssetId, storageKey, generated, prompt, providerType);
    } catch (error) {
      await rm(absolutePath, { force: true });
      throw error;
    }
  }

  private async persistStagePreviewAsset(
    projectId: string,
    characterId: string,
    stage: CharacterStage,
    referenceAssetId: string,
    storageKey: string,
    buffer: Buffer,
    prompt: string,
    providerType: ImageProviderType,
  ): Promise<WorkbenchAsset> {
    const now = new Date();
    const assetId = randomUUID();
    const metadata = {
      schemaVersion: 1,
      characterId,
      stageId: stage.id,
      role: STAGE_PREVIEW_ASSET_ROLE,
      provider: this.toProviderMetaId(providerType),
      promptDigest: this.digestPrompt(prompt),
      generationMode: "image_edit",
      sourceReferenceAssetId: referenceAssetId,
      createdAt: now.toISOString(),
    } as const;
    await this.prismaService.runBusinessTransaction(async (tx) => {
      await tx.asset.create({
        data: {
          id: assetId,
          projectId,
          chapterId: null,
          type: "image",
          role: STAGE_PREVIEW_ASSET_ROLE,
          mimeType: "image/webp",
          storageKey,
          status: "staged",
          sha256: null,
          bytes: null,
          width: null,
          height: null,
          durationMs: null,
          sourceTaskId: null,
          metadataJson: metadata,
          metadataSchemaVersion: 1,
          metadataDigest: digestCanonicalJson(metadata),
          createdAt: now,
          updatedAt: now,
        },
      });
      await tx.asset.update({
        where: { id: assetId },
        data: { status: "ready", sha256: `sha256:${createHash("sha256").update(buffer).digest("hex")}`, bytes: buffer.length, readyAt: now },
      });
      await tx.characterStage.update({
        where: { id: stage.id },
        data: { previewAssetId: assetId },
      });
    });
    return {
      id: assetId,
      chapterId: null,
      type: "image",
      name: `角色阶段预览图 ${stage.stageOrder}`,
      path: storageKey,
      sourceTaskId: null,
      meta: JSON.stringify(metadata),
    };
  }

  // ====== 查询 / 更新 / 删除 ======

  /** 查询角色全部阶段，按 stageOrder 升序。projectId/characterId 作用域校验：角色必须属于该项目。 */
  async getCharacterStages(projectId: string, characterId: string): Promise<CharacterStage[]> {
    this.requireDatabaseMode();
    const character = await this.prismaService.database().character.findFirst({
      where: { id: characterId, projectId },
      select: { id: true },
    });
    if (!character) {
      throw new NotFoundException("PROJECT_CHARACTER_NOT_FOUND");
    }
    const rows = await this.prismaService.database().characterStage.findMany({
      where: { characterId, projectId },
      orderBy: { stageOrder: "asc" },
    });
    return rows.map((row) => this.toCharacterStage(row));
  }

  /** 更新阶段：name/visualDelta/fromChapterId。visualDelta 不允许清空。projectId/characterId 作用域校验。 */
  async updateCharacterStage(
    projectId: string,
    characterId: string,
    stageId: string,
    input: UpdateCharacterStageInput,
  ): Promise<CharacterStage> {
    this.requireDatabaseMode();
    const stageRow = await this.loadStageRowInScope(projectId, characterId, stageId);
    const nextVisualDelta = input.visualDelta === undefined ? stageRow.visualDelta : input.visualDelta?.trim();
    if (!nextVisualDelta) {
      throw new BadRequestException("CHARACTER_STAGE_VISUAL_DELTA_REQUIRED");
    }
    const nextFromChapterId = input.fromChapterId === undefined ? stageRow.fromChapterId : (input.fromChapterId?.trim() || null);
    if (nextFromChapterId) {
      await this.assertChapterInProject(stageRow.projectId, nextFromChapterId);
    }
    const updated = await this.prismaService.runBusinessTransaction((tx) =>
      tx.characterStage.update({
        where: { id: stageId },
        data: {
          name: input.name === undefined ? stageRow.name : (input.name?.trim() || null),
          visualDelta: nextVisualDelta,
          fromChapterId: nextFromChapterId,
        },
      }),
    );
    return this.toCharacterStage(updated);
  }

  /**
   * 删除阶段。projectId/characterId 作用域校验。
   *
   * 说明：character_stages.previewAssetId/finalAssetId 是普通字符串列（无外键），
   * Prisma 不会自动级联；这里在事务内显式回收本阶段创建的资产（asset.role 以
   * character_stage_ 开头才删除，避免误删被其他实体引用的资产），提交后再尽力清理物理文件。
   */
  async deleteCharacterStage(projectId: string, characterId: string, stageId: string): Promise<void> {
    this.requireDatabaseMode();
    const stageRow = await this.loadStageRowInScope(projectId, characterId, stageId);
    const ownedStorageKeys: string[] = [];
    await this.prismaService.runBusinessTransaction(async (tx) => {
      for (const assetId of [stageRow.previewAssetId, stageRow.finalAssetId]) {
        if (!assetId) {
          continue;
        }
        const asset = await tx.asset.findFirst({ where: { id: assetId, projectId: stageRow.projectId } });
        if (!asset) {
          continue;
        }
        if (!asset.role.startsWith("character_stage_")) {
          this.logger.warn(`Skip deleting non-stage asset ${asset.id} (role=${asset.role}) referenced by stage ${stageId}`);
          continue;
        }
        ownedStorageKeys.push(asset.storageKey);
        await tx.asset.delete({ where: { id: asset.id } });
      }
      await tx.characterStage.delete({ where: { id: stageId } });
    });
    for (const storageKey of ownedStorageKeys) {
      try {
        await rm(this.workspacePathService.resolveVirtualPath(`/workspace/${storageKey}`), { force: true });
      } catch (error) {
        this.logger.warn(`Failed to remove stage asset file ${storageKey}: ${this.getErrorMessage(error)}`);
      }
    }
  }

  /** 重新生成阶段预览图。projectId/characterId 作用域校验。参考图优先级：本阶段定稿图 > 上一阶段图 > 锚点图 > 定稿参考 > 预览参考。 */
  async regenerateStagePreview(
    projectId: string,
    characterId: string,
    stageId: string,
  ): Promise<{ stage: CharacterStage; previewAsset: WorkbenchAsset | null }> {
    this.requireDatabaseMode();
    const stageRow = await this.loadStageRowInScope(projectId, characterId, stageId);
    const project = await this.projectStore.getReadyProject(stageRow.projectId);
    const characterRow = await this.loadCharacterRow(stageRow.projectId, stageRow.characterId);
    const previousStage = await this.prismaService.database().characterStage.findFirst({
      where: { characterId: stageRow.characterId, stageOrder: { lt: stageRow.stageOrder } },
      orderBy: { stageOrder: "desc" },
    });
    const referenceAssetId = stageRow.finalAssetId ?? this.resolveReferenceAssetId(previousStage, characterRow);
    const stage = this.toCharacterStage(stageRow);
    if (!referenceAssetId) {
      return { stage, previewAsset: null };
    }
    const previewAsset = await this.generateStagePreview(project, { id: characterRow.id, name: characterRow.name }, stage, referenceAssetId);
    const refreshedRow = await this.prismaService.database().characterStage.findUnique({ where: { id: stageId } });
    return { stage: this.toCharacterStage(refreshedRow ?? stageRow), previewAsset };
  }

  // ====== 私有辅助 ======

  /** 按 projectId/characterId 作用域加载阶段行；阶段不存在或不属于该项目的该角色时抛 CHARACTER_STAGE_NOT_FOUND。 */
  private async loadStageRowInScope(projectId: string, characterId: string, stageId: string): Promise<StageRow> {
    const stageRow = await this.prismaService.database().characterStage.findUnique({ where: { id: stageId } });
    if (!stageRow || stageRow.projectId !== projectId || stageRow.characterId !== characterId) {
      throw new NotFoundException("CHARACTER_STAGE_NOT_FOUND");
    }
    return stageRow;
  }

  private async loadCharacterRow(
    projectId: string,
    characterId: string,
  ): Promise<{
    id: string;
    name: string;
    anchorAssetId: string | null;
    primaryVisual: { assetId: string } | null;
    previewVisual: { assetId: string } | null;
  }> {
    const row = await this.prismaService.database().character.findFirst({
      where: { id: characterId, projectId },
      include: {
        primaryVisual: { select: { assetId: true } },
        previewVisual: { select: { assetId: true } },
      },
    });
    if (!row) {
      throw new NotFoundException("PROJECT_CHARACTER_NOT_FOUND");
    }
    return row;
  }

  private async assertChapterInProject(projectId: string, chapterId: string): Promise<void> {
    const chapter = await this.prismaService.database().chapter.findFirst({
      where: { id: chapterId, projectId },
      select: { id: true },
    });
    if (!chapter) {
      throw new NotFoundException("CHAPTER_NOT_FOUND");
    }
  }

  /** 参考图优先级：上一阶段定稿/预览图 > 角色锚点图 > 定稿参考 > 预览参考。 */
  private resolveReferenceAssetId(
    previousStage: Pick<StageRow, "finalAssetId" | "previewAssetId"> | null,
    characterRow: {
      anchorAssetId: string | null;
      primaryVisual: { assetId: string } | null;
      previewVisual: { assetId: string } | null;
    },
  ): string | null {
    return previousStage?.finalAssetId
      ?? previousStage?.previewAssetId
      ?? characterRow.anchorAssetId
      ?? characterRow.primaryVisual?.assetId
      ?? characterRow.previewVisual?.assetId
      ?? null;
  }

  /** 垫图 prompt：角色名 + 差异描述 + 保脸约束 + 项目画风指南。 */
  private buildStagePreviewPrompt(
    project: LocalProject,
    character: Pick<ProjectCharacter, "id" | "name">,
    stage: CharacterStage,
  ): string {
    return [
      `${character.name}，${stage.visualDelta}`,
      "保持面部特征与五官不变，只按上述差异描述改变造型。",
      buildCharacterReferenceStyleGuide(project),
    ].filter(Boolean).join("\n");
  }

  /** 加载参考图资产（asset 行 + workspace 文件）。 */
  private async readReferenceAssetFile(
    projectId: string,
    assetId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const row = await this.prismaService.database().asset.findFirst({
      where: { id: assetId, projectId, status: "ready" },
      select: { storageKey: true, mimeType: true },
    });
    if (!row) {
      throw new NotFoundException("PROJECT_ASSET_NOT_FOUND");
    }
    if (!row.storageKey.startsWith(`projects/${projectId}/`) && !row.storageKey.startsWith(`legacy-import/${projectId}/`)) {
      throw new BadRequestException("PROJECT_ASSET_PATH_INVALID");
    }
    try {
      return {
        buffer: await readFile(this.workspacePathService.resolveVirtualPath(`/workspace/${row.storageKey}`)),
        mimeType: row.mimeType,
        fileName: path.basename(row.storageKey),
      };
    } catch (error) {
      if ((error as { code?: string })?.code === "ENOENT") {
        throw new NotFoundException("PROJECT_ASSET_FILE_NOT_FOUND");
      }
      throw error;
    }
  }

  private toCharacterStage(row: StageRow): CharacterStage {
    return {
      id: row.id,
      projectId: row.projectId,
      characterId: row.characterId,
      stageOrder: row.stageOrder,
      name: row.name ?? undefined,
      fromChapterId: row.fromChapterId ?? undefined,
      toChapterId: row.toChapterId ?? undefined,
      visualDelta: row.visualDelta,
      previewAssetId: row.previewAssetId ?? undefined,
      finalAssetId: row.finalAssetId ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private digestPrompt(prompt: string): string {
    return createHash("sha256").update(prompt).digest("hex").slice(0, 12);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
  }

  private toProviderMetaId(providerType: ImageProviderType): string {
    if (providerType === "doubao") return "doubao_image";
    if (providerType === "grok") return "grok_image";
    if (providerType === "runware") return "runware_image";
    return "openai_image";
  }
}

/** character_stages 表行（映射所需字段）。 */
type StageRow = {
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
};
