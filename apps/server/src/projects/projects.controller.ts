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
  ScriptHistoryCopyRequest,
  ScriptPendingAdoptRequest,
  ScriptPendingDiscardRequest,
  ScriptPublishRequest,
  ScriptWorkingCopyClearRequest,
  ScriptWorkingCopyRevertRequest,
  ScriptWorkingCopyUpdateRequest,
  ConfirmStoryWorkingCopyRequest,
  CreateStoryWorkingCopyRequest,
  DiscardStoryWorkingCopyRequest,
  UpdateStoryWorkingCopyRequest,
  ConfirmStoryboardWorkingCopyRequest,
  CreatePendingShotRequest,
  CreateStoryboardWorkingCopyRequest,
  DiscardStoryboardWorkingCopyRequest,
  UpdateStoryboardWorkingCopyRequest,
  ConfirmChapterPreflightRequest,
} from "@airoaming/shared";
import { ok } from "../http.js";
import { ProjectsService } from "./projects.service.js";
import { ScriptVersionService } from "./versioning/script-version.service.js";
import { StoryVersionService } from "./versioning/story-version.service.js";
import { StoryboardVersionService } from "./versioning/storyboard-version.service.js";
import { ChapterProductionQueryService } from "./versioning/chapter-production-query.service.js";
import { PreflightRevisionService } from "./versioning/preflight-revision.service.js";

