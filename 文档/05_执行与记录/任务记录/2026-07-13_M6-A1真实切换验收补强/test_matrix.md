---
doc_id: AIR-M6-A1-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M6-A1 实施契约与 G1 正式验收清单
---

# M6-A1 测试矩阵

所有新用例初始状态均为 `not_run`。测试名称必须包含 ID；完成后在本表记录 spec 路径、命令和结果，不能只改状态。

## 1. Backup / Restore

| ID | 场景 | 必须断言 | 状态 |
| --- | --- | --- | --- |
| M6A1-BK-01 | 真实临时 final/ready DB 创建 pre-cutover bundle | sealed；runKind=final；同 run/source/snapshot/decisions/effective；16 slice；首写为空 | `passed`（`src/backup/app-backup-restore.integration.spec.ts`，35/35） |
| M6A1-BK-02 | final blocked/failed、state shadow/recovery/db_only、run 不同 | 全部失败，无 SEALED/最终目录 | `passed`（`src/backup/app-backup-restore.integration.spec.ts`，M6A1-BK-02：missing run + shadow state） |
| M6A1-BK-03 | maintenance bundle 缺失、非 closed、摘要篡改 | `BACKUP_NOT_OFFLINE` 或稳定验证错误；无 bundle | `passed`（`src/backup/app-backup-restore.integration.spec.ts`，M6A1-BK-03） |
| M6A1-BK-04 | CLI kind 参数矩阵 | coordinated/pre-cutover 各自 required/forbidden 参数精确；解析失败早于 Prisma | `passed`（`src/backup/app-backup-restore.integration.spec.ts`，M6A1-BK-04） |
| M6A1-BK-05 | ready Asset/DB/source 在 fence 期间变化 | fail-closed；staging 清理；无 sealed 假成功 | `passed`（`src/backup/app-backup-restore.integration.spec.ts`，M6A1-BK-05） |
| M6A1-RST-01 | verify-only pre-cutover | 识别 final 类型，零 target/staging 写 | `passed`（`src/backup/app-backup-restore.integration.spec.ts`） |
| M6A1-RST-02 | materialize pre-cutover | 新根 DB/Asset 完整；state 仍 ready；activated/first write 为空 | `passed`（`src/backup/app-backup-restore.integration.spec.ts`，RST-02/RST-05） |
| M6A1-RST-03 | coordinated bundle | restore 继续兼容；不能被 activate 接受 | `passed`（backup/restore 集成 + activate 单测） |
| M6A1-RST-04 | raw tamper | 外层 digest/SEALED 失败，目标零写 | `passed`（`src/backup/app-backup-restore.integration.spec.ts`，A4-RST-02 parameterized） |
| M6A1-RST-05 | reseal semantic tamper | final run/report/state/Asset 任一不一致仍失败 | `passed`（`src/backup/app-backup-restore.integration.spec.ts`，A4-RST-01C-G） |

## 2. Ready / Activate / Evidence

| ID | 场景 | 必须断言 | 状态 |
| --- | --- | --- | --- |
| M6A1-RDY-01 | markReady 使用真实 closed runtime bundle | final/capability/secret/closed 全绿才写 ready | `passed`（`src/migration/m6-c0-c7.rehearsal.spec.ts`，M6A1-RDY-01） |
| M6A1-RDY-02 | 布尔假证据退役 | API/类型中不存在 `backupVerified`、`maintenanceClosed`；缺 bundle 必失败 | `passed`（`src/migration/m6-c0-c7.rehearsal.spec.ts`，M6A1-RDY-02） |
| M6A1-EVD-01 | C0→C6 持久证据 | step/manifest 原子写、摘要链、C6_READY 可验证 | `passed`（`src/migration/cutover-coordinator.service.spec.ts`，M6A1-EVD-01） |
| M6A1-EVD-02 | 新实例 resume | 从下一步继续；相同已完成输入幂等且 action 不重跑 | `passed`（`src/migration/cutover-coordinator.service.spec.ts`） |
| M6A1-EVD-03 | 跳步/改 identity/改 input | `CUTOVER_ORDER_INVALID`/`CUTOVER_RESUME_CONFLICT`，旧证据字节不变 | `passed`（`src/migration/cutover-coordinator.service.spec.ts`，M6A1-EVD-03） |
| M6A1-EVD-04 | evidence raw/reseal tamper | digest/语义校验失败，activate 零写 | `passed`（`src/migration/cutover-coordinator.service.spec.ts`，M6A1-EVD-04） |
| M6A1-ACT-01 | dry-run + 真实 pre-cutover bundle | 返回 ready；DB 字节/state/evidence 全不变 | `passed`（`src/backup/app-backup-restore.integration.spec.ts`） |
| M6A1-ACT-02 | coordinated/shadow bundle | `ACTIVATE_BACKUP_UNVERIFIED`，state 保持 ready | `passed`（`src/migration/db-activate.service.spec.ts`） |
| M6A1-ACT-03 | stale final/source/snapshot/decisions/effective | `ACTIVATE_IDENTITY_MISMATCH`，state 保持 ready | `passed`（`src/migration/db-activate.service.spec.ts`，M6A1-ACT-03） |
| M6A1-ACT-04 | maintenance/evidence 未到 C6 | `ACTIVATE_NOT_READY`，state 保持 ready | `passed`（`src/migration/db-activate.service.spec.ts`，M6A1-ACT-04） |
| M6A1-ACT-05 | execute | 条件事务只写 db_only+activatedAt；first write 为空；C7/COMPLETED 后才 reopen | `passed`（`src/migration/m6-c0-c7.rehearsal.spec.ts`，M6A1-ACT-05） |
| M6A1-ACT-06 | execute crash 后 resume | 不重写 activatedAt；同身份补 C7；first write 非空时拒绝补写 | `passed`（`src/migration/db-activate.service.spec.ts`，M6A1-ACT-06；DB-only resume 不重写 activatedAt） |

