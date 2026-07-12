---
doc_id: AIR-G3-M3-A5-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: M3-A5 实现与 SQLite 集成证据
---

# Handoff

## 当前切片

- 入口：`db:import --kind shadow --slice story --snapshot <sealed-dir> --decisions <normalized-decisions.json> --database-url <file:...> --report <output>`。
- 前置：目标 DB 已完成 A2 Project/Chapter；若要 confirmed/current，必须先完成 A3 Script/Outline 并保证 Chapter script working clean。
- 产物：StoryVersion、ChapterScene、StorySceneProjection、StoryBeatProjection 和对应 ImportedEntitySource。

## 关键边界

- 只有 sourceScriptVersion 可证明且等于 current Script 时才 confirmed/current。
- source 不存在或已 stale 时，run blocked，写 `STORY_SOURCE_UNRESOLVED`；不写空 source 三元组，也不制造 confirmed 版本。
- 角色、场景参考图、Storyboard/Shot、Preflight 和后续生产实体未实现。

## 下一步

进入 A6 Storyboard/Shot importer：复用本切片的 StoryVersion/Scene/Beat source identity，按 pending→Shot projection→confirmed 顺序处理 sourceStoryVersion 与字符 token 解析。
