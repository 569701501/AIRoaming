---
doc_id: AIR-G3-M3-A4-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: M3-A4 实现与 SQLite 集成证据
---

# Handoff

## 当前切片

- 入口：`db:import --kind shadow --slice script-pending-revision --snapshot <sealed-dir> --decisions <normalized-decisions.json> --database-url <file:...> --report <output>`。
- 前置：目标 DB 已有 Project/Chapter shadow；A4 可独立于 A3 的 ScriptVersion history 执行，但不重建缺失 Project/Chapter。
- 产物：ChapterScriptPending、ChapterScriptRevision、lastScriptRevisionId 和 ImportedEntitySource。

## 明确未完成

- 不导入 ConversationThread/Message；旧 Dialogue 引用只保留为证据，不是可查询 FK。
- Story/Storyboard/Preflight、Task/Asset/Candidate/Lock、Layout/Export、Dialogue/provider metadata、db-verify、backup 和 activate 仍未实现。

## 下一步

完成 A4 后进入 Story/Storyboard importer；Dialogue 相关实体导入时再定义如何把 pending/revision 的证据升级为可关联 FK，不能覆盖 A4 的历史 source rows。
