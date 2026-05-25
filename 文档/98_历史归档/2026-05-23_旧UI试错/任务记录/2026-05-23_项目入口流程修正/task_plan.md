# 任务计划：项目入口流程修正

---
doc_id: AIR-TASK-20260523-PROJECT-FLOW-PLAN
status: archived
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户指出页面流程不符合“先创建项目，再进入工作台”的产品逻辑
---

## 目标

修正前端信息架构：用户进入应用后先看到项目库，创建项目后再进入该项目工作台。

## 阶段

| 阶段 | 状态 | 结果 |
| --- | --- | --- |
| 重新定义入口流程 | completed | 确认为项目库 -> 创建项目 -> 项目工作台 |
| 后端项目 API | completed | 新增项目列表、创建、按项目读取 workbench |
| 前端页面修正 | completed | 新增项目库和创建项目表单 |
| 验证 | completed | build/typecheck/API smoke/HTTP 入口通过 |

## 决策

| Decision | Rationale |
| --- | --- |
| 应用入口必须是项目库 | 符合创作工具的基础用户路径 |
| 创建项目后进入工作台 | 工作台必须绑定具体 projectId |
| workbench API 改为 `:projectId` | 避免固定 demo 项目污染产品流程 |
