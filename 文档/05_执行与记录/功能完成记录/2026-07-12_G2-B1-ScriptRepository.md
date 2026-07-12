---
doc_id: AIR-G2-B1-DONE-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-B1 ScriptVersion Repository
---

# G2-B1 ScriptVersion Repository 完成记录

## 功能摘要

完成 G2 Script 上游数据库闭环：Working Copy 读写、清空、回退、发布 ScriptVersion、AI pending 采用/丢弃、历史版本读回与复制，并提供新的 DB-only API facade/路由。Mutation 返回统一的 productionState/rowVersion/replayed，history 使用 limit/beforeVersion 游标页。

## 影响范围

- Shared：新增 Script API/DTO 类型与 `ScriptPublishResponse`。
- Server：新增 ScriptVersion repository/service；ProjectsModule 注册事务 runner、scoped query 和 repository；ProjectsController 增加 G2 Script 路由。
- Database：0009 Overlay 保持 0 表/0 列/0 rebuild/0 G2 CHECK/2 partial unique index/14 trigger；同步 0008 Working Copy CHECK 以支持 current Script + 空 dirty Working Copy。

## 验证命令与结果

- `corepack pnpm --filter @airoaming/shared build`：通过。
- `corepack pnpm --filter @airoaming/server typecheck`：通过。
- `corepack pnpm --filter @airoaming/server g1:manifest:check`：通过，manifest=`sha256:3d843e2a77b9a1acc44f4e49430a40514df92b10defe4143dc52aaaf1514a036`。
- `corepack pnpm --filter @airoaming/server g1:migration:check`：通过。
- `corepack pnpm --filter @airoaming/server test`：31 个 spec、174 个测试通过。
- `git diff --check`：通过。

## 已知风险

- C1/D1/E/F 尚未实现；B1 不代表完整 G2 或 production DB-only cutover。
- 旧 G1 Script 写路径保持兼容，legacy fail-closed 需在 capability switch 阶段统一打开。
- Preflight 历史文档无法按 V2 codec 解析时，productionState 采取保守 unresolved。

## 后续建议

进入 G2-C1 时复用 B1 的 scoped query、事务 runner、错误 envelope 和 CAS 约定，先实现 Story pending create/update/discard/confirm，再接 D1 的 Storyboard/Preflight。
