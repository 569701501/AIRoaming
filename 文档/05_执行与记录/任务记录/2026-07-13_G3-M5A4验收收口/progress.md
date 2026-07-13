---
doc_id: AIR-G3-M5-A4-PROGRESS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5-A4 task plan
---

# 进展

- [x] 独立复跑 M5 capability/backup/restore 定向测试：11/11 通过。
- [x] 独立复跑 server typecheck：通过。
- [x] 对照原 implementation contract 与 acceptance checklist 逐项审查生产代码和测试。
- [x] 确认 M5 需要 A4 收口，不能直接进入 D2/M6。
- [x] 编写 A4 实施契约、验收清单、Luna handoff 与 D2/M6 后续路线。
- [x] 文档基线复核：server 49 files/314 tests、workspace typecheck、G1 manifest/schema/migration check、`git diff --check` 通过；这些只证明当前回归稳定，不把 A4 `not_run` 项改绿。
- [ ] M5-A4-1 backup 一致性栅栏与 CLI grammar。
- [ ] M5-A4-2 restore identity/ledger。
- [ ] M5-A4-3 secret/path/compensation fault matrix。
- [ ] M5-A4-4 完整回归与正式复核。

# 当前交接

下一执行者只领取 `M5-A4-1`。实现与运行证据尚未执行，不能把文档完成写成代码完成。
