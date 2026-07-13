---
doc_id: AIR-D2-A3-2A-CHAR-WORKER-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: Character worker
---

# Findings

- G1 已提供 staged→ready、图片尺寸、CharacterVisual scope 与 current pointer trigger；本切片复用既有约束，不新增 migration。
- source digest 使用 Character `rowVersion`，身份变更后旧任务会落 historical，避免迟到结果覆盖新身份。
- worker 已支持生产 handler 的 preview 文生图和 final 基于 preview 的编辑入口，但验收仅使用 fake handler。
