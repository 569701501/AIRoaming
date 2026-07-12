---
doc_id: AIR-G2-F2-PROGRESS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: F2 implementation session
---

# 改动

- 新增 `packages/shared/src/versioning/task-source-projection.ts`：TaskSourceProjectionV1、UTF-8/BINARY 排序、role order 重建和 JCS digest。
- 新增 `apps/server/src/tasks/persistent-task.repository.ts`：DB task create/seal/replay、global slot provisioning、claim CAS、heartbeat、finish/retry、cancel、recovery 与 lease fencing。
- 新增 `apps/server/src/tasks/persistent-task-recovery.service.ts`：DB mode startup recovery。
- `TasksModule` 引入 PersistenceModule 与上述 provider；TasksController/TasksService 在 DB mode 读取持久化任务，file mode 保持旧实现。
- `project-db-persistence.integration.spec.ts` 增加 fresh SQLite runtime 证据：source projection seal、idempotency replay、claim/slot、heartbeat、retry、second claim、late result rejection、expired lease recovery。
- F3 接续已落地在同一运行时边界：`PersistentTaskWorkerService` 提供 claim/heartbeat/provider/finish loop；`story_parse` 与 `shot_generate` 已接入 OpenCode provider、严格 V2 输出归一化、TaskApplicabilityGuard 和 Story/Storyboard pending apply transaction；worker 支持显式 `runOnce()`、主进程 DB 启动开关和测试 handler 注入。
- Task detail API 已返回 `TaskAttempt` 历史；completion transaction 同时记录 `current` / `historical` applicability。

# 验证

- `corepack pnpm test`：shared 7 files/36 tests；server 31 files/180 tests，全部通过。
- `corepack pnpm -w typecheck`：shared/server/web 全部通过。
- `corepack pnpm --filter @airoaming/server g1:schema:check`：通过，manifest `sha256:3d843e2a77b9a1acc44f4e49430a40514df92b10defe4143dc52aaaf1514a036`。
- `corepack pnpm --filter @airoaming/server g1:manifest:check`：通过，同 digest。
- `corepack pnpm --filter @airoaming/server g1:migration:check`：通过，8 migrations / 195 checks / 194 triggers。
- `git diff --check`：通过。

# 遗留

- `story_parse`/`shot_generate` 已闭环；`shot_prompt_generate`/`image_generate` 尚未迁移到同一 DB worker。旧 file-mode image worker 仍保持原路径。
- 真实 OpenCode provider 需要可用的 OpenCode 服务和模型配置；集成证据使用 deterministic handler，未在 CI 触发外部模型。
- G2 任务创建 API 仍需把四类 enabled task 的 strict input/creation gate 与 source builder 完整收口；现阶段 repository 直接创建已覆盖 story/shot runtime。
