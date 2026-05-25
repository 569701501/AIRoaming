# 任务计划：对话输出布局重构

---
doc_id: AIR-TASK-20260523-CHAT-OUTPUT-LAYOUT-PLAN
status: archived
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户要求参考 AuroraPlatformWeb，左侧对话，右侧输出内容
---

## 目标

将 AI漫游前端重构为 Aurora 类似的双栏生产界面：左侧对话/指令流，右侧输出内容工作区。

## 非目标

- 本次不接入真实生成模型。
- 本次不改变后端数据结构、任务协议或 Prisma schema。
- 本次不实现图片候选锁定、导出打包、TTS、FFmpeg 等深层生产能力。

## 阶段

| 阶段 | 状态 | 结果 |
| --- | --- | --- |
| 参考确认 | completed | Aurora `ProjectEditPage` 是左侧 `AgentChat` + 右侧 `DirectorWorkbench` |
| 前端重构 | completed | 重写 `App.vue` 和 `styles.css`，形成左对话、右输出、底部任务 Dock 的工作台 |
| 验证留痕 | completed | build/typecheck/API smoke 已通过，完成记录已新增 |

## 决策

| Decision | Rationale |
| --- | --- |
| 左栏承载项目创建和对话流 | 用户通过对话/指令推进创作 |
| 右栏承载输出内容 | 故事、分镜、素材、导出属于产物区 |
| 任务 Dock 放在右侧底部 | 生成进度贴近输出内容 |
| 视觉收敛为冷灰白工作台 | 避免营销页和模板感，更接近长期生产界面 |

## 退出标准

| 标准 | 状态 | 证据 |
| --- | --- | --- |
| 用户能从左侧创建作品 | completed | `App.vue` 创建表单保留在左侧对话流 |
| 作品打开后右侧显示输出区域 | completed | 输出区包含总览、故事、分镜、素材、导出 Tab |
| 任务状态不再作为主页面中心 | completed | 任务队列移动到右侧底部 Dock |
| 构建与类型检查通过 | completed | `corepack pnpm build`、`corepack pnpm typecheck` |
| 服务连通性正常 | completed | `GET /` 200，`GET /api/health` ok，`GET /api/projects` success |
