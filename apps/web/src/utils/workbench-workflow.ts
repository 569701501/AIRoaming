/**
 * 工作台 workflow 状态机纯函数(从 workbench-store.ts 抽出)。
 *
 * 这些函数只读参数,不依赖 store 状态。供 store 的 apply* action 和 UI 渲染共用。
 * 见前端大文件拆分轮次1。
 */
import { PROJECT_WORKFLOW_STEP_KEYS } from "@airoaming/shared";
import type {
  ChapterDetail,
  ChapterStoryStructure,
  ProjectWorkflowStepKey,
  ProjectWorkflowStepStatus,
  WorkbenchSnapshot,
} from "@airoaming/shared";
import { isChapterImagePreflightReady } from "./workbench-preflight";

/** workflow 步骤排序 Map(基于 PROJECT_WORKFLOW_STEP_KEYS 顺序)。 */
export const workflowStepOrder = new Map<ProjectWorkflowStepKey, number>(
  PROJECT_WORKFLOW_STEP_KEYS.map((key, index) => [key, index]),
);

/** 根据章节状态推导当前 workflow 步骤。 */
export function resolveWorkflowCurrentStepKey(chapter: ChapterDetail, snapshot: WorkbenchSnapshot): ProjectWorkflowStepKey {
  switch (chapter.status) {
    case "script_done":
      return "story_structure";
    case "structured":
      return "storyboard";
    case "storyboard_done":
      return isChapterImagePreflightReady(snapshot) ? "image_candidates" : "image_preflight";
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

/** 推导单个 workflow 步骤的状态(done/active/waiting)。 */
export function resolveWorkflowStepStatus(
  stepKey: ProjectWorkflowStepKey,
  currentStepKey: ProjectWorkflowStepKey,
  chapterStatus: ChapterDetail["status"],
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
  return "waiting";
}

/** workflow 步骤摘要文案(面向用户)。 */
export function getWorkflowStepSummary(
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
    case "story_structure":
      return "当前章节剧本已完成，可以运行 story_parse 生成结构化剧情。";
    case "storyboard":
      return "当前章节剧情结构已就绪，可以生成和编辑分镜。";
    case "image_preflight":
      return "当前章节分镜已确认，检查角色参考图、镜头绑定和出图输入。";
    case "image_candidates":
      return "出图准备已通过，可以生成候选图并锁定结果。";
    case "layout_export":
      return "当前章节图片结果已就绪，可以自动生成完整成稿并继续编辑。";
    case "asset_package":
      return "当前章节或项目导出已就绪，可以归档素材包。";
  }
}

/** workflow 步骤完成态摘要。 */
export function getWorkflowDoneSummary(stepKey: ProjectWorkflowStepKey): string {
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
}

/** workflow 步骤等待态摘要。 */
export function getWorkflowWaitingSummary(stepKey: ProjectWorkflowStepKey): string {
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
      return "需要先完成章节成稿和正式导出。";
  }
}

/** workflow 步骤证据路径(workspace 相对路径)。 */
export function getWorkflowStepEvidence(projectId: string, chapter: ChapterDetail, stepKey: ProjectWorkflowStepKey): string {
  switch (stepKey) {
    case "project_story":
      return `/workspace/projects/${projectId}/chapters/${chapter.slug}/script.md`;
    case "story_structure":
      return `/workspace/projects/${projectId}/chapters/${chapter.slug}/structure.json`;
    case "storyboard":
      return `/workspace/projects/${projectId}/chapters/${chapter.slug}/storyboard.json`;
    case "image_preflight":
      return `/workspace/projects/${projectId}/chapters/${chapter.slug}/preflight.json`;
    case "image_candidates":
      return `/workspace/projects/${projectId}/chapters/${chapter.slug}/candidates/`;
    case "layout_export":
      return `/workspace/projects/${projectId}/chapters/${chapter.slug}/layout/`;
    case "asset_package":
      return `/workspace/projects/${projectId}/exports/packages/`;
  }
}

/** 根据章节重新计算整个 workflow 对象(状态/摘要/证据全量刷新)。 */
export function patchWorkflowForChapter(snapshot: WorkbenchSnapshot, chapter: ChapterDetail): WorkbenchSnapshot["workflow"] {
  const currentStepKey = resolveWorkflowCurrentStepKey(chapter, snapshot);
  const steps = snapshot.workflow.steps.map((step) => {
    const status = resolveWorkflowStepStatus(step.key, currentStepKey, chapter.status);
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

// 抑制未使用类型 import 警告(ChapterStoryStructure 被 patchWorkflowForChapter 间接经由 snapshot 使用)
export type { ChapterStoryStructure };
