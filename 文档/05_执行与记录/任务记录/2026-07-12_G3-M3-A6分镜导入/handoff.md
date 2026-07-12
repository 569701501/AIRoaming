---
doc_id: AIR-G3-M3-A6-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: M3-A6 实现与 SQLite 集成证据
---

# Handoff

## 当前切片

- 入口：`db:import --kind shadow --slice storyboard --snapshot <sealed-dir> --decisions <normalized-decisions.json> --database-url <file:...> --report <output>`。
- 前置：A2 Project/Chapter、A3 ScriptVersion、A5 confirmed/current Story；Storyboard source 必须等于该 Story。
- 产物：StoryboardVersion、Shot、StoryboardShotProjection 和 ImportedEntitySource。

## 关键边界

- 角色 token 非空但未有 Character target 时 fail-closed，不写 null/猜测 FK。
- 旧 `lockedCandidateId/status` 不进入 V2 documentDigest；Candidate/Lock 留给后续切片。
- Preflight 必须绑定正式 Storyboard digest，不能在本切片顺手创建。

## 下一步

进入 Character/Asset/Visual 与 Preflight 前置导入，再处理 Candidate/Lock、Task、Layout/Export 和 Dialogue；最终仍需要 verifier、backup 和 activate。
