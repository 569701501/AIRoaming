---
doc_id: AIR-D2-A3-2A-CHAR-TASK-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent, qa
source: P4 Character/Asset contract
---

# Character reference task persistence

目标：DB 模式 `queue_character_reference` 先创建持久 `GenerationTask`，冻结 Character source projection/digest，支持同一输入幂等重放；不调用 provider、不写物理图片、不伪造 Asset ready。

本切片不关闭 `generate_character_reference`、`confirm_character_preview`、`confirm_character_reference`、`delete_character_reference` 或 SceneVisual；这些继续由后续 staging/visual slice 负责。
