# 发现与决策

---
doc_id: AIR-TASK-20260523-CHAT-OUTPUT-LAYOUT-FINDINGS
status: archived
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 发现

- Aurora 的项目编辑页是典型的 “conversation drives production / output on the right”。
- AI漫游如果继续做项目栏/检查器/画布三栏，会偏向工具后台，不像 AI 创作环境。
- 创建项目也应该从左侧对话流发起，右侧只呈现结果和产物。

## 参考证据

| 来源 | 结论 |
| --- | --- |
| `/Users/liyadong/selfProject/AuroraPlatformWeb/apps/web/src/pages/ProjectEditPage.vue` | 页面结构为左侧 `AgentChat`、右侧 `DirectorWorkbench` |
| `/Users/liyadong/selfProject/AuroraPlatformWeb/apps/web/src/components/AgentChat/index.vue` | 对话区包含会话流、模型/模式控制、输入 Composer |

## 本次取舍

| 取舍 | 结论 |
| --- | --- |
| 主入口形态 | 从项目列表/工具页改为工作台双栏 |
| 左侧职责 | 项目选择、创建、对话指令、输入 Composer |
| 右侧职责 | 输出内容、阶段状态、故事/分镜/素材/导出、任务 Dock |
| 文案风格 | 减少教程式说明，保留生产状态和内容标签 |

## Scrutiny Review

| 检查项 | 结论 |
| --- | --- |
| 类型契约 | 未修改 shared DTO 和后端接口，前端继续使用 `WorkbenchSnapshot` |
| 数据库 | 未修改 Prisma schema |
| 任务协议 | 未修改任务类型和状态枚举 |
| UI 结构 | 符合“左对话 / 右输出”的工作台方向 |
| 设计约束 | 卡片圆角不超过 8px，未使用 viewport 字号，主界面不是落地页 |

## Runtime/User Review

| 检查项 | 结论 |
| --- | --- |
| 前端服务 | `http://localhost:5173/` 返回 200 |
| 后端服务 | `http://localhost:4310/api/health` 返回 ok |
| 项目 API | `GET /api/projects` 返回 success |
| 工作台 API | `GET /api/projects/f8733bcb-8c5b-43eb-ab6e-11cabca185ab/workbench` 返回 `snapshot` |
| 当前限制 | 尚未做浏览器截图留档；本轮以构建、类型检查和 API smoke 作为证据 |

## 残留风险

- 右侧输出仍然使用已有 mock snapshot，真实分镜、素材候选和导出能力尚未接入。
- 左侧对话暂未沉淀真实消息历史，后续需要设计对话协议和任务触发契约。
