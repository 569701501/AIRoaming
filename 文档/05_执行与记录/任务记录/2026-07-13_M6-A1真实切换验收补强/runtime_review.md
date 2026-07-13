---
doc_id: AIR-M6-A1-RUNTIME-001
status: passed_isolated
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: reviewer, human, ai-agent
source: M6-A1 真实隔离 C0～C7 rehearsal
---

# M6-A1 隔离 Runtime Review

## 运行边界

- 临时根 marker：`airoaming-m6-c0-c7-real-*`。
- 数据库：临时绝对 `file:` SQLite，先执行真实 Prisma `migrate deploy`。
- workspace、target data、restore、backup、archive、evidence、fake secret store 根两两分离。
- 允许的 fake：仅 `SecretStore`；未触碰真实 Keychain、provider 或用户凭据。
- worker：`AIROAMING_TASK_WORKER_ENABLED=false`。

## 真实 domain services

`MaintenanceCoordinator`、`RuntimeBundleFileService`、`SnapshotService`、`FinalImportOrchestrator`、`ReadyCoordinator`、`AppBackupService`、`AppRestoreService`、`MetadataArchiveService`、Nest `AppModule` API、`DbActivateService`、`PrismaService` 和 `CutoverCoordinator`。

## C0～C7 结果

| 阶段 | 测试 ID | 结果 |
| --- | --- | --- |
| C0 release/capability/root gates | `M6A1-C0` | passed |
| C1 drain/closed/runtime bundle | `M6A1-C1` | passed |
| C2 final source snapshot | `M6A1-C2` | passed |
| C3 fresh target SQLite | `M6A1-C3` | passed |
| C4 final import/ready/pre-cutover backup/verify-only restore | `M6A1-C4` | passed |
| C5 closed API read + ready write rejection | `M6A1-C5` | passed |
| C6 metadata-only archive | `M6A1-C6` | passed |
| C7 dry-run/execute/first business write | `M6A1-C7` | passed |
| 禁止 fake 综合链 | `M6A1-CHAIN-01` | passed |

## 安全观察

- C0～C7 durable evidence 写入临时 evidence root，8 个步骤和 evidence digest 均存在。
- backup、settings、run summary、数据库和恢复根执行 sentinel 检查，隔离链未发现命中。
- metadata archive 保留资产路径但不复制资产字节。
- ready 状态下业务写在 mutation callback 前拒绝；首笔 db-only 业务写记录 `firstBusinessWriteAt`。
- `M6A1-RB-01/RB-02` 已分别验证 final 失败和 C5 smoke 失败的隔离回滚边界；`M6A1-ACT-06` 验证 DB-only resume 不重写 `activatedAt`，但未做进程级 kill。真实进程崩溃和真实根恢复仍不执行。
- `M6A1-SEC-01` 递归扫描 DB/settings/report/evidence/backup/restore/archive/log fixture；`M6A1-PATH-01` 直接覆盖 symlink/overlap 目录边界，未读取真实默认根。

## 结论

`passed_isolated`。这证明隔离临时链路及已声明范围内的负例可运行，不表示真实切换已完成。真实用户数据、真实系统凭据、真实 Keychain/provider 和真实授权操作次数均为 `0`。
