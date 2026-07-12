---
doc_id: AIR-G3-M3-A0-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: M3-A0 实现
---

# Handoff

## 已完成

- `MigrationLedger` 固化 running → blocked/succeeded/failed、终态不可变、issue 只能挂 running、旧 run 不被新 run 修改。
- `ImportedEntitySource` 等价规则已在纯内存账本中固化：sourceKey 稳定、sourceDigest 冲突阻断、provenance 只能升级、entityId 可重复计算。
- `MigrationAuditService` 只读取 sealed snapshot，验证 manifest 与 payload digest，映射项目 comicFormat 并生成确定性 report。
- `migration:audit:check --snapshot <sealed-dir> --report <output>` 输出稳定 code；blocker 时退出码为 2。

## 明确未完成

- 账本尚未接 Prisma/SQLite；本切片不会创建 `MigrationRun`、`MigrationIssue` 或业务实体数据库行。
- 尚未实现完整实体导入顺序、决议消费、`db-import`、`db-verify`、shadow replay 和 capability registry。
- `migration:audit:check` 不是最终施工包要求的 `db-audit --database-url`。

## 下一步建议

把本切片作为 M3 的 A0 基础，下一切片接 Prisma ledger repository 和显式临时 SQLite；先完成 RUN-01～03 的数据库版，再接 Project/Chapter 导入，禁止跳到全量“只插 Project”假完成。
