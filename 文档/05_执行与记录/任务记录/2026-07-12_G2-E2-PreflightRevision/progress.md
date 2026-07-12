---
doc_id: AIR-G2-E2-PROGRESS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-E2 执行记录
---

# 进度

## 2026-07-12

- 已复用 Shared `buildPreflightSourceSnapshot`、`sourceSnapshotDigest`、`PreflightDocumentCodecV2`，没有复制 JCS/strict parser。
- 新增 `SourceSnapshotBuilderService`：按当前 Storyboard shot 引用聚合项目角色、CharacterVisual/Asset、ChapterScene/SceneVisual/Asset 和 Project comicFormat/artStyle；缺角色/场景生成稳定 blocker/warning。
- 新增 `PreflightRevisionRepository/Service`：preview、expected source/digest/rowVersion confirm、immutable revision insert、Chapter current pointer CAS 和重放。
- 新增 `/image-preflight/preview`、`/image-preflight/confirm` DB API；旧 file-mode ImagePreflight API 未改写。
- fresh SQLite 集成覆盖 empty ready preview、confirm、replay、应用上下文内链路和 Storyboard 新 current 后 `PREFLIGHT_SOURCE_STORYBOARD_CHANGED` stale。
- 全量验证：Shared 6 specs/34 tests；Server 31 specs/178 tests；workspace typecheck；G1 schema/manifest/migration check；`git diff --check`。

## 边界

- 当前没有 active reference task 查询、持久 worker 或 TaskApplicabilityGuard；因此参考图任务运行态和迟到任务 fencing 留给后续 F/任务切片。
- 本阶段无独立浏览器 UI、图片或导出物，Runtime/User Review 以 fresh SQLite/API 证据覆盖，页面/导出标记 `not_applicable`。
