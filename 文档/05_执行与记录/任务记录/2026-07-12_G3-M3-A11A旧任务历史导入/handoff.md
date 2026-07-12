---
doc_id: AIR-G3-M3-A11A-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: A11A 实现与 SQLite 集成证据
---

# Handoff

## 已完成

- `TaskShadowImporter` 读取 sealed snapshot 的 task artifact，写入 stable `GenerationTask` 历史行和 `ImportedEntitySource`。
- 完整 input/output 为 `legacy_imported`；缺 output 为 `legacy_stub`；两者均不可 claim、retry 或进入 runtime worker。
- `db:import --kind shadow --slice tasks` 已接入；集成、replay、全量回归与 G1 门禁通过。

## 明确未完成

- Candidate、CandidateLockRevision、旧 lockedCandidateId、Asset 绑定、Layout/Export、db-verify、backup、activate 和 final import 仍未实现。

## 下一步

实现 A11B Candidate metadata/Asset 绑定：先验证 Candidate 的 shot、task、asset 三方同 scope，再决定是否可以建立 legacy lock revision；无直接证据时只保留历史 Candidate，不设置 Shot current lock。
