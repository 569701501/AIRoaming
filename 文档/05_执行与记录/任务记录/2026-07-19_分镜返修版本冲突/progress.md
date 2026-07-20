# 进度日志

---
doc_id: AIR-TASK-20260719-STORYBOARD-REBASE-PROGRESS
status: completed
created: 2026-07-19
updated: 2026-07-20
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 会话：2026-07-19

### 阶段 1：需求与事实源恢复

- **状态：** completed
- 已采取的操作：
  - 读取版本链、Freshness、数据模型、UI 和 API 事实源。
  - 读取当前生产 SQLite 中存在 active pending 分镜的章节版本链。
  - 调用当前运行服务的 Workbench 与 Storyboard Working Copy 只读接口。
  - 使用前端当前适配函数重算 Story document digest，并与数据库和 pending 冻结摘要比较。
  - 逐字段比较数据库正式 Story 文档与前端重建文档。
- 验证结果：
  - 正式 Story ID 与 pending 的 source Story ID 一致。
  - 正式 Story digest 与 pending 的 source digest 一致，均为同一权威值。
  - 前端确认路径重算出的 digest 不同；唯一内容差异是一个 group 角色的 `projectCharacterId` 被当前角色集合重新映射到另一条相似群体角色记录。
  - 因而当前错误是可稳定复现的客户端错误来源摘要，不是已有图片使 Story 版本真正过期。

### 阶段 2：产品方案与实现边界

- **状态：** completed
- 已采取的操作：
  - 明确“重新生成只建 pending，确认才切 current”的两阶段语义。
  - 明确真实来源过期和错误摘要必须使用不同处理。
  - 形成历史保留、Freshness 回退、影响预览和后续按镜复用边界。
- 用户于 2026-07-20 确认进入实施。

## 会话：2026-07-20

### 阶段 3：Worker 实施

- **状态：** completed
- 已完成：
  - 新增 Store 回归，先复现展示 DTO 重算摘要与 pending 冻结摘要不一致，再改为确认请求原样回显 pending `sourceId/sourceDigest`。
  - Storyboard 确认保留当前最远里程碑，修复 `images_done/layout_done/exported` 被写回 `storyboard_done` 的失败。
  - 把重新生成处的过早警告移动到确认 current 的时点，展示出图准备、候选、定稿、排版和导出数量。
  - 真正的 Story ID/digest 变化统一返回 `UPSTREAM_SOURCE_STALE`，页面明确要求基于最新剧情结构重新生成。
  - 用户真实数据库业务状态未被修改。

### 阶段 4：Scrutiny Review

- **状态：** completed
- 复核来源摘要、事务顺序、历史保留、里程碑和错误分类。
- 首轮发现 Story ID 变化错误分类不准确，返回 Worker 修正并补单测；第二轮无阻塞项。

### 阶段 5：Runtime/User Review

- **状态：** completed
- 隔离 DB + Chromium 真实页面用例通过：取消切换不提交，确认切换后旧候选保留、里程碑保持 `images_done`、Preflight 变 `needs_update`。
- 影响弹窗截图已写入 `evidence/storyboard_revision_impact.png` 并完成视觉检查。

### 阶段 6：交付与留痕

- **状态：** completed
- 已同步产品流程、UI 信息架构、核心数据模型、会话记忆、长期记忆和功能完成记录。

## Handoff

### 完成

- 已准确定位当前 `UPSTREAM_SOURCE_STALE`。
- 已完成产品与技术修复、静态复核和隔离浏览器验收。

### 未完成

- 未替用户确认真实项目中的待确认分镜；正式版本切换仍由用户在页面明确确认。
- 按镜头自动复用旧候选图仍后置，当前安全策略是整章来源更新并保留旧产物历史。

### 证据

- `tests/e2e/support/storyboard-confirm-source.test.ts`：确认请求必须回显 pending 冻结来源。
- `apps/server/src/projects/project-db-persistence.integration.spec.ts`：高里程碑确认和 Preflight stale 回归。
- `tests/e2e/web/storyboard-revision-impact.spec.ts`：真实浏览器完成下游影响提示与确认路径。
- `evidence/storyboard_revision_impact.png`：影响弹窗视觉证据。
- 完整 Server：134/136 files、814/816 tests 通过；2 项既有用例在并发运行时触发 5 秒超时，隔离复跑 2/2 均约 2 秒通过。E2E 环境 35/35、相关 Chromium 1/1、前后端与 E2E typecheck 全绿。

### 流程遵守

- 已读取项目总入口、AI 上下文、写作规范、版本链方案、ADR、数据模型与 UI 事实源。
- 生产代码改动限制在分镜确认来源、里程碑与影响交互；未修改用户真实业务数据。

### 给复核者的重点

- 不得重新从 Workbench 展示 DTO 构建正式来源摘要；确认只能使用 pending 冻结来源。
- 后续若做按镜复用，必须先建立稳定镜头匹配和镜头级来源摘要，不能仅按顺序或文案猜测。
