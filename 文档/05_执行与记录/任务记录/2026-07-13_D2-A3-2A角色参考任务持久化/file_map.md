---
doc_id: AIR-D2-A3-2A-CHAR-TASK-FILEMAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent
source: Character task persistence
---

# 文件与函数地图

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/projects/character-reference.service.ts` | DB task input/source projection/idempotent queue |
| `apps/server/src/projects/projects.service.ts` | DB mode 允许 queue facade 进入持久 repository |
| `apps/server/src/tasks/persistent-task.repository.ts` | task/source rows、seal、idempotency、concurrency slot |
| `apps/server/src/projects/project-db-persistence.integration.spec.ts` | fresh SQLite queue/replay/source evidence |

禁止 provider、物理 Asset、Visual current、Outbox、M6 改动。
