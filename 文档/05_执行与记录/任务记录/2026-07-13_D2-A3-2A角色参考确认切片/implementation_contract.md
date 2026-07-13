---
doc_id: AIR-D2-A3-2A-CHAR-CONFIRM-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: P4 confirmation contract
---

# 实施契约

- 只能确认同项目、同角色、ready Asset，且 CharacterVisual kind 必须匹配。
- preview 确认不伪造 final primary；lead/recurring/chapter/minor 继续排队 final，extra 不自动排队。
- final 确认在事务内更新 primaryVisualId、status、finalizedAt、rowVersion；in_use 角色不能切换到其他资产。
- DB 分支不写 legacy project files。
