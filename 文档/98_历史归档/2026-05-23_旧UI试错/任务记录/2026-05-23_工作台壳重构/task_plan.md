# 任务计划：工作台壳重构

---
doc_id: AIR-TASK-20260523-WORKBENCH-SHELL-PLAN
status: archived
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户指出 AI漫游应是工作台，不是抽象工具页面流
---

## 目标

将应用从“项目库页面 / 工作台页面”切换模型，重构为始终打开的创作工作台壳：左侧作品栏、中间创作画布、右侧检查器、底部任务 Dock。

## 阶段

| 阶段 | 状态 | 结果 |
| --- | --- | --- |
| 产品模型修正 | completed | 应用本身就是工作台，项目是工作台上下文 |
| 前端壳重构 | completed | 重写 `App.vue` 与主样式 |
| 验证与留痕 | completed | build/typecheck/API smoke/完成记录 |

## 决策

| Decision | Rationale |
| --- | --- |
| 不再显示独立项目库页 | 避免产品像管理后台 |
| 作品列表放左侧 rail | 项目是工作台上下文，而不是独立模块 |
| 没有作品时主画布显示创建作品 | 保持工作台结构稳定 |
| 右侧检查器随上下文变化 | AI 动作和参数应依附当前对象 |
