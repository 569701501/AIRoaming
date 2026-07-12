---
doc_id: AIR-G2-D1-SCRUTINY-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: D1 静态与运行复核
---

# Scrutiny Review

## 静态结论

- `StoryboardVersionRepository` 使用 scoped Chapter query、事务 runner 和 B1 productionState；不把 G1 内存 ProjectStore 当作 DB Storyboard 真值。
- pending Board 的 source Story id/digest 在 create 时冻结；update/discard/confirm 使用 pending rowVersion + Chapter rowVersion CAS，重复 confirm 只接受 current pointer、digest 和 `expected + 1` 完全匹配。
- stable Shot 创建由 requestId 派生 ID，初始 Shot 与 pending document/projection 在一个事务写入；同一 requestId replay 不重复插入。
- confirm 在 pending parent 上重建 `StoryboardShotProjection` 和 `StoryboardShotCharacter`，按 current projection 差集把 active Shot 标记 retired；不更新 Candidate/Layout/Export/Preflight。
- API facade 拒绝未知字段、错误枚举、非法 digest/rowVersion；旧 Storyboard API 仍保留，等待 capability switch。

## 运行证据

```text
corepack pnpm test                                      PASS
corepack pnpm -w typecheck                              PASS
corepack pnpm --filter @airoaming/server g1:schema:check PASS
corepack pnpm --filter @airoaming/server g1:manifest:check PASS
corepack pnpm --filter @airoaming/server g1:migration:check PASS
git diff --check                                        PASS
```

fresh SQLite 场景已验证 source gate、stable Shot replay、projection、confirm、clone/update 和 retire。

## 残留风险

- D1 未实现 `shot_generate` worker、任务适用性写回、Candidate、Preflight、Storyboard history API 和 capability switch；这些必须由 D2/E/F 明确交付。
- 当前 stable Shot requestId facade 校验非空字符串，后续 API 层可再收紧 UUID v4 格式而不改变数据库算法。
