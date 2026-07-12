---
doc_id: AIR-G2-D1-DONE-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-D1 StoryboardVersion Repository 实现
---

# G2-D1 StoryboardVersion Repository 完成记录

## 功能摘要

完成 Storyboard Working Copy 的 DB-only 手工闭环：pending create/update/discard/confirm、stable Shot 创建与 requestId replay、scene/beat/character projection，以及移除镜头后的 retired。

## 影响范围

- Shared：新增 Storyboard DTO、请求 contract、stable Shot 已有纯函数复用。
- Server：新增 `StoryboardVersionRepository`、`StoryboardVersionService` 和六个 DB-only 路由。
- Persistence：confirm 绑定 C1 Story current，重建 Storyboard projections，切换 Chapter current/pending Board 指针，按 current 差集 retired Shot；不新增 migration。

## 修改文件

- `packages/shared/src/versioning/api-contract.ts`
- `apps/server/src/projects/versioning/storyboard-version.repository.ts`
- `apps/server/src/projects/versioning/storyboard-version.service.ts`
- `apps/server/src/projects/versioning/g2-database-error.mapper.ts`
- `apps/server/src/projects/projects.controller.ts`
- `apps/server/src/projects/projects.module.ts`
- `apps/server/src/projects/project-db-persistence.integration.spec.ts`

## 验证命令与结果

```text
corepack pnpm test                                      PASS
corepack pnpm -w typecheck                              PASS
corepack pnpm --filter @airoaming/server g1:schema:check PASS
corepack pnpm --filter @airoaming/server g1:manifest:check PASS
corepack pnpm --filter @airoaming/server g1:migration:check PASS
git diff --check                                        PASS
```

fresh SQLite 已覆盖 Story current source、stable Shot replay、projection、confirm、clone/update 和 retire。

## 已知风险

- D1 不包含 `shot_generate` worker、Candidate/Preflight、Storyboard history 和全局 capability switch；G2 尚未总体完成。

## 后续建议

进入 G2-E1：统一 ProductionState/Workflow/NewWorkGate，并为 Preflight 实现 confirmed Storyboard source snapshot。
