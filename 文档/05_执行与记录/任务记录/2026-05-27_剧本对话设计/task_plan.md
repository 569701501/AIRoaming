# 剧本对话设计任务计划

---
doc_id: AIR-TASK-SCRIPT-DIALOGUE-DESIGN-PLAN-001
status: in_progress
created: 2026-05-27
updated: 2026-05-27
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户调用 $deep-think 要求重新设计剧本对话功能
---

## 目标

还原当前剧本对话功能状态，识别它和章节剧本工作流之间的缺口，并形成下一步产品与技术设计方案。

## 非目标

- 本轮不直接实现新对话功能。
- 本轮不接入新的 AI provider。
- 本轮不改数据库模型。

## 阶段

| 阶段 | 状态 | 退出标准 |
| --- | --- | --- |
| 事实源读取 | completed | 已读取相关产品、架构、对话、章节文档和代码 |
| 现状还原 | completed | 明确当前前后端对话链路、上下文、限制 |
| 方案设计 | completed | 明确推荐的剧本对话目标、动作、数据边界和阶段实现 |
| 复核收口 | completed | 静态检查文档一致性，给出后续开发建议 |

## 当前角色边界

- Orchestrator：读取事实源，拆设计问题，维护任务记录。
- Worker：必要时更新方案文档和记录。
- Scrutiny Review：检查新设计是否和章节、项目、对话事实源冲突。
- Runtime/User Review：本轮为设计任务，仅做代码静态路径验证，不做 UI 运行验收。
