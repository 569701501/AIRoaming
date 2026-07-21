import type { ProjectListItem, ProjectStatus } from "@airoaming/shared";

export const projectStatusMeta: Record<ProjectStatus, { label: string; tone: string; step: string }> = {
  draft: {
    label: "创作中",
    tone: "amber",
    step: "剧本",
  },
  story_ready: {
    label: "创作中",
    tone: "blue",
    step: "剧情结构",
  },
  characters_ready: {
    label: "创作中",
    tone: "green",
    step: "角色库",
  },
  shots_ready: {
    label: "创作中",
    tone: "violet",
    step: "分镜",
  },
  images_ready: {
    label: "创作中",
    tone: "cyan",
    step: "候选图",
  },
  layout_ready: {
    label: "创作中",
    tone: "amber",
    step: "排版导出",
  },
  exported: {
    label: "已导出",
    tone: "green",
    step: "",
  },
};

export function formatRelativeDate(value: string) {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) {
    return "时间未知";
  }

  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return "刚刚更新";
  }

  if (diff < hour) {
    return `${Math.floor(diff / minute)} 分钟前`;
  }

  if (diff < day) {
    return `${Math.floor(diff / hour)} 小时前`;
  }

  if (diff < 7 * day) {
    return `${Math.floor(diff / day)} 天前`;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * 返回项目卡上展示的"当前进度"文字。
 * 已导出项目返回完成态文案，其余按当前步骤返回"当前 · 第 N 步 XXX"。
 * 7 步顺序与 workflow 定义一致：剧本 → 剧情结构 → 分镜 → 出图准备 → 候选图 → 排版导出 → 素材包。
 */
const STATUS_STEP_INDEX: Record<ProjectStatus, number> = {
  draft: 1,
  story_ready: 2,
  characters_ready: 2,
  shots_ready: 3,
  images_ready: 5,
  layout_ready: 6,
  exported: 7,
};

export function getProjectStepLabel(project: ProjectListItem) {
  const meta = projectStatusMeta[project.status];
  if (!meta) {
    return "进度未知";
  }
  if (project.status === "exported") {
    return "✓ 已完成";
  }
  const index = STATUS_STEP_INDEX[project.status] ?? 1;
  return `当前 · 第 ${index} 步 ${meta.step}`;
}

export function getProjectDigest(project: ProjectListItem) {
  const text = project.sourceTextPreview || project.description;
  return text.trim() || "还没有故事内容，进入项目后补充故事原文。";
}

export function getProjectAccent(projectId: string) {
  const total = [...projectId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (total % 4) + 1;
}
