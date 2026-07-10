---
doc_id: AIR-TASK-20260710-COMIC-FINISHING-FLOW-PLAN
status: completed
created: 2026-07-10
updated: 2026-07-10
owner: AI漫游项目
audience: human, ai-agent
source: 用户讨论、现有七步主流程与漫画排版实现
---

# 漫画成稿编辑流程定位任务计划

## 目标

判断借鉴 Anifusion 与 AI Comic Factory 的漫画成稿编辑，应放入 AI漫游主流程的哪个步骤、页面内部如何分段、与候选图和分镜如何衔接。

## 非目标

- 不修改功能代码。
- 不在用户确认前修改正式产品流程、数据契约或模块边界。
- 不讨论具体画布技术选型与实现排期。

## 验收标准

- 给出明确的顶层流程位置。
- 说明页面内子流程、进入条件、退出条件和回退路径。
- 说明图片重画、对白编辑与排版编辑分别归属哪个模块。
- 说明不建议新增独立顶层步骤的原因与残留风险。

## 阶段

| 阶段 | 角色 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| 1. 事实源与当前页面结构核对 | Orchestrator | completed | 七步流程、路由、页面布局与状态边界明确 |
| 2. 成稿编辑流程定位 | Worker | completed | 顶层位置和页面内子流程明确 |
| 3. 上下游职责与回退路径 | Worker | completed | 分镜、候选、排版职责不重叠 |
| 4. 静态复核 | Scrutiny Review | completed | 与现有产品和契约没有明显冲突 |
| 5. 用户评审 | Runtime/User Review | completed | 无运行产物；已形成供用户评审的明确建议 |

## 退出标准

- 结论与证据写入 `findings.md`。
- 执行与静态复核写入 `progress.md`。
- 会话记忆同步本轮新需求与结论。
