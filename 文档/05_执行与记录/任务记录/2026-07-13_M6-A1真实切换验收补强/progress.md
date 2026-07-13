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

### A1-1 / A1-2 / A1-3 / A1-4 Worker 更新

状态：`m6_a1_verification_in_progress`（A1-1～A1-4 已完成，A1-5 隔离复核已完成；矩阵未运行负例仍待补齐）

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

下一步：补齐 `luna_next_execution_handoff.md` 列出的临时根故障注入、crash-resume、路径和安全负例；真实切换仍禁止。

### A1-3 收口

状态：`passed`（结构门禁与代表性 DB 回归通过）

修改范围：

- 所有生产业务目录不再直接调用 `$transaction`；版本事务、任务仓、设置、对话、参考图、候选、布局/素材包、worker、Outbox 统一委托 `PrismaService.runBusinessTransaction`。
- 新增 `business-write-boundary.registry.ts`，登记 12 个业务 mutation owner 与证据 ID；新增结构门禁 spec，禁止旁路 transaction/direct model mutation。
- `PrismaService.runBusinessTransaction` 继续保证 ready/recovery 拒写、首笔写时间与业务事务同提交、已有时间戳不可覆盖。

新增或更新测试 ID：

- `M6A1-TX-01/02`：owner registry、无 direct `$transaction`/direct model mutation，已通过。
- `M6A1-TX-03/04`：业务边界与 ready/recovery 拒写，已通过。
- `M6A1-TX-05/06/07`：首笔写时间同事务、回滚不留痕、已有时间戳不覆盖，单元与 DB 集成回归已通过。

验证命令与结果：

- `pnpm --dir apps/server exec tsc --noEmit`：通过。
- `business-write-boundary.spec.ts`：2/2；`prisma.service.spec.ts`：5/5。
- `project-db-persistence.integration.spec.ts`：34/34（含 P4/P6/P7/P8 代表性业务写）。

验证补充：修正 `VersionTransactionRunner` 测试 double，使其匹配统一业务事务边界；服务端全量回归 `61 files / 412 tests` 通过，`git diff --check` 通过。

提交：`c969bb9`（`refactor(persistence): route business writes through boundary`）。

下一步：已转入 A1-4，以真实临时 SQLite 串联 C0～C7，淘汰 fake Prisma/fake restore rehearsal 作为综合证据。

### A1-4 真实隔离链收口

状态：`passed`

修改范围：

- `m6-c0-c7.rehearsal.spec.ts` 已替换为真实临时 SQLite 链：真实 Prisma migrate deploy、`FinalImportOrchestrator` 16 slice、`ReadyCoordinator`、pre-cutover `AppBackupService`、verify-only `AppRestoreService`、Nest API read、ready 拒写、metadata-only archive、`DbActivateService` dry-run/execute、首笔真实业务写和 durable `cutover-evidence.json`。
- 禁止综合证据中的 fake Prisma、fake restore、手写 final migration state；仅使用 fake SecretStore 和临时根。
- `SettingsService` 在 `ready_for_activation` / `recovery_required` 只读启动时不再尝试写入默认 provider，保证 API read smoke 不旁路业务写边界。

验证命令与结果：

- `pnpm --dir apps/server exec tsc --noEmit`：通过。
- `m6-c0-c7.rehearsal.spec.ts`：1/1 通过；`settings.service.spec.ts`：8/8；`business-write-boundary.spec.ts`：2/2。
- C0～C7 每阶段 durable evidence 共 8 步，恢复链和首笔写断言通过；只触碰临时 SQLite、临时 workspace、fake SecretStore。

提交：`b4b4a18`（`test(m6): complete isolated c0-c7 rehearsal`）。

下一步：隔离 Scrutiny/Runtime Review 已完成；继续补跑测试矩阵中仍为 `not_run` 的故障注入、crash-resume、路径和安全负例，完成后再申请最终 readiness 判定。

### A1-5 复核与收口

状态：`passed_isolated`

- Scrutiny Review：`scrutiny_review.md`，结论为隔离工程证据通过，不授权真实切换。
- Runtime Review：`runtime_review.md`，结论为 `passed_isolated`。
- 功能完成记录：`文档/05_执行与记录/功能完成记录/2026-07-13_M6-A1真实隔离验收补强.md`。
- Luna 后续执行单：`luna_next_execution_handoff.md`，仅覆盖矩阵中仍为 `not_run` 的临时根负例。
- 代码提交：`b4b4a18`；文档提交待本节同步后完成。
- 真实用户数据、真实 Keychain/provider、真实 C0～C7：均为 `0` 次。

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
