---
doc_id: AIR-G2-B1-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-B1 代码探索
---

# 探索发现

- `Chapter` 已有 `scriptWorkingText/scriptWorkingDigest/scriptWorkingState/currentScriptVersionId/rowVersion`，`ChapterScriptVersion` 与 `ChapterScriptPending` 可直接承载 B1，不需要新增表。
- A1 Overlay 要求 Chapter 相关命令在变更时 `rowVersion + 1`，Working Copy 的空/clean/dirty 组合必须与当前 Script 指针一致。
- 当前 `ProjectsService` 与 `ChapterScriptService` 是 G1 文件模式和旧 DB C3 路径；B1 将使用独立 `ScriptVersionRepository`，通过 facade 接入新路径，避免改写旧路径。
- Script 发布时需要在同一事务创建不可变 `ChapterScriptVersion`，清理 pending Story 指针并归档旧 pending Story；不修改已确认 Story、Storyboard、Preflight。
- Script 文本统一使用 shared `normalizeScriptText(..., { allowEmpty: true })` 与 `encodeScriptTextV1`，因此 digest 与读回结果稳定。
- G1 原 `ck_chapters_working_consistency` 只允许空文本对应 empty；与施工资料中“已有 current Script 清空进入 dirty”矛盾。已把该既有 CHECK 的合法形状扩展为 current Script + empty text + dirty，并同步 source DSL、0008 SQL 与 manifest，结构计数仍为 195 CHECK/194 trigger。
- `createdNextChapter` 以 `(projectId, order)` 查询复用；publish 的 replay 只接受 `expectedRowVersion + 1` 且 current digest/working clean 完全匹配，避免把后续命令误判为重放。
- 历史版本复制只替换 Working Copy；复制非 current 版本时状态为 dirty，不切换 current ScriptVersion。
