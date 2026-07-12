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
- 既有截图删除未纳入本轮提交。

## 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm --filter @airoaming/server test -- --pool=forks --poolOptions.forks.singleFork=true --reporter=dot` | 47 个测试文件、300 tests 通过 |
| `corepack pnpm -w typecheck` | shared、web、server 全部通过 |
| `corepack pnpm --filter @airoaming/server g1:manifest:check` | `G1_SCHEMA_MANIFEST_OK`，manifest `sha256:ad3b0e1b…` |
| `corepack pnpm --filter @airoaming/server g1:schema:check` | `G1_PRISMA_SCHEMA_OK` |
| `corepack pnpm --filter @airoaming/server g1:migration:check` | `G1_MIGRATIONS_OK`，8 migrations / 195 checks / 194 triggers |
| `DATABASE_URL=file:<temporary>` + `prisma validate` | Prisma 6.19.3 schema valid |
| `git diff --check` | 通过 |

## 本轮复核基线

- 复核基线：`8a70758`；本轮新增 `IMP-M4-28` 仅增加 full CLI 回归测试，不改变 importer/verifier 生产逻辑。
- 当前复跑：server 47 个测试文件、300 tests 全部通过；workspace typecheck、G1 manifest/schema/migration check、Prisma validate、`git diff --check` 全部通过。
- 工作区仍只保留既有 12 张截图删除；本轮没有将其纳入提交。

## M4 定向证据

- `IMP-M4-01～28` 与 full shadow / API / DB-only / pending Dialogue 链路：迁移集成文件 55/55 通过。
- `IMP-M4-10`：16 个 shadow slice 逐片 verifier 通过来源计数和注册表校验。
- `IMP-M4-23～25`：报告 artifact 缺失、非法、摘要不一致均 fail-closed。
- `IMP-M4-26`：临时 SQLite 上真实 `db:verify` CLI 成功，并核对输出文件与 `--import-report`。
- `IMP-M4-27`：缺少 `--import-report` 在 Prisma 初始化前返回 `MIGRATION_VERIFY_ARGS_INVALID`。
- `IMP-M4-28`：临时 SQLite 上真实 `db:import --kind shadow --slice full` 返回 `MIGRATION_IMPORT_OK`，聚合报告包含 16 个有序 slice 和 16 条 MigrationRun。

## 当前残留

- M4 等待正式验收签字，状态保持 `in_progress`。
- `db:import --kind final`、M5 backup/restore、M6 activate/cutover 继续 fail-closed 或未实现。
