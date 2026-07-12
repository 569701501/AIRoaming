---
doc_id: AIR-G2-F3-COMPLETE-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2 F3 implementation session
---

# 功能摘要

完成 G2 `story_parse` / `shot_generate` 的持久化任务执行闭环：任务 claim 后由 worker 执行 provider，输出经 V2 codec 严格归一化，在同一事务内执行 applicability、pending version CAS、projection rebuild、Attempt 与任务终态写入。

# 影响范围

- 新增 `apps/server/src/projects/persistent-task-worker.service.ts`。
- 扩展 `PersistentTaskRepository`、Story/Storyboard version repository、Tasks detail API。
- 主进程 DB mode 默认启动 worker，可用 `AIROAMING_TASK_WORKER_ENABLED=false` 关闭；file mode 不变。
- 未新增 migration、表或字段。

# 验证命令与结果

- `corepack pnpm -w typecheck`：通过。
- `corepack pnpm test`：shared 7 files/36 tests；server 31 files/180 tests，全部通过。
- `git diff --check`：通过。

# 已知风险与后续

- 未在真实 OpenCode 服务上执行 provider smoke test；测试使用 deterministic handler。
- `shot_prompt_generate` / `image_generate` 尚未迁移到 DB worker，任务创建 strict gate 仍需统一收口。
