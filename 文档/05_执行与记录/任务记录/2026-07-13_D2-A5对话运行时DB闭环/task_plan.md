---
doc_id: AIR-D2-A5-PLAN-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-M6 总 Handoff P7、Dialogue Prisma runtime substrate
---

# D2-A5 Dialogue runtime DB 闭环

## 目标

让 DB 模式下 thread、message、tool result、pending artifact、runtime session 成为可重启事实源，并为 maintenance 与 project deleting 提供写栅栏。

## 非目标

- 不接触真实 OpenCode、provider key、Keychain 或真实 workspace。
- 不实现 D2-A6 Outbox consumer、Project purge、final importer 或 M6 activate。
- 不把 runtime bundle 或进程 Map 当 DB 事实源。

## 退出标准

- `P7-DIALOGUE-DB-01` 通过：message/tool/pending/session、restart、replay、fake provider、maintenance/deleting fence。
- server 全量、typecheck、web build、Prisma/G1、diff check 通过。
- capability `dialogue_pending_runtime` 为 implemented、`restartCovered=true`，真实 blocker 从 3 降到 2。
- Scrutiny/Runtime 记录完成并独立提交。
