---
doc_id: AIR-G3-M3-A2-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G3-M 导入器决议与迁移账本、M3-A1
---

# 目标

实现 M3 full importer 的第一段实体导入：Project/Chapter shadow slice，消费已校验 decisions，并让目标实体和来源账本可重放。

# 非目标

- 不导入 ScriptVersion/Outline、Story、Storyboard、Preflight、Task、Asset、Candidate、Layout、Dialogue。
- 不实现 final import、db-verify、backup、activate。
- 不读取活动 workspace，不写回 sealed snapshot。

# 实施阶段

- [x] 读取 sealed snapshot 和 decisions artifact。
- [x] 解析 project.json、chapter.json、script.md，构造稳定 target ID 和 payloadDigest。
- [x] 在 Project INSERT 前处理 canonical/auto_mapped/decision_required。
- [x] 单事务写入 Project/Chapter/ImportedEntitySource，支持同库重放。
- [x] 提供 `db:import --kind shadow`。
- [x] 全量测试、门禁、静态复核、交接和提交。

# 退出标准

IMP-A2-01～04 通过；full server 测试、typecheck、G1 三项检查和 diff check 通过；明确后续 Script/Outline 仍未实现。A2 提交为 `ee6cc66`。
