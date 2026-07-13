---
doc_id: AIR-D2-A3-2A-CANDIDATE-LOCK-MAP-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent
source: CandidateLock 持久化 Handoff
---

# 文件与函数地图

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/projects/image-candidate.service.ts` | DB lock transaction 与 replay |
| `apps/server/src/projects/projects.service.ts` | DB/legacy route 分流 |
| `apps/server/src/migration/db-capability-registry.ts` | `lock_candidate` evidence/status |
| `apps/server/src/migration/db-capability-registry.spec.ts` | registry 断言 |
| `apps/server/src/projects/project-db-persistence.integration.spec.ts` | P4-LOCK-01 fresh SQLite 证据 |
