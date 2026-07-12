---
doc_id: AIR-G2-F1-PROGRESS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-F1 执行记录
---

# 进度

- 新增 `TaskApplicabilityGuardService.evaluate/assertCurrent`，复用 NewWorkGate，不复制 source/pending/Preflight 条件。
- Guard 只返回 `applicability: current|historical`、reasonCodes 和 productionState；没有写权限，未来由持久 worker 调用后决定是否登记迟到结果。
- fresh SQLite 集成覆盖 current story_parse gate 和不满足 shot_generate 时 historical 结果。
- 未改造现有内存 TasksService，未实现 claim/lease/heartbeat/recovery 或 task history。

验证：Shared 34 tests、Server 178 tests、workspace typecheck、G1 checks、`git diff --check` 全部通过。
