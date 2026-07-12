---
doc_id: AIR-TASK-20260712-G3M-DOC-PLAN
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3-core 完成记录、G1 M2～M4 方案、当前代码
---

# G3 剩余功能文档审查任务计划

## 目标

把 G3-M 从分散的未来描述整理成 Luna 可逐切片执行的施工包，并明确真正阻止 DB-only 激活的 G1 前置。

## 阶段

1. 读取 G1/G3 事实源并核对当前代码。
2. 建立 G3-M 五份施工资料和 handoff。
3. 做 docs-only Scrutiny Review。
4. 同步索引、会话记忆与长期记忆。

## 强制退出标准

- 每个切片有精确目标、前置、文件面、测试和 Stop condition。
- 决议、快照、MigrationRun、备份恢复和激活状态机可直接实现。
- 明确当前不得直接生产激活的原因与解除条件。
- Luna 不需要从旧长文中自行推断执行顺序。

## 结果

已完成五份 G3-M 施工资料、Luna handoff、Scrutiny Review、索引和记忆同步。文档对 foundation 开发通过；production activate 保持前置阻塞。