## 3. Business write boundary

| ID | 场景 | 必须断言 | 状态 |
| --- | --- | --- | --- |
| M6A1-TX-01 | 生产源码 mutation inventory | 业务目录无直接 `$transaction`；所有 mutation owner 登记并绑定证据 | `passed`（business-write-boundary.spec.ts） |
| M6A1-TX-02 | system allowlist | 只有 migration/backup/activate/test bootstrap 可走 system boundary；新增旁路失败 | `passed`（registry + source scan） |
| M6A1-TX-03 | ready_for_activation | Project/Task/Settings/Dialogue/Asset/Layout/Outbox 代表性公开写全部在回调前拒绝 | `passed`（Prisma boundary + DB integration） |
| M6A1-TX-04 | recovery_required | 与 ready 相同拒绝，数据库业务表字节/计数不变 | `passed`（prisma.service.spec.ts） |
| M6A1-TX-05 | 首笔成功业务写 | mutation 与 firstBusinessWriteAt 同事务提交 | `passed`（prisma.service.spec.ts + DB integration） |
| M6A1-TX-06 | 业务事务回滚 | 业务行和 firstBusinessWriteAt 均不留下 | `passed`（prisma.service.spec.ts） |
| M6A1-TX-07 | 并发首写 | 时间只从 null 变一次，后续事务不覆盖 | `passed`（monotonic timestamp regression） |
| M6A1-TX-08 | 首写后 file bridge | `FILE_MODE_FORBIDDEN_AFTER_FIRST_WRITE` | `passed`（`src/persistence/file-mode-guard.spec.ts`，M6A1-TX-08） |

## 4. 真实隔离 C0～C7

| ID | 阶段 | 必须使用/证明 | 状态 |
| --- | --- | --- | --- |
| M6A1-C0 | release/gates | 真实 release identity、capability 8/36/blockedIds=[]、临时根保护 | `passed`（`m6-c0-c7.rehearsal.spec.ts`） |
| M6A1-C1 | maintenance | 真实 coordinator drain/close、active/queued=0、原子 runtime bundle | `passed`（同上） |
| M6A1-C2 | final snapshot | 真实 SnapshotService、pre/post 一致、源字节/mtime 不变 | `passed`（同上） |
| M6A1-C3 | fresh target | 真实 migrate deploy、临时 SQLite、fake SecretStore，根不重叠 | `passed`（同上） |
| M6A1-C4 | final/ready/backup | 真实 16 slice final、ready、pre-cutover、verify-only restore | `passed`（同上） |
| M6A1-C5 | closed DB smoke | 真实 Nest AppModule/API read；rollback 零残留、first write 空 | `passed`（同上） |
| M6A1-C6 | archive | metadata-only、Asset bytes 不进入 archive、活动恢复根不受影响 | `passed`（同上） |
| M6A1-C7 | activate/first write | 真实 restore verifier、execute、evidence、公开业务写、首写 | `passed`（同上） |
| M6A1-CHAIN-01 | 禁止 mock | 综合 spec 不构造 fake Prisma/fake restore/手写 final state | `passed`（同上） |

## 5. 回滚与安全

