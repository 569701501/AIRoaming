---
doc_id: AIR-G2-B1-SCRUTINY-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: B1 静态与运行复核
---

# Scrutiny Review

## 静态结论

- `ScriptVersionRepository` 只依赖 PrismaService、事务 runner 和 scoped Chapter query，不直接复用 G1 内存 ProjectStore。
- 所有 Chapter 命令写入均使用 `updateMany(...rowVersion=expected)`，并由 0009 trigger 要求 rowVersion 恰好递增；publish 的 ScriptVersion 使用数据库内最大版本 + 1，不在内存保存计数器。
- publish 只创建 ChapterScriptVersion、归档 pending Story、更新 Chapter current/working/milestone；没有写 confirmed Story、Storyboard、Preflight 或下游历史。
- 新 API 通过 ScriptVersionService 进入 repository；Controller 不直接访问 Prisma。旧 G1 路径未删除，等待后续 capability switch 再按 `LEGACY_WRITE_ROUTE_DISABLED` 切换。
- API facade 在进入 repository 前执行 exact-field、digest、整数和布尔字段校验；Script 文本 codec 还限制规范化后不超过 2 MiB。

## 运行证据

```text
corepack pnpm --filter @airoaming/shared build                 PASS
corepack pnpm --filter @airoaming/server typecheck             PASS
corepack pnpm --filter @airoaming/server g1:manifest:check     PASS
corepack pnpm --filter @airoaming/server g1:migration:check    PASS
corepack pnpm --filter @airoaming/server test                  PASS (31 specs / 174 tests)
git diff --check                                               PASS
```

## 残留风险

- Story/Storyboard/Preflight 的 G2 repository 尚未实现；B1 只提供 Script 上游闭环。
- `productionState` 对历史 DB 中无法按 V2 codec 解析的 Preflight 文档会保守返回 unresolved；后续 D1 应以正式 source snapshot repository 补齐。
- G1 旧 Script 路径仍可用，尚未开启全局 legacy route fail-closed；这需要 C1/D1 和 capability switch 一起切换。
