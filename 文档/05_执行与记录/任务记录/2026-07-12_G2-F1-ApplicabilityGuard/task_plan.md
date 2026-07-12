---
doc_id: AIR-G2-F1-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2 任务协议与 E1/E2 交接
---

# G2-F1 TaskApplicabilityGuard 任务计划

## 目标

实现任务完成前的纯检查门：复用 `NewWorkGateService` 判断 source/target/Preflight 是否仍 current，输出 `current` 或 `historical`，不直接写版本表、不伪造 worker。

## 退出标准

- story_parse 的 pending target/source 仍匹配时返回 current。
- 不存在 pending target、来源已变化或 Preflight 不 current 时返回 historical 和 reasonCodes。
- Guard 可由未来持久 worker 在最终 apply 前调用；当前不接管内存 TasksService，不宣称 worker/runtime 已完成。
- fresh SQLite、类型检查、全量回归和文档复核通过。
