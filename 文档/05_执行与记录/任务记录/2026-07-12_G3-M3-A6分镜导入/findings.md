---
doc_id: AIR-G3-M3-A6-FIND-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: A6 代码与 SQLite 集成证据
---

# 发现

- StoryboardVersion 的 source 三元组绑定 current StoryVersion 的 id/documentDigest；没有 current Story 或 source 版本不匹配时只能 blocker。
- G1/G2 trigger 要求 Storyboard pending 行先被 Chapter.pendingStoryboardVersionId 指向，Shot/Projection 先建好，再切 confirmed/current。
- V2 不保存旧 `lockedCandidateId/status`；锁定状态、Candidate 和 Asset 由后续证据切片处理。
- 当前 A6 测试使用无角色 token 的合法 storyboard；任何非空但未导入的角色 token 都拒绝，避免悬空 `StoryboardShotCharacter` 外键。
