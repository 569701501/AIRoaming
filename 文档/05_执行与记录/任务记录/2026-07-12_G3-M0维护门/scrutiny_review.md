---
doc_id: AIR-G3M0-SCRUTINY-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, qa
source: G3-M0 静态复核
---

# Scrutiny Review

结论：M0 范围内通过，允许交给下一切片；不允许把 M0 误报成 migration ready。

- 新写入的已识别入口通过 coordinator：ProjectStore、Dialogue send/stream、Tasks create/cancel/worker、ToolCallback mutation、Settings update、PersistentTaskWorker。
- loopback 与 token file 是 controller 的双重条件；缺 token、错误权限和错误 token 均 fail-closed。
- bundle digest 排除自身，bundle payload 不包含 token/apiKey；不可观察状态用稳定 reason 显式记录。
- 仍有 bridge 前内存态和未来 snapshot/importer 的观察缺口，已写入 `unobservableBeforeBridge` 与 handoff，不能在 M0 关闭该风险。
- 未修改 G3 enum、Prisma migration 0010 或 G3 core schema。
