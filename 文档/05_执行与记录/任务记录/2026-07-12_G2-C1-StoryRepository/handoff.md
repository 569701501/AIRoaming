---
doc_id: AIR-G2-C1-HANDOFF-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: C1 handoff
---

# C1 Handoff

## 已交付

- Shared Story Working Copy API contract：summary、empty/clone create、update、discard、confirm 和统一 mutation envelope。
- DB-only `StoryVersionRepository`：pending create/update/discard/confirm、V2 codec、Character source resolution、Story scene/beat projection、CAS/replay、current pointer 切换。
- `StoryVersionService` 与 ProjectsController 五个 working-copy 路由；G1 旧 Story 路径保留。
- fresh SQLite 端到端证据：Script source gate、projection、confirm/discard/replay、Nest restart readback。
- 修正 0009 Story confirm trigger 的 `chapters` 错误列引用，并保留 G1 migration/manifest 可验证性。

## 下一阶段入口

- G2-D1 读取本 handoff 与 `2026-07-12_G2施工包_依赖边界与阶段门禁.md`，在 Story current + confirmed 且 source chain current 的门禁上实现 StoryboardVersionRepository。
- D1 不得改写已确认 Story 文档；Storyboard pending 的 sourceStoryVersionId/sourceDigest 必须绑定 C1 confirm 产物，并在 projection scope 内写入。
- E/F 再补 Preflight source snapshot、任务适用性与完整 capability switch；没有这些证据前，G2 不能宣称完成。
