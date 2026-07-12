---
doc_id: AIR-G2-C1-DONE-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-C1 StoryVersion Repository 实现
---

# G2-C1 StoryVersion Repository 完成记录

## 功能摘要

完成 Story Working Copy 的 DB-only 手工闭环：读取、empty/clone_current pending 创建、V2 文档更新、丢弃、确认成为不可变 current，以及重复请求 replay。

## 影响范围

- Shared：新增 Story DTO、请求 contract 和统一 `VersionMutationResult` envelope。
- Server：新增 `StoryVersionRepository`、`StoryVersionService`，以及 `/story-structure/working-copy` GET/POST/PATCH/DELETE/confirm 路由。
- Persistence：确认事务重建 Story scene/beat projections、解析同 project Character、绑定 Script source id/digest、切换 Chapter current/pending pointer；不新增表或字段。
- Compatibility：修正 0009 Story confirm trigger 的错误章节列引用；旧 ProjectRepository 启动可与 Story current/pending 指针共存，G1 旧 Story 路径仍保留。

## 修改文件

- `packages/shared/src/versioning/api-contract.ts`
- `apps/server/src/projects/versioning/story-version.repository.ts`
- `apps/server/src/projects/versioning/story-version.service.ts`
- `apps/server/src/projects/projects.controller.ts`
- `apps/server/src/projects/projects.module.ts`
- `apps/server/src/projects/project-repository.service.ts`
- `apps/server/src/projects/project-db-persistence.integration.spec.ts`
- `apps/server/prisma/migrations/0009_g2_version_freshness_overlay/migration.sql`

## 数据或协议变化

- Story pending 文档固定为 `schemaVersion=2`，`sourcePolicyVersion=story-source-v1`，`documentDigest` 和 Script `sourceDigest` 均为 canonical JSON/文本摘要。
- update、discard、confirm 使用 pending Story rowVersion + Chapter rowVersion CAS；confirm 完成后 pending Story rowVersion +1、status=`confirmed`、Chapter currentStoryVersionId 指向该版本并清空 pending pointer。
- 新路由使用 exact-field DTO；旧 `story-structure` 路由未删除，待 capability switch 后再 fail closed。

## 验证命令与结果

```text
corepack pnpm test                                      PASS (Shared 6 specs/34 tests; Server 31 specs/175 tests)
corepack pnpm -w typecheck                              PASS
corepack pnpm --filter @airoaming/server g1:schema:check PASS
corepack pnpm --filter @airoaming/server g1:manifest:check PASS
corepack pnpm --filter @airoaming/server g1:migration:check PASS (8 migrations/195 checks/194 triggers)
git diff --check                                        PASS
```

fresh SQLite 集成已验证 Script source gate、Story projections、CAS/replay、discard 和 Nest restart readback。

## 已知风险

- Storyboard、Preflight、task worker 和全局 capability switch 尚未实现；不能把 C1 当作 G2 总体完成。
- 旧 G1 Story API 仍可进入旧服务路径；在 D1/E/F 之前保留该兼容入口，禁止假设它已自动切换为 G2 repository。

## 后续建议

进入 G2-D1：以 C1 confirmed Story 为唯一 Storyboard source，完成 Storyboard pending/projection/confirm 的 source digest、CAS、幂等和 fresh SQLite 验证。
