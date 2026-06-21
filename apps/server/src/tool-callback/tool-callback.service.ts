import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ExtractProjectCharactersResponse, QueueCharacterReferenceResponse, QueueSceneReferenceResponse } from "@airoaming/shared";
import { ProjectsService } from "../projects/projects.service.js";

/**
 * 工具回调业务层:接收插件工具的回调,委托 ProjectsService 执行。
 * 职责:token 鉴权 + 按角色名查 id + 委托业务方法。
 */
@Injectable()
export class ToolCallbackService {
  private readonly callbackToken: string | null;

  constructor(@Inject(ProjectsService) private readonly projectsService: ProjectsService) {
    this.callbackToken = process.env.AIROAMING_TOOL_CALLBACK_TOKEN?.trim() || null;
  }

  /** token 校验:配置了 token 时必须匹配,防止外部调用 */
  assertToken(token: string | undefined): void {
    if (this.callbackToken) {
      if (!token || token !== this.callbackToken) {
        throw new BadRequestException("TOOL_CALLBACK_TOKEN_INVALID");
      }
    }
  }

  /** 生成角色预览图(preview_front):按角色名查 id,委托 queueCharacterReference */
  async generateCharacterImage(input: {
    projectId: string;
    characterName: string;
    prompt?: string;
  }): Promise<QueueCharacterReferenceResponse> {
    const characterId = await this.resolveCharacterIdByName(input.projectId, input.characterName);
    return this.projectsService.queueCharacterReference(input.projectId, characterId, {
      referenceKind: "preview_front",
      prompt: input.prompt,
    });
  }

  /** 生成角色三视图(final_reference):按角色名查 id,委托 queueCharacterReference */
  async generateCharacterFinal(input: {
    projectId: string;
    characterName: string;
    prompt?: string;
  }): Promise<QueueCharacterReferenceResponse> {
    const characterId = await this.resolveCharacterIdByName(input.projectId, input.characterName);
    return this.projectsService.queueCharacterReference(input.projectId, characterId, {
      referenceKind: "final_reference",
      prompt: input.prompt,
    });
  }

  /** 按角色名查 characterId(大小写不敏感、去空格) */
  private async resolveCharacterIdByName(projectId: string, characterName: string): Promise<string> {
    const trimmed = characterName.trim();
    if (!trimmed) {
      throw new BadRequestException("CHARACTER_NAME_REQUIRED");
    }
    const characters = await this.projectsService.listProjectCharacters(projectId);
    const normalize = (value: string) => value.trim().toLowerCase();
    const matched = characters.characters.find((c) => normalize(c.name) === normalize(trimmed));
    if (!matched) {
      throw new NotFoundException(`CHARACTER_NOT_FOUND:${trimmed}`);
    }
    return matched.id;
  }

  /** 生成场景背景图:直接传 chapterId + sceneId,委托 queueSceneReference */
  async generateSceneImage(input: {
    projectId: string;
    chapterId: string;
    sceneId: string;
    prompt?: string;
  }): Promise<QueueSceneReferenceResponse> {
    return this.projectsService.queueSceneReference(input.projectId, input.chapterId, input.sceneId, {
      prompt: input.prompt,
    });
  }

  /** 提取项目角色:从剧本大纲/剧情结构提取角色进项目角色库 */
  async extractCharacters(input: { projectId: string }): Promise<ExtractProjectCharactersResponse> {
    return this.projectsService.extractProjectCharacters(input.projectId, {});
  }

  /**
   * 查询项目状态摘要(给 AI 自主决策用):
   * 当前章节、workflow 进度、角色图状态(哪些有图/没图)、场景图状态。
   */
  async getProjectStatus(projectId: string): Promise<{
    projectName: string;
    currentChapter: { id: string; title: string; status: string } | null;
    characters: Array<{ id: string; name: string; level: string; hasImage: boolean; hasFinal: boolean }>;
    scenes: Array<{ id: string; name: string; hasImage: boolean }>;
    storyboardShotCount: number;
    workflowStep: string;
  }> {
    const snapshot = await this.projectsService.getWorkbenchSnapshot(projectId);
    const characters = snapshot.characters.map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      hasImage: Boolean(c.previewReferenceAssetId),
      hasFinal: c.primaryReferenceKind === "final_reference" && Boolean(c.primaryReferenceAssetId),
    }));
    const scenes = (snapshot.storyStructure?.structureJson.scenes ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      hasImage: Boolean(s.referenceAssetId),
    }));
    return {
      projectName: snapshot.project.name,
      currentChapter: snapshot.currentChapter
        ? { id: snapshot.currentChapter.id, title: snapshot.currentChapter.title, status: snapshot.currentChapter.status }
        : null,
      characters,
      scenes,
      storyboardShotCount: snapshot.shots.length,
      workflowStep: snapshot.workflow?.currentStepKey ?? "unknown",
    };
  }
}
