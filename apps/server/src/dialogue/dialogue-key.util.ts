/**
 * DialogueService key 派生函数(从 dialogue.service.ts 抽出)。
 *
 * 这些函数生成进程内 pending* Map 和 thread Map 的 key。
 * 见任务 2026-07-02_DialogueService拆分 轮次1。
 */

export function getThreadKey(projectId: string, stepKey: string, chapterId: string | null): string {
  return chapterId ? `${projectId}:${stepKey}:${chapterId}` : `${projectId}:${stepKey}`;
}

export function getPendingInspirationKey(projectId: string, stepKey: string): string {
  return `${projectId}:${stepKey}:inspiration`;
}

export function getPendingScriptOutlineKey(projectId: string, stepKey: string): string {
  return `${projectId}:${stepKey}:script-outline`;
}

export function getPendingStoryStructureKey(projectId: string, chapterId: string | null): string {
  return `${projectId}:story_structure:${chapterId ?? "project"}`;
}
