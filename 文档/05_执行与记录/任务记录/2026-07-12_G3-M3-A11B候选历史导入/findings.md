---
doc_id: AIR-G3-M3-A11B-FINDINGS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: A11B 代码探索与 SQLite 集成证据
---

# 发现与取舍

- G1 Candidate trigger 要求 legacy task 与 Candidate 使用 `legacy_unspecified`；旧 V1 prompt/spec 不可直接当作新 runtime 输入。
- 旧 `locked`/`selected` 状态没有单独的不可变锁修订证据，先映射为 `generated`，避免创建伪造 current lock。
- Candidate 的 Asset 只接受稳定 Asset target 且必须同项目/章节；缺物理 ready 证据不由 A11B 猜测补齐。
- CandidateLockRevision 必须单独验证旧 shot.lockedCandidateId、Candidate 存在性、revision 链和决定时间，不能在 Candidate 导入事务里顺手写入。
