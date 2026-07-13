---
doc_id: AIR-M6-A1-PROGRESS-001
status: in_progress
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: orchestrator, worker, reviewer, human
source: M6-A1 task_plan
---

# M6-A1 进度

## 2026-07-13 Orchestrator

### 状态

`in_progress`

### 已完成

- 完成当前代码、M5/M6 证据、G1 验收清单和后续 G4/G5 状态复核。
- 撤回“fake C0～C7 已足以申请真实授权”的判断。
- 建立 Handoff、实施契约、测试矩阵、文件地图和复核清单。
- 将任务拆为 A1-0～A1-5，可由 Luna 连续执行并逐阶段独立提交。

### 当前未执行

### A1-1 / A1-2 Worker 更新

状态：`in_progress`（A1-1 已完成，A1-2 进行中）

基线 commit：`6a33009`

修改文件：

- `apps/server/src/backup/backup.types.ts`
- `apps/server/src/backup/app-backup.service.ts`
- `apps/server/src/backup/app-backup.cli.ts`
- `apps/server/src/backup/app-restore.service.ts`
- `apps/server/src/backup/app-backup-restore.integration.spec.ts`
- `apps/server/src/migration/runtime-bundle-file.service.ts`
- `apps/server/src/migration/snapshot.types.ts`
- `apps/server/src/maintenance/maintenance.types.ts`
- `apps/server/src/maintenance/maintenance-coordinator.service.ts`
- `apps/server/src/migration/ready-coordinator.ts`
- `apps/server/src/migration/db-ready.cli.ts`
- `apps/server/src/migration/db-activate.service.ts`
- `apps/server/src/migration/cutover-coordinator.service.ts`

新增或更新测试 ID：

- `M6A1-BK-01`：真实临时 SQLite final/ready pre-cutover bundle + verify-only restore，已通过。
- `M6A1-ACT-01`：真实临时 bundle dry-run/execute，已通过。
- `M6A1-RST-01`：pre-cutover verify-only，已通过。
- `M6A1-RST-03`：coordinated 兼容回归，已通过。
- `M6A1-RST-04/05`：既有 raw/semantic tamper 回归，已通过。
- Ready runtime bundle closed/active=0 校验与 boolean 假证据退役，相关 FIN 用例已通过。
- durable C0 evidence restart/identity 保护单测已通过。

验证命令与通过数：

- `pnpm --dir apps/server exec tsc --noEmit`：通过。
- `pnpm --dir apps/server exec vitest run src/backup/app-backup-restore.integration.spec.ts --pool=forks --poolOptions.forks.singleFork=true --testTimeout=120000`：35/35 通过。
- Ready/runtime 定向：12/12 通过；activate/cutover 定向：7/7 通过。
- server 全量 `pnpm --dir apps/server test -- --pool=forks --poolOptions.forks.singleFork=true --testTimeout=60000 --reporter=dot`：60 files / 408 tests 通过（149.80s）。

Scrutiny 结果：A1-1 静态约束已实现；真实切换、真实 workspace、真实 Keychain/provider 仍禁止。

Runtime 结果：仅临时 SQLite、临时 workspace、fake SecretStore；未执行真实授权。

提交：`e9912ca`（`feat(m6): bind pre-cutover backup and durable evidence`）。

下一步：完成 durable C0-C7 evidence 与真实 pre-cutover activate 语义，随后进入 A1-3 business write boundary。

## Worker 更新模板

每阶段必须追加：

```text
日期/阶段：
状态：in_progress / passed / blocked
基线 commit：
修改文件：
新增或更新测试 ID：
验证命令与通过数：
Scrutiny 结果：
Runtime 结果：
提交：
下一步：
```

不得只写“已完成”或覆盖历史记录。
