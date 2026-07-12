---
doc_id: AIR-G2-B1-PROGRESS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-B1 执行记录
---

# 进度

## 2026-07-12

- 已确认 A0 Shared versioning 与 A1 SQLite Overlay 已完成并可作为 B1 前置。
- 已读取 Script 文件 Repository、API 幂等、依赖边界和数据库 Overlay 施工资料。
- 开始实现 Shared Script contract、DB Repository、API facade 和 fresh SQLite 验证。
- 新增 `packages/shared/src/versioning/api-contract.ts`，统一 Script Working Copy、publish、pending、history 请求/响应类型。
- 新增 `apps/server/src/projects/versioning/script-version.repository.ts`：scoped query、rowVersion/digest CAS、publish 版本分配、pending Story 归档、下一章幂等、pending adopt/discard、history 读回/复制。
- 新增 `script-version.service.ts` 与 ProjectsController 的 DB-only Script 路由；API 边界拒绝未知字段、非法 digest、非法 rowVersion。
- History API 按施工资料提供 `limit`/`beforeVersion` 游标页，并为 mutation 返回 `productionState`、`chapterRowVersion` 与 `replayed`。
- fresh SQLite 集成验证覆盖：更新 replay、并发冲突、publish replay、不重复下一章、clear/revert、第二版本、历史复制、pending adopt/discard、Nest 重启读回。
- 修正既有 G1 Working Copy CHECK，允许 current Script + 空 dirty Working Copy；同步 0008 migration、check DSL 和 manifest digest。
- 验证完成：Shared build/typecheck、Server typecheck、Server 全量 31 spec/174 tests、G1 manifest/migration check、`git diff --check` 均通过。
