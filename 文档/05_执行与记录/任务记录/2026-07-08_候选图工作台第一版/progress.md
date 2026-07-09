# 候选图工作台第一版进度

---
doc_id: AIR-TASK-20260708-CANDIDATES-PROGRESS
status: active
created: 2026-07-08
updated: 2026-07-08
owner: AI漫游项目
audience: human, ai-agent
source: task_plan.md
---

## 2026-07-08

### Orchestrator

- 已同步代码到 `origin/main` 的 `4d1dd30`。
- 已启动本地后端：`http://localhost:4310/api`。
- 已启动本地前端：`http://localhost:5173/`。
- 已验证 `GET /api/health` 返回 `status=ok`。
- 已验证 Vite 前端入口返回 HTTP 200。

### Worker

- 新增 `ImageCandidatesWorkspace.vue`，候选图步骤不再显示通用占位页。
- 页面展示章节下拉、正式分镜列表、选中镜头上下文、候选数量控制、按镜头聚合的 `image_generate` 任务状态和候选结果空态。
- `workbench-store.generateImageCandidates` 复用 `POST /api/tasks` 创建章节作用域 `image_generate`，前端只组装镜头 prompt、候选数量、参考资产和图片尺寸。
- `ProjectWorkbenchView.vue` 与 `AppShell.vue` 已完成事件接线。

### Scrutiny Review

- 静态复核确认本阶段未新增 DTO、数据库或后端 API，仍使用现有任务协议和后端 guard。
- `corepack pnpm -r typecheck` 通过。
- `corepack pnpm -r --parallel --filter @airoaming/shared --filter @airoaming/server test` 通过，shared 15 + server 46 tests。
- `corepack pnpm -r build` 通过，仅保留 Vite chunk 大小警告。

### Runtime/User Review

- 浏览器打开样例项目 `/projects/3c91668b-03db-4022-a9cd-5b130205c14f/candidates`，确认显示候选图工作台组件而非通用占位。
- 样例项目尚无正式分镜/出图准备，页面正确显示“请先确认本章分镜”阻塞态。
- 未通过 preflight 的样例项目直接创建 `image_generate` 被后端拒绝，错误码为 `IMAGE_PREFLIGHT_NOT_CONFIRMED`。
- 临时项目完成结构、分镜和 preflight 后，通过 API 创建 `image_generate` 成功，任务 input 注入 `imagePreflightId/sourceStoryboardId` 等追溯字段；临时项目已删除。
- 浏览器插件 DOM snapshot 在本地页面检查时出现插件侧错误，后续改用只读页面检查、截图和 API 路径验证。

## Handoff

当前任务已完成。下一阶段建议进入 `Candidate` 持久化、真实候选图片落库、`Shot.lockedCandidateId` 选择/锁定和排版入口。
