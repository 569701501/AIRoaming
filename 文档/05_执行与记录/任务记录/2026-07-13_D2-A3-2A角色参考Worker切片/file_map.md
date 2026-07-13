---
doc_id: AIR-D2-A3-2A-CHAR-WORKER-FILEMAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent
source: Character worker
---

# 文件与函数地图

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/projects/persistent-task-worker.service.ts` | claim、provider handler、图片校验、Asset/Visual promote、source fencing |
| `apps/server/src/projects/character-reference.service.ts` | DB Character rowVersion source freeze |
| `apps/server/src/projects/project-db-persistence.integration.spec.ts` | fresh SQLite fake handler 与迟到结果证据 |

不改 schema/migration；不实现 final primary confirm、delete、SceneVisual 或 provider 真调用验收。
