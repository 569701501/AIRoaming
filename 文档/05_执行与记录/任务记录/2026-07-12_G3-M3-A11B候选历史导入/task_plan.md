---
doc_id: AIR-G3-M3-A11B-PLAN-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: G1 Candidate provenance 与 G4 CandidateLock 迁移边界
---

# G3-M3-A11B 候选历史导入计划

## 目标

导入 `candidates.json` 的 Candidate 元数据，验证 Shot、legacy Task、Asset 三方同项目/章节作用域；旧锁定状态只保留为历史候选，不直接设置 Shot current lock。

## 边界

- Candidate 必须使用 `generationPurpose=legacy_unspecified`，不补写 Candidate V2 generation spec。
- `selected/locked` 旧状态转为 `generated`；只有后续 A11C 在直接证据完整时才创建 CandidateLockRevision。
- 任一 shot/task/asset 缺失或跨 scope 时记录 blocker，不插入断链 Candidate。
- `db:import --kind final`、Layout/Export、verifier、backup、activate 仍 fail-closed/后置。

## 退出标准

- 集成测试覆盖 Candidate 三方 FK、旧 locked 降级、无 current lock 和 replay。
- typecheck、server 全量测试、G1 三项门禁和 diff check 通过。
