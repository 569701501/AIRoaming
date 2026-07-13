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
- [ ] M5-A4-2 restore identity/ledger。
- [ ] M5-A4-3 secret/path/compensation fault matrix。
- [ ] M5-A4-4 完整回归与正式复核。

# 当前交接

本轮只完成并提交 `M5-A4-1`，不得据此推进 A4-2、D2 或 M6。

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
- M5 仍保持 `hardening_required`；A4-2～A4-4 仍为 `not_run`，不能据此进入 D2/M6。
