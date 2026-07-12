---
doc_id: AIR-G2-E2-DONE-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-E2 PreflightRevision 实现
---

# G2-E2 PreflightRevision 完成记录

## 功能摘要

完成 DB-only Preflight live preview、SourceSnapshot 聚合和不可变 revision confirm。旧 revision 不原地改写，Storyboard 新 current 会自动派生旧 Preflight stale。

## 影响范围

- Shared 增加 Preflight preview/confirm API DTO。
- Server 新增 `SourceSnapshotBuilderService`、`PreflightRevisionRepository`、`PreflightRevisionService`。
- 新增 DB API：`/image-preflight/preview`、`/image-preflight/confirm`。
- Shared resolver 在 current Storyboard 与持久 Preflight snapshot 不一致时返回 `PREFLIGHT_SOURCE_STORYBOARD_CHANGED`。

## 修改文件

- `packages/shared/src/versioning/api-contract.ts`
- `packages/shared/src/versioning/production-state.ts`
- `apps/server/src/projects/versioning/source-snapshot-builder.service.ts`
- `apps/server/src/projects/versioning/preflight-revision.repository.ts`
- `apps/server/src/projects/versioning/preflight-revision.service.ts`
- `apps/server/src/projects/projects.controller.ts`
- `apps/server/src/projects/projects.module.ts`
- `apps/server/src/projects/project-db-persistence.integration.spec.ts`

## 验证命令与结果

```text
corepack pnpm test                                      PASS (shared 34 / server 178)
corepack pnpm -w typecheck                              PASS
corepack pnpm --filter @airoaming/server g1:schema:check PASS
corepack pnpm --filter @airoaming/server g1:manifest:check PASS
corepack pnpm --filter @airoaming/server g1:migration:check PASS
git diff --check                                        PASS
```

## 已知风险

E2 尚未接入 active reference task 状态、持久 worker、TaskApplicabilityGuard 或 capability switch；真实图片任务运行时和迟到结果 fencing 仍未完成。页面/真实 provider/导出物不属于本切片。

## 后续建议

进入 F/任务 runtime：把 NewWorkGate 接到持久任务创建，增加 applicability terminal fencing、history 和 capability 状态。
