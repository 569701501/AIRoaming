import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import * as path from "node:path";
import {
  type ChapterStoryStructure,
  type ChapterListItem,
  type ChapterDetail,
  type ConfirmCharacterPreviewRequest,
  type ConfirmCharacterPreviewResponse,
  type ConfirmCharacterReferenceRequest,
  type ExtractProjectCharactersRequest,
  type ExtractProjectCharactersResponse,
  type GenerateCharacterReferenceRequest,
  type GenerateCharacterReferenceResponse,
  type GenerateSceneReferenceRequest,
  type ProjectCharacter,
  type ProjectCharacterEntityType,
  type ProjectCharacterLevel,
  type ProjectCharacterReferenceKind,
  type ProjectCharacterStatus,
  type ProjectCharactersResponse,
  type ProjectScriptOutline,
  type QueueCharacterReferenceResponse,
  type QueueSceneReferenceResponse,
  type SaveProjectCharacterResponse,
  type GenerationTaskItem,
  type StoryStructureJson,
  type UpdateProjectCharacterRequest,
  type WorkbenchAsset,
  buildTaskSourceProjection,
  digestCanonicalJson,
} from "@airoaming/shared";
import type { LocalChapter, LocalProject } from "./local-types.js";
import { CHARACTER_LEVEL_ORDER } from "./project-domain.util.js";
import * as wsDomain from "./project-domain.util.js";
import * as wsCharacter from "./character-domain.util.js";
import * as referencePromptUtil from "./reference-prompt.util.js";
import { WorkspacePathService } from "../workspace/workspace-path.service.js";
import { ProjectRepository } from "./project-repository.service.js";
import { ProjectStore } from "./project-store.service.js";
import { ImageProviderService } from "./image-provider.service.js";
import { TasksService } from "../tasks/tasks.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { PrismaService } from "../persistence/prisma.service.js";
import { PersistentTaskRepository } from "../tasks/persistent-task.repository.js";

interface ProjectAssetFile {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

interface CharacterReferenceSource extends ProjectAssetFile {
  asset: WorkbenchAsset;
}

/**
 * 角色/场景参考图编排(从 ProjectsService 抽出,见任务 2026-06-24_角色编排Service抽取第二轮)。
 *
 * 收口角色库 CRUD + 角色/场景参考图生成队列 + 资产读写。
 * ProjectsService 保留薄门面委托(ADR-0005),Controller/ToolCallback 调法不变。
 *
 * 依赖:ProjectStore(骨架)/ Repository(缓存)/ ImageProvider(出图)/ Tasks(队列)/ Settings(provider 配置)/ WorkspacePath(文件)。
 * 不依赖 ProjectsService → 无循环(第五轮 ProjectStore 已解开骨架耦合)。
 *
 * 注:resolveImagePreflightCharacter 留在 ProjectsService(耦合分镜 normalizeStoryboardJson/toChapterDetail)。
 */
@Injectable()
export class CharacterReferenceService {
  private readonly logger = new Logger(CharacterReferenceService.name);
  private characterReferenceQueue: Promise<void> = Promise.resolve();

  constructor(
    @Inject(WorkspacePathService) private readonly workspacePathService: WorkspacePathService,
    @Inject(ProjectRepository) private readonly repository: ProjectRepository,
    @Inject(ProjectStore) private readonly projectStore: ProjectStore,
    @Inject(ImageProviderService) private readonly imageProvider: ImageProviderService,
    @Inject(TasksService) private readonly tasksService: TasksService,
    @Inject(SettingsService) private readonly settingsService: SettingsService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    @Inject(PersistentTaskRepository) private readonly persistentTaskRepository: PersistentTaskRepository,
  ) {}

  private isDatabaseMode(): boolean {
    return this.prismaService.isDatabaseMode();
  }

  // ====== 角色纯函数薄委托(内联,委托 wsCharacter/wsDomain) ======

  private normalizeCharacterName(value: string): string {
    return wsCharacter.normalizeCharacterName(value);
  }

  private normalizeCharacterLevel(value: string): ProjectCharacterLevel {
    return wsCharacter.normalizeCharacterLevel(value);
  }

  private normalizeCharacterStatus(value: string): ProjectCharacterStatus {
    return wsCharacter.normalizeCharacterStatus(value);
  }

  private normalizeCharacterReferenceKind(value: string): ProjectCharacterReferenceKind {
    return wsCharacter.normalizeCharacterReferenceKind(value);
  }

  private defaultReferenceKindForLevel(level: ProjectCharacterLevel): ProjectCharacterReferenceKind {
    return wsCharacter.defaultReferenceKindForLevel(level);
  }

  private sortProjectCharacters(characters: ProjectCharacter[]): ProjectCharacter[] {
    return wsDomain.sortProjectCharacters(characters);
  }

  resolveMoreImportantCharacterLevel(left: ProjectCharacterLevel, right: ProjectCharacterLevel): ProjectCharacterLevel {
    return CHARACTER_LEVEL_ORDER[left] <= CHARACTER_LEVEL_ORDER[right] ? left : right;
  }

  isProjectCharacterLibraryReady(project: Pick<LocalProject, "characters">): boolean {
    const required = project.characters.filter((character) => character.level === "lead" || character.level === "recurring");
    if (required.length === 0) {
      return false;
    }
    return required.every((character) =>
      (character.status === "finalized" || character.status === "in_use")
      && Boolean(character.primaryReferenceAssetId)
      && character.primaryReferenceKind === "final_reference",
    );
  }

  resolvePrimaryReferenceForLevel(
    character: ProjectCharacter,
    level: ProjectCharacterLevel,
  ): Pick<ProjectCharacter, "primaryReferenceAssetId" | "primaryReferenceKind" | "finalizedAt"> {
    if (wsCharacter.isPrimaryReferenceCompatible(character.primaryReferenceAssetId, character.primaryReferenceKind)) {
      return {
        primaryReferenceAssetId: character.primaryReferenceAssetId,
        primaryReferenceKind: character.primaryReferenceKind,
        finalizedAt: character.finalizedAt,
      };
    }
    return {
      primaryReferenceAssetId: null,
      primaryReferenceKind: this.defaultReferenceKindForLevel(level),
      finalizedAt: null,
    };
  }

