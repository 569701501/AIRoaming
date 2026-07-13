---
doc_id: AIR-D2-A3-2A-SCENE-WORKER-FILEMAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent
source: SceneVisual worker
---

# 文件与函数地图

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/projects/persistent-task-worker.service.ts` | scene handler、Asset/SceneVisual promote、source fencing |
| `apps/server/src/projects/character-reference.service.ts` | DB scene task source projection（公开入口仍 blocked） |
| `apps/server/src/projects/project-db-persistence.integration.spec.ts` | fresh SQLite SceneVisual 证据 |
