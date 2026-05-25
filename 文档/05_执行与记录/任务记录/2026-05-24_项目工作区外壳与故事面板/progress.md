# 项目工作区外壳与故事面板进展记录

---
doc_id: AIR-TASK-20260524-WORKBENCH-STORY-PROGRESS
status: completed
created: 2026-05-24
updated: 2026-05-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 1. 时间线

| 时间 | 操作 | 结果 |
| --- | --- | --- |
| 2026-05-24 | 启动 `$deep-think` | 确认下一功能为项目工作区外壳与项目与故事面板 |
| 2026-05-24 | 阅读事实源 | 确认项目工作区为当前 next，6 步流程稳定 |
| 2026-05-24 | 建立任务记录 | 创建 `task_plan.md`、`progress.md`、`findings.md` |
| 2026-05-24 | 实现后端草稿保存接口 | 新增 `PATCH /api/projects/{projectId}`，保存项目字段和故事原文 |
| 2026-05-24 | 实现前端项目工作区 | 新增工作区外壳、6 步流程和项目与故事面板 |
| 2026-05-24 | 构建验证 | `corepack pnpm build` 通过 |
| 2026-05-24 | 接口验证 | 创建临时项目后 PATCH 保存，确认 workspace 文件更新 |
| 2026-05-24 | 用户路径验证 | Headless Chrome 验证项目库进入工作区、保存草稿、创建 story_parse mock 任务、返回项目库 |
| 2026-05-24 | 完成留痕 | 同步事实源和功能完成记录 |

## 2. 修改文件

| 文件 | 说明 |
| --- | --- |
| `packages/shared/src/dto.ts` | 新增 `UpdateProjectDraftRequest` |
| `apps/server/src/projects/projects.controller.ts` | 新增 PATCH 草稿保存路由 |
| `apps/server/src/projects/projects.service.ts` | 更新项目草稿、写回 workspace、返回 6 步 snapshot |
| `apps/web/src/services/api.ts` | 新增 `updateProjectDraft` |
| `apps/web/src/stores/workbench-store.ts` | 新增 `saveProjectDraft` |
| `apps/web/src/components/layout/AppShell.vue` | 切换项目库 / 项目工作区 |
| `apps/web/src/components/layout/TopBar.vue` | 支持项目内搜索 placeholder |
| `apps/web/src/components/workbench/ProjectWorkbenchView.vue` | 新增项目工作区外壳 |
| `apps/web/src/components/workbench/WorkbenchStageRail.vue` | 新增 6 步流程展示 |
| `apps/web/src/components/workbench/ProjectStoryPanel.vue` | 新增项目与故事表单 |

## 3. Handoff

项目工作区第一步已经可用。下一步应进入“剧情结构”页面，接入 `story_parse` 的结构化输出展示和编辑；当前 `AI 分析剧情` 只创建 mock 任务，不生成结构化剧情结果。
