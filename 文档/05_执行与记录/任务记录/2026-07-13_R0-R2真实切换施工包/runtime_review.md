---
doc_id: AIR-RCUT-RUNTIME-001
status: changes_requested
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: reviewer, release-owner, ai-agent
source: R0-A 隔离测试与 M6 rehearsal
---

# R0-A Runtime Review（隔离）

## 结论

`changes_requested`。本轮没有连接真实系统；只验证临时目录、fake SecretStore/fake executor、隔离 SQLite 和仓库 fixture。

## 已执行证据

- 完整 R0-A 定向：13 个 spec、103 个测试通过；服务端全量 68 个 spec、468 个测试通过（含 C5 smoke failure、C7 crash/reopen、首写 file-guard、RCUT-RB-01、RCUT-SEC-08、RCUT-PATH-01/02/03、RCUT-EVD-09）。
- `cutover-runner.service.ts` 的 C1 maintenance 与 C3 migration/settings 注入 seam 已在临时根通过；migration 使用隔离 SQLite，SecretStore/maintenance 仍为 fake。
- runner 的 C1/C3/C4/C5/C7 失败路径已证明在临时根停止后续写入、恢复环境或关闭 Prisma；两个 fresh 临时根已跑通真实 domain C0～C7，并完成 C4 backup/restore 与 C7 activation。
- 新 `DbCutoverService` 协议层的两个 fresh identity-bound C0～C7/replay chain 已通过；action 仍为 fake，不等价于真实 domain runner。
- M6 既有隔离 rehearsal：真实临时 SQLite 的 final import、restore、ready、API smoke、activate 和首写边界通过；这只是历史 isolated evidence。
- 新 evidence store：C0～C6、C7 completion seal、resume conflict、raw/semantic tamper、marker 校验、action/rename failure、db_only completion reconcile 通过。
- fake CLI：非 test、非 tmp root 及缺 test-only 标志在 Prisma 初始化前拒绝。
- 真实 `security`、真实 provider、真实 workspace/dataRoot、真实维护 API 调用次数均为 0。

## 尚未满足

- C7 crash/reopen、first-write 后 file guard、C5 smoke 失败和 RCUT-RB-01 统一 C1～C4 故障回滚矩阵已在 fresh 隔离链通过；本记录仍不能替代独立于实现者的 Runtime Review。
- 因此不得把本记录改为 `passed_isolated`，也不得进入 R0-B/R1。

## 复核者

Runtime Review：Codex（仅隔离运行复核；未代签 AUTH 门）。
