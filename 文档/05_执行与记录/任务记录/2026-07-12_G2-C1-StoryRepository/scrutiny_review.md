---
doc_id: AIR-G2-C1-SCRUTINY-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: C1 静态与运行复核
---

# Scrutiny Review

## 静态结论

- `StoryVersionRepository` 只依赖 scoped Chapter query、事务 runner、Prisma 和 B1 `productionState` 映射；不把 G1 内存 ProjectStore 当作 Story 真值。
- create/update/discard/confirm 都按 Chapter `rowVersion` 和 pending Story `rowVersion` 做 CAS；重复请求只在目标 id、digest、pointer 和 `expected + 1` 完全匹配时 replay。
- Story 文档通过 shared `StoryDocumentCodecV2` 严格解析/规范化；create/update/confirm 先做 Character 作用域解析，未解析角色返回 `SOURCE_UNRESOLVED`，不会写半成品。
- confirm 在一个事务内重建 Story scene/beat projections、formalize pending Story、切换 Chapter current/pending pointer、清理兼容 pending Storyboard，并将 milestone 推进到 `structured`；不改写 confirmed 历史版本。
- API facade 拒绝未知字段、非法 digest、错误枚举和负 rowVersion；旧 `story-structure` G1 路径保留，新的 DB-only 路径使用 `/story-structure/working-copy`。

## 运行证据

```text
corepack pnpm test                                      PASS (Shared 6 specs/34 tests; Server 31 specs/175 tests)
corepack pnpm -w typecheck                              PASS
corepack pnpm --filter @airoaming/server g1:schema:check PASS
corepack pnpm --filter @airoaming/server g1:manifest:check PASS
corepack pnpm --filter @airoaming/server g1:migration:check PASS (8 migrations/195 checks/194 triggers)
git diff --check                                        PASS
```

fresh SQLite 集成还覆盖了 Story projection 数量、确认 replay、discard、Nest restart readback；首次真实 Story confirm 暴露并修复了 0009 trigger 的错误列引用。

## 残留风险

- Story parse worker、Storyboard repository、Preflight repository 和 capability switch 尚未实现；C1 不能宣称 G2 全部完成。
- 旧 G1 Story API 仍由 `ProjectsService` 提供，尚未统一切换到 `LEGACY_WRITE_ROUTE_DISABLED`；在 D1/E/F 完成前不得删除旧路径。
- `basedOnCurrentVersionId` 当前按 pending/current document digest 相等映射；后续若引入显式 base version 字段，需要扩展 contract 和 migration。
