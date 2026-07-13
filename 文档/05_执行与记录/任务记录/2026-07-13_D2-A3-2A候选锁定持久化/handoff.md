---
doc_id: AIR-D2-A3-2A-CANDIDATE-LOCK-HANDOFF-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, reviewer
source: D2-A3-2A 连续执行
---

# CandidateLock 持久化 Handoff

## 目标

DB 模式公开 `lock_candidate`，以事务创建线性 `CandidateLockRevision`，绑定 ready Candidate/Shot scope，更新 Shot current pointer，并对同一 current candidate 幂等重放。

## 非目标

不实现 Layout/Export、Dialogue、Outbox、final importer、M6 或真实切换；`complete_chapter_images` 另有后续独立切片。

## 证据

`P4-LOCK-01` 覆盖 ready candidate、revision=1、origin=runtime、current pointer 与 replay；registry、类型检查及既有 30 条定向/371 条全量回归保持通过。
