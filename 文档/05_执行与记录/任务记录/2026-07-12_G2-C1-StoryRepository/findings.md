---
doc_id: AIR-G2-C1-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-C1 代码探索与运行验证
---

# 探索发现

- Story V2 codec 已提供 strict parse/encode；Character `projectCharacterId` 必须在同 project 的 characters 表中存在。
- Story empty 文档也必须完整符合 `StoryDocumentV2`，不能以 `{}` 或旧 schema 写入；projection 的 scene/beat 顺序、摘要和 ChapterScene 作用域由同一事务重建。
- confirm 的 SQLite trigger 先检查 Story pending pointer、current Script、clean working state 和 source digest；因此 StoryVersion 必须先在 pending parent 上 formalize，再切 Chapter current pointer。
- 0009 原 confirm source trigger 误写 `c.chapter_id`（chapters 没有该列），Story 首次真实 confirm 才会触发；已修为 `c.id = NEW.chapter_id`，并通过 fresh SQLite 和 G1 migration checks。
- 旧 `ProjectRepository` 仍负责 G1 本地投影，但启动时不再把 Story current/pending 指针视为 C3 外记录；G2 Story API 继续从 scoped Chapter query 读取正式文档，旧 Story 写路径尚未切换为 G2 capability gate。
