---
doc_id: AIR-D2-A3-2A-CHAR-WORKER-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: P4 worker contract
---

# 实施契约

- worker 只接受已 claim 的 `character_reference_generate`，校验 lease token 与 frozen source digest。
- 图片必须先落同一 workspace virtual storageKey，再在 DB 事务内 staged→ready；记录 sha256、bytes、MIME、宽高和 sourceTaskId。
- `preview_front` current 结果建立 CharacterVisual 并更新 `Character.previewVisualId`；source 变化的迟到结果只保留 historical visual，不更新指针。
- `final_reference` 只建立 available visual，不自动替换 primary；确认动作属于后续切片。