  resolveCharacterStatusForReference(
    level: ProjectCharacterLevel,
    primaryReferenceAssetId: string | null,
    inUse: boolean,
    primaryReferenceKind = this.defaultReferenceKindForLevel(level),
  ): ProjectCharacterStatus {
    if (inUse) {
      return "in_use";
    }
    if (wsCharacter.isPrimaryReferenceCompatible(primaryReferenceAssetId, primaryReferenceKind)) {
      return "finalized";
    }
    if (level === "lead" || level === "recurring") {
      return "needs_reference";
    }
    return "draft";
  }

  private normalizeRequestedReferenceKind(
    character: ProjectCharacter,
    requested: ProjectCharacterReferenceKind | undefined,
  ): ProjectCharacterReferenceKind {
    const fallback = this.defaultReferenceKindForLevel(character.level);
    const normalized = requested ? this.normalizeCharacterReferenceKind(requested) : fallback;
    if (normalized === "preview_front") {
      return "preview_front";
    }
    if (normalized === "final_reference" && character.level === "extra") {
      return "none";
    }
    return normalized === "none" ? fallback : normalized;
  }

  // ====== 资产/通用辅助(内联) ======

  private digestPrompt(prompt: string): string {
    return createHash("sha256").update(prompt).digest("hex").slice(0, 12);
  }

  private inferMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case ".png":
        return "image/png";
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".webp":
        return "image/webp";
      case ".gif":
        return "image/gif";
      default:
        return "application/octet-stream";
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async readProjectAssetFile(project: Pick<LocalProject, "id">, asset: WorkbenchAsset): Promise<ProjectAssetFile> {
    const safePath = asset.path.replace(/^\/+/, "");
    if (!safePath.startsWith(`projects/${project.id}/`)) {
      throw new BadRequestException("PROJECT_ASSET_PATH_INVALID");
    }
    const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${safePath}`);
    try {
      return {
        buffer: await readFile(absolutePath),
        mimeType: this.inferMimeType(asset.path),
        fileName: path.basename(asset.path),
      };
    } catch (error) {
      if (error instanceof NotFoundException || (error as { message?: string })?.message === "NOT_FOUND") {
        throw new NotFoundException("PROJECT_ASSET_FILE_NOT_FOUND");
      }
      throw error;
    }
  }

  private async removeProjectAssetFile(project: Pick<LocalProject, "id">, asset: WorkbenchAsset): Promise<void> {
    const safePath = asset.path.replace(/^\/+/, "");
    if (!safePath.startsWith(`projects/${project.id}/`)) {
      this.logger.warn(`Skip invalid project asset path during delete: ${asset.path}`);
      return;
    }
    const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${safePath}`);
    try {
      await rm(absolutePath, { force: true });
    } catch (error) {
      this.logger.warn(`Failed to remove project asset file ${safePath}: ${this.getErrorMessage(error)}`);
    }
  }

  findProjectCharacter(project: LocalProject, characterId: string): ProjectCharacter {
    const character = project.characters.find((item) => item.id === characterId);
    if (!character) {
      throw new NotFoundException("PROJECT_CHARACTER_NOT_FOUND");
    }
    return character;
  }

  private withUpdatedProjectCharacter(project: LocalProject, character: ProjectCharacter, updatedAt: string): LocalProject {
    return {
      ...project,
      characters: this.sortProjectCharacters(project.characters.map((item) => (item.id === character.id ? character : item))),
      updatedAt,
    };
  }

  private toProjectCharactersResponse(project: LocalProject): ProjectCharactersResponse {
    return {
      characters: this.sortProjectCharacters(project.characters),
      assets: project.assets,
      ready: this.isProjectCharacterLibraryReady(project),
    };
  }

  private getCharacterReferenceAssets(
    project: Pick<LocalProject, "assets">,
    character: Pick<ProjectCharacter, "id" | "referenceAssetIds">,
    referenceKind: ProjectCharacterReferenceKind,
  ): WorkbenchAsset[] {
    const ids = new Set(character.referenceAssetIds);
    return project.assets
      .filter((asset) => ids.has(asset.id) && referencePromptUtil.getAssetReferenceKind(asset) === referenceKind)
      .sort((left, right) => Date.parse(referencePromptUtil.getAssetCreatedAt(right)) - Date.parse(referencePromptUtil.getAssetCreatedAt(left)));
  }

  private async getConfirmedPreviewReferenceSource(project: LocalProject, character: ProjectCharacter): Promise<CharacterReferenceSource> {
    if (!character.previewReferenceAssetId) {
      throw new BadRequestException("CHARACTER_PREVIEW_REFERENCE_REQUIRED");
    }
    const asset = project.assets.find((item) => item.id === character.previewReferenceAssetId);
    if (!asset) {
      throw new NotFoundException("CHARACTER_PREVIEW_ASSET_NOT_FOUND");
    }
    if (!character.referenceAssetIds.includes(asset.id)) {
      throw new BadRequestException("CHARACTER_REFERENCE_ASSET_MISMATCH");
    }
    if (referencePromptUtil.getAssetReferenceKind(asset) !== "preview_front") {
      throw new BadRequestException("CHARACTER_PREVIEW_KIND_MISMATCH");
    }
    return { asset, ...(await this.readProjectAssetFile(project, asset)) };
  }

  // ====== 编排方法(门面委托目标) ======

