---
doc_id: AIR-D2-A3-1-FILEMAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent
source: A3-1 contract
---

# 文件与函数地图

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/projects/projects.service.ts` | DB 旧入口稳定退役；file mode 原行为 |
| `apps/server/src/migration/db-capability-registry.ts` | 7 operations retired 元数据与 aggregate 状态 |
| `apps/server/src/migration/db-capability-registry.spec.ts` | 7 retired、blockedIds=4、其他 capability 不变 |
| `apps/server/src/projects/project-db-persistence.integration.spec.ts` | fresh SQLite old rejection + modern replacement evidence |
| `apps/server/src/projects/versioning/story-version.repository.ts` | Story document/projection/current/pending/CAS（本阶段不改） |
| `apps/server/src/projects/versioning/storyboard-version.repository.ts` | Storyboard/Shot projection/current/pending/CAS（本阶段不改） |
| `apps/server/src/projects/versioning/preflight-revision.repository.ts` | Preflight snapshot/ready/source digest（本阶段不改） |

禁止修改 Prisma schema、G1 artifacts、migration SQL、Character/Asset/Outbox/M6。
