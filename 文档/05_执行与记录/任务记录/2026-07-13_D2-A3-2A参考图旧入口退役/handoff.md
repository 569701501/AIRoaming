---
doc_id: AIR-D2-A3-2A-REFERENCE-LEGACY-HANDOFF-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, reviewer
source: D2-A3-2A 连续执行
---

# 参考图旧入口退役 Handoff

DB 模式退役批量 ensure 与同步 character/scene generate 入口，稳定返回 `LEGACY_WRITE_ROUTE_DISABLED`，并给出逐角色/逐场景 queue replacement。真实生成只允许持久 task + worker；文件模式旧实现不改变。
