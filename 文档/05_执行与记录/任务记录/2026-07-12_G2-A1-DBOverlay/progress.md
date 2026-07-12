---
doc_id: AIR-G2-A1-PROGRESS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-A1 执行记录
---

# Progress

## 2026-07-12

- 已核对 G2 数据库 Overlay 清单、文件 Repository 与事务地图、现有 Prisma schema、G1 0008 触发器与运行时 migration ledger。
- 已确认 A1 的关键边界：手写 0009，不触碰 G1 manifest；G2 ledger 单独扩展，不提前改变 PrismaService 的 G1 启动门禁。
- 已新增 `0009_g2_version_freshness_overlay`：2 个 partial unique index、14 个正式 trigger，以及 6 个错误码对应的 TEMP preflight guard；guard 在迁移末尾清理且不进入 `sqlite_master`。
- 已新增 `g2-overlay-contract` 直接验证、G2 九行 runtime ledger helper、VersionTransactionRunner、G2 数据库错误映射、ChapterVersionQueryRepository 与四层 command repository 稳定接口。
- 为让正式 Prisma 目录与既有 G1 门禁共存，G1 artifact-tree/runtime ledger 仅识别并忽略已知 0009；G1 八个迁移名/checksum/SQL 未改，DB 集成验收的正式迁移数更新为 9。
- `corepack pnpm -w typecheck`、`corepack pnpm test`、`g1:manifest:check`、`git diff --check` 均通过。
