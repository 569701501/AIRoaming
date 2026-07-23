import {
  PROJECT_WORKFLOW_SCHEMA_VERSION,
  PROJECT_WORKFLOW_STEPS,
  type ChapterStatus,
  type ProjectWorkflow,
  type ProjectWorkflowStep,
  type ProjectWorkflowStepKey,
} from "@airoaming/shared";
import type { LocalChapter, LocalProject } from "./local-types.js";
import { DEFAULT_CHAPTER_SLUG } from "./project-domain.util.js";

const workflowStepOrder = new Map<ProjectWorkflowStepKey, number>(
  PROJECT_WORKFLOW_STEPS.map((step, index) => [step.key, index]),
);

/**
 * 项目工作流状态机(从 projects.service 抽出,见任务 2026-06-21_ProjectsService拆分 候选E)。
 * 纯逻辑:根据 project + chapter 推导 workflow。
 * isChapterImagePreflightReady 的判断依赖 buildImagePreflightJson(候选②业务方法),由调用方传入 isPreflightReady。
 */
export function buildProjectWorkflow(
  project: LocalProject,
  currentChapter: LocalChapter | null,
  isPreflightReady: boolean,
): ProjectWorkflow {
  const currentStepKey = resolveWorkflowCurrentStepKey(currentChapter, isPreflightReady);
  return {
    schemaVersion: PROJECT_WORKFLOW_SCHEMA_VERSION,
    projectId: project.id,
    currentChapterId: currentChapter?.id ?? null,
    currentStepKey,
    steps: PROJECT_WORKFLOW_STEPS.map((step) => toWorkflowStep(project, currentChapter, step, currentStepKey)),
    updatedAt: project.updatedAt,
  };
}

function toWorkflowStep(
  project: LocalProject,
  currentChapter: LocalChapter | null,
  definition: (typeof PROJECT_WORKFLOW_STEPS)[number],
  currentStepKey: ProjectWorkflowStepKey,
): ProjectWorkflowStep {
  const status = resolveWorkflowStepStatus(
    definition.key,
    currentStepKey,
    currentChapter?.status ?? "draft",
  );
  return {
    key: definition.key,
    label: definition.label,
    status,
    scope: definition.scope,
    summary: getWorkflowStepSummary(definition.key, status, currentChapter),
    evidence: getWorkflowStepEvidence(project.id, currentChapter, definition.key),
    completionCriteria: [...definition.completionCriteria],
  };
}

export function resolveWorkflowCurrentStepKey(
  chapter: LocalChapter | null,
  isPreflightReady: boolean,
): ProjectWorkflowStepKey {
  switch (chapter?.status) {
    case "script_done":
      return "story_structure";
    case "structured":
      return "storyboard";
    case "storyboard_done":
      return isPreflightReady ? "image_candidates" : "image_preflight";
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
  chapterStatus: ChapterStatus,
): ProjectWorkflowStep["status"] {
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
  return "waiting";
}

function getWorkflowStepSummary(
  stepKey: ProjectWorkflowStepKey,
  status: ProjectWorkflowStep["status"],
  chapter: LocalChapter | null,
): string {
  if (status === "done") {
    return getWorkflowDoneSummary(stepKey);
  }
  if (status === "waiting" || status === "blocked") {
    return getWorkflowWaitingSummary(stepKey);
  }

  switch (stepKey) {
    case "project_story":
      return chapter?.sourceText.trim()
        ? "当前章节已有草稿，保存后可点击完成本章。"
        : "补充当前章节剧本，保存草稿后继续推进。";
    case "story_structure":
      return "当前章节剧本已完成，可以运行 story_parse 生成结构化剧情。";
    case "storyboard":
      return "当前章节剧情结构已就绪，可以生成和编辑分镜。";
    case "image_preflight":
      return "当前章节分镜已确认，检查角色参考图、镜头绑定和出图输入。";
    case "image_candidates":
      return "出图准备已通过，可以生成候选图并锁定结果。";
    case "layout_export":
      return "当前章节图片结果已就绪，可以排版并导出。";
    case "asset_package":
      return "当前章节或项目导出已就绪，可以归档素材包。";
  }
  return "继续推进当前工作流步骤。";
}

function getWorkflowDoneSummary(stepKey: ProjectWorkflowStepKey): string {
  switch (stepKey) {
    case "project_story":
      return "章节剧本已完成并写入版本快照。";
    case "story_structure":
      return "结构化剧情已完成。";
    case "storyboard":
      return "分镜已完成。";
    case "image_preflight":
      return "出图准备已完成。";
    case "image_candidates":
      return "候选图或锁定图已完成。";
    case "layout_export":
      return "漫画成稿已完成。";
    case "asset_package":
      return "素材包已归档。";
  }
  return "该步骤已完成。";
}

function getWorkflowWaitingSummary(stepKey: ProjectWorkflowStepKey): string {
  switch (stepKey) {
    case "project_story":
      return "等待进入剧本阶段。";
    case "story_structure":
      return "需要先完成当前章节剧本。";
    case "storyboard":
      return "需要先完成当前章节剧情结构。";
    case "image_preflight":
      return "需要先确认当前章节分镜。";
    case "image_candidates":
      return "需要先通过出图准备。";
    case "layout_export":
      return "需要先锁定当前章节候选图。";
    case "asset_package":
      return "需要先完成章节排版和导出。";
  }
  return "等待前置步骤完成。";
}

function getWorkflowStepEvidence(
  projectId: string,
  chapter: LocalChapter | null,
  stepKey: ProjectWorkflowStepKey,
): string {
  const chapterSlug = chapter?.slug ?? DEFAULT_CHAPTER_SLUG;
  switch (stepKey) {
    case "project_story":
      return `/workspace/projects/${projectId}/chapters/${chapterSlug}/script.md`;
    case "story_structure":
      return `/workspace/projects/${projectId}/chapters/${chapterSlug}/structure.json`;
    case "storyboard":
      return `/workspace/projects/${projectId}/chapters/${chapterSlug}/storyboard.json`;
    case "image_preflight":
      return `/workspace/projects/${projectId}/chapters/${chapterSlug}/preflight.json`;
    case "image_candidates":
      return `/workspace/projects/${projectId}/chapters/${chapterSlug}/candidates/`;
    case "layout_export":
      return `/workspace/projects/${projectId}/chapters/${chapterSlug}/layout/`;
    case "asset_package":
      return `/workspace/projects/${projectId}/exports/packages/`;
  }
  return `/workspace/projects/${projectId}/workflow.json`;
}
