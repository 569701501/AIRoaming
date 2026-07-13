---
doc_id: AIR-D2-A3-2A-CHAR-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent, qa
source: P4 character/asset contract
---

# D2-A3-2A Character identity DB slice

本切片关闭 `extract_characters` 与 `update_character`：角色文本身份只写 Character 表，使用 DB identity-map refresh，禁止写 legacy `characters.json` 或 `LocalProject` whole-tree。角色 `in_use` 禁止修改，名称使用 project scope 唯一约束，rowVersion 递增。

不在本切片伪造生成任务、Asset、CharacterVisual/SceneVisual、ready、provider 或物理文件；其余 Character/Asset operation 继续 blocked，下一切片再做 task/source/staging/promote。
