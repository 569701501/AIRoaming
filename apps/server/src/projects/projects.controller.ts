import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Res, StreamableFile } from "@nestjs/common";
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
  ConfirmImportChapterRequest,
  VersionHistoryCopyRequest,
  InitializeLayoutWorkingCopyRequestV1,
  SaveLayoutWorkingCopyRequestV1,
  CommitLayoutSourceReplacementRequestV1,
  CreateLayoutRevisionRequestV1,
  PreviewLayoutSourceReplacementRequestV1,
  RestoreLayoutRevisionRequestV1,
  RunLayoutPreflightRequestV1,
  CreateLayoutPublicationRequestV1,
  CreatePendingEditorCommandSetRequestV1,
} from "@airoaming/shared";
import { ok } from "../http.js";
import { ProjectsService } from "./projects.service.js";
import { ScriptVersionService } from "./versioning/script-version.service.js";
import { StoryVersionService } from "./versioning/story-version.service.js";
import { StoryboardVersionService } from "./versioning/storyboard-version.service.js";
import { ChapterProductionQueryService } from "./versioning/chapter-production-query.service.js";
import { PreflightRevisionService } from "./versioning/preflight-revision.service.js";
import { CandidateDecisionService } from "./candidate-decision.service.js";
import { LayoutWorkingCopyService } from "./layout-working-copy.service.js";
import { LayoutFontService } from "./layout-font.service.js";
import { LayoutVersioningService } from "./layout-versioning.service.js";
import { LayoutPendingCommandService } from "./layout-pending-command.service.js";
import { ScriptWorkflowSourceRepository } from "./script-workflow-source.repository.js";

