---
doc_id: AIR-G3-M5-A4-4-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5-A4 验收清单与前序切片完成记录
---

# M5-A4-4 实施契约

## 1. 恢复后运行态

materialize 必须只使用临时 bundle/release/data/workspace 根。发布完成后：

- 再扫描恢复 DB 的 TEXT/BLOB 和 workspace 文件，sentinel 必须为 0；
- 设置 `DATABASE_URL=file:<临时恢复 DB>`、DB persistence mode、关闭 task worker，启动 Nest 应用；
- `GET /api/projects` 必须返回恢复项目；
- `PersistenceState.activationState=shadow`、`firstBusinessWriteAt=null`；
- maintenance runtime bundle 必须是 closed，不能因只读 API 访问产生业务写入。

## 2. 全量门禁

必须在当前工作树执行并记录：

```text
corepack pnpm --filter @airoaming/server test -- --pool=forks --poolOptions.forks.singleFork=true --reporter=dot
corepack pnpm --filter @airoaming/server typecheck
corepack pnpm -w typecheck
corepack pnpm --filter @airoaming/server g1:manifest:check
corepack pnpm --filter @airoaming/server g1:schema:check
corepack pnpm --filter @airoaming/server g1:migration:check
corepack pnpm --filter @airoaming/server prisma:validate
git diff --check
```

## 3. 结论边界

只有所有 A4 acceptance ID 均有直接测试/命令证据，且两类 Review 均通过，才可把 M5 标记 `completed`。这不授权 D2、final importer、pre-cutover 或 activate。
