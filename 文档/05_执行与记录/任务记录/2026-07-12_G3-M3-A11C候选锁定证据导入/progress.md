---
doc_id: AIR-G3-M3-A11C-PROGRESS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A11C 实现与 SQLite 集成证据
---

# 进度

- [x] 新增 `CandidateLockShadowImporter` 与 `--slice candidate-locks`。
- [x] 从旧 storyboard 直接证据创建 `legacy_import` lock revision，并更新 Shot current pointer。
- [x] 集成测试覆盖 revision 字段、current pointer 与 replay 无重复。
- [x] 定向测试通过；typecheck 通过。
- [x] server 全量回归 44 个测试文件、252 项测试通过；首次 SQLite `database is locked` 为一次性锁竞争，复跑通过。
- [x] G1 manifest/schema/migration 三项门禁与 `git diff --check` 通过。
- [ ] M3 verifier、backup、activate 与 final import 仍后置。
