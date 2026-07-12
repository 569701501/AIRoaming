---
doc_id: AIR-G2-E1-SCRUTINY-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-E1 静态复核
---

# Scrutiny Review

## 复核范围

- Shared `ProjectWorkflowStepStatus`、Workflow step 扩展字段和 `GetChapterProductionStateResponse`。
- Server `ChapterProductionQueryService`、`NewWorkGateService`、ProjectsController/Module wiring。
- Chapter scoped query、0009 overlay gate 对齐、测试证据和 handoff 边界。

## 静态结论

1. 查询入口固定为 `ChapterVersionQueryRepository.findByScope`，返回同一份 `productionState + workflow + chapterRowVersion`；没有新增第二套可写 freshness 真值。
2. `ChapterProductionQueryService` 复用 Shared `resolveChapterProductionState`，Workflow 只负责把节点 freshness、milestone、attention、history 和 reasonCodes 投影为 API DTO。
3. `NewWorkGateService` 对四类 G2 任务统一收口；source id/digest、pending id/rowVersion、confirmed current、Preflight 和 active Shot 缺一项即拒绝，稳定错误为 `UPSTREAM_WORK_NOT_CONFIRMED`。
4. 应用层 gate 与 0009 SQLite trigger 是互补关系：前者提供可解释错误，后者在事务末端继续做机械 fail-closed；E1 没有移除或绕过 trigger。
5. Controller 仅暴露 production-state 查询；任务创建入口尚未接入 worker/TaskApplicabilityGuard，故 E1 不声称已完成异步任务执行。

## 证据

- `corepack pnpm test`：Shared 6 specs/34 tests，Server 31 specs/177 tests，PASS。
- `corepack pnpm -w typecheck`：shared/server/web，PASS。
- `corepack pnpm --filter @airoaming/server g1:schema:check`：PASS。
- `corepack pnpm --filter @airoaming/server g1:manifest:check`：PASS。
- `corepack pnpm --filter @airoaming/server g1:migration:check`：PASS，8 migrations / 195 checks / 194 triggers。
- `git diff --check`：PASS。

## 残留风险

- PreflightRevision 尚无 command repository，因此 image prompt/image generation gate 在缺少 current Preflight 时只能拒绝。
- `TaskApplicabilityGuard`、持久 worker、任务 history 和 capability switch 未实现；真实任务运行时复核留待后续阶段。
