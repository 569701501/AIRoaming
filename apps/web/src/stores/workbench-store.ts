import { defineStore } from "pinia";
import {
  PROJECT_WORKFLOW_STEP_KEYS,
  type AIRuntimeModelItem,
  type AIRuntimeModelSelection,
  type ChapterDetail,
  type ChapterListItem,
  type ChapterStoryboard,
  type CompleteChapterResponse,
  type CompleteChapterRequest,
  type GenerateCharacterReferenceRequest,
  type CreateProjectRequest,
  type DialogueMessageItem,
  type DialogueStreamEvent,
  type DialogueThread,
  type DialogueToolResult,
  type GenerationTaskItem,
  type HealthResponse,
  type ProjectCharacter,
  type ProjectListItem,
  type ProjectWorkflowStepKey,
  type ProjectWorkflowStepStatus,
  type SaveChapterDraftRequest,
  type UpdateProjectCharacterRequest,
  type SendDialogueMessageRequest,
  type StoryStructureJson,
  type ChapterStoryStructure,
  type StoryboardJson,
  type UpdateProjectDraftRequest,
  type WorkbenchSnapshot,
  type WorkspaceInfo,
} from "@airoaming/shared";
import { api } from "../services/api";
import { getCurrentChapterId, getCurrentChapterSourceText } from "../utils/workbench-chapter";

const workflowStepOrder = new Map<ProjectWorkflowStepKey, number>(
  PROJECT_WORKFLOW_STEP_KEYS.map((key, index) => [key, index]),
);

function toChapterListItem(chapter: ChapterDetail): ChapterListItem {
  return {
    id: chapter.id,
    projectId: chapter.projectId,
    slug: chapter.slug,
    order: chapter.order,
    title: chapter.title,
    status: chapter.status,
    storyboardStatus: chapter.storyboardStatus,
    currentScriptVersionId: chapter.currentScriptVersionId,
    currentStoryVersionId: chapter.currentStoryVersionId,
    summary: chapter.summary,
    sourceTextPreview: chapter.sourceTextPreview,
    lastScriptRevision: chapter.lastScriptRevision,
    createdAt: chapter.createdAt,
    updatedAt: chapter.updatedAt,
    completedAt: chapter.completedAt,
  };
}

function resolveChapterList(
  existingChapters: ChapterListItem[],
  nextChapters: ChapterListItem[] | null,
  currentChapter: ChapterDetail,
): ChapterListItem[] {
  if (nextChapters && nextChapters.length > 0) {
    return nextChapters
      .map((chapter) => (chapter.id === currentChapter.id ? toChapterListItem(currentChapter) : chapter))
      .sort((left, right) => left.order - right.order);
  }

  const byId = new Map(existingChapters.map((chapter) => [chapter.id, chapter]));
  byId.set(currentChapter.id, toChapterListItem(currentChapter));
  return [...byId.values()].sort((left, right) => left.order - right.order);
}

function isProjectCharacterLibraryReady(characters: ProjectCharacter[]): boolean {
  const required = characters.filter((character) => character.level === "lead" || character.level === "recurring");
  return required.length > 0 && required.every((character) =>
    (character.status === "finalized" || character.status === "in_use")
    && Boolean(character.primaryReferenceAssetId)
    && character.primaryReferenceKind === "turnaround_4view",
  );
}

function resolveWorkflowCurrentStepKey(chapter: ChapterDetail, charactersReady: boolean): ProjectWorkflowStepKey {
  if (chapter.status !== "draft" && !charactersReady) {
    return "project_characters";
  }

  switch (chapter.status) {
    case "script_done":
      return "story_structure";
    case "structured":
      return "storyboard";
    case "storyboard_done":
      return "image_candidates";
    case "images_done":
      return "layout_export";
    case "layout_done":
    case "exported":
      return "asset_package";
    case "draft":
    default:
      return "project_story";
  }
}

