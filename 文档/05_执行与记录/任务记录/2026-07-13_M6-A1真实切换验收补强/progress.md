---
doc_id: AIR-M6-A1-PROGRESS-001
status: superseded
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: orchestrator, worker, reviewer, human
source: M6-A1 task_plan
---

# M6-A1 进度

## 2026-07-13 Orchestrator

### 状态

`isolated_complete / production_entry_changes_required`

### 已完成

- 完成当前代码、M5/M6 证据、G1 验收清单和后续 G4/G5 状态复核。
- 撤回“fake C0～C7 已足以申请真实授权”的判断。
- 建立 Handoff、实施契约、测试矩阵、文件地图和复核清单。
- 将任务拆为 A1-0～A1-5，可由 Luna 连续执行并逐阶段独立提交。

### 最终收口

### A1-1 / A1-2 / A1-3 / A1-4 Worker 更新

状态：`isolated_complete`（A1-1～A1-5 隔离矩阵完成；production entry 由 R0-A 接替）

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
- server 全量 `pnpm --dir apps/server test -- --pool=forks --poolOptions.forks.singleFork=true --testTimeout=60000 --reporter=dot`：61 files / 425 tests 通过（147.10s）。

Scrutiny 结果：A1-1 静态约束已实现；真实切换、真实 workspace、真实 Keychain/provider 仍禁止。

Runtime 结果：仅临时 SQLite、临时 workspace、fake SecretStore；未执行真实授权。

提交：`e9912ca`（`feat(m6): bind pre-cutover backup and durable evidence`）。

下一步：不再领取下游；若要执行真实 C0～C7，必须先取得用户单独授权并另建真实切换记录。当前不执行真实切换。

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
- backup/restore、snapshot、credential-redactor、maintenance、cutover、activate、file-mode 定向复核：7 files / 59 tests 通过；新增 M6A1-BK-04、M6A1-EVD-01/03/04、M6A1-TX-08 证据后，矩阵已回填直接有证据的项。
- 已补齐 M6A1-BK-03、M6A1-RDY-01/02、M6A1-ACT-03/04，以及 BK-02/BK-05、RB-01/RB-02、SEC-01、PATH-01；`CutoverCoordinator` 现写入逐步 digest、`steps/*.json`、`C6_READY`/`COMPLETED`，activate 可校验 closed maintenance 与 C0-C6 evidence。
- `M6A1-RB-01`（final 失败链）和 `M6A1-RB-02`（C5 smoke 失败链）已补齐真实临时根直接证据；矩阵不再有 `not_run` 行。
- C0～C7 每阶段 durable evidence 共 8 步，恢复链和首笔写断言通过；只触碰临时 SQLite、临时 workspace、fake SecretStore。

提交：`b4b4a18`（`test(m6): complete isolated c0-c7 rehearsal`）。

下一步：隔离 Scrutiny/Runtime Review 已更新为最终收口；保持真实切换、真实用户数据、真实 Keychain/provider、OBS 观察期为未执行。

### A1-5 复核与收口

状态：`passed_isolated`

- Scrutiny Review：`scrutiny_review.md`，结论为隔离工程证据通过，不授权真实切换。
- Runtime Review：`runtime_review.md`，结论为 `passed_isolated`。
- 功能完成记录：`文档/05_执行与记录/功能完成记录/2026-07-13_M6-A1真实隔离验收补强.md`。
- Luna 后续执行单：`luna_next_execution_handoff.md`，已改为最终交接与停止说明，不再有待执行矩阵项。
- 代码提交：`3661939`（含 `90ea779`、`37c2c02`、`61d6ade`、`79f555e` 等 M6-A1 收口提交）；文档提交待本节同步后完成。
- 真实用户数据、真实 Keychain/provider、真实 C0～C7：均为 `0` 次。

### 最终门禁（2026-07-13）

- server 全量：`61 files / 425 tests` 通过。
- workspace typecheck、server build、web build：通过（web 仅保留既有 chunk size warning）。
- Prisma validate、G1 manifest/schema/migration：通过；manifest digest 为 `sha256:ad3b0e1ba884e20718e6e81994cbb8beaedbb9e6777e471ac2a21e4c94c2b1ea`。
- capability CLI：8 个聚合 capability、`blockedIds=[]`，`settings_credential_secret_store.restartCovered=true`，未误改其它 capability。
- `test_matrix.md`：M6A1-BK/RST/RDY/ACT/EVD/TX/C0～C7/RB/SEC/PATH/REG 均为 `passed`；真实授权、真实根、OBS-01～10 仍不执行。

### Production entry 后续复核

- final/ready CLI 仍硬编码 fake SecretStore，且 Keychain put 仍把 secret 放进 argv；真实 Keychain 无法作为合规正式门禁输入。
- activate 的 maintenance/evidence 参数 optional，CLI 也不能传入，存在跳过证据校验路径。
- CutoverCoordinator/MetadataArchiveService 没有生产 C0～C7 runner。
- 本任务仅保留为 `isolated_complete`；当前唯一入口改为 `2026-07-13_R0-R2真实切换施工包/handoff.md`。

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
