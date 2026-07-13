---
doc_id: AIR-D2-A3-2A-SCENE-QUEUE-MAP-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent
source: 场景参考任务持久化 Handoff
---

# 文件与函数地图

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/projects/projects.service.ts` | DB/legacy queue 路由分流 |
| `apps/server/src/projects/character-reference.service.ts` | scene source projection、task 创建、replay |
| `apps/server/src/projects/persistent-task-worker.service.ts` | scene handler、claim completion、Asset/SceneVisual 持久化 |
| `apps/server/src/migration/db-capability-registry.ts` | queue_scene_reference 证据与状态 |
| `apps/server/src/migration/db-capability-registry.spec.ts` | operation registry 断言 |
| `apps/server/src/projects/project-db-persistence.integration.spec.ts` | P4-SCENE-01 与 worker fresh SQLite 证据 |
