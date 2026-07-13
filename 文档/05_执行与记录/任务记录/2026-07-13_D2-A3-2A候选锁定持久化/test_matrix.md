---
doc_id: AIR-D2-A3-2A-CANDIDATE-LOCK-TEST-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, reviewer
source: CandidateLock 持久化 Handoff
---

# 测试矩阵

| ID | 验证 | 结果 |
| --- | --- | --- |
| P4-LOCK-01 | ready Candidate 锁定、revision/current pointer、同候选 replay | PASS |
| CAP-02 | lock_candidate=implemented，其余 operation/capability 不误改 | PASS |
| TARGETED | registry 5 + DB integration 25 = 30 | PASS |
| FULL-SERVER | 54 files / 371 tests | PASS（场景 queue 提交时已通过；本片只增断言） |
| STATIC | server typecheck | PASS |
