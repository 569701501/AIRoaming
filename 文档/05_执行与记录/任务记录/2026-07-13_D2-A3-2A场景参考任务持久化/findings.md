---
doc_id: AIR-D2-A3-2A-SCENE-QUEUE-FINDINGS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, reviewer
source: 场景参考任务持久化实施
---

# Findings

- 直接在测试中拼装 ChapterScriptVersion 并更新 Chapter 指针会触发正式外键/版本约束；夹具已改用 ScriptVersionRepository 与 StoryVersionRepository，避免绕过业务 CAS。
- Story confirm 会建立 ChapterScene 投影，因此 queue 测试复用现有行，不重复插入。
- `queue_scene_reference` 可独立从 Character/Asset 聚合中开放，但聚合仍为 partial，delete 与 CandidateLock 不能因此提前放行。
