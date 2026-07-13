---
doc_id: AIR-D2-A6-SCRUTINY-001
status: passed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: reviewer, human
source: D2-A6 静态复核
---

# Scrutiny Review

## 结论

通过。实现只依赖 DB 事实与受控 workspace；没有把物理删除提前放回 Character service，也没有开放 final importer 或真实切换。

## 复核项

- `ProjectDeleteOutboxService` 是唯一的事件 claim/lease/handler/purge 边界。
- payload 使用 exact keys，digest、scope、路径和 sentinel 检查在副作用前执行。
- `processNext` 在 `markProcessed` 后的 secret finalize 失败不会重开 terminal event。
- capability registry 的 operation evidence 与源码 36 个 guard 对齐，聚合项只在有证据时标记 implemented。
- API response 只新增可选 `status/cleanupEventId`，file 模式保持原语义。

## 命令证据

```text
corepack pnpm --filter @airoaming/server test -- src/migration/db-capability-registry.spec.ts src/projects/project-db-persistence.integration.spec.ts --testNamePattern='(CAP-|P8-)' --testTimeout=30000
9 passed
corepack pnpm --filter @airoaming/server typecheck
passed
```
