---
doc_id: AIR-D2-A2-2-FILEMAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent
source: D2-A2-2 contract
---

# 文件与函数地图

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/migration/db-capability-registry.ts` | retired 状态、reason/replacement/evidence、blocked 计算 |
| `apps/server/src/projects/projects.service.ts` | reset/import/legacy route 稳定拒绝；保留 file mode |
| `apps/server/src/projects/versioning/script-version.repository.ts` | G2 clear/adopt/discard CAS，不删除历史 |
| `apps/server/src/projects/project-db-persistence.integration.spec.ts` | fresh SQLite retired rejection + modern replacement evidence |
| `apps/server/src/migration/db-capability-registry.spec.ts` | registry/blockedIds=5 |
| `文档/05_执行与记录/任务记录/2026-07-13_D2-A2-2安全清空导入退役/` | progress/findings/review/完成记录 |

禁止修改 schema、0001～0010、G1 generator、A3/A6/M6。
