---
doc_id: AIR-G2-E2-HANDOFF-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-E2 交接记录
---

# G2-E2 Handoff

## 已交付

- `GET /projects/:projectId/chapters/:chapterId/image-preflight/preview`：服务端重建 live preview 和 sourceDigest。
- `POST /projects/:projectId/chapters/:chapterId/image-preflight/confirm`：expected source ID/digest/Chapter rowVersion，成功后写不可变 `PreflightRevision` 并切 current。
- `SourceSnapshotBuilderService` 聚合 Storyboard、项目角色/视觉/Asset、章节场景/视觉/Asset 和画风；缺失角色阻塞，缺场景参考图只 warning。
- confirm replay、source changed、Chapter CAS 和 Storyboard 返修后的 stale reason 均有 fresh SQLite 证据。

## 下游接入约束

- `NewWorkGateService` 的 `shot_prompt_generate/image_generate` 只有在当前 Preflight revision source snapshot current 时才能放行。
- 任务创建必须携带 `imagePreflightId`/`sourceStoryboardId` 等追溯字段，并在 F 阶段接入 TaskApplicabilityGuard；E2 只提供 revision/current 事实。
- 旧 file-mode ImagePreflightService 不能和 DB repository 双写；capability switch 接线前继续显式选择模式。

## 下一阶段

- F/任务 runtime：persistent worker、TaskApplicabilityGuard、source/target fencing、任务 history 和 capability switch。
- 后续 G4/G5：Candidate lock、Layout/Export，不在 E2 内顺手实现。

## Runtime/User Review

E2 没有独立浏览器 UI、真实 provider 或导出物；fresh SQLite/API integration 是本阶段 runtime 证据，页面/图片/导出复核标记 `not_applicable`。
