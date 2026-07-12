---
doc_id: AIR-G3-M3-A11C-FINDINGS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A11C 代码探索与 SQLite 集成证据
---

# 发现与取舍

- `StoryboardShadowImporter` 的 V2 编码会剥离旧 `lockedCandidateId`，所以 A11C 必须重新读取 sealed snapshot 中的原始 storyboard 载荷，不能从已编码 StoryboardVersion 反推。
- `Candidate.status=locked` 只是旧状态字段，不是不可变锁定事实；A11B 已将其降级为 `generated`，A11C 只接受 Shot 级直接引用。
- 旧数据没有可靠的用户决定时间，`decidedAt` 保持 `null`，由 G1 约束允许；`recordedAt` 使用 storyboard/shot 可追溯更新时间。
- revision 与 Shot current pointer 在同一事务中写入；source ledger 使用稳定 source key，第二次运行不新增 revision。
