---
doc_id: AIR-G3M0-HANDOFF-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3-M0 实现与验收
---

# Handoff

## 已完成

- `MaintenanceCoordinator`：`open → draining → closed → handed_off`、mutation/stream lease、participant busy 门禁。
- 五类 participant：`projects`、`dialogue`、`tasks`、`tool-callback`、`settings`；集中写入口和 persistent worker 已接同一 coordinator。
- `/api/_local/maintenance/status|drain|close|bundle|reopen`，仅 loopback + 显式 0600 token file。
- `maintenance` CLI 支持 status/drain/close/bundle/reopen、`--format json` 和 0600 原子 bundle 写出。
- closed bundle 明确标记 G3-M0 尚不可观察的对话、pending dialogue、legacy task 状态，不伪造完整迁移。

## 未完成且禁止越界

- snapshot/source manifest、CredentialRedactor、comic-format decision codec、importer、verify/shadow、backup/restore、activate 均留给后续切片。
- M0 bundle 不是 importer 输入，不代表旧 workspace 已完成迁移。

## 起点与命令

- 起始基线：`0dbf93d`。
- 定向：`pnpm --filter @airoaming/server test -- maintenance/maintenance-coordinator.spec.ts`
- 全量：`pnpm --filter @airoaming/server test`
- 类型：`pnpm --filter @airoaming/server typecheck`
- G1：`g1:manifest:check`、`g1:schema:check`、`g1:migration:check`
