---
doc_id: AIR-COMPLETE-G2-A1-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G2-A1 任务记录与五份施工资料
---

# G2-A1 DB Overlay / Repository substrate 完成记录

## 功能摘要

完成 G2 数据库 overlay 和版本持久化基座：正式 0009 migration、2 个 pending partial unique index、14 个 G2 trigger、迁移前置扫描 guard、G2 九行 ledger helper、事务重试、数据库错误映射、Chapter 版本图只读查询和四层 command repository 接口。

## 影响范围

- 新增 `apps/server/prisma/migrations/0009_g2_version_freshness_overlay/`；不新增表/列，不回填业务数据。为兑现 B1 的 clear 契约，同步放宽既有 `0008` Working Copy CHECK，允许 current Script + 空 dirty Working Copy，并同步 manifest/checksum。
- G1 tree/runtime ledger 对已知 0009 做兼容过滤；G1 八条 SQL、name/checksum 常量和业务语义保持不变。
- 未注册新 repository 到 ProjectsModule，未改变 file mode、既有 V1 API 或 worker。

## 验证命令与结果

```text
corepack pnpm -w typecheck
corepack pnpm test
corepack pnpm --filter @airoaming/server g1:manifest:check
git diff --check
```

结果：全仓 typecheck 通过；Shared 34/34、Server 171/171 通过；G1 manifest check 和 whitespace check 通过。G2 contract 额外验证 fresh 0001–0009 deploy、正式对象数量、无新表/列和无 TEMP guard 残留。

## 已知风险

- SQL 无法重算 SHA-256 或证明完整 source snapshot；应用 transaction 必须使用 Shared codec/SourceSnapshotBuilder 并做条件更新。
- 四层 repository 目前是稳定接口基座，不是完整 Script/Story/Storyboard/Preflight command 实现。
- G2 九行 ledger 仍是 opt-in helper；完整 API/worker 命令就绪后再决定是否把九行严格门禁接入 PrismaService。

## 后续建议

进入 G2-B1 Script repository，再进入 C1 Story/Storyboard、D1 Preflight；每个切片继续沿用本 A1 的 transaction runner、query repository、错误码和 fresh migration 证据。
