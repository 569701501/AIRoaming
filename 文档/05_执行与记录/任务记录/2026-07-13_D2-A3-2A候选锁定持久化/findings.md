---
doc_id: AIR-D2-A3-2A-CANDIDATE-LOCK-FINDINGS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, reviewer
source: CandidateLock 持久化实施
---

# Findings

- `CandidateLockRevision.origin` 的正式 CHECK 只允许 `runtime`/`legacy_import`，公开运行时锁定必须使用 `runtime`。
- Candidate.status 的正式 CHECK 不含 `locked`；锁定状态由 Shot current pointer + revision 投影提供，不能直接写入非法状态。
- 线性 revision 与 current pointer 必须同一事务更新，重复请求在 current candidate 相同的情况下只读 replay。