  async listProjectCharacters(projectId: string): Promise<ProjectCharactersResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    return this.toProjectCharactersResponse(project);
  }

  async ensureProjectCharacterPreviewTasks(projectId: string): Promise<QueueCharacterReferenceResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const tasks = project.characters
      .map((character) => this.queueMissingCharacterReferenceTask(project, character, "preview_front"))
      .filter((task): task is NonNullable<typeof task> => Boolean(task));
    return { ...this.toProjectCharactersResponse(project), tasks, createdCount: tasks.length };
  }

  async extractProjectCharacters(projectId: string, input: ExtractProjectCharactersRequest = {}): Promise<ExtractProjectCharactersResponse> {
    const project = this.isDatabaseMode()
      ? await this.repository.refreshProjectFromDatabase(projectId)
      : await this.projectStore.getReadyProject(projectId);
    const now = new Date().toISOString();
    const extracted = this.extractCharactersFromProjectSource(project, input.source ?? "auto", now);
    const existingByName = new Map(project.characters.map((character) => [wsCharacter.normalizeCharacterNameKey(character.name), character]));
    let createdCount = 0;
    let updatedCount = 0;
    const nextCharacters = [...project.characters];

    for (const candidate of extracted) {
      const key = wsCharacter.normalizeCharacterNameKey(candidate.name);
      const existing = existingByName.get(key);
      if (!existing) {
        nextCharacters.push(candidate);
        existingByName.set(key, candidate);
        createdCount += 1;
        continue;
      }
      const nextCharacter: ProjectCharacter = {
        ...existing,
        role: existing.role || candidate.role,
        level: this.resolveMoreImportantCharacterLevel(existing.level, candidate.level),
        appearance: existing.appearance || candidate.appearance,
        personality: existing.personality || candidate.personality,
        promptFragment: existing.promptFragment || candidate.promptFragment,
        updatedAt: now,
      };
      const index = nextCharacters.findIndex((character) => character.id === existing.id);
      if (index >= 0) {
        nextCharacters[index] = nextCharacter;
        updatedCount += 1;
      }
    }

    const nextProject: LocalProject = { ...project, characters: this.sortProjectCharacters(nextCharacters), updatedAt: now };
    if (this.isDatabaseMode()) {
      await this.prismaService.database().$transaction(async (tx) => {
        for (const character of nextCharacters) {
          const exists = await tx.character.findFirst({ where: { id: character.id, projectId } });
          if (exists) {
            await tx.character.update({
              where: { id: character.id },
              data: {
                name: character.name,
                normalizedName: wsCharacter.normalizeCharacterNameKey(character.name),
                role: character.role,
                level: character.level,
                entityType: character.entityType,
                status: character.status,
                appearance: character.appearance,
                personality: character.personality,
                promptFragment: character.promptFragment,
                source: character.source,
                finalizedAt: character.finalizedAt ? new Date(character.finalizedAt) : null,
              },
            });
          } else {
            await tx.character.create({
              data: {
                id: character.id,
                projectId,
                name: character.name,
                normalizedName: wsCharacter.normalizeCharacterNameKey(character.name),
                role: character.role,
                level: character.level,
                entityType: character.entityType,
                status: character.status,
                appearance: character.appearance,
                personality: character.personality,
                promptFragment: character.promptFragment,
                source: character.source,
                createdAt: new Date(character.createdAt),
                updatedAt: new Date(character.updatedAt),
                finalizedAt: character.finalizedAt ? new Date(character.finalizedAt) : null,
              },
            });
          }
        }
      });
      const refreshed = await this.repository.refreshProjectFromDatabase(projectId);
      return { ...this.toProjectCharactersResponse(refreshed), createdCount, updatedCount };
    }
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);
    return { ...this.toProjectCharactersResponse(nextProject), createdCount, updatedCount };
  }

  async updateProjectCharacter(projectId: string, characterId: string, input: UpdateProjectCharacterRequest): Promise<SaveProjectCharacterResponse> {
    const project = this.isDatabaseMode()
      ? await this.repository.refreshProjectFromDatabase(projectId)
      : await this.projectStore.getReadyProject(projectId);
    const character = this.findProjectCharacter(project, characterId);
    if (character.status === "in_use") {
      throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
    }
    const updatedAt = new Date().toISOString();
    const nextName = input.name === undefined ? character.name : this.normalizeCharacterName(input.name);
    const duplicatedName = project.characters.some((item) =>
      item.id !== character.id && wsCharacter.normalizeCharacterNameKey(item.name) === wsCharacter.normalizeCharacterNameKey(nextName),
    );
    if (duplicatedName) {
      throw new BadRequestException("PROJECT_CHARACTER_NAME_DUPLICATED");
    }
    const nextLevel = input.level === undefined ? character.level : this.normalizeCharacterLevel(input.level);
    const nextReference = this.resolvePrimaryReferenceForLevel(character, nextLevel);
    const nextCharacter: ProjectCharacter = {
      ...character,
      name: nextName,
      role: input.role === undefined ? character.role : input.role.trim(),
      level: nextLevel,
      status: this.resolveCharacterStatusForReference(nextLevel, nextReference.primaryReferenceAssetId, false, nextReference.primaryReferenceKind),
      appearance: input.appearance === undefined ? character.appearance : input.appearance.trim(),
      personality: input.personality === undefined ? character.personality : input.personality.trim(),
      promptFragment: input.promptFragment === undefined ? character.promptFragment : input.promptFragment.trim(),
      primaryReferenceAssetId: nextReference.primaryReferenceAssetId,
      primaryReferenceKind: nextReference.primaryReferenceKind,
      finalizedAt: nextReference.finalizedAt,
      updatedAt,
    };
    const nextProject = this.withUpdatedProjectCharacter(project, nextCharacter, updatedAt);
    if (this.isDatabaseMode()) {
      const result = await this.prismaService.database().character.updateMany({
        where: { id: characterId, projectId, rowVersion: { gte: 0 } },
        data: {
          name: nextCharacter.name,
          normalizedName: wsCharacter.normalizeCharacterNameKey(nextCharacter.name),
          role: nextCharacter.role,
          level: nextCharacter.level,
          status: nextCharacter.status,
          appearance: nextCharacter.appearance,
          personality: nextCharacter.personality,
          promptFragment: nextCharacter.promptFragment,
          updatedAt: new Date(updatedAt),
          finalizedAt: nextCharacter.finalizedAt ? new Date(nextCharacter.finalizedAt) : null,
          rowVersion: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new BadRequestException("PROJECT_CHARACTER_VERSION_CONFLICT");
      const refreshed = await this.repository.refreshProjectFromDatabase(projectId);
      const updated = this.findProjectCharacter(refreshed, characterId);
      return { ...this.toProjectCharactersResponse(refreshed), character: updated };
    }
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);
    return { ...this.toProjectCharactersResponse(nextProject), character: nextCharacter };
  }

  // ====== 角色提取纯算法(从 source 提取候选角色) ======

  private extractCharactersFromProjectSource(
    project: LocalProject,
    source: "script_outline" | "current_chapter" | "auto",
    now: string,
  ): ProjectCharacter[] {
    const currentChapter = wsDomain.getCurrentChapter(project);
    const sourceText = source === "current_chapter"
      ? currentChapter?.sourceText ?? ""
      : project.scriptOutline?.sourceText || currentChapter?.sourceText || project.sourceText;
    const sourceType: ProjectCharacter["source"] = project.scriptOutline?.sourceText && source !== "current_chapter"
      ? "script_outline"
      : "imported_script";
    const section = this.extractMainCharactersSection(sourceText);
    if (!section.trim()) {
      return [];
    }
    const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
    const candidates: ProjectCharacter[] = [];
    for (const line of lines) {
      const parsed = this.parseCharacterLine(line);
      if (!parsed) {
        continue;
      }
      candidates.push({
        id: `char_${randomUUID()}`,
        projectId: project.id,
        name: parsed.name,
        role: parsed.role,
        level: this.inferCharacterLevel(parsed.name, parsed.role, parsed.description, candidates.length),
        entityType: "human",
        status: "draft",
        appearance: parsed.description,
        personality: "",
        promptFragment: "",
        referenceAssetIds: [],
        previewReferenceAssetId: null,
        previewConfirmedAt: null,
        primaryReferenceAssetId: null,
        primaryReferenceKind: this.defaultReferenceKindForLevel(this.inferCharacterLevel(parsed.name, parsed.role, parsed.description, candidates.length)),
        visualVersion: 0,
        source: sourceType,
        createdAt: now,
        updatedAt: now,
        finalizedAt: null,
      });
    }
    return candidates;
  }

  private extractMainCharactersSection(sourceText: string): string {
    const mainMatch = sourceText.match(/(?:主要角色|角色列表|人物介绍|出场人物|角色介绍|主要人物|人物列表)[：:、\s]*\n([\s\S]*?)(?=\n(?:场景|设定|世界观|剧情|大纲|主题|风格|亮点|视觉|本章|剧本)|$)/i);
    return mainMatch?.[1] ?? "";
  }

  private parseCharacterLine(line: string): { name: string; role: string; description: string } | null {
    const match = line.match(/^([^：:（(【《「『]+)[：:（(【《「『]?\s*(.*)$/);
    if (!match) {
      return null;
    }
    const name = match[1].trim();
    const rest = (match[2] ?? "").trim();
    if (!name || name.length > 20) {
      return null;
    }
    return { name, role: "", description: rest };
  }

  inferCharacterLevel(name: string, role: string, description: string, index: number): ProjectCharacterLevel {
    const text = `${name} ${role} ${description}`.toLowerCase();
    if (index === 0) {
      return "lead";
    }
    if (/主角|第一|核心|hero|protagonist/.test(text)) {
      return "lead";
    }
    if (/反派|boss|宿敌|重要|关键|配角|主要|第二|女主|男主/.test(text)) {
      return "recurring";
    }
    if (/路人|背景|临时|龙套|群众/.test(text)) {
      return "extra";
    }
    return "recurring";
  }

  // ====== 参考图生成与队列 ======

  private queueMissingCharacterReferenceTask(
    project: LocalProject,
    character: ProjectCharacter,
    referenceKind: ProjectCharacterReferenceKind,
  ): GenerationTaskItem | null {
    if (referenceKind === "none") {
      return null;
    }
    if (character.status === "in_use") {
      return null;
    }
    if (this.getCharacterReferenceAssets(project, character, referenceKind).length > 0) {
      return null;
    }
    if (this.hasActiveCharacterReferenceTask(project.id, character.id, referenceKind)) {
      return null;
    }
    return this.queueCharacterReferenceTask(project, character, referenceKind);
  }

  private queueCharacterReferenceTask(
    project: LocalProject,
    character: ProjectCharacter,
    referenceKind: ProjectCharacterReferenceKind,
    input: GenerateCharacterReferenceRequest = {},
  ): GenerationTaskItem {
    if (this.hasActiveCharacterReferenceTask(project.id, character.id, referenceKind)) {
      const existing = this.tasksService.list().find((task) =>
        task.projectId === project.id
        && task.type === "character_reference_generate"
        && task.target?.type === "character"
        && task.target.id === character.id
        && task.input.referenceKind === referenceKind
        && (task.status === "queued" || task.status === "running" || task.status === "retrying"),
      );
      if (existing) {
        return existing;
      }
    }
    const task = this.tasksService.createControlled({
      projectId: project.id,
      type: "character_reference_generate",
      target: { type: "character", id: character.id },
      input: {
        characterId: character.id,
        characterName: character.name,
        referenceKind,
        ...(referenceKind === "final_reference" && character.previewReferenceAssetId ? { sourceReferenceAssetId: character.previewReferenceAssetId } : {}),
        prompt: input.prompt,
        size: input.size,
        quality: input.quality,
        outputFormat: input.outputFormat,
      },
      options: { provider: this.toProviderMetaId(this.settingsService.getRuntimeImageProviderSettings().type) },
    });
    this.enqueueCharacterReferenceTaskRun(task.id, project.id, character.id, referenceKind, input);
    return task;
  }

  private enqueueCharacterReferenceTaskRun(
    taskId: string,
    projectId: string,
    characterId: string,
    referenceKind: ProjectCharacterReferenceKind,
    input: GenerateCharacterReferenceRequest,
  ): void {
    const run = () => this.runCharacterReferenceTask(taskId, projectId, characterId, referenceKind, input);
    this.characterReferenceQueue = this.characterReferenceQueue.then(run, run);
    void this.characterReferenceQueue.catch((error) => {
      this.logger.error(`Character reference queue failed: ${this.getErrorMessage(error)}`);
    });
  }

  private async runCharacterReferenceTask(
    taskId: string,
    projectId: string,
    characterId: string,
    referenceKind: ProjectCharacterReferenceKind,
    input: GenerateCharacterReferenceRequest,
  ): Promise<void> {
    const current = this.tasksService.peek(taskId);
    if (!current || current.status === "cancelled") {
      return;
    }
    this.tasksService.start(taskId, "image_provider_running");
    try {
      const result = await this.generateCharacterReference(projectId, characterId, { ...input, referenceKind, sourceTaskId: taskId });
      this.tasksService.succeed(taskId, { characterId, referenceKind, assetId: result.asset.id });
    } catch (error) {
      if (!this.tasksService.peek(taskId)) {
        return;
      }
      this.tasksService.fail(taskId, "CHARACTER_REFERENCE_GENERATE_FAILED", this.getErrorMessage(error), true);
    }
  }

  hasActiveCharacterReferenceTask(projectId: string, characterId: string, referenceKind: ProjectCharacterReferenceKind): boolean {
    return this.tasksService.list().some((task) =>
      task.projectId === projectId
      && task.type === "character_reference_generate"
      && task.target?.type === "character"
      && task.target.id === characterId
      && task.input.referenceKind === referenceKind
      && (task.status === "queued" || task.status === "running" || task.status === "retrying"),
    );
  }

  async generateCharacterReference(
    projectId: string,
    characterId: string,
    input: GenerateCharacterReferenceRequest & { sourceTaskId?: string } = {},
  ): Promise<GenerateCharacterReferenceResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const character = this.findProjectCharacter(project, characterId);
    if (character.status === "in_use") {
      throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
    }
    const referenceKind = this.normalizeRequestedReferenceKind(character, input.referenceKind);
    if (referenceKind === "none") {
      throw new BadRequestException("CHARACTER_REFERENCE_NOT_REQUIRED");
    }
    const nextVisualVersion = Math.max(1, character.visualVersion + 1);
    const fileName = referenceKind === "final_reference" ? "final-reference.webp" : "preview.webp";
    const relativePath = `projects/${project.id}/assets/characters/${character.id}/visual-v${String(nextVisualVersion).padStart(3, "0")}/${fileName}`;
    const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${relativePath}`);
    const prompt = input.prompt?.trim() || referencePromptUtil.buildCharacterReferencePrompt(project, character, referenceKind);
    const referenceSource = referenceKind === "final_reference" ? await this.getConfirmedPreviewReferenceSource(project, character) : null;
    const providerType = this.imageProvider.getActiveProviderType();
    const size = providerType === "doubao"
      ? (referenceKind === "final_reference" ? "2560x1440" : "1920x1920")
      : (input.size?.trim() || (referenceKind === "final_reference" ? "3072x1536" : "1536x2048"));
    const generated = referenceSource
      ? await this.imageProvider.editImage({ prompt, size, quality: input.quality, outputFormat: input.outputFormat, referenceImage: referenceSource })
      : await this.imageProvider.generateImage({ prompt, size, quality: input.quality, outputFormat: input.outputFormat });

    this.projectStore.assertProjectStillActive(project.id);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, generated);

    const now = new Date().toISOString();
    const asset: WorkbenchAsset = {
      id: `asset_${randomUUID()}`,
      chapterId: null,
      type: "image",
      name: `${character.name} ${referenceKind === "final_reference" ? "角色定稿图" : "角色预览图"}`,
      path: relativePath,
      sourceTaskId: input.sourceTaskId ?? null,
      meta: JSON.stringify({
        characterId: character.id,
        referenceKind,
        provider: this.toProviderMetaId(providerType),
        model: this.settingsService.getRuntimeImageProviderSettings().modelId,
        promptDigest: this.digestPrompt(prompt),
        generationMode: referenceSource ? "image_edit" : "image_generation",
        sourceReferenceAssetId: referenceSource?.asset.id ?? null,
        createdAt: now,
      }),
    };
    const hasCompatiblePrimaryReference = wsCharacter.isPrimaryReferenceCompatible(character.primaryReferenceAssetId, character.primaryReferenceKind);
    const nextCharacter: ProjectCharacter = {
      ...character,
      status: this.resolveCharacterStatusForReference(
        character.level,
        hasCompatiblePrimaryReference ? character.primaryReferenceAssetId : null,
        false,
        hasCompatiblePrimaryReference ? character.primaryReferenceKind : referenceKind,
      ),
      primaryReferenceAssetId: hasCompatiblePrimaryReference ? character.primaryReferenceAssetId : null,
      primaryReferenceKind: hasCompatiblePrimaryReference ? character.primaryReferenceKind : this.defaultReferenceKindForLevel(character.level),
      referenceAssetIds: [...new Set([...character.referenceAssetIds, asset.id])],
      visualVersion: nextVisualVersion,
      finalizedAt: hasCompatiblePrimaryReference ? character.finalizedAt : null,
      updatedAt: now,
    };
    const nextProject = this.withUpdatedProjectCharacter({ ...project, assets: [...project.assets, asset] }, nextCharacter, now);
    this.projectStore.assertProjectStillActive(project.id);
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);
    return { ...this.toProjectCharactersResponse(nextProject), character: nextCharacter, asset };
  }

  async queueCharacterReference(projectId: string, characterId: string, input: GenerateCharacterReferenceRequest = {}): Promise<QueueCharacterReferenceResponse> {
    if (this.isDatabaseMode()) {
      const project = await this.repository.refreshProjectFromDatabase(projectId);
      const character = this.findProjectCharacter(project, characterId);
      const characterRow = await this.prismaService.database().character.findUnique({ where: { id: characterId } });
      if (!characterRow || characterRow.projectId !== projectId) throw new NotFoundException("PROJECT_CHARACTER_NOT_FOUND");
      if (character.status === "in_use") throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
      const referenceKind = this.normalizeRequestedReferenceKind(character, input.referenceKind);
      if (referenceKind === "none") throw new BadRequestException("CHARACTER_REFERENCE_NOT_REQUIRED");
      const sourceProjection = buildTaskSourceProjection({
        policyVersion: "character-reference-source-v1",
        projectId,
        chapterId: null,
        consumerType: "character_reference_generate",
        sources: [{
          role: "character",
          sourceType: "character",
          sourceId: character.id,
          sourceDigest: digestCanonicalJson({
            id: character.id,
            name: character.name,
            role: character.role,
            level: character.level,
            entityType: character.entityType,
            appearance: character.appearance,
            personality: character.personality,
            promptFragment: character.promptFragment,
            rowVersion: characterRow.rowVersion,
          }),
        }],
      });
      const task = await this.persistentTaskRepository.create({
        projectId,
        type: "character_reference_generate",
        target: { type: "character", id: character.id },
        input: {
          schemaVersion: 1,
          projectId,
          characterId: character.id,
          referenceKind,
          prompt: input.prompt?.trim() || referencePromptUtil.buildCharacterReferencePrompt(project, character, referenceKind),
          sourceProjection,
        },
        options: { concurrencyKey: "image-provider", concurrencySlots: 1, maxAttempts: 3 },
      });
      return { ...this.toProjectCharactersResponse(project), tasks: [task.item], createdCount: task.replayed ? 0 : 1 };
    }
    let project = await this.projectStore.getReadyProject(projectId);
    let character = this.findProjectCharacter(project, characterId);
    if (character.status === "in_use") {
      throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
    }
    const referenceKind = this.normalizeRequestedReferenceKind(character, input.referenceKind);
    if (referenceKind === "none") {
      throw new BadRequestException("CHARACTER_REFERENCE_NOT_REQUIRED");
    }
    if (referenceKind === "final_reference" && !character.previewReferenceAssetId) {
      const previewAsset = this.getCharacterReferenceAssets(project, character, "preview_front")[0] ?? null;
      if (!previewAsset) {
        throw new BadRequestException("CHARACTER_PREVIEW_REFERENCE_REQUIRED");
      }
      const now = new Date().toISOString();
      character = {
        ...character,
        previewReferenceAssetId: previewAsset.id,
        previewConfirmedAt: now,
        status: character.level === "lead" || character.level === "recurring" ? "needs_reference" : character.status,
        updatedAt: now,
      };
      project = this.withUpdatedProjectCharacter(project, character, now);
      await this.projectStore.writeProjectFiles(project);
      this.repository.setProject(project);
    }
    const alreadyActive = this.hasActiveCharacterReferenceTask(project.id, character.id, referenceKind);
    const task = this.queueCharacterReferenceTask(project, character, referenceKind, input);
    return { ...this.toProjectCharactersResponse(project), tasks: [task], createdCount: alreadyActive ? 0 : 1 };
  }

  async confirmCharacterPreview(projectId: string, characterId: string, input: ConfirmCharacterPreviewRequest): Promise<ConfirmCharacterPreviewResponse> {
    if (this.isDatabaseMode()) {
      const project = await this.repository.refreshProjectFromDatabase(projectId);
      const character = this.findProjectCharacter(project, characterId);
      if (character.status === "in_use") throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
      const asset = await this.prismaService.database().asset.findFirst({ where: { id: input.assetId, projectId }, include: { characterVisualByAsset: true } });
      const visual = asset?.characterVisualByAsset;
      if (!asset) throw new NotFoundException("CHARACTER_PREVIEW_ASSET_NOT_FOUND");
      if (!visual || visual.characterId !== characterId || visual.kind !== "preview_front" || asset.status !== "ready") throw new BadRequestException("CHARACTER_PREVIEW_KIND_MISMATCH");
      await this.prismaService.database().character.update({ where: { id: characterId }, data: { previewVisualId: visual.id, rowVersion: { increment: 1 }, updatedAt: new Date() } });
      const refreshed = await this.repository.refreshProjectFromDatabase(projectId);
      const nextCharacter = this.findProjectCharacter(refreshed, characterId);
      const task = nextCharacter.level !== "extra" ? await this.queueCharacterReference(projectId, characterId, { referenceKind: "final_reference" }) : null;
      return { ...this.toProjectCharactersResponse(refreshed), character: nextCharacter, tasks: task?.tasks ?? [] };
    }
    const project = await this.projectStore.getReadyProject(projectId);
    const character = this.findProjectCharacter(project, characterId);
    if (character.status === "in_use") {
      throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
    }
    const asset = project.assets.find((item) => item.id === input.assetId);
    if (!asset) {
      throw new NotFoundException("CHARACTER_PREVIEW_ASSET_NOT_FOUND");
    }
    if (!character.referenceAssetIds.includes(asset.id)) {
      throw new BadRequestException("CHARACTER_REFERENCE_ASSET_MISMATCH");
    }
    if (referencePromptUtil.getAssetReferenceKind(asset) !== "preview_front") {
      throw new BadRequestException("CHARACTER_PREVIEW_KIND_MISMATCH");
    }
    const now = new Date().toISOString();
    const shouldFinalize = character.level !== "extra";
    const nextCharacter: ProjectCharacter = {
      ...character,
      previewReferenceAssetId: asset.id,
      previewConfirmedAt: now,
      status: shouldFinalize ? "needs_reference" : character.status,
      updatedAt: now,
    };
    const nextProject = this.withUpdatedProjectCharacter(project, nextCharacter, now);
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);
    const task = shouldFinalize ? this.queueMissingCharacterReferenceTask(nextProject, nextCharacter, "final_reference") : null;
    return { ...this.toProjectCharactersResponse(nextProject), character: nextCharacter, tasks: task ? [task] : [] };
  }

  async confirmCharacterReference(projectId: string, characterId: string, input: ConfirmCharacterReferenceRequest): Promise<SaveProjectCharacterResponse> {
    if (this.isDatabaseMode()) {
      const project = await this.repository.refreshProjectFromDatabase(projectId);
      const character = this.findProjectCharacter(project, characterId);
      if (character.status === "in_use" && character.primaryReferenceAssetId !== input.assetId) throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
      const asset = await this.prismaService.database().asset.findFirst({ where: { id: input.assetId, projectId }, include: { characterVisualByAsset: true } });
      const visual = asset?.characterVisualByAsset;
      if (!asset) throw new NotFoundException("CHARACTER_REFERENCE_ASSET_NOT_FOUND");
      if (!visual || visual.characterId !== characterId || visual.kind !== "final_reference" || asset.status !== "ready") throw new BadRequestException("CHARACTER_REFERENCE_KIND_MISMATCH");
      await this.prismaService.database().character.update({ where: { id: characterId }, data: { primaryVisualId: visual.id, status: character.status === "in_use" ? "in_use" : "finalized", finalizedAt: new Date(), rowVersion: { increment: 1 }, updatedAt: new Date() } });
      const refreshed = await this.repository.refreshProjectFromDatabase(projectId);
      return { ...this.toProjectCharactersResponse(refreshed), character: this.findProjectCharacter(refreshed, characterId) };
    }
    const project = await this.projectStore.getReadyProject(projectId);
    const character = this.findProjectCharacter(project, characterId);
    if (character.status === "in_use" && character.primaryReferenceAssetId !== input.assetId) {
      throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
    }
    const asset = project.assets.find((item) => item.id === input.assetId);
    if (!asset) {
      throw new NotFoundException("CHARACTER_REFERENCE_ASSET_NOT_FOUND");
    }
    if (asset.type !== "image") {
      throw new BadRequestException("CHARACTER_REFERENCE_ASSET_TYPE_INVALID");
    }
    if (!character.referenceAssetIds.includes(asset.id)) {
      throw new BadRequestException("CHARACTER_REFERENCE_ASSET_MISMATCH");
    }
    const referenceKind = referencePromptUtil.getAssetReferenceKind(asset) ?? character.primaryReferenceKind;
    if (!wsCharacter.isPrimaryReferenceCompatible(asset.id, referenceKind)) {
      throw new BadRequestException("CHARACTER_REFERENCE_KIND_MISMATCH");
    }
    const now = new Date().toISOString();
    const nextCharacter: ProjectCharacter = {
      ...character,
      status: character.status === "in_use" ? "in_use" : "finalized",
      primaryReferenceAssetId: asset.id,
      primaryReferenceKind: referenceKind,
      updatedAt: now,
      finalizedAt: now,
    };
    const nextProject = this.withUpdatedProjectCharacter(project, nextCharacter, now);
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);
    return { ...this.toProjectCharactersResponse(nextProject), character: nextCharacter };
  }

  async deleteCharacterReference(projectId: string, characterId: string, assetId: string): Promise<SaveProjectCharacterResponse & { deletedAssetId: string }> {
    const project = await this.projectStore.getReadyProject(projectId);
    const character = this.findProjectCharacter(project, characterId);
    if (character.status === "in_use" && character.primaryReferenceAssetId === assetId) {
      throw new BadRequestException("PROJECT_CHARACTER_IN_USE_LOCKED");
    }
    const asset = project.assets.find((item) => item.id === assetId);
    if (!asset) {
      throw new NotFoundException("CHARACTER_REFERENCE_ASSET_NOT_FOUND");
    }
    if (!character.referenceAssetIds.includes(asset.id)) {
      throw new BadRequestException("CHARACTER_REFERENCE_ASSET_MISMATCH");
    }
    const now = new Date().toISOString();
    const nextPrimaryReferenceAssetId = character.primaryReferenceAssetId === assetId ? null : character.primaryReferenceAssetId;
    const nextPrimaryReferenceKind = nextPrimaryReferenceAssetId ? character.primaryReferenceKind : this.defaultReferenceKindForLevel(character.level);
    const nextCharacter: ProjectCharacter = {
      ...character,
      referenceAssetIds: character.referenceAssetIds.filter((item) => item !== asset.id),
      previewReferenceAssetId: character.previewReferenceAssetId === asset.id ? null : character.previewReferenceAssetId,
      previewConfirmedAt: character.previewReferenceAssetId === asset.id ? null : character.previewConfirmedAt,
      primaryReferenceAssetId: nextPrimaryReferenceAssetId,
      primaryReferenceKind: nextPrimaryReferenceKind,
      finalizedAt: nextPrimaryReferenceAssetId ? character.finalizedAt : null,
      status: this.resolveCharacterStatusForReference(character.level, nextPrimaryReferenceAssetId, false, nextPrimaryReferenceKind),
      updatedAt: now,
    };
    const nextProject = this.withUpdatedProjectCharacter({ ...project, assets: project.assets.filter((item) => item.id !== asset.id) }, nextCharacter, now);
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);
    await this.removeProjectAssetFile(project, asset);
    return { ...this.toProjectCharactersResponse(nextProject), character: nextCharacter, deletedAssetId: asset.id };
  }

  async getProjectAssetFile(projectId: string, assetId: string): Promise<ProjectAssetFile> {
    const project = await this.projectStore.getReadyProject(projectId);
    const asset = project.assets.find((item) => item.id === assetId);
    if (!asset) {
      throw new NotFoundException("PROJECT_ASSET_NOT_FOUND");
    }
    return this.readProjectAssetFile(project, asset);
  }

  // ====== 场景参考图 ======

  async queueSceneReference(projectId: string, chapterId: string, sceneId: string, input: GenerateSceneReferenceRequest = {}): Promise<QueueSceneReferenceResponse> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    const storyStructure = chapter.storyStructure;
    if (!storyStructure) {
      throw new BadRequestException("STORY_STRUCTURE_REQUIRED");
    }
    const scene = storyStructure.structureJson.scenes.find((item) => item.id === sceneId);
    if (!scene) {
      throw new BadRequestException("SCENE_NOT_FOUND");
    }
    const settings = this.settingsService.getRuntimeImageProviderSettings();
    if (!settings.apiKey) {
      throw new BadRequestException("IMAGE_PROVIDER_NOT_CONFIGURED");
    }
    const existing = this.tasksService.list().find((task) =>
      task.projectId === project.id
      && task.type === "scene_reference_generate"
      && task.target?.type === "scene"
      && task.target.id === sceneId
      && (task.status === "queued" || task.status === "running" || task.status === "retrying"),
    );
    let task: GenerationTaskItem | null = existing ?? null;
    if (!task) {
      task = await this.tasksService.createControlled({
        projectId: project.id,
        type: "scene_reference_generate",
        target: { type: "scene", id: sceneId, chapterId },
        input: { sceneId, chapterId, sceneName: scene.name, prompt: input.prompt ?? "", size: input.size ?? "" },
        options: { provider: this.toProviderMetaId(settings.type) },
      });
      this.enqueueSceneReferenceTaskRun(task.id, project.id, chapterId, sceneId, input);
    }
    return { storyStructure, assets: project.assets, tasks: task ? [task] : [], createdCount: task && !existing ? 1 : 0 };
  }

  async generateSceneReference(
    projectId: string,
    chapterId: string,
    sceneId: string,
    input: GenerateSceneReferenceRequest & { sourceTaskId?: string } = {},
  ): Promise<{ storyStructure: ChapterStoryStructure; asset: WorkbenchAsset }> {
    const project = await this.projectStore.getReadyProject(projectId);
    const chapter = this.projectStore.findChapter(project, chapterId);
    const storyStructure = chapter.storyStructure;
    if (!storyStructure) {
      throw new BadRequestException("STORY_STRUCTURE_REQUIRED");
    }
    const scene = storyStructure.structureJson.scenes.find((item) => item.id === sceneId);
    if (!scene) {
      throw new BadRequestException("SCENE_NOT_FOUND");
    }
    const prompt = input.prompt?.trim() || referencePromptUtil.buildScenePrompt(scene);
    const size = "2560x1440";
    const generated = await this.imageProvider.generateImage({ prompt, size, quality: "high", outputFormat: "webp" });
    const relativePath = `projects/${project.id}/chapters/${chapter.slug}/scenes/${sceneId}/background.webp`;
    const absolutePath = this.workspacePathService.resolveVirtualPath(`/workspace/${relativePath}`);
    await this.workspacePathService.ensureReady();
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, generated);
    const now = new Date().toISOString();
    const asset: WorkbenchAsset = {
      id: `asset_${randomUUID()}`,
      chapterId: chapter.id,
      type: "image",
      name: `${scene.name}-背景`,
      path: relativePath,
      sourceTaskId: input.sourceTaskId ?? null,
      meta: JSON.stringify({
        sceneId,
        chapterId: chapter.id,
        referenceKind: "scene_background",
        provider: this.toProviderMetaId(this.imageProvider.getActiveProviderType()),
        promptDigest: this.digestPrompt(prompt),
        generationMode: "image_generation",
        createdAt: now,
      }),
    };
    const nextScenes = storyStructure.structureJson.scenes.map((item) => (item.id === sceneId ? { ...item, referenceAssetId: asset.id } : item));
    const nextStoryStructure: ChapterStoryStructure = { ...storyStructure, structureJson: { ...storyStructure.structureJson, scenes: nextScenes }, updatedAt: now };
    const nextChapter: LocalChapter = { ...chapter, storyStructure: nextStoryStructure, updatedAt: now };
    const nextProject = this.projectStore.withUpdatedChapter({ ...project, assets: [...project.assets, asset] }, nextChapter);
    this.projectStore.assertProjectStillActive(project.id);
    await this.projectStore.writeProjectFiles(nextProject);
    this.repository.setProject(nextProject);
    return { storyStructure: nextStoryStructure, asset };
  }

  private enqueueSceneReferenceTaskRun(taskId: string, projectId: string, chapterId: string, sceneId: string, input: GenerateSceneReferenceRequest): void {
    const run = () => this.runSceneReferenceTask(taskId, projectId, chapterId, sceneId, input);
    this.characterReferenceQueue = this.characterReferenceQueue.then(run, run);
    void this.characterReferenceQueue.catch((error) => {
      this.logger.error(`Scene reference queue failed: ${this.getErrorMessage(error)}`);
    });
  }

  private async runSceneReferenceTask(taskId: string, projectId: string, chapterId: string, sceneId: string, input: GenerateSceneReferenceRequest): Promise<void> {
    const current = this.tasksService.peek(taskId);
    if (!current || current.status === "cancelled") {
      return;
    }
    this.tasksService.start(taskId, "image_provider_running");
    try {
      const result = await this.generateSceneReference(projectId, chapterId, sceneId, { ...input, sourceTaskId: taskId });
      this.tasksService.succeed(taskId, { sceneId, chapterId, assetId: result.asset.id });
    } catch (error) {
      if (!this.tasksService.peek(taskId)) {
        return;
      }
      this.tasksService.fail(taskId, "SCENE_REFERENCE_GENERATE_FAILED", this.getErrorMessage(error), true);
    }
  }

  private toProviderMetaId(providerType: "openai" | "doubao" | "grok"): string {
    if (providerType === "doubao") return "doubao_image";
    if (providerType === "grok") return "grok_image";
    return "openai_image";
  }
}
