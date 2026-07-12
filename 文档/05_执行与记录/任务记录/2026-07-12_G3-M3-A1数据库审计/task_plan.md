---
doc_id: AIR-G3-M3-A1-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G3-M 导入器决议与迁移账本、M3-A0
---

# 目标

把 M3-A0 账本接入 Prisma/SQLite，并提供只做 audit 的 `db:audit`，使 RUN-01～03 在真实迁移树上可验证。

# 非目标

- 不创建 Project、Chapter 或其他业务实体。
- 不消费 decisions artifact，不实现 `db-import`/`db-verify`。
- 不连接真实 workspace 或生产数据库。

# 实施阶段

- [x] 定义 `MigrationLedgerPort`，复用内存与 Prisma 两种实现。
- [x] 实现 `PrismaMigrationLedgerRepository`：run、issue、source、终态与 provenance 规则。
- [x] 实现 `DatabaseMigrationAuditService` 和 `db:audit`。
- [x] fresh SQLite 集成测试。
- [x] 全量测试、G1 门禁、静态复核、交接和提交。

# 退出标准

数据库版 RUN-DB-01～03、AUDIT-DB-01 通过；server 全量测试、typecheck、G1 三项检查、git diff check 通过；文档明确 full importer 仍未完成。
