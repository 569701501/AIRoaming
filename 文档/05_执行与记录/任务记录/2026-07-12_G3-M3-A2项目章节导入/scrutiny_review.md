---
doc_id: AIR-G3-M3-A2-SCRUTINY-001
status: passed_with_scope_limit
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: A2 静态复核、fresh SQLite 集成测试与 G1 门禁
---

# Scrutiny Review

## 通过

1. Importer 入口只接受 sealed snapshot 和与 source manifest digest 绑定的 decisions artifact，不读取活动 workspace。
2. `decision_required` 在 Project INSERT 前校验 issueKey、sourceDigest 和 detail；未决项目不会落业务表，额外未消费决议会 fail-closed。
3. Project/Chapter/source rows 在同一个 Prisma transaction 中写入；数据库约束失败不会留下半棵项目树。
4. target ID 来自 `entityType + sourceKey` 稳定摘要；同一 sourceKey 的 sourceDigest、sourceStorageKey、payloadDigest 不一致会阻断 replay。
5. CLI 对 `final` kind 明确 fail-closed；报告区分 `blocked` 与 `imported`，没有把 A2 伪装成 full importer。

## 不能扩大解释

- 没有证明 Script/Outline 及后续实体覆盖、全量 source provenance 或 db-verify 等价性。
- 没有证明两轮 fresh shadow 的 report/ledger/API 完全一致，也没有生产 workspace 或真实用户页面复核。
- 因此 G3-M3 full importer、G3-M4、backup 和 activate 仍不得标记完成。