function resolveWorkflowStepStatus(
  stepKey: ProjectWorkflowStepKey,
  currentStepKey: ProjectWorkflowStepKey,
  chapterStatus: ChapterDetail["status"],
  charactersReady: boolean,
): ProjectWorkflowStepStatus {
  if (chapterStatus === "exported") {
    return "done";
  }

  const stepIndex = workflowStepOrder.get(stepKey) ?? 0;
  const currentIndex = workflowStepOrder.get(currentStepKey) ?? 0;
  if (stepIndex < currentIndex) {
    return "done";
  }
  if (stepIndex === currentIndex) {
    return "active";
  }
  if (stepKey === "story_structure" && chapterStatus !== "draft" && !charactersReady) {
    return "blocked";
  }
  return "waiting";
}

function getWorkflowStepSummary(
  stepKey: ProjectWorkflowStepKey,
  status: ProjectWorkflowStepStatus,
  chapter: ChapterDetail,
): string {
  if (status === "done") {
    return getWorkflowDoneSummary(stepKey);
  }
  if (status === "waiting") {
    return getWorkflowWaitingSummary(stepKey);
  }
  if (status === "blocked") {
    return getWorkflowWaitingSummary(stepKey);
  }

  switch (stepKey) {
    case "project_story":
      return chapter.sourceText.trim()
        ? "当前章节已有草稿，保存后可点击完成本章。"
        : "补充当前章节剧本，保存草稿后继续推进。";
    case "project_characters":
      return "提取主角和常驻角色，并确认四视图角色定稿图。";
    case "story_structure":
      return "当前章节剧本已完成，可以运行 story_parse 生成结构化剧情。";
    case "storyboard":
      return "当前章节剧情结构已就绪，可以生成和编辑分镜。";
    case "image_candidates":
      return "当前章节分镜已就绪，可以生成候选图并锁定结果。";
    case "layout_export":
      return "当前章节图片结果已就绪，可以排版并导出。";
    case "asset_package":
      return "当前章节或项目导出已就绪，可以归档素材包。";
  }
}

function getWorkflowDoneSummary(stepKey: ProjectWorkflowStepKey): string {
  switch (stepKey) {
    case "project_story":
      return "章节剧本已完成并写入版本快照。";
    case "project_characters":
      return "项目角色库已完成。";
    case "story_structure":
      return "结构化剧情已完成。";
    case "storyboard":
      return "分镜已完成。";
    case "image_candidates":
      return "候选图或锁定图已完成。";
    case "layout_export":
      return "排版导出已完成。";
    case "asset_package":
      return "素材包已归档。";
  }
}

function getWorkflowWaitingSummary(stepKey: ProjectWorkflowStepKey): string {
  switch (stepKey) {
    case "project_story":
      return "等待进入剧本阶段。";
    case "project_characters":
      return "需要先完成当前章节剧本。";
    case "story_structure":
      return "需要先完成项目角色库。";
    case "storyboard":
      return "需要先完成当前章节剧情结构。";
    case "image_candidates":
      return "需要先完成当前章节分镜。";
    case "layout_export":
      return "需要先锁定当前章节候选图。";
    case "asset_package":
      return "需要先完成章节排版和导出。";
  }
}

function getWorkflowStepEvidence(projectId: string, chapter: ChapterDetail, stepKey: ProjectWorkflowStepKey): string {
  switch (stepKey) {
    case "project_story":
      return `/workspace/projects/${projectId}/chapters/${chapter.slug}/script.md`;
    case "project_characters":
      return `/workspace/projects/${projectId}/shared/characters.json`;
    case "story_structure":
      return `/workspace/projects/${projectId}/chapters/${chapter.slug}/structure.json`;
    case "storyboard":
      return `/workspace/projects/${projectId}/chapters/${chapter.slug}/storyboard.json`;
    case "image_candidates":
      return `/workspace/projects/${projectId}/chapters/${chapter.slug}/candidates/`;
    case "layout_export":
      return `/workspace/projects/${projectId}/chapters/${chapter.slug}/layout/`;
    case "asset_package":
      return `/workspace/projects/${projectId}/exports/packages/`;
  }
}

