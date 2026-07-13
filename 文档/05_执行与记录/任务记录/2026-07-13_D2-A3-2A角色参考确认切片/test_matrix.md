---
doc_id: AIR-D2-A3-2A-CHAR-CONFIRM-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: Character confirmation
---

# 测试矩阵

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| P4-CHAR-06 | preview confirm | previewVisual 指向 ready visual；extra 不自动排 final |
| P4-CHAR-07 | final confirm | primaryVisual 指向 final visual，status=finalized，DB-only |
| P4-CHAR-08 | scope/kind guard | 跨角色或错误 kind 被拒绝 |
