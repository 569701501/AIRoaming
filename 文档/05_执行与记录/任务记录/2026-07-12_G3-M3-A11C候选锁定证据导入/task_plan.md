---
doc_id: AIR-G3-M3-A11C-PLAN-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 CandidateLockRevision 契约与 G4 旧锁定证据迁移边界
---

# G3-M3-A11C 候选锁定证据导入计划

## 目标

从旧 `storyboard.json` 的 `lockedCandidateId` 恢复可验证的 `CandidateLockRevision`，并在 revision 写入成功后更新 Shot 当前锁定指针。

## 边界

- 只有直接 `lockedCandidateId`、Candidate、Shot 同项目/章节且 Candidate 属于该 Shot 时才导入。
- 旧锁定没有可靠决定时间，使用 `origin=legacy_import`、`action=lock`、`decidedAt=null`；`recordedAt` 只记录可追溯的旧更新时间。
- 仅 `Candidate.status=locked/selected` 不足以创建锁定；缺失、跨 scope 或现有指针冲突时记录 blocker。
- 不改变 Candidate 历史语义，不生成 runtime generation spec；Layout/Export、verifier、backup、activate 和 final import 仍后置。

## 退出标准

- `--slice candidate-locks` 可执行，锁定 revision 与 Shot current 指针同事务写入。
- 集成测试覆盖直接证据、revision 字段、current pointer、replay 幂等。
- typecheck、server 全量测试、G1 三项门禁和 diff check 通过。
