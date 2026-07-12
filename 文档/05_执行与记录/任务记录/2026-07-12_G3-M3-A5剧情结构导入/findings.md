---
doc_id: AIR-G3-M3-A5-FIND-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: A5 代码与 SQLite 集成证据
---

# 发现

- G1 trigger 禁止直接 INSERT confirmed StoryVersion；必须按 pending → projection → confirmed 执行，并且确认前 Chapter 必须指向 pending。
- G2 `trg_g2_story_versions_confirm_source_update` 还要求 sourceScriptVersionId 等于 Chapter currentScriptVersionId、working state 为 clean 且无 Script pending。
- 因此 source 缺失或非 current 时，当前数据库不能安全插入 confirmed/historical StoryVersion；A5 fail-closed 写 `STORY_SOURCE_UNRESOLVED` blocker，保留结构文件来源摘要在 report/ledger。
- V2 codec 不保留旧 `referenceAssetId`，SceneVisual 留给后续 Asset/Visual slice；Story documentDigest 不混入场景图片。
