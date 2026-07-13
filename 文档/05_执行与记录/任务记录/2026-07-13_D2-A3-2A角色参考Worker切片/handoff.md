---
doc_id: AIR-D2-A3-2A-CHAR-WORKER-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent, qa
source: P4 Character/Asset contract
---

# Character reference worker

DB `character_reference_generate` 已接入持久 worker：claim 后通过可注入 handler 产出图片，先写 staged Asset，再完成 ready Asset、CharacterVisual 和受 source digest 保护的 preview 指针更新。final reference 不自动写 primary 指针。

本切片禁止真实 provider、真实凭据、真实 workspace、Outbox、SceneVisual、确认/删除 API。
