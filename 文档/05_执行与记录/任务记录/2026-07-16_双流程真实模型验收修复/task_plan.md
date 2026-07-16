---
doc_id: AIR-TASK-20260716-SCRIPT-REAL-MODEL-FIX-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 真实双路线浏览器验收失败样例
---

# 双流程真实模型验收修复任务计划

## 目标

修复真实浏览器验收发现的 AI pending 状态分裂和 B2 字段形状问题，并用真实模型把 AI 创作与完整剧本导入两条路线重新走通。

## 非目标

- 不新增页面字段、ChapterPlan、公开 Skill、数据库表或 API。
- 不增加导入章节手动整理、AI 重新整理、批量确认或自动切章。
- 不修改 StoryStructure 和后续流程。

## 阶段与状态

| 阶段 | 角色 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| 失败复现与根因 | Orchestrator / 诊断 | completed | 两个原始问题均有稳定证据和失败回归 |
| 最小修复 | Worker | completed | 状态同步、B2 字段契约和真实 B4 失败样例修复 |
| 静态与自动复核 | Scrutiny Review | completed | 类型、构建、单元、DB E2E、文档一致性通过 |
| 真实用户路径 | Runtime/User Review | completed | 新项目真实模型两条路线走到正式章节和剧情结构入口 |

## 关键决策

- DB pending 预览和动作 DTO 必须原子刷新，不建立第二套本地状态同步协议。
- 保持严格 parser；通过明确 Prompt/Skill 条目形状解决 `sourceRange/sourceRanges` 歧义。
- 合理结构化归纳允许，但具体剧情新增、语义反转和文本载体重分类仍是硬问题。

## 退出标准

- 原始复现通过真实浏览器重测。
- 两章导入批次 completed、正式版本 origin=import、pending=0。
- 自动回归和 Skill 校验通过。
- 契约、任务记录、完成记录、会话记忆和长期记忆同步。
