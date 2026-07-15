---
doc_id: AIR-D2-M6-REAL-CUTOVER-HANDOFF-001
status: superseded
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa, release-owner
source: M6 工具与隔离演练完成记录、G3-M 施工包
---

# 真实切换授权 Handoff（已被 R0-R2 施工包替代）

## 当前结论

2026-07-13 M6-A1 完成隔离证据后，进一步核对生产 CLI 发现：final/ready 仍是 fake SecretStore only，Keychain put 仍把 secret 放进 `security -w <secret>` argv，activate 的 maintenance/evidence 参数仍可省略，且没有生产 `db:cutover` runner。因此当前为 `production_entry_changes_required / real_cutover_no_go`，本文件不得作为真实切换授权入口。

唯一当前入口：

`文档/05_执行与记录/任务记录/2026-07-13_R0-R2真实切换施工包/handoff.md`

## 已完成证据

- M5-A0～A4：协调备份/空根恢复完成。
- D2-A7：final importer、verifier、ready coordinator、FIN-01～10。
- D2-A8：双 fresh/replay/restart/legacy isolation，D2-WIT-01～05。
- M6：`db:activate` dry-run/execute、首写事务、file bridge、metadata archive、C0-C7 临时根 8/8。
- capability：8/36，`blockedIds=[]`。
- 服务端全量：59 files/403 tests 通过。

## R0-A 通过后仍需三次明确授权

1. C0 无授权只读落证；随后 `AUTH-C1` 绑定 C0 evidence，授权停写及 plan 指定的 C3 Keychain verify/prestage。
2. `AUTH-C5`：final/ready/backup/materialize 全绿后授权关闭旧 file 进程并进入 DB smoke/archive。
3. `AUTH-C7`：C5/C6 全绿后授权 activate execute。
4. 首笔真实业务写后进入 OBS-01～10；不得 down migration 或 file-only 回退。

## 禁止默认执行

- 真实 Keychain/provider secret 读取或写入。
- 未授权的真实停写、真实 backup、真实 activate、真实数据导入。
- 用临时根测试结果替代真实 go/no-go。