@Controller("projects")
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
    @Inject(ScriptVersionService) private readonly scriptVersionService: ScriptVersionService,
    @Inject(StoryVersionService) private readonly storyVersionService: StoryVersionService,
    @Inject(StoryboardVersionService) private readonly storyboardVersionService: StoryboardVersionService,
    @Inject(ChapterProductionQueryService) private readonly chapterProductionQueryService: ChapterProductionQueryService,
    @Inject(PreflightRevisionService) private readonly preflightRevisionService: PreflightRevisionService,
  ) {}

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

  @Get(":projectId/chapters/:chapterId/script/working-copy")
  async getScriptWorkingCopy(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string) {
    return ok(await this.scriptVersionService.getWorkingCopy({ projectId, chapterId }));
  }

  @Patch(":projectId/chapters/:chapterId/script/working-copy")
  async updateScriptWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ScriptWorkingCopyUpdateRequest,
  ) {
    return ok(await this.scriptVersionService.updateWorkingCopy({ projectId, chapterId }, body));
  }

  @Delete(":projectId/chapters/:chapterId/script/working-copy")
  async clearScriptWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ScriptWorkingCopyClearRequest,
  ) {
    return ok(await this.scriptVersionService.clearWorkingCopy({ projectId, chapterId }, body));
  }

  @Post(":projectId/chapters/:chapterId/script/working-copy/revert")
  async revertScriptWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ScriptWorkingCopyRevertRequest,
  ) {
    return ok(await this.scriptVersionService.revertWorkingCopy({ projectId, chapterId }, body));
  }

  @Post(":projectId/chapters/:chapterId/script/publish")
  async publishScript(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ScriptPublishRequest,
  ) {
    return ok(await this.scriptVersionService.publish({ projectId, chapterId }, body));
  }

  @Get(":projectId/chapters/:chapterId/script/pending-suggestion")
  async getScriptPendingSuggestion(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string) {
    return ok(await this.scriptVersionService.getPendingSuggestion({ projectId, chapterId }));
  }

  @Post(":projectId/chapters/:chapterId/script/pending-suggestion/adopt")
  async adoptScriptPendingSuggestion(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ScriptPendingAdoptRequest,
  ) {
    return ok(await this.scriptVersionService.adoptPendingSuggestion({ projectId, chapterId }, body));
  }

  @Delete(":projectId/chapters/:chapterId/script/pending-suggestion")
  async discardScriptPendingSuggestion(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ScriptPendingDiscardRequest,
  ) {
    return ok(await this.scriptVersionService.discardPendingSuggestion({ projectId, chapterId }, body));
  }

  @Get(":projectId/chapters/:chapterId/script/versions")
  async listScriptVersions(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Query("limit") limit?: string,
    @Query("beforeVersion") beforeVersion?: string,
  ) {
    return ok(await this.scriptVersionService.listHistory({ projectId, chapterId }, {
      limit: limit === undefined ? undefined : Number(limit),
      beforeVersion: beforeVersion === undefined ? undefined : Number(beforeVersion),
    }));
  }

  @Get(":projectId/chapters/:chapterId/script/versions/:versionId")
  async getScriptVersion(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("versionId") versionId: string,
  ) {
    return ok(await this.scriptVersionService.getHistoryDetail({ projectId, chapterId }, versionId));
  }

  @Post(":projectId/chapters/:chapterId/script/versions/:versionId/copy-to-working-copy")
  async copyScriptVersionToWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("versionId") versionId: string,
    @Body() body: ScriptHistoryCopyRequest,
  ) {
    return ok(await this.scriptVersionService.copyHistoryToWorkingCopy({ projectId, chapterId }, versionId, body));
  }

  @Get(":projectId/chapters/:chapterId/story-structure/working-copy")
  async getStoryWorkingCopy(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string) {
    return ok(await this.storyVersionService.getWorkingCopy({ projectId, chapterId }));
  }

  @Get(":projectId/chapters/:chapterId/production-state")
  async getChapterProductionState(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string) {
    return ok(await this.chapterProductionQueryService.get({ projectId, chapterId }));
  }

  @Get(":projectId/chapters/:chapterId/image-preflight/preview")
  async getChapterPreflightPreview(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string, @Query("notes") notes?: string) {
    return ok(await this.preflightRevisionService.getPreview({ projectId, chapterId }, notes));
  }

  @Post(":projectId/chapters/:chapterId/image-preflight/confirm")
  async confirmChapterPreflight(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string, @Body() body: ConfirmChapterPreflightRequest) {
    return ok(await this.preflightRevisionService.confirm({ projectId, chapterId }, body));
  }

  @Post(":projectId/chapters/:chapterId/story-structure/working-copy")
  async createStoryWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: CreateStoryWorkingCopyRequest,
  ) {
    return ok(await this.storyVersionService.createWorkingCopy({ projectId, chapterId }, body));
  }

  @Patch(":projectId/chapters/:chapterId/story-structure/working-copy")
  async updateStoryWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: UpdateStoryWorkingCopyRequest,
  ) {
    return ok(await this.storyVersionService.updateWorkingCopy({ projectId, chapterId }, body));
  }

  @Delete(":projectId/chapters/:chapterId/story-structure/working-copy")
  async discardStoryWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: DiscardStoryWorkingCopyRequest,
  ) {
    return ok(await this.storyVersionService.discardWorkingCopy({ projectId, chapterId }, body));
  }

  @Post(":projectId/chapters/:chapterId/story-structure/working-copy/confirm")
  async confirmStoryWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ConfirmStoryWorkingCopyRequest,
  ) {
    return ok(await this.storyVersionService.confirmWorkingCopy({ projectId, chapterId }, body));
  }

  @Get(":projectId/chapters/:chapterId/storyboard/working-copy")
  async getStoryboardWorkingCopy(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string) {
    return ok(await this.storyboardVersionService.getWorkingCopy({ projectId, chapterId }));
  }

  @Post(":projectId/chapters/:chapterId/storyboard/working-copy")
  async createStoryboardWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: CreateStoryboardWorkingCopyRequest,
  ) {
    return ok(await this.storyboardVersionService.createWorkingCopy({ projectId, chapterId }, body));
  }

  @Patch(":projectId/chapters/:chapterId/storyboard/working-copy")
  async updateStoryboardWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: UpdateStoryboardWorkingCopyRequest,
  ) {
    return ok(await this.storyboardVersionService.updateWorkingCopy({ projectId, chapterId }, body));
  }

  @Delete(":projectId/chapters/:chapterId/storyboard/working-copy")
  async discardStoryboardWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: DiscardStoryboardWorkingCopyRequest,
  ) {
    return ok(await this.storyboardVersionService.discardWorkingCopy({ projectId, chapterId }, body));
  }

  @Post(":projectId/chapters/:chapterId/storyboard/working-copy/confirm")
  async confirmStoryboardWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ConfirmStoryboardWorkingCopyRequest,
  ) {
    return ok(await this.storyboardVersionService.confirmWorkingCopy({ projectId, chapterId }, body));
  }

  @Post(":projectId/chapters/:chapterId/storyboard/working-copy/shots")
  async createPendingStoryboardShot(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: CreatePendingShotRequest,
  ) {
    return ok(await this.storyboardVersionService.createPendingShot({ projectId, chapterId }, body));
  }

  @Patch(":projectId/chapters/:chapterId/draft")
  async saveChapterDraft(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: SaveChapterDraftRequest,
  ) {
    return ok(await this.projectsService.saveChapterDraft(projectId, chapterId, body));
  }

  @Post(":projectId/chapters/:chapterId/source-pending/confirm")
  async confirmChapterPendingSource(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.projectsService.confirmChapterPendingSource(projectId, chapterId));
  }

  @Delete(":projectId/chapters/:chapterId/source-pending")
  async discardChapterPendingSource(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.projectsService.discardChapterPendingSource(projectId, chapterId));
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

  @Post(":projectId/chapters/:chapterId/candidates/:candidateId/lock")
  async lockChapterCandidate(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("candidateId") candidateId: string,
  ) {
    return ok(await this.projectsService.lockChapterCandidate(projectId, chapterId, { candidateId }));
  }

  @Get(":projectId/chapters/:chapterId/shots/:shotId/candidate-generation-preview")
  async getCandidateGenerationPreview(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("shotId") shotId: string,
  ) {
    return ok(await this.projectsService.getCandidateGenerationPreview(projectId, chapterId, shotId));
  }

  @Post(":projectId/chapters/:chapterId/images/complete")
  async completeChapterImages(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.projectsService.completeChapterImages(projectId, chapterId));
  }

  @Post(":projectId/chapters/:chapterId/layout/build")
  async buildChapterLayout(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.projectsService.buildChapterLayout(projectId, chapterId));
  }

  @Post(":projectId/chapters/:chapterId/layout/export")
  async exportChapterLayout(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.projectsService.exportChapterLayout(projectId, chapterId));
  }

  @Post(":projectId/chapters/:chapterId/asset-package/export")
  async exportChapterAssetPackage(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.projectsService.exportAssetPackage(projectId, chapterId));
  }
}
