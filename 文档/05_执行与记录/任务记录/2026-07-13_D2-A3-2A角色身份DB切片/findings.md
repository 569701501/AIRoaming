---
doc_id: AIR-D2-A3-2A-CHAR-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: P4 execution
---

# Findings

- ProjectRepository 的 DB identity-map refresh 已能读取 Character/CharacterVisual/Asset 的数据库事实，适合在 focused mutation 后重建 DTO。
- 旧 CharacterReferenceService 在 DB 模式会调用 ProjectStore whole-tree write；本切片只给 update identity 加 DB 分支，保持生成/Asset/Visual 仍阻塞。
- `update_character` 不应改变 primary/preview visual 指针；视觉替换必须后续使用新版本和 provenance。
- DB identity update 已通过 focused `rowVersion` 增量与 refresh；项目/章节事实仍由 DB 读取，legacy workspace marker 字节保持不变。
- `extract_characters` 已具备 DB branch 基础但尚未升级 capability；生成 task、Asset/Visual 和场景 reference 仍未关闭。
