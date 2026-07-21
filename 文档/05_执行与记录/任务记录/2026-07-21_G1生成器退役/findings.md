---
doc_id: AIR-TASK-20260721-G1-GENERATOR-RETIREMENT-FINDINGS
status: completed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 代码依赖、数据库 artifact 与项目事实源
---

# 需求理解

本任务不是为了追求删除数字，而是让完成迁移使命的生成基础设施退出正常工程，同时不削弱当前 SQLite 运行安全。

# 初始发现

- 活跃 G1 生成器由 16 个生产文件、9,142 行组成，只被六个 `g1:*` package script 和自身测试调用，未发现正常 Nest 入口依赖。
- 八个既有 G1 测试中，七个只证明生成器/历史 Gate；`g1-schema-trigger-sqlite-semantics.spec.ts` 仍保护 194 个基线 trigger 的关键 SQLite 行为，必须保留并解耦。
- 历史 manifest 已包含模型最小建表字段、CHECK 表达式和完整 trigger SQL，因此语义测试可直接读取冻结 artifact，无需重建 DSL。
- 当前运行安全由 `release-schema-identity.ts`、`g1-runtime-migration-ledger.ts`、后续 0017 runtime ledger、Schema contract 与 overlay contract 承担，它们不依赖生成器。

# 风险

- 历史文档仍包含旧 `g1:*` 命令；必须明确标记为历史，而不是让执行者误以为命令仍存在。
- 删除生成器后不能再从 Markdown 重建 0001～0008；这是 ADR-0015 已接受的退役后果，恢复来源是版本控制中的不可变 artifact，而不是生产 CLI。
- Trigger 语义测试若只验证名称会降低保护，因此必须继续执行真实 SQLite 正反例。

# 最终改动

| 指标 | 删除前 | 删除后 | 变化 |
| --- | ---: | ---: | ---: |
| 服务端 TypeScript 文件 | 383 | 360 | -23 |
| 服务端 TypeScript 行数 | 89,426 | 78,360 | -11,066 |
| 服务端生产文件 | 247 | 231 | -16 |
| 服务端生产行数 | 62,912 | 53,770 | -9,142 |
| 服务端测试文件 | 136 | 129 | -7 |
| 服务端测试行数 | 26,514 | 24,590 | -1,924 |

删除内容为：G1 model/constraint/trigger DSL、manifest assembler/source closure、Prisma renderer/writer/check、migration renderer/writer/check、对应 CLI、历史 Gate ownership 和只服务这些模块的测试。`apps/server/package.json` 同步删除六个失效命令。

保留内容为：

- `apps/server/prisma/contracts/g1-schema-manifest.json`
- `apps/server/prisma/schema.prisma`
- `apps/server/prisma/migrations/0001～0017`
- `release-schema-identity.ts` 与测试
- G1 至 0017 的 runtime migration ledger 与测试
- `schema-contract.spec.ts`、全部 overlay contract
- `g1-schema-trigger-sqlite-semantics.spec.ts` 的 36 个真实 SQLite 语义用例
- final importer、verifier、DB-only 启动、backup/restore 与 archive

# 验证证据

- 退役前：G1 manifest/schema/migration exact check、Prisma validate 通过。
- 退役后：保留契约 4 files/43 tests、server 129 files/790 tests、全仓 typecheck、server build、Prisma validate 全部通过。
- 删除前后 `schema.prisma`、历史 manifest 和 migration tree aggregate SHA-256 完全一致。
- 标准库只读结果：`db_only`，17/17 migrations，`integrity_check=ok`，`foreign_key_check` 为空。
- 非文档代码搜索只剩 trigger 语义测试读取历史 manifest；没有已删除生成器的调用方。

# Scrutiny Review

通过。删除闭包与 ADR-0015 一致，数据库 artifact 和运行安全门禁未受影响，必要语义测试没有被删除或弱化。残留风险是无法再从 Markdown/DSL 本地重建历史基线；该代价已由 ADR 明确接受，并由版本控制、冻结 artifact SHA、runtime ledger 和 release identity 补位。

# Runtime/User Review

通过（后端等价复核）。本次无 UI/用户路径变化，人工页面验收不适用；标准 DB-only 只读检查、fresh migration/项目/任务/备份恢复集成测试及全量服务端回归均通过。
