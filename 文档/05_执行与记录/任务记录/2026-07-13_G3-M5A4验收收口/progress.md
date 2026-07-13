---
doc_id: AIR-G3-M5-A4-PROGRESS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5-A4 task plan
---

# 进展

- [x] 独立复跑 M5 capability/backup/restore 定向测试：基线 11/11 通过。
- [x] 独立复跑 server typecheck：通过。
- [x] 对照原 implementation contract 与 acceptance checklist 逐项审查生产代码和测试。
- [x] 确认 M5 需要 A4 收口，不能直接进入 D2/M6。
- [x] 编写 A4 实施契约、验收清单、Luna handoff 与 D2/M6 后续路线。
- [x] 文档基线复核：server 49 files/314 tests、workspace typecheck、G1 manifest/schema/migration check、`git diff --check` 通过；这些只证明当前回归稳定，不把 A4 `not_run` 项改绿。
- [x] M5-A4-1 backup 一致性栅栏与 CLI grammar：实现完成，定向 10/10、server 全量 49 files/317 tests 通过。
- [x] M5-A4-2 restore identity/ledger：实现完成，定向 22/22、server 全量 49 files/329 tests 通过。
- [ ] M5-A4-3 secret/path/compensation fault matrix。
- [ ] M5-A4-4 完整回归与正式复核。

# 当前交接

上一轮只完成并提交 `M5-A4-1`；本轮完成并提交 `M5-A4-2`，先做复核后停止，不推进 A4-3、D2 或 M6。

2026-07-13 独立复核确认 M5 仍未完成；已新增 A4-2 handoff、实施契约、测试矩阵、文件地图和复核清单。下一执行者只领取 `handoff_a4_2.md`，完成后先复核，不继续 A4-3。

A4-2 施工文档先通过 `passed_for_luna_a4_2`，实现后又通过 `passed_for_a4_2`；A4-RST-01/02 已有直接测试和全量回归证据。

## A4-2 实现与证据

### 修改范围

- `apps/server/src/backup/app-restore.service.ts`：增加显式 release identity 校验；固定 16-slice summary 顺序/字段；逐项读取 MigrationRun、schema version、verification、open MigrationIssue 和 PersistenceState。
- `apps/server/src/backup/app-restore.cli.ts`：增加必填 `--release-root`，继续保持 exact grammar 和副作用前失败。
- `apps/server/src/backup/app-backup-restore.integration.spec.ts`：增加 release mismatch、缺失/重复/相对 release root、resealed semantic tamper、raw tamper 和 ledger/state/issue 故障注入。

### 验证

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm --filter @airoaming/server test -- --run src/backup/app-backup-restore.integration.spec.ts --pool=forks --poolOptions.forks.singleFork=true` | 22/22 通过 |
| `corepack pnpm --filter @airoaming/server test -- --pool=forks --poolOptions.forks.singleFork=true --reporter=dot` | 49 files/329 tests 通过 |
| `corepack pnpm --filter @airoaming/server typecheck` | 通过 |
| `corepack pnpm -w typecheck` | 通过 |
| `corepack pnpm --filter @airoaming/server prisma:validate` | 通过 |
| G1 manifest/schema/migration checks | 全部通过 |
| `git diff --check` | 通过 |

### 留存边界

- A4-2 未实现 DB/Asset/report/settings/restored roots 的 secret scan、symlink/storageKey/重叠门、第二根发布补偿安全或 A4-4 全量 rehearsal。
- A4-3、A4-4 仍为 `not_run`；M5 仍保持 `hardening_required`，不推进 D2/M6。

## A4-1 实现与证据

### 修改范围

- `apps/server/src/backup/app-backup.service.ts`：在 DB 派生读取前取得 SQLite `BEGIN IMMEDIATE` 写入栅栏；DB、ready Asset 元数据/复制和 settings 读取均在栅栏内完成；复制后复核源文件摘要，失败时不 seal。
- `apps/server/src/backup/app-backup.cli.ts`、`app-restore.cli.ts`：拒绝额外 positional、孤立值、重复/未知/缺值参数，并保持 `--format json` 精确语法。
- `apps/server/src/backup/app-backup-restore.integration.spec.ts`：增加第二 SQLite writer、active writer、CLI extra positional 的直接证据。

### 验证

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm --filter @airoaming/server test -- --run src/backup/app-backup-restore.integration.spec.ts --pool=forks --poolOptions.forks.singleFork=true` | 10/10 通过 |
| `corepack pnpm --filter @airoaming/server test -- --pool=forks --poolOptions.forks.singleFork=true --reporter=dot` | 49 files/317 tests 通过 |
| `corepack pnpm --filter @airoaming/server typecheck` | 通过 |
| `corepack pnpm -w typecheck` | 通过 |
| `corepack pnpm --filter @airoaming/server prisma:validate` | 通过 |
| G1 manifest/schema/migration checks | 全部通过 |
| `git diff --check` | 通过 |

### 留存边界

- A4-1 未实现 restore release identity/ledger 精确核对、SecretStore/secret fault matrix、路径补偿矩阵或全量 runtime rehearsal。
- 当时 M5 仍保持 `hardening_required`；现 A4-2 已完成，A4-3/A4-4 仍为 `not_run`，不能据此进入 D2/M6。
