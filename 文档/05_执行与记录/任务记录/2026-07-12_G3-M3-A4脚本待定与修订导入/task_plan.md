---
doc_id: AIR-G3-M3-A4-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: G1 旧数据映射、G2 Script 契约、A3 handoff
---

# 目标

导入章节 `script-pending.json` 和 `script.revisions/latest.json`，保留 pending/revision 的可追溯证据，并在 Dialogue 尚未导入时避免伪造 thread/message/tool 外键。

# 非目标

- 不把 pending 误转为 ScriptVersion；不确认、不丢弃、不修改正式 working copy。
- 不导入 ConversationThread/ConversationMessage、Story/Storyboard/Preflight 或后续实体。
- 不实现 db-verify、final import、backup、activate 或真实 workspace 写回。

# 实施阶段

- [x] 解析 pending/revision 文件并构造稳定 target ID/sourceKey/payloadDigest。
- [x] 写入 ChapterScriptPending 与 ChapterScriptRevision，更新 lastScriptRevisionId。
- [x] 对未导入 Dialogue 的旧引用置空并计 warning，原路径和 digest 进入 ImportedEntitySource。
- [x] 提供 `db:import --kind shadow --slice script-pending-revision`。
- [x] 全量测试、门禁、静态复核、交接和提交。

# 退出标准

A4 集成测试通过；pending/revision source rows、FK scope、同库 replay 和 rowVersion 幂等得到真实 SQLite 证据；server 全量测试、typecheck、G1 三项检查和 diff check 通过；明确后续实体仍未实现。提交为 `352248e`。
