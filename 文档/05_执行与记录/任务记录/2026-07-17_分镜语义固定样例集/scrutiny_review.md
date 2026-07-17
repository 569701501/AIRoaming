---
doc_id: AIR-TASK-20260717-STORYBOARD-SEMANTIC-CORPUS-SCRUTINY
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md, implementation diff, evidence_review.md
---

# Scrutiny Review

## 结论

`passed_with_known_unrelated_test_stability_debt`

## 静态复核

- 固定样例使用仓库内单一 JSON 事实源，人工预期通过现有严格 evaluator 解析，不另造宽松报告协议。
- 顶层和样例字段精确校验；重复 fixture、章节错位、未知 Beat、重复镜头序号、无镜头 Beat 和非法预期证据均 fail-closed。
- 预期一致度按 `summary/outcome` 逐维度比较，不用 `overallStatus` 掩盖局部错误。
- 重复稳定度只统计至少两次有效报告的维度；契约失败不伪装成 `missing` 或纳入稳定分母。
- 批量 CLI 严格串行，单项失败保留并继续，支持定向复跑；输出使用私有权限的原子文件写入。
- CLI 只复用 deny-all 文本运行时和 evaluator，不引用 ProjectsService、StoryboardService、数据库写方法或媒体 provider。
- 生产代码没有反向依赖 corpus 模块，package script 是唯一人工运行入口。

## 风险复核

- 5 个样例足以覆盖首轮缺陷类型，但不是商业题材穷尽样本。
- 人工预期本身仍需版本审查；后续修改样例必须同时解释为什么改变真值。
- 关系状态变化出现 1 个维度模型分歧，证明单次 evaluator 结果不能成为生产硬门。
- 首轮动作样例有一次输出契约失败，定向复跑未复现；应继续保留 fail-closed 和失败证据，而不是降低严格性。
- 全仓并发的备份测试固定 5 秒超时重复出现，隔离和整文件均通过；它是既有测试稳定性债，不属于本任务修复范围。

## 放行边界

放行固定样例集、比较汇总和 QA CLI。禁止把本次结果解释为：

- V2.4 可以恢复；
- evaluator 可以阻断用户确认或下游生产；
- 98.1% 是线上准确率；
- 5 个固定样例已经证明所有题材都稳定。
