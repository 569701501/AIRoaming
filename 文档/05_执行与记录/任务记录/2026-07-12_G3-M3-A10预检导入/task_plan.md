---
doc_id: AIR-G3-M3-A10-PLAN-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: G2 Preflight SourceSnapshot 契约与 G3-M3 施工包
---

# G3-M3-A10 Preflight shadow 导入计划

## 目标

从 sealed snapshot 的章节 `preflight.json` 导入可证明来源的 `PreflightRevision`，将旧的 Preflight V1/ID-only 记录转为可审计 blocker，不伪造 ready 或 current 指针。

## 边界

- 只接受 `schemaVersion=2` 且包含 `sourceSnapshot` 的来源；来源快照必须匹配当前 confirmed StoryboardVersion 的 documentDigest。
- 目标 style、角色/场景实体、ready Asset 和 available Visual 不完整时阻断，不猜测外键、不创建伪造视觉证据。
- 写入 `PreflightRevision` 时固定 `sourcePolicyVersion=preflight-source-v1`、`schemaVersion=2`、confirmed/ready，并在同一事务更新 Chapter current 指针。
- `db:import --kind final` 继续 fail-closed；A10 不实现 Candidate/Lock、Task、Layout/Export、verifier、backup 或 activate。

## 退出标准

- 集成测试覆盖旧来源 blocker、完整来源成功导入、current 指针和 replay 零新增。
- typecheck、server 全量测试、G1 三项门禁和 `git diff --check` 通过。
- 更新 handoff、会话记忆、长期记忆和完成记录。
