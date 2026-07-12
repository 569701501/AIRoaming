---
doc_id: AIR-G3-M3-A11B-PROGRESS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: A11B 实现与 SQLite 集成证据
---

# 进度

- [x] 新增 `CandidateShadowImporter` 与 `--slice candidates`。
- [x] 验证 Candidate → Shot/Task/Asset 同 scope；旧 selected/locked 不变成 current lock。
- [x] 集成测试覆盖元数据导入与 replay。
- [x] typecheck、server 全量回归（44 文件、251 tests）和 G1 manifest/schema/migration 三项门禁通过。
- [ ] A11C CandidateLockRevision、旧 lockedCandidateId 直接证据和 current lock 仍后置。
