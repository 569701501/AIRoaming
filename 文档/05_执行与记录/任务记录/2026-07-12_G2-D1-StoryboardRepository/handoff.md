---
doc_id: AIR-G2-D1-HANDOFF-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: D1 handoff
---

# D1 Handoff

## 已交付

- Shared Storyboard Working Copy 与 stable Shot contract。
- DB-only `StoryboardVersionRepository`：pending CRUD、stable Shot create、V2 codec/source gate、Shot/scene/beat/character projection、confirm 和 active→retired。
- `StoryboardVersionService` 与 ProjectsController working-copy/shot 路由；G1 旧路径保留。
- fresh SQLite 端到端证据：C1 Story source、requestId replay、projection、confirm、clone/update、retire。

## 下一阶段入口

- G2-E1 读取本 handoff 与五份施工资料，统一 ProductionState/Workflow/NewWorkGate，并让 Storyboard current 成为 Preflight 的唯一上游。
- E1 不得把 Candidate/Asset 的运行态写入 Storyboard 文档；Preflight source snapshot 必须绑定 confirmed Board digest 和角色/场景视觉来源。
- `shot_generate` worker、history API 和 capability switch 仍需独立切片，不得在 E1 中隐式补实现。
