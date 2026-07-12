---
doc_id: AIR-G2-F3-PROGRESS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2 F3 implementation
---

# 已完成

- `PersistentTaskRepository.finishInTransaction`：允许 domain apply 与 TaskAttempt/GenerationTask terminal 状态同事务提交。
- `StoryVersionRepository` / `StoryboardVersionRepository`：新增 `applyTaskResult` 与 transaction variant，严格 codec、source gate、active pending pointer、rowVersion CAS、projection rebuild。
- `PersistentTaskWorkerService`：支持 handler 注入、OpenCode 默认 provider、15 秒 heartbeat、strict V2 output envelope、current/historical applicability、失败重试和 DB 主进程轮询。
- Tasks detail API：返回 TaskAttempt 历史与 applicability。
- repository create 对 story/shot task 增加 schemaVersion、routing target、expected target/rowVersion、source type 和 instruction 的基础 strict 校验。
- `project-db-persistence.integration.spec.ts`：覆盖 story_parse current/historical、shot_generate current、pending rowVersion、projection/terminal evidence。

# 验证

- `corepack pnpm -w typecheck`：shared/server/web 全部通过。
- `corepack pnpm test`：shared 7 files/36 tests；server 31 files/180 tests，全部通过。
- `git diff --check`：通过。
