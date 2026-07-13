---
doc_id: AIR-D2-A3-2A-IMAGES-DONE-HANDOFF-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, reviewer
source: D2-A3-2A 连续执行
---

# 章节图像完成状态 Handoff

DB 模式在当前 Storyboard、有效 confirmed Preflight 且每个 shot 都有 current CandidateLockRevision 时，以 Chapter rowVersion CAS 推进 `milestoneStatus=images_done`；重复调用不新增版本。未锁全、preflight source 不匹配或 storyboard 为空必须 fail-closed。

不触碰 Layout/Export、Dialogue、Outbox、final importer、M6、真实数据或 provider。
