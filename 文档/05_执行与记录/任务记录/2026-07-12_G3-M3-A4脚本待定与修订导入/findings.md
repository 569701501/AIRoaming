---
doc_id: AIR-G3-M3-A4-FIND-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: A4 代码与 fresh SQLite 集成测试
---

# 发现

- `script-pending.json` 只映射为 ChapterScriptPending，不创建正式 ScriptVersion，也不改变 Chapter 的 working copy。
- `script.revisions/latest.json` 只映射最近一条 ChapterScriptRevision；targetWorkingDigest 优先使用同章 pending 正文，否则使用 snapshot 中 `script.md` 的规范化 digest。
- Dialogue 尚未进入导入顺序时，threadId/messageId/toolCallId 不能直接写入目标表；目标字段置空，原始引用由 sourceDigest/sourceStorageKey 追溯，provenance 为 partial 并计 warning。
- replay 时 pending/revision 不重复插入，lastScriptRevisionId 不重复推进 Chapter rowVersion。

# 风险

- Dialogue 记录和完整 provider metadata 尚未导入，因此 A4 的目标 revision 不能恢复原始对话外键。
- A4 仍只覆盖 Script 相关历史，Story/Storyboard/Preflight/Task/Asset/Candidate/Layout/Export/Dialogue 尚未实现。
