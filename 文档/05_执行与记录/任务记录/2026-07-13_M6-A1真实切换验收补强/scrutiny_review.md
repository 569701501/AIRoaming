---
doc_id: AIR-M6-A1-SCRUTINY-001
status: passed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: reviewer, human, ai-agent
source: M6-A1 实施契约、测试矩阵、代码与回归证据
---

# M6-A1 Scrutiny Review

## 结论

结论：`passed`（仅针对 M6-A1 隔离工程证据）。

本复核确认 A1-1～A1-4 的实现、定向测试、全量回归和文档留痕相互一致。该结论不等于真实切换通过，也不授予真实 workspace、真实数据库、真实 Keychain、真实 provider 或真实 C0～C7 的执行权限。

## 代码范围

- pre-cutover/coordinated backup 判别联合、manifest 和 restore kind 分支。
- closed runtime bundle、ReadyCoordinator 和 activate identity 校验。
- 持久 C0～C7 evidence root、顺序、重启续跑、幂等和 identity 冲突保护。
- `PrismaService.runBusinessTransaction` 及业务 mutation owner registry/source guard。
- 真实隔离 C0～C7 rehearsal 和 ready/recovery 只读启动修正。

## 复核结论

| 复核项 | 结论 | 证据 |
| --- | --- | --- |
| manifest/final/ready/activate identity | 通过 | `app-backup-restore.integration.spec.ts`、`db-activate.service.spec.ts`、`m6-c0-c7.rehearsal.spec.ts` |
| 业务写边界 | 通过 | `business-write-boundary.spec.ts`、`prisma.service.spec.ts`、项目 DB 集成回归 |
| 真实隔离链 | 通过 | `M6A1-C0-C7 / M6A1-CHAIN-01`，真实 Prisma migrate deploy + 16 slice final + API read + activate + 首写 |
| 回归门禁 | 通过 | server 61 files / 412 tests；workspace typecheck；server/web build；Prisma/G1 checks |
| capability 状态 | 通过 | `blockedIds=[]`，未误改其它 capability |
| 文档状态 | 通过 | progress、test matrix、session、MEMORY、Runtime Review、完成记录已同步 |

## 明确保留的未执行项

- 真实用户数据、真实 dataRoot、真实 Keychain、真实 provider 和真实停写：`0` 次。
- G1 真实授权、观察期 OBS-01～10、真实 C0～C7：继续 `not_run`。
- 矩阵中的故障注入、crash-resume、raw/reseal 负例若未有直接测试 ID，不能从代码阅读推断为通过。

## 最终边界

当前只能写成：`M6-A1 isolated verification passed / real cutover no-go`。未经用户单独授权，不得执行真实 `db:activate --execute`、真实停写或真实 C0。
