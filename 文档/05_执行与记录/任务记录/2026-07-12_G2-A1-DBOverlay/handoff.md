---
doc_id: AIR-G2-A1-HANDOFF-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G2-A1 DB overlay / Repository substrate
---

# Handoff

## 已交付

- `apps/server/prisma/migrations/0009_g2_version_freshness_overlay/migration.sql`
- `apps/server/src/persistence/g2-overlay-contract.ts` 与对应 spec
- `apps/server/src/persistence/g2-runtime-migration-ledger.ts` 与对应 spec
- `apps/server/src/projects/versioning/versioning-database.types.ts`
- `apps/server/src/projects/versioning/versioning-repository.contract.ts`
- `apps/server/src/projects/versioning/version-transaction-runner.service.ts`
- `apps/server/src/projects/versioning/g2-database-error.mapper.ts`
- `apps/server/src/projects/versioning/chapter-version-query.repository.ts`

## 下一阶段接入顺序

1. B1 Script repository：已完成，复用 `VersionTransactionRunner`、`ChapterVersionQueryRepository`、Shared Script codec；working/pending/publish/revert/clear 的条件更新已通过 fresh SQLite。
2. C1 Story/Storyboard：在 pending parent 内重建 projections，confirm 事务完成 source digest/applicability 证明；不要把 G2 SQL trigger 再复制到 Service。
3. D1 Preflight：用 SourceSnapshotBuilder 与 V2 codec 生成 ready revision，再更新 Chapter current pointer。
4. E1/F1：将 NewWorkGate、history、API envelope、409 刷新路径接入；G2 九行 ledger capability 在完整 runtime 命令就绪后再考虑收紧启动门禁。

## 已知边界

- SQLite trigger 不计算 JCS/SHA-256，不验证完整 sourceProjection/expectedTargetRowVersion，也不能判断 historical task 是否越权写 current；这些是应用事务的强制责任。
- A1 当时没有注册新 Repository 到 `ProjectsModule`，也没有改变 file mode 或旧 Projects API；B1 已新增独立 ScriptVersionService/Repository 和新路由，旧 Projects API 仍保持兼容。

## 不应宣称

- 四层版本命令、G2 API、worker applicability、真实素材追溯或 G2 全阶段完成。
