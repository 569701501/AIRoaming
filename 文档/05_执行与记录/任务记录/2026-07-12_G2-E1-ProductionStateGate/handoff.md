---
doc_id: AIR-G2-E1-HANDOFF-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-E1 交接记录
---

# G2-E1 Handoff

## 已交付

- `GET /projects/:projectId/chapters/:chapterId/production-state` 返回 `productionState`、`workflow`、`chapterRowVersion`。
- Shared Workflow 支持 `needs_confirmation`、`needs_update`，并附带 `milestoneReached/currentArtifactId/freshness/attention/canStartTask/historyAvailable/reasonCodes`。
- `ChapterProductionQueryService` 是 DB scoped production projection 的唯一服务入口。
- `NewWorkGateService.check/assertAllowed` 覆盖 `story_parse`、`shot_generate`、`shot_prompt_generate`、`image_generate`，错误稳定为 `UPSTREAM_WORK_NOT_CONFIRMED`。
- fresh SQLite 重启测试证明 current/pending 状态、reasonCodes、workflow 和 chapter rowVersion 可重建。

## 下游接入约束

- 新的任务创建服务必须先调用 `NewWorkGateService.assertAllowed`，并把 gate 读与实际 task seal 放入同一短事务或使用等价的 rowVersion/sourceDigest CAS；不能在 Controller 或前端复制条件。
- `shot_prompt_generate` / `image_generate` 只有在 E2 完成 current PreflightRevision 与 source snapshot 后才能放行。
- Worker 完成写入前必须再增加 `TaskApplicabilityGuard`；E1 的 Gate 不等于迟到任务 fencing。

## 下一阶段

- E2：Preflight live preview、SourceSnapshot 聚合和不可变 PreflightRevision confirm。
- F/任务阶段：持久 worker、TaskApplicabilityGuard、history、capability switch 和真实任务运行时证据。

## Runtime/User Review

E1 是后端查询和门禁切片，没有独立 UI、图片或导出物，因此真实页面/导出复核标记为 `not_applicable`；SQLite integration test 是本阶段的 runtime 证据。
