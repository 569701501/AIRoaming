import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Res, StreamableFile } from "@nestjs/common";
import type {
  CompleteChapterRequest,
  ConfirmCharacterPreviewRequest,
  ConfirmCharacterReferenceRequest,
  ConfirmChapterImagePreflightRequest,
  ConfirmChapterStoryboardRequest,
  ConfirmChapterStoryStructureRequest,
  CreateProjectRequest,
  ExtractProjectCharactersRequest,
  GenerateCharacterReferenceRequest,
  GenerateSceneReferenceRequest,
  ResolveImagePreflightCharacterRequest,
  SaveChapterDraftRequest,
  UpdateProjectCharacterRequest,
  UpdateChapterStoryboardRequest,
  UpdateChapterStoryStructureRequest,
  UpdateProjectDraftRequest,
} from "@airoaming/shared";
import { ok } from "../http.js";
import { ProjectsService } from "./projects.service.js";

@Controller("projects")
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projectsService: ProjectsService) {}

  @Get()
  async list() {
    return ok({ items: await this.projectsService.listProjects() });
  }

  @Post()
  async create(@Body() body: CreateProjectRequest) {
    return ok({ project: await this.projectsService.createProject(body) });
  }

  @Delete(":projectId")
  async delete(@Param("projectId") projectId: string) {
    return ok(await this.projectsService.deleteProject(projectId));
  }

  @Patch(":projectId")
  async updateDraft(@Param("projectId") projectId: string, @Body() body: UpdateProjectDraftRequest) {
    const project = await this.projectsService.updateProjectDraft(projectId, body);
    return ok({
      project,
      snapshot: await this.projectsService.getWorkbenchSnapshot(projectId),
    });
  }

  @Get(":projectId/workbench")
  async workbench(@Param("projectId") projectId: string, @Query("chapterId") chapterId?: string) {
    return ok({ snapshot: await this.projectsService.getWorkbenchSnapshot(projectId, chapterId) });
  }

  @Post(":projectId/script/reset")
  async resetScript(@Param("projectId") projectId: string) {
    return ok(await this.projectsService.resetProjectScript(projectId));
  }

  @Get(":projectId/chapters")
  async listChapters(@Param("projectId") projectId: string) {
    return ok(await this.projectsService.listChapters(projectId));
  }

  @Get(":projectId/chapters/:chapterId")
  async getChapter(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string) {
    return ok(await this.projectsService.getChapter(projectId, chapterId));
  }

  @Get(":projectId/characters")
  async listProjectCharacters(@Param("projectId") projectId: string) {
    return ok(await this.projectsService.listProjectCharacters(projectId));
  }

  @Post(":projectId/characters/extract")
  async extractProjectCharacters(@Param("projectId") projectId: string, @Body() body: ExtractProjectCharactersRequest) {
    return ok(await this.projectsService.extractProjectCharacters(projectId, body));
  }

  @Post(":projectId/characters/previews/ensure")
  async ensureProjectCharacterPreviewTasks(@Param("projectId") projectId: string) {
    return ok(await this.projectsService.ensureProjectCharacterPreviewTasks(projectId));
  }

  @Patch(":projectId/characters/:characterId")
  async updateProjectCharacter(
    @Param("projectId") projectId: string,
    @Param("characterId") characterId: string,
    @Body() body: UpdateProjectCharacterRequest,
  ) {
    return ok(await this.projectsService.updateProjectCharacter(projectId, characterId, body));
  }

  @Post(":projectId/characters/:characterId/reference")
  async generateCharacterReference(
    @Param("projectId") projectId: string,
    @Param("characterId") characterId: string,
    @Body() body: GenerateCharacterReferenceRequest,
  ) {
    return ok(await this.projectsService.queueCharacterReference(projectId, characterId, body));
  }

  @Post(":projectId/characters/:characterId/preview/confirm")
  async confirmCharacterPreview(
    @Param("projectId") projectId: string,
    @Param("characterId") characterId: string,
    @Body() body: ConfirmCharacterPreviewRequest,
  ) {
    return ok(await this.projectsService.confirmCharacterPreview(projectId, characterId, body));
  }

  @Post(":projectId/characters/:characterId/reference/confirm")
  async confirmCharacterReference(
    @Param("projectId") projectId: string,
    @Param("characterId") characterId: string,
    @Body() body: ConfirmCharacterReferenceRequest,
  ) {
    return ok(await this.projectsService.confirmCharacterReference(projectId, characterId, body));
  }

  @Delete(":projectId/characters/:characterId/references/:assetId")
  async deleteCharacterReference(
    @Param("projectId") projectId: string,
    @Param("characterId") characterId: string,
    @Param("assetId") assetId: string,
  ) {
    return ok(await this.projectsService.deleteCharacterReference(projectId, characterId, assetId));
  }

  @Get(":projectId/assets/:assetId/file")
  async getProjectAssetFile(
    @Param("projectId") projectId: string,
    @Param("assetId") assetId: string,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const file = await this.projectsService.getProjectAssetFile(projectId, assetId);
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Cache-Control", "private, max-age=60");
    response.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.fileName)}"`);
    return new StreamableFile(file.buffer);
  }

  @Post(":projectId/chapters/:chapterId/script/clear")
  async clearChapterScript(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string) {
    return ok(await this.projectsService.clearChapterScript(projectId, chapterId));
  }

  @Patch(":projectId/chapters/:chapterId/draft")
  async saveChapterDraft(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: SaveChapterDraftRequest,
  ) {
    return ok(await this.projectsService.saveChapterDraft(projectId, chapterId, body));
  }

  @Post(":projectId/chapters/:chapterId/complete")
  async completeChapter(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: CompleteChapterRequest,
  ) {
    return ok(await this.projectsService.completeChapter(projectId, chapterId, body));
  }

  @Get(":projectId/chapters/:chapterId/story-structure")
  async getChapterStoryStructure(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string) {
    return ok(await this.projectsService.getChapterStoryStructure(projectId, chapterId));
  }

  @Post(":projectId/chapters/:chapterId/story-structure/confirm")
  async confirmChapterStoryStructure(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ConfirmChapterStoryStructureRequest,
  ) {
    return ok(await this.projectsService.confirmChapterStoryStructure(projectId, chapterId, body));
  }

  @Patch(":projectId/chapters/:chapterId/story-structure")
  async updateChapterStoryStructure(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: UpdateChapterStoryStructureRequest,
  ) {
    return ok(await this.projectsService.updateChapterStoryStructure(projectId, chapterId, body));
  }

  @Post(":projectId/chapters/:chapterId/scenes/:sceneId/reference")
  async queueSceneReference(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("sceneId") sceneId: string,
    @Body() body: GenerateSceneReferenceRequest,
  ) {
    return ok(await this.projectsService.queueSceneReference(projectId, chapterId, sceneId, body));
  }

  @Get(":projectId/chapters/:chapterId/storyboard")
  async getChapterStoryboard(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string) {
    return ok(await this.projectsService.getChapterStoryboard(projectId, chapterId));
  }

  @Get(":projectId/chapters/:chapterId/image-preflight")
  async getChapterImagePreflight(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string) {
    return ok(await this.projectsService.getChapterImagePreflight(projectId, chapterId));
  }

  @Post(":projectId/chapters/:chapterId/image-preflight/confirm")
  async confirmChapterImagePreflight(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ConfirmChapterImagePreflightRequest,
  ) {
    return ok(await this.projectsService.confirmChapterImagePreflight(projectId, chapterId, body));
  }

  @Post(":projectId/chapters/:chapterId/image-preflight/characters/resolve")
  async resolveImagePreflightCharacter(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ResolveImagePreflightCharacterRequest,
  ) {
    return ok(await this.projectsService.resolveImagePreflightCharacter(projectId, chapterId, body));
  }

  @Patch(":projectId/chapters/:chapterId/storyboard/pending")
  async savePendingChapterStoryboard(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: UpdateChapterStoryboardRequest,
  ) {
    return ok(await this.projectsService.savePendingChapterStoryboard(projectId, chapterId, body));
  }

  @Post(":projectId/chapters/:chapterId/storyboard/confirm")
  async confirmChapterStoryboard(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ConfirmChapterStoryboardRequest,
  ) {
    return ok(await this.projectsService.confirmChapterStoryboard(projectId, chapterId, body));
  }

  @Patch(":projectId/chapters/:chapterId/storyboard")
  async updateChapterStoryboard(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: UpdateChapterStoryboardRequest,
  ) {
    return ok(await this.projectsService.updateChapterStoryboard(projectId, chapterId, body));
  }
}
