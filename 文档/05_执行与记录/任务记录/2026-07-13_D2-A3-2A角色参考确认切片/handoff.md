---
doc_id: AIR-D2-A3-2A-CHAR-CONFIRM-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent, qa
source: P4 Character/Asset contract
---

# Character visual confirmation

DB `confirm_character_preview` 与 `confirm_character_reference` 已接通。preview 确认只切换 previewVisual，并按角色层级决定是否排队 final；final 确认才切换 primaryVisual、状态和 finalizedAt。删除、SceneVisual、真实 provider 仍不在本切片。
