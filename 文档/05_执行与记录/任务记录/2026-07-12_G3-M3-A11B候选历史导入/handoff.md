---
doc_id: AIR-G3-M3-A11B-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: A11B 实现与 SQLite 集成证据
---

# Handoff

## 已完成

- `CandidateShadowImporter` 读取 sealed snapshot 的 `candidates.json`，导入稳定 Candidate 历史并验证 Shot/Task/Asset scope。
- 旧 selected/locked 只保存为 generated 历史，不改变 Shot current lock；`--slice candidates` 已接入。
- A11B 定向集成覆盖导入/replay；全量回归 44 文件、251 tests，typecheck 与 G1 三项门禁均通过。

## 明确未完成

- CandidateLockRevision、旧 lockedCandidateId 直接证据、Layout/Export、db-verify、backup、activate 和 final import 仍未实现。

## 下一步

进入 A11C：仅在 `lockedCandidateId`、Candidate、Shot scope 和决定证据全部可验证时创建 legacy CandidateLockRevision；其余情况保持 current lock 为空并留 blocker。
