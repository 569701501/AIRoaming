---
doc_id: AIR-D2-A3-2A-REFERENCE-LEGACY-CONTRACT-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent
source: 参考图旧入口退役 Handoff
---

# 实施契约

| operation | DB 行为 | replacement |
| --- | --- | --- |
| ensure_character_previews | 409 retired | per-character queue |
| generate_character_reference | 409 retired | queue character reference |
| generate_scene_reference | 409 retired | queue scene reference |

退役不删除历史，不调用 provider，不触碰 workspace。
