---
doc_id: AIR-G3-M3-A11C-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: A11C 实现与 SQLite 集成证据
---

# Handoff

## 已完成

- `CandidateLockShadowImporter` 读取 sealed snapshot 的原始 storyboard，校验 `lockedCandidateId` 与 Candidate/Shot 的同 scope 关系。
- 成功时创建 `CandidateLockRevision(action=lock, origin=legacy_import, decidedAt=null)`，随后更新 Shot 当前锁定 revision；CLI 已接入 `--slice candidate-locks`。
- A11C 定向集成覆盖导入、字段和 replay 幂等；typecheck 已通过。

## 明确未完成

- verifier、backup、activate、Layout/Export、final import 仍未实现。
- server 全量回归复跑通过：44 个测试文件、252 项测试；G1 三项门禁与 diff check 通过。

## 下一步

进入 M3 verifier/backup/activate，先验证候选锁定链、当前指针和审计账本，再允许后续导出或正式导入。
