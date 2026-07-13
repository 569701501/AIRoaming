---
doc_id: AIR-G3-M4-EVIDENCE-COMMANDS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: 本轮临时 SQLite / server 回归与 CLI fixture
---

# M4 可复现命令证据

## 基线与范围

- 施工基线：`0c3295b`
- 证据生成前代码提交：`e6ff615`
- 证据提交：`c580050`
- 本证据只覆盖 shadow importer / verifier；不授权 `final`、backup、activate。
- 12 张旧截图删除后来由用户单独授权并在 `65c90fe` 提交；不属于 M4 生产代码或验收证据。

## 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm --filter @airoaming/server test -- --pool=forks --poolOptions.forks.singleFork=true --reporter=dot` | 47 个测试文件、302 tests 通过 |
| `corepack pnpm -w typecheck` | shared、web、server 全部通过 |
| `corepack pnpm --filter @airoaming/server g1:manifest:check` | `G1_SCHEMA_MANIFEST_OK`，manifest `sha256:ad3b0e1b…` |
| `corepack pnpm --filter @airoaming/server g1:schema:check` | `G1_PRISMA_SCHEMA_OK` |
| `corepack pnpm --filter @airoaming/server g1:migration:check` | `G1_MIGRATIONS_OK`，8 migrations / 195 checks / 194 triggers |
| `DATABASE_URL=file:<temporary>` + `prisma validate` | Prisma 6.19.3 schema valid |
| `git diff --check` | 通过 |

## 复核基线与后续验证

- 复核基线：`8a70758`；本轮新增 `IMP-M4-28/29/30/31` 仅增加 full CLI 成功/blocked/final fail-closed/独立 slice dispatch 回归测试，不改变 importer/verifier 生产逻辑。
- 后续验证提交：`4972d8e`；补齐 `IMP-M4-31` 的 16 个独立 slice CLI dispatch 回归，未改变 importer/verifier 生产逻辑。
- 当前复跑：server 47 个测试文件、303 tests 全部通过；workspace typecheck、G1 manifest/schema/migration check、Prisma validate、`git diff --check` 全部通过。
- 复核 HEAD 为 `65c90fe`，签字前工作树干净；该提交只处理用户授权的旧截图删除，没有 M4 生产代码变化。

## M4 定向证据

- `IMP-M4-01～31` 与 full shadow / API / DB-only / pending Dialogue 链路：迁移集成文件 58/58 通过。
- `IMP-M4-10`：16 个 shadow slice 逐片 verifier 通过来源计数和注册表校验。
- `IMP-M4-23～25`：报告 artifact 缺失、非法、摘要不一致均 fail-closed。
- `IMP-M4-26`：临时 SQLite 上真实 `db:verify` CLI 成功，并核对输出文件与 `--import-report`。
- `IMP-M4-27`：缺少 `--import-report` 在 Prisma 初始化前返回 `MIGRATION_VERIFY_ARGS_INVALID`。
- `IMP-M4-28`：临时 SQLite 上真实 `db:import --kind shadow --slice full` 返回 `MIGRATION_IMPORT_OK`，聚合报告包含 16 个有序 slice 和 16 条 MigrationRun。
- `IMP-M4-29`：临时 SQLite 上 blocked full CLI 返回 `MIGRATION_IMPORT_BLOCKED`/退出码 2，聚合报告只含首个 blocked slice，数据库只保留 1 条 run。
- `IMP-M4-30`：`db:import --kind final` 真实 CLI 在 Prisma 初始化前返回 `MIGRATION_FINAL_IMPORT_NOT_READY`，没有 stdout 或数据库副作用。
- `IMP-M4-31`：16 个独立 `db:import --kind shadow --slice <slice>` 真实 CLI 入口按依赖顺序返回 `MIGRATION_IMPORT_OK`，报告摘要合法，数据库保留 16 条 run。

## 当前残留

- M4 已于 2026-07-13 正式验收通过，状态为 `completed`。
- `db:import --kind final`、M5 backup/restore、M6 activate/cutover 继续 fail-closed 或未实现。