@Controller("projects")
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly projectsService: ProjectsService,
    @Inject(ScriptVersionService) private readonly scriptVersionService: ScriptVersionService,
    @Inject(ScriptWorkflowSourceRepository) private readonly scriptWorkflowSourceRepository: ScriptWorkflowSourceRepository,
    @Inject(StoryVersionService) private readonly storyVersionService: StoryVersionService,
    @Inject(StoryboardVersionService) private readonly storyboardVersionService: StoryboardVersionService,
    @Inject(ChapterProductionQueryService) private readonly chapterProductionQueryService: ChapterProductionQueryService,
    @Inject(PreflightRevisionService) private readonly preflightRevisionService: PreflightRevisionService,
    @Inject(CandidateDecisionService) private readonly candidateDecisionService: CandidateDecisionService,
    @Inject(LayoutFontService) private readonly layoutFontService: LayoutFontService,
    @Inject(LayoutWorkingCopyService) private readonly layoutWorkingCopyService: LayoutWorkingCopyService,
    @Inject(LayoutVersioningService) private readonly layoutVersioningService: LayoutVersioningService,
    @Inject(LayoutPendingCommandService) private readonly layoutPendingCommandService: LayoutPendingCommandService,
  ) {}

  @Get()
  async list() {
    return ok({ items: await this.projectsService.listProjects() });
  }

  @Post()
  async create(@Body() body: unknown) {
    return ok({ project: await this.projectsService.createProject(body) });
  }

  @Delete(":projectId")
  async delete(@Param("projectId") projectId: string) {
    return ok(await this.projectsService.deleteProject(projectId));
  }

  @Patch(":projectId")
  async updateDraft(@Param("projectId") projectId: string, @Body() body: unknown) {
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

  @Get(":projectId/script/impact-preview")
  async scriptImpactPreview(@Param("projectId") projectId: string) {
    return ok(await this.projectsService.getScriptImpactPreview(projectId));
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

  @Post(":projectId/chapters/:chapterId/script/import-pending/confirm")
  async confirmImportChapter(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: ConfirmImportChapterRequest,
  ) {
    return ok(await this.scriptWorkflowSourceRepository.confirmImportPending({
      projectId,
      chapterId,
      pendingId: body.pendingId,
      expectedPendingRowVersion: body.expectedPendingRowVersion,
      expectedPendingDigest: body.expectedPendingDigest,
      expectedChapterRowVersion: body.expectedChapterRowVersion,
    }));
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
  async confirmChapterPreflight(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string, @Body() body: ConfirmChapterPreflightRequest | ConfirmChapterImagePreflightRequest) {
    if (this.projectsService.usesDatabasePersistence()) {
      return ok(await this.preflightRevisionService.confirm({ projectId, chapterId }, body as ConfirmChapterPreflightRequest));
    }
    return ok(await this.projectsService.confirmChapterImagePreflight(projectId, chapterId, body as ConfirmChapterImagePreflightRequest));
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

  @Post(":projectId/chapters/:chapterId/story-structure/versions/:versionId/copy-to-working-copy")
  async copyStoryVersionToWorkingCopy(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string, @Param("versionId") versionId: string, @Body() body: VersionHistoryCopyRequest) {
    return ok(await this.storyVersionService.copyHistoryToWorkingCopy({ projectId, chapterId }, versionId, body));
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

  @Post(":projectId/chapters/:chapterId/storyboard/versions/:versionId/copy-to-working-copy")
  async copyStoryboardVersionToWorkingCopy(@Param("projectId") projectId: string, @Param("chapterId") chapterId: string, @Param("versionId") versionId: string, @Body() body: VersionHistoryCopyRequest) {
    return ok(await this.storyboardVersionService.copyHistoryToWorkingCopy({ projectId, chapterId }, versionId, body));
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

  @Post(":projectId/chapters/:chapterId/shots/:shotId/candidate-lock/preview")
  async previewCandidateLock(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("shotId") shotId: string,
    @Body() body: unknown,
  ) {
    return ok(await this.candidateDecisionService.preview(projectId, chapterId, shotId, body));
  }

  @Put(":projectId/chapters/:chapterId/shots/:shotId/candidate-lock")
  async commitCandidateLock(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("shotId") shotId: string,
    @Body() body: unknown,
  ) {
    return ok(await this.candidateDecisionService.commit(projectId, chapterId, shotId, body));
  }

  @Get(":projectId/chapters/:chapterId/shots/:shotId/candidate-lock/history")
  async candidateLockHistory(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("shotId") shotId: string,
    @Query("limit") limit?: string,
    @Query("beforeRevision") beforeRevision?: string,
  ) {
    return ok(await this.candidateDecisionService.history(projectId, chapterId, shotId, limit, beforeRevision));
  }

  @Put(":projectId/chapters/:chapterId/candidates/:candidateId/favorite")
  async favoriteCandidate(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("candidateId") candidateId: string,
  ) {
    return ok(await this.candidateDecisionService.favorite(projectId, chapterId, candidateId, true));
  }

  @Delete(":projectId/chapters/:chapterId/candidates/:candidateId/favorite")
  async unfavoriteCandidate(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("candidateId") candidateId: string,
  ) {
    return ok(await this.candidateDecisionService.favorite(projectId, chapterId, candidateId, false));
  }

  @Put(":projectId/chapters/:chapterId/candidates/:candidateId/rejection")
  async rejectCandidate(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("candidateId") candidateId: string,
  ) {
    return ok(await this.candidateDecisionService.rejection(projectId, chapterId, candidateId, true));
  }

  @Delete(":projectId/chapters/:chapterId/candidates/:candidateId/rejection")
  async restoreCandidate(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("candidateId") candidateId: string,
  ) {
    return ok(await this.candidateDecisionService.rejection(projectId, chapterId, candidateId, false));
  }

  @Get(":projectId/chapters/:chapterId/shots/:shotId/candidate-generation-preview")
  async getCandidateGenerationPreview(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("shotId") shotId: string,
    @Query("visualDescription") visualDescription?: string,
    @Query("action") action?: string,
    @Query("composition") composition?: string,
  ) {
    return ok(await this.projectsService.getCandidateGenerationPreview(projectId, chapterId, shotId, {
      ...(visualDescription?.trim() ? { visualDescription: visualDescription.trim() } : {}),
      ...(action?.trim() ? { action: action.trim() } : {}),
      ...(composition?.trim() ? { composition: composition.trim() } : {}),
    }));
  }

  @Post(":projectId/chapters/:chapterId/images/complete")
  async completeChapterImages(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.projectsService.completeChapterImages(projectId, chapterId));
  }

  @Get(":projectId/chapters/:chapterId/layout/working-copy")
  async getLayoutWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.layoutWorkingCopyService.get({ projectId, chapterId }));
  }

  @Get(":projectId/chapters/:chapterId/layout/source-catalog")
  async getLayoutSourceCatalog(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.layoutWorkingCopyService.sourceCatalog({ projectId, chapterId }));
  }

  @Get(":projectId/chapters/:chapterId/layout/legacy-status")
  async getLayoutLegacyStatus(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.layoutWorkingCopyService.legacyStatus({ projectId, chapterId }));
  }

  @Post(":projectId/chapters/:chapterId/layout/legacy/convert")
  async convertLegacyLayout(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.layoutWorkingCopyService.convertLegacy({ projectId, chapterId }));
  }

  @Post(":projectId/chapters/:chapterId/layout/legacy/rebuild")
  async rebuildLegacyLayout(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: InitializeLayoutWorkingCopyRequestV1,
  ) {
    return ok(await this.layoutWorkingCopyService.rebuildLegacy({ projectId, chapterId }, body));
  }

  @Get(":projectId/chapters/:chapterId/layout/fonts")
  async getLayoutFonts(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.layoutFontService.list({ projectId, chapterId }));
  }

  @Post(":projectId/chapters/:chapterId/layout/fonts/provision")
  async provisionLayoutFonts(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.layoutFontService.provision({ projectId, chapterId }));
  }

  @Get(":projectId/chapters/:chapterId/layout/fonts/:assetId/file")
  async getLayoutFontFile(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("assetId") assetId: string,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const file = await this.layoutFontService.readFontFile({ projectId, chapterId }, assetId);
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    response.setHeader("ETag", `\"${file.sha256}\"`);
    response.setHeader("Content-Disposition", `inline; filename=\"${encodeURIComponent(file.fileName)}\"`);
    return new StreamableFile(file.buffer);
  }

  @Post(":projectId/chapters/:chapterId/layout/working-copy/initialize")
  async initializeLayoutWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: InitializeLayoutWorkingCopyRequestV1,
  ) {
    return ok(await this.layoutWorkingCopyService.initialize({ projectId, chapterId }, body));
  }

  @Put(":projectId/chapters/:chapterId/layout/working-copy")
  async saveLayoutWorkingCopy(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: SaveLayoutWorkingCopyRequestV1,
  ) {
    return ok(await this.layoutWorkingCopyService.save({ projectId, chapterId }, body));
  }

  @Post(":projectId/chapters/:chapterId/layout/source-replacements/preview")
  async previewLayoutSourceReplacements(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: PreviewLayoutSourceReplacementRequestV1,
  ) {
    return ok(await this.layoutVersioningService.previewSourceReplacements({ projectId, chapterId }, body));
  }

  @Post(":projectId/chapters/:chapterId/layout/source-replacements/commit")
  async commitLayoutSourceReplacements(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: CommitLayoutSourceReplacementRequestV1,
  ) {
    return ok(await this.layoutVersioningService.commitSourceReplacements({ projectId, chapterId }, body));
  }

  @Post(":projectId/chapters/:chapterId/layout/preflight")
  async runLayoutPreflight(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: RunLayoutPreflightRequestV1,
  ) {
    return ok(await this.layoutVersioningService.preflight({ projectId, chapterId }, body));
  }

  @Post(":projectId/chapters/:chapterId/layout/revisions")
  async createLayoutRevision(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: CreateLayoutRevisionRequestV1,
  ) {
    return ok(await this.layoutVersioningService.createRevision({ projectId, chapterId }, body));
  }

  @Get(":projectId/chapters/:chapterId/layout/revisions")
  async listLayoutRevisions(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.layoutVersioningService.listRevisions({ projectId, chapterId }));
  }

  @Get(":projectId/chapters/:chapterId/layout/revisions/:revisionId")
  async getLayoutRevision(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("revisionId") revisionId: string,
  ) {
    return ok(await this.layoutVersioningService.getRevision({ projectId, chapterId }, revisionId));
  }

  @Post(":projectId/chapters/:chapterId/layout/revisions/:revisionId/restore-to-working-copy")
  async restoreLayoutRevision(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("revisionId") revisionId: string,
    @Body() body: RestoreLayoutRevisionRequestV1,
  ) {
    return ok(await this.layoutVersioningService.restoreRevision({ projectId, chapterId }, revisionId, body));
  }

  @Get(":projectId/chapters/:chapterId/layout/pending-commands/current")
  async getCurrentPendingLayoutCommand(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.layoutPendingCommandService.current({ projectId, chapterId }));
  }

  @Post(":projectId/chapters/:chapterId/layout/pending-commands/preview")
  async previewPendingLayoutCommand(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: CreatePendingEditorCommandSetRequestV1,
  ) {
    return ok(await this.layoutPendingCommandService.create({ projectId, chapterId }, body));
  }

  @Post(":projectId/chapters/:chapterId/layout/pending-commands/:pendingId/apply")
  async applyPendingLayoutCommand(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("pendingId") pendingId: string,
  ) {
    return ok(await this.layoutPendingCommandService.apply({ projectId, chapterId }, pendingId));
  }

  @Delete(":projectId/chapters/:chapterId/layout/pending-commands/:pendingId")
  async discardPendingLayoutCommand(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("pendingId") pendingId: string,
  ) {
    return ok(await this.layoutPendingCommandService.discard({ projectId, chapterId }, pendingId));
  }

  @Post(":projectId/chapters/:chapterId/exports/layout-publications")
  async createLayoutPublication(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Body() body: CreateLayoutPublicationRequestV1,
  ) {
    return ok(await this.projectsService.createLayoutPublication(projectId, chapterId, body));
  }

  @Get(":projectId/chapters/:chapterId/exports/layout-publications")
  async listLayoutPublications(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.projectsService.listLayoutPublications(projectId, chapterId));
  }

  @Get(":projectId/chapters/:chapterId/exports/layout-publications/:exportRevisionId")
  async getLayoutPublication(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("exportRevisionId") exportRevisionId: string,
  ) {
    return ok(await this.projectsService.getLayoutPublication(projectId, chapterId, exportRevisionId));
  }

  @Get(":projectId/chapters/:chapterId/exports/layout-publications/:exportRevisionId/artifacts/:assetId/file")
  async getLayoutPublicationArtifact(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("exportRevisionId") exportRevisionId: string,
    @Param("assetId") assetId: string,
    @Res({ passthrough: true }) response: { setHeader(name: string, value: string): void },
  ) {
    const file = await this.projectsService.readLayoutPublicationArtifact(projectId, chapterId, exportRevisionId, assetId);
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Cache-Control", "private, max-age=60");
    response.setHeader("ETag", `"${file.sha256}"`);
    response.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.fileName)}"`);
    return new StreamableFile(file.buffer);
  }

  @Post(":projectId/chapters/:chapterId/exports/layout-publications/:exportRevisionId/cancel")
  async cancelLayoutPublication(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
    @Param("exportRevisionId") exportRevisionId: string,
  ) {
    return ok(await this.projectsService.cancelLayoutPublication(projectId, chapterId, exportRevisionId));
  }

  @Post(":projectId/chapters/:chapterId/asset-package/export")
  async exportChapterAssetPackage(
    @Param("projectId") projectId: string,
    @Param("chapterId") chapterId: string,
  ) {
    return ok(await this.projectsService.exportAssetPackage(projectId, chapterId));
  }
}
