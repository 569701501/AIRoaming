---
doc_id: AIR-G2-F1-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-F1 代码探索
---

# 探索发现

- 当前 `TasksService` 仍是内存 Map 和直接 worker；不能把 Guard 接到它上面后冒充 SQLite persistent runtime。
- E1 NewWorkGate 已经具备任务创建前门禁，F1 只在完成前复用该门禁，并额外比较 image task 的 expected Preflight sourceDigest。
- Guard 的 historical 是“不得写 current”的决定，不是删除任务或伪造成功；未来 worker 应把结果登记为 historical evidence。
