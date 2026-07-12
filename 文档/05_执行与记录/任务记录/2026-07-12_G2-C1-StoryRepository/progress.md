---
doc_id: AIR-G2-C1-PROGRESS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-C1 执行记录
---

# 进度

## 2026-07-12

- 已读取 Story Working Copy API、Repository 事务地图、依赖边界、V2 Story codec、G1 Story projection/formalize trigger。
- 已确认 StoryVersion 现有字段足以承载 pending/current/history，不新增 migration。
- 开始实现 Shared Story API contract、StoryVersionRepository 和 DB-only routes。
- 已新增 Story Working Copy 请求/响应 contract、StoryVersionService 和五个 DB-only working-copy 路由。
- 已实现 pending create（empty/clone_current）、update、discard、confirm；所有写入使用 Chapter/Story rowVersion CAS，confirm 同事务重建 Story scene/beat projections、切换 current pointer 并清理 pending Storyboard。
- fresh SQLite 集成覆盖 create/update/confirm/discard、重复请求 replay、projection、Nest restart readback；修正 0009 source gate 中错误的 `chapters.c.chapter_id` 引用，并允许旧 ProjectRepository 启动时读取已存在的 G2 Story 指针。
- 验证完成：全量 31 specs / 175 tests、workspace typecheck、G1 schema/manifest/migration check、`git diff --check` 均通过。