function patchWorkflowForChapter(snapshot: WorkbenchSnapshot, chapter: ChapterDetail): WorkbenchSnapshot["workflow"] {
  const charactersReady = isProjectCharacterLibraryReady(snapshot.characters);
  const currentStepKey = resolveWorkflowCurrentStepKey(chapter, charactersReady);
  const steps = snapshot.workflow.steps.map((step) => {
    const status = resolveWorkflowStepStatus(step.key, currentStepKey, chapter.status, charactersReady);
    return {
      ...step,
      status,
      summary: getWorkflowStepSummary(step.key, status, chapter),
      evidence: getWorkflowStepEvidence(snapshot.project.id, chapter, step.key),
    };
  });

  return {
    ...snapshot.workflow,
    currentChapterId: chapter.id,
    currentStepKey,
    steps,
    updatedAt: chapter.updatedAt,
  };
}

function getProjectStatusFromChapter(chapter: ChapterDetail, charactersReady = false): ProjectListItem["status"] {
  if (charactersReady) {
    return "characters_ready";
  }
  return chapter.sourceText.trim().length > 0 ? "story_ready" : "draft";
}

function getSceneName(storyStructure: ChapterStoryStructure | null, sceneId: string | null): string {
  if (!storyStructure || !sceneId) {
    return "";
  }

  return storyStructure.structureJson.scenes.find((scene) => scene.id === sceneId)?.name ?? "";
}

function mapStoryboardShots(storyboard: ChapterStoryboard | null, storyStructure: ChapterStoryStructure | null, chapterId: string): WorkbenchSnapshot["shots"] {
  if (!storyboard) {
    return [];
  }

  return storyboard.storyboardJson.shots.map((shot) => {
    const scene = storyStructure?.structureJson.scenes.find((item) => item.id === shot.sceneId) ?? null;
    const beat = storyStructure?.structureJson.beats.find((item) => item.id === shot.beatId) ?? null;
    return {
      ...shot,
      chapterId,
      sceneName: scene?.name ?? "",
      characterIds: shot.characterIds,
      characters: shot.characterIds.length > 0 ? shot.characterIds : beat?.characters ?? [],
    };
  });
}

interface WorkbenchState {
  health: HealthResponse | null;
  workspace: WorkspaceInfo | null;
  projects: ProjectListItem[];
  activeProjectId: string | null;
  activeChapterId: string | null;
  activeStepKey: string;
  snapshot: WorkbenchSnapshot | null;
  dialogueThread: DialogueThread | null;
  chapterCompletionPrompt: ChapterCompletionPrompt | null;
  dialogueSending: boolean;
  dialogueError: string | null;
  dialogueNotice: string | null;
  runtimeModels: AIRuntimeModelItem[];
  selectedDialogueModel: AIRuntimeModelSelection | null;
  runtimeModelError: string | null;
  tasks: GenerationTaskItem[];
  loading: boolean;
  error: string | null;
}

export interface ChapterCompletionPrompt {
  completedChapterId: string;
  completedChapterTitle: string;
  nextChapterId: string | null;
  nextChapterTitle: string | null;
}

