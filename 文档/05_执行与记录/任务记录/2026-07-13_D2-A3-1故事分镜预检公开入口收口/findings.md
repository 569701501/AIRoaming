---
doc_id: AIR-D2-A3-1-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: A3-1 execution
---

# Findings

- StoryVersionRepository、StoryboardVersionRepository、PreflightRevisionRepository 和对应 service 已是 DB 事实源；它们已有 fresh SQLite、CAS、projection、restart 与 freshness 测试。
- 旧 `StoryStructureService`、`StoryboardService`、`ImagePreflightService` 仍以 `ProjectStore`/文件式 LocalProject 编排；在 DB 模式继续调用会绕过 G2 事实源，因此必须退役而不是增加第二套写模型。
- `resolve_image_preflight_character` 需要 Character/Visual DB 写模型，属于后续 P4；本阶段用明确 replacement 退役，不能伪造角色或 ready。
- 7 个 operation 已通过 `retired + reason + replacement + evidence` 关闭；aggregate `outline_story_storyboard_preflight` 已升级为 implemented，blockedIds 从 5 降为 4。
- 旧入口在业务读写前拒绝，新增 A3-1 集成证据确认临时 DB 的项目/章节计数不变；modern G2 证据复用既有 Story/Storyboard/Preflight CAS、projection、restart/freshness 测试。
