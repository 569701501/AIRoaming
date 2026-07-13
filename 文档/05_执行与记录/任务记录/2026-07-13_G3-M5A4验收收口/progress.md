---
doc_id: AIR-G3-M5-A4-PROGRESS-001
status: completed
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
- [x] M5-A4-3 secret/path/compensation fault matrix：实现完成，新增故障证据与原集成 spec 合计 32/32 通过。
- [x] M5-A4-4 完整回归与正式复核：server 49 files/340 tests、全量门禁、Runtime/User Review、Scrutiny Review 全部通过。

# 当前交接

M5-A4-1～A4-3 已分阶段提交；本轮完成 A4-4 最终回归和双 Review，M5 恢复 `completed`，不推进 D2 或 M6。

2026-07-13 A4-2～A4-4 五份施工资料均已落地并执行；最终 Scrutiny/Runtime Review 通过，M5 完成。D2/M6 仍需独立授权，不从本任务自动开始。

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
- A4-4 已完成；M5 已恢复 `completed`。D2/M6 不在本任务范围内。

## A4-3 实现与证据

### 修改范围

- `apps/server/src/backup/app-backup.service.ts`：扫描真实 DB TEXT/BLOB、Asset、run/report/settings 内容；seal 前 sentinel 命中即失败；release root 加入重叠门。
- `apps/server/src/backup/app-restore.service.ts`：bundle/恢复后 sentinel 扫描、storageKey 安全解析、restore root 重叠门、rename adapter 与 inventory 绑定补偿清理。
- `apps/server/src/backup/app-backup-restore.integration.spec.ts`：增加 full-shadow 缺/重复 slice、DB/Asset sentinel、symlink/重叠、non-sealed、storageKey 越界、第二根失败安全/不安全补偿测试。

### 验证

| 命令 | 结果 |
| --- | --- |
| backup/restore 集成 spec | 32/32 通过 |
| server typecheck | 通过 |

### 留存边界

- A4-3 阶段未包含 A4-4 的完整重启/API/secret 后运行态 rehearsal 与最终双 Review；该缺口已由 A4-4 补齐。

## A4-4 最终回归与证据

- A4-RST-05：33/33 集成 spec 中直接验证恢复 DB/workspace sentinel=0、closed maintenance、`GET /api/projects` 和 `PersistenceState shadow/null/null`。
- A4-REG-01：server 49 files/340 tests、workspace/server typecheck、G1 三项、Prisma validate、`git diff --check` 全部通过。
- Scrutiny Review：`passed_for_m5`；Runtime/User Review：`passed_for_m5_backend_fixture`。
- A4 全部 acceptance ID 已标记 `passed`；M5 状态恢复 `completed`。

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
- A4-1 结束时 M5 仍保持 `hardening_required`；随后 A4-2～A4-4 已完成，不能据此自动进入 D2/M6。
