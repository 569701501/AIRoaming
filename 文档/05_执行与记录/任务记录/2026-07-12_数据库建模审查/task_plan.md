---
doc_id: AIR-TASK-DB-MODEL-REVIEW-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: 用户对 44 表、194 trigger 与代码生成器的质疑
---

# 目标

只读还原数据库建模、trigger 与生成器的实际实现，说清设计理由、合理部分与过度设计风险，并形成不打断当前开发的优化顺序。

# 非目标

- 不修改代码、Schema、migration 或运行时数据。
- 不在本轮修改或提交重构代码；只给出后续实施方案。

# 阶段

1. [x] 事实源与 Schema 核对。
2. [x] trigger 分类与必要性审查。
3. [x] 生成器调用链审查。
4. [x] Scrutiny Review 式结论与讨论提纲。
5. [x] 核对 overlay migration、runtime ledger 与 Task Repository 对 trigger 的实际依赖。
6. [x] 给出低风险、短周期的优化分层与退出条件。
7. [x] 复核 importer/verify 对生成链的真实依赖、摘要算法、DELETE 等价性与投影读取点。
8. [x] 明确生成器采用渐进退役，并修正第一阶段范围。

# 验收标准

- 数量与分类可从现有代码/迁移 SQL 复核。
- 每个主要结论均有实际路径与代码语义支撑。
- 明确区分必要约束、SQLite/Prisma 局限补丁与可回收复杂度。
- 优化方案不得要求重写 0001–0010、一次性合表或批量删除 trigger。
- 在执行第一阶段前必须先用 ADR 冻结生成器终局与 release schema identity 语义。

# 当前角色边界

Orchestrator + Scrutiny Review；无 Worker 实施，Runtime/User Review 不适用。
