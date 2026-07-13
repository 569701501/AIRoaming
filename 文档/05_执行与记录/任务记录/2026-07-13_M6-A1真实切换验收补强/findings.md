---
doc_id: AIR-M6-A1-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: orchestrator, worker, reviewer, human
source: 当前 M6 源码、测试和 G1 正式验收清单
---

# M6-A1 Findings

## 1. 已确认缺口

| ID | 事实 | 代码证据 | 影响 |
| --- | --- | --- | --- |
| F-01 | pre-cutover backup 未实现 | `AppBackupService.backup()` 对非 coordinated 返回 `MIGRATION_CAPABILITY_BLOCKED` | 无 final/ready 恢复点 |
| F-02 | restore 类型写死 shadow | `BackupManifest.backupKind="coordinated"`、`migration.runKind="shadow"` | 无法验证 final bundle |
| F-03 | ready/backup 存在循环 | `ReadyCoordinator` 要求布尔 `backupVerified`；契约又要求 pre-cutover backup 绑定 ready state | 现有成功路径无法真实成立 |
| F-04 | activate 未绑定 backup identity | `verifyBackup()` 只调用 restore verify-only，返回 `void` | 旧 shadow bundle 可能被误作 activate 备份 |
| F-05 | maintenance 只由布尔/内存表达 | ready 接受 `maintenanceClosed: boolean`，cutover evidence 只在数组中 | 重启后无法恢复或证明 C0～C6 |
| F-06 | 综合演练为 mock | `m6-c0-c7.rehearsal.spec.ts` 使用 fake Prisma、fake restore、marker 文件 | 不能证明 importer/backup/restore/API/rollback |
| F-07 | 业务写边界不完整 | projects/tasks/settings/dialogue/outbox/layout/export 等存在直接 `$transaction` 和直接 mutation | ready/recovery fence 与 first write 不覆盖系统 |
| F-08 | 正式验收未回填 | G1 的 SH、C0～C7、RB、OBS 大量 `not_run` | 文档完成状态高于真实证据 |

## 2. 时序纠正

现有文字把 pre-cutover DB backup 放在 C2，但同一契约又规定它必须绑定 succeeded final run 和 `ready_for_activation`。final run 到 C4 才存在，因此两者不可同时成立。

M6-A1 统一为：

```text
C2 = 最终旧源 snapshot + 源侧回滚证据
C4 = final import/verify -> ready_for_activation
     -> pre-cutover DB backup -> verify-only + materialize rehearsal
```

这不是放宽门禁，而是把备份放到其依赖已经存在的最早合法位置。

## 3. 允许的测试替身

- 允许：fake SecretStore、loopback fake provider、临时时钟、故障注入 file executor。
- 禁止作为综合证据：fake Prisma、fake `AppRestoreService`、手写 final run/state 对象、只写 marker 代替 snapshot/backup、手动设置 firstBusinessWriteAt。

## 4. 业务写边界初始盘点

当前至少需要审查：

```text
apps/server/src/tasks/persistent-task.repository.ts
apps/server/src/settings/settings.service.ts
apps/server/src/projects/layout-export.service.ts
apps/server/src/projects/character-reference.service.ts
apps/server/src/projects/image-candidate.service.ts
apps/server/src/projects/persistent-task-worker.service.ts
apps/server/src/projects/asset-package.service.ts
apps/server/src/projects/project-delete-outbox.service.ts
apps/server/src/projects/versioning/version-transaction-runner.service.ts
apps/server/src/dialogue/dialogue.service.ts
```

迁移账本、final importer、ready、backup、activate 属于维护写，不能错误改成普通业务写，但必须进入显式维护 allowlist。

## 5. 风险

- 把所有 `$transaction` 机械替换为业务事务会破坏 importer/activate，因此必须先分类再改。
- 只扫描 `$transaction` 不足以发现直接 `create/update/delete/upsert`，需要生产源码 mutation surface guard。
- pre-cutover manifest 若仍复用 shadow-only 字段，会继续产生“外层 sealed、内部语义错误”的假安全。
- Runtime Review 如果仍只断言内存对象，必须判为 `changes_requested`。

