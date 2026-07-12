---
doc_id: AIR-G2-F1-DONE-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-F1 TaskApplicabilityGuard 实现
---

# G2-F1 TaskApplicabilityGuard 完成记录

## 功能摘要

新增无副作用的任务完成适用性检查，复用 NewWorkGate，把仍 current 与已过期/来源变化的任务分成 `current` / `historical`。

## 修改文件

- `apps/server/src/projects/versioning/task-applicability-guard.service.ts`
- `apps/server/src/projects/projects.module.ts`
- `apps/server/src/projects/project-db-persistence.integration.spec.ts`

## 验证

```text
corepack pnpm test                                      PASS (shared 34 / server 178)
corepack pnpm -w typecheck                              PASS
corepack pnpm --filter @airoaming/server g1:schema:check PASS
corepack pnpm --filter @airoaming/server g1:manifest:check PASS
corepack pnpm --filter @airoaming/server g1:migration:check PASS
git diff --check                                        PASS
```

## 边界

当前 TasksService 仍为内存 runtime；F1 只提供未来 worker 可调用的 guard，不代表 persistent worker/claim/lease/history 已完成。
