# 发现与决策

---
doc_id: AIR-TASK-20260526-OPENCODE-DIALOGUE-FINDINGS
status: completed
created: 2026-05-26
updated: 2026-05-26
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 需求

- 用户要求把 OpenCode 接进当前项目，并测试对话。
- 当前用户路径是：项目库创建项目后进入项目工作区，第 1 步“剧本”左侧为对话框，右侧为剧本文档。
- 对话框是公共能力，后续步骤可复用不同上下文提示词。

## 事实源

| 文档/文件 | 结论 |
| --- | --- |
| `文档/04_方案与决策/2026-05-25_OpenCode对话运行时移植方案.md` | 首阶段选择 OpenCode；OpenCode session 只作为运行时映射，不等同于 AI漫游业务对话。 |
| `文档/04_方案与决策/2026-05-25_Aurora对话框参考与AI漫游适配方案.md` | 可参考 Aurora 对话框，但 AI 输出不能自动覆盖右侧文档。 |
| `文档/02_架构与契约/核心数据模型.md` | 当前已有项目、故事、任务和素材概念；对话记录需要补充最小契约。 |
| `文档/03_模块梳理/模块总览与依赖.md` | 前端不直接执行业务生成任务；运行时应由后端封装。 |
| `apps/server/src/projects/projects.service.ts` | 当前项目与故事草稿保存在内存并写入 workspace 文件。 |
| `apps/web/src/components/workbench/ProjectDialoguePanel.vue` | 当前对话框是静态占位，发送输入被禁用。 |

## 研究发现

- 本机 `opencode` 可用，版本为 `1.4.0`。
- `opencode serve --port 4396 --hostname 127.0.0.1` 可启动本地 HTTP 服务。
- `POST /session` 可创建 session。
- `POST /session/:sessionId/message` 可同步返回 assistant message，正文位于 `parts[]` 中 `type: "text"` 的 `text` 字段。
- OpenCode `/config` 返回内容包含敏感配置风险，本项目只允许提取 provider/model 的非敏感展示字段。
- 首轮实现复核时发现对话线程不能按项目共用完整历史，必须按 `projectId + stepKey` 隔离；已改为步骤线程。

## 证据

| 路径/命令 | 结论 |
| --- | --- |
| `opencode --version` | 返回 `1.4.0`。 |
| `POST /session` | 返回 `ses_...` session id。 |
| `POST /session/:id/message` | 返回 `AI漫游 OpenCode 测试成功`。 |
| `corepack pnpm --filter @airoaming/shared build` | 通过。 |
| `corepack pnpm --filter @airoaming/server build` | 通过。 |
| `corepack pnpm --filter @airoaming/web build` | 通过。 |
| `POST /api/projects/{projectId}/dialogue/threads/project_story/messages` | 当前页面后端返回 `当前页面对话可用`。 |
| `GET /api/projects/{projectId}/dialogue/threads/story_structure` | 未发送过消息的步骤线程消息数为 0，步骤隔离生效。 |

## 缺口与风险

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| 当前对话记录首版使用内存存储 | 重启服务后记录消失 | 后续接入数据库或 workspace JSON。 |
| OpenCode 运行时不可用 | 对话发送失败 | 后端返回明确错误，前端显示失败状态。 |
| 模型选择首版较轻 | 还不是完整模型管理页 | 后续单独做模型配置与切换功能。 |
| AI 输出可能被误认为已经改文档 | 用户稿件被误解为已更新 | 提示词与 UI 都强调“建议/改写草案”，必须由用户应用。 |
