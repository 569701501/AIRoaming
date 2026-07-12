---
doc_id: AIR-G2-F2-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G1 SQL trigger review and F2 integration evidence
---

# 关键结论

1. GenerationTask 的 source seal 不能依赖 SQL 计算 digest；应用必须用 shared canonical JSON 计算 `Task.sourceDigest`，并把同一 projection 写入 `inputJson` 与 `GenerationTaskSource`。
2. claim 只更新 GenerationTask；G1 trigger 会在同一 SQLite 事务内 materialize TaskAttempt 和占用空闲 TaskConcurrencySlot。
3. finish 必须先更新 task output/error/nextRunAt，再完成开放 Attempt；Attempt trigger 才能根据 retry window 决定 retrying 或终态并释放 slot。
4. concurrency slot 是全局池，唯一键是 `(concurrencyKey, slotNo)`；创建任务时必须补齐池，不得每个 task 重复插入相同 slot。
5. 迟到 worker 不能依靠 taskId 写回结果；claimToken、开放 Attempt、running 状态和 lease expiry 任一不满足都返回 `TASK_LEASE_LOST`。
6. G2 overlay 对 story_parse/shot_generate 的 seal 还要求真实 current script 与 pending target；测试必须先构造合法版本链，不能拿空 Chapter 伪造 runtime task。

# 风险

- 当前 repository 已能记录 `applicability`，但不会替 provider 执行 Story/Storyboard 的 current/historical 完成事务。
- startup recovery 只负责状态收敛，不会重放 provider；真实 worker 接入前任务仍是可持久化但不可自动执行的 runtime substrate。
