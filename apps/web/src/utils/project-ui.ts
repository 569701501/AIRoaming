import type { ProjectListItem, ProjectStatus, ProjectType } from "@airoaming/shared";

export const projectTypeLabels: Record<ProjectType, string> = {
  comic: "漫画项目",
  light_motion: "轻漫剧",
  mixed: "混合项目",
};

export const projectStatusMeta: Record<ProjectStatus, { label: string; tone: string; progress: number }> = {
  draft: {
    label: "草稿",
    tone: "neutral",
    progress: 12,
  },
  story_ready: {
    label: "剧情就绪",
    tone: "blue",
    progress: 26,
  },
  shots_ready: {
    label: "分镜就绪",
    tone: "violet",
    progress: 42,
  },
  images_ready: {
    label: "候选图就绪",
    tone: "cyan",
    progress: 64,
  },
  layout_ready: {
    label: "可排版",
    tone: "amber",
    progress: 82,
  },
  exported: {
    label: "已导出",
    tone: "green",
    progress: 100,
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

export function getProjectProgress(project: ProjectListItem) {
  return projectStatusMeta[project.status]?.progress ?? 0;
}

export function getProjectDigest(project: ProjectListItem) {
  const text = project.sourceTextPreview || project.description;
  return text.trim() || "还没有故事内容，进入项目后补充故事原文。";
}

export function getProjectAccent(projectId: string) {
  const total = [...projectId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (total % 4) + 1;
}
