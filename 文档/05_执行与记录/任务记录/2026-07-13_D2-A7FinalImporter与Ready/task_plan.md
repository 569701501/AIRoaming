---
doc_id: AIR-D2-A7-PLAN-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: D2 至 M6 总 Handoff、implementation_contract.md、test_matrix.md
---

# D2-A7 Final Importer 与 Ready Coordinator

## 目标

在不触碰真实 workspace、真实数据库、真实 Keychain 或真实 provider 的前提下，完成 final import、final verifier 和 `ready_for_activation` coordinator。复用既有 16-slice shadow mapper，建立一个权威 `MigrationRun(kind=final)`，为 D2-A8 综合见证提供正式入口。

## 非目标

- 不实现真实 final import、真实 pre-cutover backup 或真实 `db:activate --execute`。
- 不改变 `schema.prisma`、0001～0010 migration、G1 trigger 或旧历史。
- 不新增 review-attestation、双签、CAS 审查 bundle 等流程基础设施。
- 不把 `ready_for_activation` 误写成 `db_only`，不设置 `activatedAt/firstBusinessWriteAt`。

## 实现范围

| 范围 | 结果 |
| --- | --- |
| `final-import-report.ts` | 严格 exact-key codec、digest、16-slice summary |
| `final-importer.ts` | 显式输入、fresh target、final run、shadow child evidence、integrity/FK/secret gate、replay/conflict |
| `migration-verify.service.ts` | final report、verification、child run、identity 绑定只读核验 |
| `ready-coordinator.ts` | final/verify/capability/secret/backup/maintenance 全绿后写 `ready_for_activation` |
| `db-import.cli.ts` | final exact grammar、JSON 输出、fail-closed 状态码 |
| `db-ready.cli.ts` | ready exact grammar、JSON 输出 |
| integration spec | FIN-01～FIN-10、FIN-CLI-01 |

## 退出标准

- FIN-01～FIN-10、FIN-CLI-01 全部通过。
- server 全量 54 files/391 tests 通过；workspace/server typecheck、web build、Prisma/G1 门禁和 diff check 通过。
- Scrutiny Review 与临时根 Runtime Review 通过。
- capability CLI 仍为 8/36/`blockedIds=[]`。
- 独立 commit 后才进入 D2-A8。
