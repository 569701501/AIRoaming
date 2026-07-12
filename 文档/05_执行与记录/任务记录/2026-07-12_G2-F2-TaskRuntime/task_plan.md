---
doc_id: AIR-G2-F2-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2 五份施工资料与 G1 Task schema
---

# 目标

在不改动 G1 schema 的前提下，让 DB mode 的 runtime task 具备可重启、可 fencing、可重试的持久化状态机。

# 阶段与退出标准

1. 复核 GenerationTask 触发器与 TaskSourceProjection：完成。
2. 实现 repository create/claim/heartbeat/finish/cancel：完成。
3. 实现全局并发槽位池和 startup recovery：完成。
4. 用 fresh SQLite 覆盖 replay、retry、迟到结果、过期租约：完成。
5. 全量 typecheck/test/G1 contract checks 与 handoff：完成。

# 非目标

- 不新增 migration/schema 字段。
- 不在本切片伪造 provider 输出。
- 不把 in-memory file mode 改成 DB+file 双写。
