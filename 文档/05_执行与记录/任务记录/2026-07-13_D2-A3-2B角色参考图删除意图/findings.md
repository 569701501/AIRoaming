---
doc_id: AIR-D2-A3-2B-DELETE-FINDINGS-001
status: passed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa, ai-agent
source: P5 code exploration and SQLite fixture
---

# Findings

- Character assets使用 `chapterId=null`，Candidate 关系仍按 assetId 做历史引用保护；不能为了删除方便级联删除历史行。
- G1 Asset 状态允许 `ready -> deleting`，CharacterVisual 状态允许 `available -> removed`；必须先清空 Character current/preview 指针，才能满足反向约束。
- `asset.delete` 的 payload 必须含 `schemaVersion、assetId、projectId、chapterId、storageKey、expectedSha256、reason`，reason 固定为 `explicit_delete`。
- `OutboxEvent` 终态不可重开；已 failed 的同一 idempotency key 不在 P5 自动重试或覆盖。
- P5 只能证明 intent 边界；物理文件仍在是正确结果，不是失败。
