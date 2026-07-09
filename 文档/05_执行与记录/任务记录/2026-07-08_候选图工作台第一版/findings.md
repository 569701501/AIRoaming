# 候选图工作台第一版发现

---
doc_id: AIR-TASK-20260708-CANDIDATES-FINDINGS
status: active
created: 2026-07-08
updated: 2026-07-08
owner: AI漫游项目
audience: human, ai-agent
source: task_plan.md
---

## 需求理解

用户要求先启动项目，再继续向下推进，并强调先思考再做。结合项目当前盘点，下一步自然缺口是主流程第 5 步“候选图工作台”。

## 已知事实

- 当前 7 步主流程已经包含 `image_candidates`。
- `ProjectWorkbenchView.vue` 对 `image_candidates` 仍显示通用占位。
- 任务协议已有 `image_generate`，且它是章节作用域任务，必须携带 `target.chapterId`。
- 出图准备确认后才应进入候选图生成。
- `packages/shared/src/dto.ts` 已定义 `WorkbenchCandidate`、`WorkbenchShot.lockedCandidateId`、`WorkbenchSnapshot.candidates`，但后端 `getWorkbenchSnapshot` 当前固定返回 `candidates: []`。
- `ProjectsService.guardGenerationTaskCreate` 已对 `shot_prompt_generate` / `image_generate` 做出图准备 guard：校验项目、章节、正式 storyboard、preflight ready，并向任务 input 注入 `imagePreflightId`、`sourceStoryboardId`、角色参考图等追溯字段。
- `TasksController` 已有通用 `POST /api/tasks`；前端 `api.createTask` 已可调用。

## 实现结论

- 第一版候选图工作台应优先复用通用任务 API，避免新增绕过 guard 的业务入口。
- 候选图步骤已具备真实工作台组件和单镜头任务入口，但仍是“任务工作台”，不是候选资产管理页。
- 候选图资产落库和 `Shot.lockedCandidateId` 锁定 API 尚未形成，需要作为后续阶段单独设计。

## 复核结论

- 前端工作台只消费 `WorkbenchSnapshot` 和任务列表，不直接写本地 workspace。
- `image_generate` 仍由后端 `ProjectsService.guardGenerationTaskCreate` 统一校验正式分镜和已确认出图准备。
- 第一版未修改共享 DTO、后端数据模型、任务类型或素材路径契约。

## 残留风险

- 当前 mock worker 不产生真实图片资产，候选结果网格只能展示空态。
- 浏览器插件点击生成路径未作为完成证据；成功路径以真实 API 创建任务验证。
