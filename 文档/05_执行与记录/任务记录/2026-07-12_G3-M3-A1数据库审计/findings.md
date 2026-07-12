---
doc_id: AIR-G3-M3-A1-FIND-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: 代码库探索与数据库集成测试
---

# 发现

- Prisma schema 已有 MigrationRun/MigrationIssue/ImportedEntitySource，G1 0008 trigger 已负责终态不可变、issue 只能挂 running、来源 identity immutable 和 provenance monotonic。
- M3-A0 的审计器只依赖 ledger port，因此可以在不复制 mapper 的情况下接 Prisma。
- 数据库 trigger 不允许 provenance 跨级升级，也不允许无证据变化时更新 lastRunId；repository 与内存实现均已对齐为逐级升级/无变化幂等。

# 风险

- 本切片只有 audit run；完整 importer 的项目子树事务、决议消费、实体 source provenance 和 shadow replay 仍待后续切片。
- `db:audit` 要求显式 `file:` database URL，并依赖目标库已部署完整 G1/G2/G3 migration tree。
