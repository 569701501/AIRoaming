---
doc_id: AIR-D2-M6-REAL-CUTOVER-HANDOFF-001
status: awaiting_authorization
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa, release-owner
source: M6 工具与隔离演练完成记录、G3-M 施工包
---

# 真实切换授权 Handoff

## 当前结论

代码与临时根证据已达到 `ready_for_real_cutover_authorization`。这不是真实切换批准，也不代表真实 workspace、数据库或凭据已经操作。

## 已完成证据

- M5-A0～A4：协调备份/空根恢复完成。
- D2-A7：final importer、verifier、ready coordinator、FIN-01～10。
- D2-A8：双 fresh/replay/restart/legacy isolation，D2-WIT-01～05。
- M6：`db:activate` dry-run/execute、首写事务、file bridge、metadata archive、C0-C7 临时根 8/8。
- capability：8/36，`blockedIds=[]`。
- 服务端全量：59 files/403 tests 通过。

## 仍需一次明确授权后才能执行

1. 指定真实 release、dataRoot、workspaceRoot、SecretStore 和维护窗口。
2. 由责任人确认停写、备份盘空间、恢复联系人和回滚窗口。
3. 按 C0→C7 顺序执行真实 pre-cutover backup、restore rehearsal、final import/ready、maintenance smoke、metadata archive、`db:activate --execute`。
4. 首笔真实业务写后进入观察期；不得 down migration 或 file-only 回退。

## 禁止默认执行

- 真实 Keychain/provider secret 读取或写入。
- 未授权的真实停写、真实 backup、真实 activate、真实数据导入。
- 用临时根测试结果替代真实 go/no-go。
