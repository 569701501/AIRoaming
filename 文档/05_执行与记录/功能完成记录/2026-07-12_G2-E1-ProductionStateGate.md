---
doc_id: AIR-G2-E1-DONE-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-E1 ProductionState/Workflow/NewWorkGate 实现
---

# G2-E1 ProductionState/Workflow/NewWorkGate 完成记录

## 功能摘要

完成服务端权威的章节生产状态与七步工作流投影，并增加四类 G2 新任务的统一前置门禁。状态从 DB current/pending 指针和 Shared resolver 派生，不写回第二套 freshness 真值。

## 影响范围

- Shared 新增 `needs_confirmation` / `needs_update` workflow 状态，以及 production-state 查询响应和 freshness/attention/reasonCodes 投影字段。
- Server 新增 `ChapterProductionQueryService`、`NewWorkGateService`，并接入 production-state API。
- Gate 覆盖 source id/digest、pending id/rowVersion、confirmed current、Preflight 和 active Shot 条件；应用层错误与 0009 trigger 保持双层防线。

## 修改文件

- `packages/shared/src/domain.ts`
- `packages/shared/src/dto.ts`
- `packages/shared/src/versioning/api-contract.ts`
- `apps/server/src/projects/versioning/chapter-production-query.service.ts`
- `apps/server/src/projects/versioning/new-work-gate.service.ts`
- `apps/server/src/projects/projects.controller.ts`
- `apps/server/src/projects/projects.module.ts`
- `apps/server/src/projects/project-db-persistence.integration.spec.ts`

## 验证命令与结果

```text
corepack pnpm test                                      PASS (shared 34 / server 177)
corepack pnpm -w typecheck                              PASS
corepack pnpm --filter @airoaming/server g1:schema:check PASS
corepack pnpm --filter @airoaming/server g1:manifest:check PASS
corepack pnpm --filter @airoaming/server g1:migration:check PASS
git diff --check                                        PASS
```

fresh SQLite 覆盖 initial/current/pending、reasonCodes、gate allow/reject、workflow attention 和 Nest restart readback。没有独立 UI/导出物，Runtime/User Review 按 handoff 标记 `not_applicable`。

## 已知风险

Preflight command repository、TaskApplicabilityGuard、持久 worker、任务 history、capability switch、Candidate/Layout/Export 尚未实现；因此缺少 current Preflight 时两类出图 Gate 会持续拒绝，G2 总体尚未完成。

## 后续建议

进入 E2 实现 Preflight live preview、SourceSnapshot 聚合和不可变 revision confirm；随后再把 Gate 接入持久任务创建与 worker 完成 fencing。
