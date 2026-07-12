---
doc_id: AIR-G2-D1-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-D1 代码探索与运行验证
---

# 探索发现

- `StoryboardVersion`、`Shot`、`StoryboardShotProjection`、`StoryboardShotCharacter` 已存在，D1 不新增表/字段。
- G2 overlay 的 Storyboard confirm trigger 要求 Chapter 当前 Story confirmed、无 Story pending、Script clean、无 ChapterScriptPending，并且 Board source Story 与 Chapter current Story 一致。
- Storyboard V2 codec 校验 shot shape/order/枚举，但不负责跨表 Shot/Character scope；repository 在写 projection 前补做 project/chapter scope 和 Character 解析。
- stable Shot ID 必须使用 shared `stableShotId(projectId, chapterId, pendingVersionId, requestId)`；相同 requestId 在 rowVersion 已前进时只返回 replay，不再次创建 Shot。
- confirm 先在 Board pending parent 上重建 projections，再把 pending Board formalize；current Board 中被移除的 active Shot 进入 retired，retired ID 永不复活。
- D1 当前只实现手工 Working Copy/confirm；`shot_generate`、Candidate、Preflight、TaskApplicabilityGuard 仍属于后续切片。
