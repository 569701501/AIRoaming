---
doc_id: AIR-D2-A3-2A-CANDIDATE-LOCK-CONTRACT-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent
source: CandidateLock 持久化 Handoff
---

# 实施契约

| 项目 | 契约 |
| --- | --- |
| 入口 | `ProjectsService.lockChapterCandidate` |
| DB 事实 | Candidate、ready Asset、Shot、CandidateLockRevision |
| revision | 当前 revision + 1；`previousRevisionId` 指向当前；action=`lock` |
| origin | `runtime`（G1 CHECK 允许值） |
| pointer | 同事务更新 `Shot.currentCandidateLockRevisionId` |
| replay | current revision 的 candidateId 已相同则不新增 revision |
| 文件模式 | 维持原 workspace 实现 |

Candidate.status 不伪造 `locked` 值；公共锁定状态由 Shot current lock revision 投影派生，符合数据库 CHECK。
