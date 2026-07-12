---
doc_id: AIR-G3-M3-A12-PROGRESS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A12 实现与 SQLite 集成证据
---

# 进度

- [x] 新增 `LayoutShadowImporter` 与 `--slice layout`。
- [x] 旧布局包成 `legacy_chapter_layout_v1`，写入 sourceBindings 与 documentDigest。
- [x] complete/unresolved 来源分支与 currentLayout 保持空指针。
- [x] 集成测试覆盖真实 CandidateLock/Asset 来源、Working Copy 与 replay。
- [x] typecheck 与 A12 定向测试通过。
- [x] server 全量回归：45 个测试文件、256 项测试通过；G1 manifest/schema/migration 三项门禁与 diff check 通过。
- [ ] ExportRevision/Artifact、Dialogue/provider 和 full importer 仍后置。
