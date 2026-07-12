---
doc_id: AIR-G2-B1-HANDOFF-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: B1 handoff
---

# B1 Handoff

## 已交付

- Shared Script API contract 与稳定错误码。
- DB-only `ScriptVersionRepository`：working copy、clear、revert、publish、pending adopt/discard、history detail/list/copy。
- ScriptVersionService 与 ProjectsController 新路由，包含请求 exact-field/digest/rowVersion 校验。
- fresh SQLite 端到端证据：CAS/replay/conflict、版本不重复、下一章幂等、历史复制、pending 生命周期和 Nest restart readback。

## 下一阶段入口

- G2-C1 读取本 handoff 与 `2026-07-12_G2施工包_依赖边界与阶段门禁.md`，在 Script current + clean 且无 AI pending 的门禁上实现 StoryVersionRepository。
- C1 不得直接改写 B1 的 Chapter current ScriptVersion、Working Copy 或 Story confirmed/downstream pointer；所有跨层写入必须按事务地图走 owner repository。
- D1 再补齐 Storyboard/Preflight source snapshot、ProductionState 精确投影与 task gate。