export const useWorkbenchStore = defineStore("workbench", {
  state: (): WorkbenchState => ({
    health: null,
    workspace: null,
    projects: [],
    activeProjectId: null,
    activeChapterId: null,
    activeStepKey: "project_story",
    snapshot: null,
    dialogueThread: null,
    chapterCompletionPrompt: null,
    dialogueSending: false,
    dialogueError: null,
    dialogueNotice: null,
    runtimeModels: [],
    selectedDialogueModel: null,
    runtimeModelError: null,
    tasks: [],
    loading: false,
    error: null,
  }),
  getters: {
    runningTaskCount: (state) => state.tasks.filter((task) => task.status === "queued" || task.status === "running").length,
    completedTaskCount: (state) => state.tasks.filter((task) => task.status === "succeeded").length,
  },
  actions: {
    async refresh() {
      this.loading = true;
      this.error = null;
      try {
        const [health, workspace, projects, tasks] = await Promise.all([
          api.health(),
          api.workspace(),
          api.listProjects(),
          api.listTasks(),
        ]);
        this.health = health;
        this.workspace = workspace;
        this.projects = projects.items;
        this.tasks = tasks.items;
        if (this.activeProjectId) {
          const workbench = await api.workbench(this.activeProjectId, this.activeChapterId);
          this.snapshot = workbench.snapshot;
          this.activeChapterId = workbench.snapshot.currentChapter?.id ?? null;
          const dialogue = await api.dialogueThread(this.activeProjectId, this.activeStepKey, this.getActiveDialogueChapterId());
          this.dialogueThread = dialogue.thread;
        } else {
          this.snapshot = null;
          this.dialogueThread = null;
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : "工作台连接失败";
        if (this.activeProjectId) {
          this.snapshot = null;
          this.dialogueThread = null;
        }
      } finally {
        this.loading = false;
      }
    },
    getActiveDialogueChapterId(): string | null {
      return ["project_story", "story_structure", "storyboard", "image_candidates", "layout_export"].includes(this.activeStepKey)
        ? this.activeChapterId
        : null;
    },
    async createProject(input: CreateProjectRequest): Promise<ProjectListItem | null> {
      this.loading = true;
      this.error = null;
      try {
        const result = await api.createProject(input);
        this.activeProjectId = result.project.id;
        this.activeChapterId = result.project.currentChapterId ?? null;
        this.activeStepKey = "project_story";
        await this.refresh();
        return result.project;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "项目创建失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async openProject(
      projectId: string,
      stepKey = "project_story",
      chapterId: string | null = null,
      options: { preserveSnapshot?: boolean } = {},
    ) {
      const shouldPreserveSnapshot = Boolean(options.preserveSnapshot && this.activeProjectId === projectId && this.snapshot);
      this.activeProjectId = projectId;
      this.activeChapterId = chapterId;
      this.activeStepKey = stepKey;
      if (!shouldPreserveSnapshot) {
        this.snapshot = null;
      }
      this.dialogueThread = null;
      this.dialogueError = null;
      this.dialogueNotice = null;
      if (!this.chapterCompletionPrompt || this.chapterCompletionPrompt.completedChapterId !== chapterId) {
        this.chapterCompletionPrompt = null;
      }
      await this.refresh();
    },
    async loadRuntimeModels() {
      this.runtimeModelError = null;
      try {
        const result = await api.listRuntimeModels();
        this.runtimeModels = result.items;

        const defaultModel = result.items.find((item) => item.default) ?? result.items[0];
        this.selectedDialogueModel = defaultModel
          ? {
              providerId: defaultModel.providerId,
              modelId: defaultModel.modelId,
            }
          : result.defaultModel;
      } catch (error) {
        this.runtimeModelError = error instanceof Error ? error.message : "模型列表加载失败";
      }
    },
    selectDialogueModel(model: AIRuntimeModelSelection) {
      this.selectedDialogueModel = model;
    },
    applyChapterUpdate(chapter: ChapterDetail, chapters: ChapterListItem[] | null = null) {
      if (!this.snapshot) {
        return;
      }

      const nextChapters = resolveChapterList(this.snapshot.chapters, chapters, chapter);
      const workflow = patchWorkflowForChapter(this.snapshot, chapter);
      const hasStory = chapter.sourceText.trim().length > 0;
      const storyStructure = this.snapshot.storyStructure?.chapterId === chapter.id && chapter.currentStoryVersionId
        ? this.snapshot.storyStructure
        : null;
      const storyboard = this.snapshot.storyboard?.chapterId === chapter.id && chapter.status === "storyboard_done"
        ? this.snapshot.storyboard
        : null;
      this.snapshot = {
        ...this.snapshot,
        project: {
          ...this.snapshot.project,
          status: getProjectStatusFromChapter(chapter, isProjectCharacterLibraryReady(this.snapshot.characters)),
          updatedAt: chapter.updatedAt,
        },
        chapters: nextChapters,
        currentChapter: chapter,
        storyStructure,
        storyboard,
        workflow,
        stages: workflow.steps,
        story: {
          ...this.snapshot.story,
          id: chapter.currentStoryVersionId ?? "chapter_script_draft",
          chapterId: chapter.id,
          title: chapter.title || this.snapshot.project.storyTitle,
          sourceText: chapter.sourceText,
          summary: storyStructure?.structureJson.synopsis || (hasStory ? "故事已进入项目，下一步执行结构化剧情。" : "还没有故事原文。"),
          beats: (storyStructure?.structureJson.beats ?? []).map((beat) => ({
            id: beat.id,
            order: beat.order,
            summary: beat.summary,
            sceneName: getSceneName(storyStructure, beat.sceneId),
            characterNames: beat.characters,
          })),
        },
        shots: mapStoryboardShots(storyboard, storyStructure, chapter.id),
      };
      this.activeChapterId = chapter.id;
      this.patchProjectPreviewFromChapter(chapter, nextChapters.length);
    },
    applyStoryStructureUpdate(storyStructure: ChapterStoryStructure, chapter: ChapterDetail, chapters: ChapterListItem[] | null = null) {
      this.applyChapterUpdate(chapter, chapters);
      if (!this.snapshot) {
        return;
      }

      this.snapshot = {
        ...this.snapshot,
        storyStructure,
        storyboard: null,
        pendingStoryboard: null,
        shots: [],
        story: {
          ...this.snapshot.story,
          id: storyStructure.id,
          summary: storyStructure.structureJson.synopsis,
          beats: storyStructure.structureJson.beats.map((beat) => ({
            id: beat.id,
            order: beat.order,
            summary: beat.summary,
            sceneName: getSceneName(storyStructure, beat.sceneId),
            characterNames: beat.characters,
          })),
        },
      };
    },
    applyStoryboardUpdate(storyboard: ChapterStoryboard, chapter: ChapterDetail, chapters: ChapterListItem[] | null = null) {
      this.applyChapterUpdate(chapter, chapters);
      if (!this.snapshot) {
        return;
      }

      this.snapshot = {
        ...this.snapshot,
        storyboard,
        pendingStoryboard: null,
        shots: mapStoryboardShots(storyboard, this.snapshot.storyStructure, chapter.id),
      };
    },
    applyPendingStoryboardUpdate(storyboard: ChapterStoryboard, chapter: ChapterDetail | null = null, chapters: ChapterListItem[] | null = null) {
      if (chapter) {
        this.applyChapterUpdate(chapter, chapters);
      }
      if (!this.snapshot) {
        return;
      }

      this.snapshot = {
        ...this.snapshot,
        pendingStoryboard: storyboard,
      };
    },
    applyProjectCharactersUpdate(characters: ProjectCharacter[], assets: WorkbenchSnapshot["assets"] | null = null) {
      if (!this.snapshot) {
        return;
      }

      const nextSnapshot: WorkbenchSnapshot = {
        ...this.snapshot,
        characters,
        assets: assets ?? this.snapshot.assets,
      };
      const currentChapter = nextSnapshot.currentChapter;
      if (currentChapter) {
        nextSnapshot.workflow = patchWorkflowForChapter(nextSnapshot, currentChapter);
        nextSnapshot.stages = nextSnapshot.workflow.steps;
        nextSnapshot.project = {
          ...nextSnapshot.project,
          status: getProjectStatusFromChapter(currentChapter, isProjectCharacterLibraryReady(characters)),
        };
      }
      this.snapshot = nextSnapshot;
    },
    patchProjectPreviewFromChapter(chapter: ChapterDetail, chapterCount: number) {
      const exists = this.projects.some((project) => project.id === chapter.projectId);
      if (!exists) {
        return;
      }

      this.projects = this.projects
        .map((project) => {
          if (project.id !== chapter.projectId) {
            return project;
          }

          return {
            ...project,
            status: getProjectStatusFromChapter(chapter, isProjectCharacterLibraryReady(this.snapshot?.characters ?? [])),
            currentChapterId: chapter.id,
            chapterCount,
            sourceTextPreview: chapter.sourceText.slice(0, 96),
            updatedAt: chapter.updatedAt,
          };
        })
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    },
    async deleteProject(projectId: string) {
      this.loading = true;
      this.error = null;
      try {
        await api.deleteProject(projectId);
        if (this.activeProjectId === projectId) {
          this.activeProjectId = null;
          this.activeChapterId = null;
          this.activeStepKey = "project_story";
          this.snapshot = null;
          this.dialogueThread = null;
          this.dialogueNotice = null;
        }
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "项目删除失败";
      } finally {
        this.loading = false;
      }
    },
    async saveProjectDraft(input: UpdateProjectDraftRequest) {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.updateProjectDraft(projectId, input);
        this.snapshot = result.snapshot;
        this.activeChapterId = result.snapshot.currentChapter?.id ?? this.activeChapterId;
        this.projects = this.projects
          .map((project) => (project.id === result.project.id ? result.project : project))
          .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
      } catch (error) {
        this.error = error instanceof Error ? error.message : "故事草稿保存失败";
      } finally {
        this.loading = false;
      }
    },
    async saveChapterDraft(chapterId: string, input: SaveChapterDraftRequest) {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.saveChapterDraft(projectId, chapterId, input);
        this.applyChapterUpdate(result.chapter, result.chapters);
      } catch (error) {
        this.error = error instanceof Error ? error.message : "章节草稿保存失败";
      } finally {
        this.loading = false;
      }
    },
    async completeChapter(chapterId: string, input: CompleteChapterRequest): Promise<CompleteChapterResponse | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const completed = await api.completeChapter(projectId, chapterId, input);
        this.applyChapterUpdate(completed.completedChapter, completed.chapters);
        const nextChapter = completed.chapters.find((item) => item.order > completed.completedChapter.order) ?? null;
        this.chapterCompletionPrompt = {
          completedChapterId: completed.completedChapter.id,
          completedChapterTitle: completed.completedChapter.title,
          nextChapterId: nextChapter?.id ?? null,
          nextChapterTitle: nextChapter?.title ?? null,
        };
        return completed;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "完成本章失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    clearChapterCompletionPrompt() {
      this.chapterCompletionPrompt = null;
    },
    async confirmStoryStructure(chapterId: string, structureJson: StoryStructureJson): Promise<ChapterStoryStructure | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.confirmChapterStoryStructure(projectId, chapterId, { structureJson });
        this.applyStoryStructureUpdate(result.storyStructure, result.chapter, result.chapters);
        this.dialogueNotice = `已确认「${result.chapter.title}」的剧情结构。`;
        return result.storyStructure;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "确认剧情结构失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async updateStoryStructure(chapterId: string, structureJson: StoryStructureJson): Promise<ChapterStoryStructure | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.updateChapterStoryStructure(projectId, chapterId, { structureJson });
        this.applyStoryStructureUpdate(result.storyStructure, result.chapter, result.chapters);
        return result.storyStructure;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "更新剧情结构失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async confirmStoryboard(chapterId: string, storyboardJson: StoryboardJson): Promise<ChapterStoryboard | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.confirmChapterStoryboard(projectId, chapterId, { storyboardJson });
        this.applyStoryboardUpdate(result.storyboard, result.chapter, result.chapters);
        this.dialogueNotice = `已确认「${result.chapter.title}」的分镜。`;
        return result.storyboard;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "确认分镜失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async savePendingStoryboard(chapterId: string, storyboardJson: StoryboardJson): Promise<ChapterStoryboard | null> {
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.savePendingChapterStoryboard(projectId, chapterId, { storyboardJson });
        this.applyPendingStoryboardUpdate(result.storyboard, result.chapter, result.chapters);
        return result.storyboard;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "保存待确认分镜失败";
        return null;
      }
    },
    async updateStoryboard(chapterId: string, storyboardJson: StoryboardJson): Promise<ChapterStoryboard | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.updateChapterStoryboard(projectId, chapterId, { storyboardJson });
        this.applyStoryboardUpdate(result.storyboard, result.chapter, result.chapters);
        return result.storyboard;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "更新分镜失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async extractProjectCharacters(): Promise<ProjectCharacter[] | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.extractProjectCharacters(projectId, { source: "auto" });
        this.applyProjectCharactersUpdate(result.characters, result.assets);
        this.dialogueNotice = `已提取 ${result.characters.length} 个项目角色。`;
        return result.characters;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "提取项目角色失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async updateProjectCharacter(characterId: string, input: UpdateProjectCharacterRequest): Promise<ProjectCharacter | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.updateProjectCharacter(projectId, characterId, input);
        this.applyProjectCharactersUpdate(result.characters, result.assets);
        return result.character;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "更新项目角色失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async generateCharacterReference(characterId: string, input: GenerateCharacterReferenceRequest): Promise<ProjectCharacter | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.generateCharacterReference(projectId, characterId, input);
        this.applyProjectCharactersUpdate(result.characters, result.assets);
        this.dialogueNotice = `已生成「${result.character.name}」的角色参考图。`;
        return result.character;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "生成角色参考图失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async confirmCharacterReference(characterId: string, assetId: string): Promise<ProjectCharacter | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const result = await api.confirmCharacterReference(projectId, characterId, { assetId });
        this.applyProjectCharactersUpdate(result.characters, result.assets);
        this.dialogueNotice = `已确认「${result.character.name}」的角色定稿图。`;
        return result.character;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "确认角色定稿失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async clearCurrentChapterScript(): Promise<ChapterDetail | null> {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const chapterId = this.snapshot ? getCurrentChapterId(this.snapshot) : this.activeChapterId;
        if (!chapterId) {
          throw new Error("请先打开一个章节");
        }

        const result = await api.clearChapterScript(projectId, chapterId);
        this.applyChapterUpdate(result.chapter, result.chapters);
        this.dialogueNotice = `已清空「${result.chapter.title}」的剧本正文，其他章节未受影响。`;
        return result.chapter;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "清空当前章节失败";
        return null;
      } finally {
        this.loading = false;
      }
    },
    async sendDialogueMessage(input: SendDialogueMessageRequest) {
      this.dialogueSending = true;
      this.dialogueError = null;
      this.dialogueNotice = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const stepKey = this.activeStepKey;
        await api.sendDialogueMessageStream(projectId, stepKey, {
          ...input,
          stepKey,
          model: this.selectedDialogueModel ?? undefined,
        }, (event) => this.applyDialogueStreamEvent(event));
      } catch (error) {
        this.dialogueError = error instanceof Error ? error.message : "对话发送失败";
      } finally {
        this.dialogueSending = false;
      }
    },
    applyDialogueStreamEvent(event: DialogueStreamEvent) {
      if (event.type === "dialogue.message.created" && event.thread) {
        this.dialogueThread = event.thread;
        return;
      }

      if (event.type === "dialogue.message.delta") {
        this.updateDialogueMessageContent(event.messageId, event.content ?? "", "running");
        return;
      }

      if (event.type === "dialogue.message.completed") {
        if (event.thread) {
          this.dialogueThread = event.thread;
          return;
        }
        if (event.assistantMessage) {
          this.upsertDialogueMessage(event.assistantMessage);
        }
        return;
      }

      if (event.type === "dialogue.tool_result.created") {
        if (event.thread) {
          this.dialogueThread = event.thread;
        }
        if (event.toolResult) {
          this.upsertDialogueToolResult(event.toolResult);
          if (event.toolResult.scriptOutline && this.snapshot) {
            this.snapshot = {
              ...this.snapshot,
              scriptOutline: event.toolResult.scriptOutline,
            };
          }
          if (event.toolResult.characters && this.snapshot) {
            this.applyProjectCharactersUpdate(event.toolResult.characters);
          }
          if (event.toolResult.tool === "generate_storyboard" && event.toolResult.status === "needs_user_confirmation" && event.toolResult.storyboard) {
            this.applyPendingStoryboardUpdate(event.toolResult.storyboard);
          }
          const shouldPatchChapter = event.toolResult.status === "succeeded" && [
            "import_script_to_chapters",
            "generate_script_from_outline",
            "generate_script_from_seed",
            "update_chapter_draft",
            "confirm_story_structure",
            "confirm_storyboard",
          ].includes(event.toolResult.tool);
          if (shouldPatchChapter) {
            void this.applyToolResultChapterUpdate(event.toolResult);
          }
        }
        return;
      }

      if (event.type === "dialogue.error") {
        this.dialogueError = event.error?.message ?? "对话发送失败";
        if (event.thread) {
          this.dialogueThread = event.thread;
        } else if (event.assistantMessage) {
          this.upsertDialogueMessage(event.assistantMessage);
        }
      }
    },
    updateDialogueMessageContent(messageId: string | undefined, content: string, status: DialogueMessageItem["status"]) {
      if (!messageId || !this.dialogueThread) {
        return;
      }

      this.dialogueThread = {
        ...this.dialogueThread,
        messages: this.dialogueThread.messages.map((message) => {
          if (message.id !== messageId) {
            return message;
          }

          return {
            ...message,
            content,
            status,
          };
        }),
      };
    },
    upsertDialogueMessage(nextMessage: DialogueMessageItem) {
      if (!this.dialogueThread) {
        return;
      }

      const exists = this.dialogueThread.messages.some((message) => message.id === nextMessage.id);
      this.dialogueThread = {
        ...this.dialogueThread,
        messages: exists
          ? this.dialogueThread.messages.map((message) => (message.id === nextMessage.id ? nextMessage : message))
          : [...this.dialogueThread.messages, nextMessage],
      };
    },
    upsertDialogueToolResult(nextResult: DialogueToolResult) {
      if (!this.dialogueThread) {
        return;
      }

      const toolResults = this.dialogueThread.toolResults ?? [];
      const exists = toolResults.some((result) => result.id === nextResult.id);
      this.dialogueThread = {
        ...this.dialogueThread,
        toolResults: exists
          ? toolResults.map((result) => (result.id === nextResult.id ? nextResult : result))
          : [...toolResults, nextResult],
      };
    },
    async applyToolResultChapterUpdate(toolResult: DialogueToolResult) {
      const projectId = this.activeProjectId;
      if (!projectId) {
        return;
      }

      const currentChapter = toolResult.currentChapter
        ?? (toolResult.currentChapterId ? (await api.getChapter(projectId, toolResult.currentChapterId)).chapter : null);
      if (!currentChapter) {
        return;
      }

      if (toolResult.storyStructure && toolResult.status === "succeeded") {
        this.applyStoryStructureUpdate(toolResult.storyStructure, currentChapter, toolResult.chapters);
        return;
      }

      if (toolResult.storyboard && toolResult.status === "succeeded") {
        this.applyStoryboardUpdate(toolResult.storyboard, currentChapter, toolResult.chapters);
        return;
      }

      this.applyChapterUpdate(currentChapter, toolResult.chapters);
    },
    closeProject() {
      this.activeProjectId = null;
      this.activeChapterId = null;
      this.activeStepKey = "project_story";
      this.snapshot = null;
      this.dialogueThread = null;
      this.dialogueError = null;
      this.dialogueNotice = null;
    },
    async createMockStoryTask() {
      this.loading = true;
      this.error = null;
      try {
        const projectId = this.activeProjectId;
        if (!projectId) {
          throw new Error("请先进入项目");
        }
        const snapshot = this.snapshot;
        if (!snapshot) {
          throw new Error("项目快照还没有加载");
        }
        const chapterId = getCurrentChapterId(snapshot);
        await api.createTask({
          projectId,
          type: "story_parse",
          target: {
            type: "chapter",
            id: chapterId ?? projectId,
            chapterId: chapterId ?? undefined,
          },
          input: {
            chapterId,
            sourceText: getCurrentChapterSourceText(snapshot),
            mode: "faithful",
            language: "zh-CN",
          },
          options: {
            provider: "mock",
          },
        });
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "任务创建失败";
      } finally {
        this.loading = false;
      }
    },
    async cancelTask(taskId: string) {
      this.loading = true;
      this.error = null;
      try {
        await api.cancelTask(taskId);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : "任务取消失败";
      } finally {
        this.loading = false;
      }
    },
  },
});
