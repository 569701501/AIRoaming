---
doc_id: AIR-G2-F2-HANDOFF-001
status: partial-ready
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: F2 completion evidence
---

# Handoff

F2 runtime substrate 与 F3 的 `story_parse`/`shot_generate` provider completion 已接通。下一阶段继续复用 `PersistentTaskRepository.claimNext/heartbeat/finishInTransaction`，禁止直接更新 `generation_tasks.status`、`lease_token` 或删除 Attempt/Slot。

## 已验证事实

- fresh SQLite 上 task create/seal/replay 成功。
- 两次 claim 受 slot 与状态 CAS 约束；heartbeat 更新租约；失败可进入 retrying 并再次 claim。
- 成功 finish 后迟到 claimToken 被 fencing；过期 lease 可由 startup recovery 收敛为 retrying。
- file mode 任务路径保持原有内存行为。
- `PersistentTaskWorkerService.runOnce()` 可注入 deterministic handler；主进程在 DB mode 且 `AIROAMING_TASK_WORKER_ENABLED !== "false"` 时启动轮询。
- provider 输出先严格编码为 `VersionDocumentTaskOutputV2`，再在同一 transaction 执行 applicability、pending version CAS、projection rebuild、Attempt/task terminal 写入。
- task detail API 已返回 attempts，便于 UI 展示 claim/重试/失败历史。

## 下一步

- 把 `shot_prompt_generate` 和 `image_generate` 的 source projection、provider handler、completion output 与 stale 规则迁移到 DB worker。
- 为 Tasks API 补 enabled G2 task input codec/creation gate，拒绝缺失 expected target/source 的请求。
- 真实 OpenCode 服务配置下补一次非 mock provider 验收；保留 deterministic 集成测试作为回归证据。
