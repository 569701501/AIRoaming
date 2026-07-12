---
doc_id: AIR-G3-M3-A7-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: M3-A7 实现与 SQLite 集成证据
---

# Handoff

## 当前切片

- 入口：`db:import --kind shadow --slice characters --snapshot <sealed-dir> --decisions <normalized-decisions.json> --database-url <file:...> --report <output>`。
- 前置：A2 Project/Chapter target；可独立于 Story/Storyboard 执行。
- 产物：Character、ImportedEntitySource；不产生 CharacterVisual。

## 关键边界

- Story importer 已把旧角色 ID 映射到本切片的稳定 Character target。
- `primaryReferenceAssetId`、preview reference 和 referenceAssetIds 不能在没有 Asset/Visual 证据时直接写 current 指针。

## 下一步

实现 `shared/assets.json` 与场景/角色视觉的 Asset/Visual slice；随后才能严谨导入 Preflight source snapshot 和 Candidate history。