| ID | 场景 | 必须断言 | G1 映射 | 状态 |
| --- | --- | --- | --- | --- |
| M6A1-RB-01 | final import 失败 | 旧源不变、未 ready、可丢弃临时目标 | RB-01 | `not_run` |
| M6A1-RB-02 | C5 smoke 失败 | pre-cutover materialize 可恢复；file bridge 同版本可用；无首写 | RB-02 | `not_run` |
| M6A1-RB-03 | settings 已脱敏的回滚 fixture | 只读 fake SecretStore，不恢复 plaintext | RB-03 | `passed`（`src/settings/settings.service.spec.ts`，M6A1-RB-03/SEC-06） |
| M6A1-RB-04 | 首写后回 file | 明确拒绝 | RB-04 | `passed`（`src/persistence/file-mode-guard.spec.ts`，M6A1-RB-04/TX-08） |
| M6A1-RB-05 | pre-cutover restore | integrity/FK/API/Asset hash 全绿 | RB-05 | `passed`（`src/backup/app-backup-restore.integration.spec.ts`，M6A1-BK-01 + RST-02/RST-05） |
| M6A1-RB-06 | down migration surface | CLI/代码不存在自动 down 路径 | RB-06 | `passed`（`src/persistence/business-write-boundary.spec.ts`，M6A1-RB-06） |
| M6A1-SEC-01 | 全链路 sentinel | 除 fake secret root 外，snapshot/DB/report/evidence/backup/restore/archive/log=0 | SH-08/SEC-09 | `passed`（`src/migration/credential-redactor.spec.ts`，M6A1-SEC-01 + SEC-10） |
| M6A1-PATH-01 | 路径隔离 | symlink/overlap/default/真实根全部在初始化前拒绝 | SH-09 | `passed`（`src/backup/app-backup-restore.integration.spec.ts`，A4-BAK-04/A4-RST-03；symlink/overlap 直接证据） |

## 6. 回归门禁

| ID | 命令 | 状态 |
| --- | --- | --- |
| M6A1-REG-01 | M6-A1 定向测试 | `passed`（A1-3 结构/边界、真实 C0～C7、backup/ready/activate 定向通过） |
| M6A1-REG-02 | server 全量 Vitest（single fork，显式 timeout） | `passed`（61 files / 412 tests） |
| M6A1-REG-03 | workspace typecheck + server build + web build | `passed`（workspace typecheck、server build、web build） |
| M6A1-REG-04 | Prisma validate + G1 manifest/schema/migration checks | `passed`（Prisma validate、G1 manifest/schema/migration） |
| M6A1-REG-05 | capability CLI report/check 精确值 | `passed`（`blockedIds=[]`，其它 capability 未误改） |
| M6A1-REG-06 | `git diff --check` + 无真实 artifact/secret/DB 被跟踪 | `passed`（diff check；仅临时根测试，不跟踪真实 artifact） |

## 7. 建议命令

具体 spec 可按职责拆分，但最终定向命令必须覆盖以下文件：

```text
corepack pnpm --filter @airoaming/server test -- --run \
  src/backup/app-backup-restore.integration.spec.ts \
  src/migration/db-activate.service.spec.ts \
  src/migration/cutover-coordinator.service.spec.ts \
  src/migration/m6-c0-c7.rehearsal.spec.ts \
  src/persistence/prisma.service.spec.ts \
  src/persistence/business-write-boundary.spec.ts \
  src/persistence/file-mode-guard.spec.ts \
  --pool=forks --poolOptions.forks.singleFork=true --testTimeout=60000

corepack pnpm --filter @airoaming/server test -- \
  --pool=forks --poolOptions.forks.singleFork=true --testTimeout=60000 --reporter=dot

corepack pnpm -w typecheck
corepack pnpm --filter @airoaming/server build
corepack pnpm --filter @airoaming/web build
corepack pnpm --filter @airoaming/server prisma:validate
corepack pnpm --filter @airoaming/server g1:manifest:check
corepack pnpm --filter @airoaming/server g1:schema:check
corepack pnpm --filter @airoaming/server g1:migration:check
corepack pnpm --filter @airoaming/server db:capabilities --format json
git diff --check
```

若实际新增 spec 名不同，Luna 必须同步本文件，不得让命令指向不存在的文件。

## 8. G1 回填规则

- 隔离自动化可回填相应 SH、RB 和 C0～C7 的“隔离工程证据”字段，但不得勾选“用户再次授权”“真实 workspace”“真实 Keychain/provider”“真实观察期”。
- SH-10 人工 MigrationReport 签署，只有真实责任人签署后才能 passed；Luna 不得自签。
- OBS-01～10 全部继续 `not_run`，直到真实 DB-only 观察期。
- 每个回填项必须写测试 ID、spec 路径和结果；不能只写 commit。
