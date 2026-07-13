---
doc_id: AIR-D2-A3-2A-CHAR-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: P4 handoff
---

# 实施契约

- DB 模式 `extract_characters/update_character` 直接写 Character，更新后只读 refresh；不调用 `ProjectStore.writeProjectFiles`。
- `name/normalizedName` 需 project scope 唯一；duplicate 与 CAS 冲突稳定失败。
- `in_use` Character 不可修改；历史 CharacterVisual/Asset 不删除、不覆盖。
- file mode 保持既有 CharacterReferenceService 写文件行为。
- operation `extract_characters/update_character` 只有在测试证据落档后才标记 implemented；aggregate 仍 partial。
