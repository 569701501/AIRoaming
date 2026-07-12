---
doc_id: AIR-G3-M3-A7-FIND-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: A7 代码与 SQLite 集成证据
---

# 发现

- `Character` 的 current visual 指针必须同时满足 CharacterVisual available、Asset ready 和 project scope；没有 Asset 证据不能导入 preview/primary 指针。
- Story V2 `projectCharacterId` 不是旧 workspace ID；必须与 Character importer 共用 `workspace-v1:{projectId}:Character:{legacyId}` sourceKey。
- A7 只导入角色文本身份，视觉字段保持 null，避免伪造 ready Asset 或 CharacterVisual。
