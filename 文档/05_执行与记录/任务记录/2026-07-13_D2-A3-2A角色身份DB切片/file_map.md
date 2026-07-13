---
doc_id: AIR-D2-A3-2A-CHAR-FILEMAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent
source: Character identity slice
---

# 文件与函数地图

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/projects/character-reference.service.ts` | DB identity update/extract branch与 refresh |
| `apps/server/src/projects/projects.service.ts` | DB 模式不再提前拒绝 `update_character` |
| `apps/server/src/migration/db-capability-registry.ts` | `update_character` evidence/status |
| `apps/server/src/projects/project-db-persistence.integration.spec.ts` | fresh SQLite + legacy workspace isolation |

禁止修改 schema/migration、Asset bytes、CharacterVisual、Outbox、provider、M6。
