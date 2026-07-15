---
doc_id: AIR-M6-A1-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M6-A1 Findings、G3-M 备份恢复与 DB-only 激活契约、当前代码
---

# M6-A1 实施契约

## 1. 不变量

| ID | 不变量 |
| --- | --- |
| INV-01 | 真实路径和默认路径永远不是自动测试输入；所有写入根显式且位于唯一临时根 |
| INV-02 | `coordinated` 与 `pre-cutover` 是两种不同语义的 bundle，restore 可验证两者，activate 只接受后者 |
| INV-03 | pre-cutover bundle 必须绑定一个 succeeded final run 和同一 `ready_for_activation` PersistenceState |
| INV-04 | `db:activate --dry-run` 零 DB 写、零 evidence 推进、零目标根写 |
| INV-05 | execute 只允许同身份 `ready_for_activation -> db_only`，不写 `firstBusinessWriteAt` |
| INV-06 | 第一笔业务写与业务 mutation 同一事务提交；回滚不留时间戳 |
| INV-07 | `ready_for_activation`、`recovery_required` 下任何业务 mutation 均被拒绝 |
| INV-08 | C0～C7 不可跳步；完成证据跨进程/实例可恢复，身份改变不得续跑 |
| INV-09 | fake SecretStore/provider 允许；fake Prisma/restore/final run 不得作为综合演练证据 |
| INV-10 | 不修改 Schema/migration/trigger，不新增审查签名基础设施 |

## 2. C2/C4 时序纠正

### 2.1 当前矛盾

旧顺序写成“C2 pre-cutover restore rehearsal”，但 pre-cutover bundle 又要求：

```text
MigrationRun.kind=final
MigrationRun.status=succeeded
PersistenceState.activationState=ready_for_activation
```

这些条件只能在 C4 final import/verify/ready 后成立。

### 2.2 唯一合法顺序

```text
C0 bridge release + capability/release gates
C1 drain/closed + sealed runtime bundle
C2 final source snapshot + decisions/source rollback evidence
C3 fresh target DB + fake SecretStore prestage
C4 final import/verify -> mark ready
   -> pre-cutover backup -> verify-only -> materialize restore rehearsal
C5 restored DB closed-maintenance API/read/rollback smoke
C6 metadata-only archive + runtime roots isolation
C7 activate dry-run -> execute -> persist C7 -> reopen writes -> first business write
```

因此必须删除 `ReadyCoordinatorInput.backupVerified: boolean`。ready 的真实前置是 final verification、capability、secret scan 和 closed runtime bundle；pre-cutover backup 在 ready 后生成，再由 activate 精确验证。

## 3. Backup 类型契约

### 3.1 输入判别联合

实现必须让 TypeScript 在 kind 分支内收窄，不得继续用一组 shadow-only 字段兼容两类输入。

```ts
type BackupInput = CoordinatedBackupInput | PreCutoverBackupInput;

interface BackupCommonInput {
  databaseUrl: string;
  workspaceRoot: string;
  dataRoot: string;
  releaseRoot: string;
  appCommit: string;
  maintenanceBundle: string;
  decisions: string;
  output: string;
}

interface CoordinatedBackupInput extends BackupCommonInput {
  kind: "coordinated";
  fullImportReport: string;
}

interface PreCutoverBackupInput extends BackupCommonInput {
  kind: "pre-cutover";
  runId: string;
}
```

CLI 精确参数：

```text
coordinated:
  必须 --full-import-report
  禁止 --run-id

pre-cutover:
  必须 --run-id
  禁止 --full-import-report
```

共同参数仍全部显式；未知、重复、额外 positional、孤立值、相对路径在 Prisma 初始化前返回 `BACKUP_ARGS_INVALID`。

### 3.2 Manifest 判别联合

```ts
type BackupManifest = CoordinatedBackupManifest | PreCutoverBackupManifest;
```

共同字段：

```text
schemaVersion=1
kind=airoaming_backup_bundle_v1
backupKind
appCommit
createdAt
maintenanceBundleDigest
migration
persistenceState
database
assets
missingAssets
secretHandling
bundleDigest
```

coordinated 固定：

```text
backupKind=coordinated
migration.runKind=shadow
migration.runIds=16 个 fixed slice run
persistenceState=shadow/null/null
```

pre-cutover 固定：

```text
backupKind=pre-cutover
migration.runKind=final
migration.runIds=[finalRunId]
migration.finalRunId=finalRunId
migration.sliceCount=16
persistenceState.activationState=ready_for_activation
persistenceState.cutoverRunId=finalRunId
persistenceState.activatedAt=null
persistenceState.firstBusinessWriteAt=null
```

pre-cutover migration 至少包含并绑定：

```text
sourceManifestDigest
snapshotManifestDigest
decisionsDigest
finalImportReportDigest
runSummaryDigest
effectiveSchemaManifestDigest
```

`BackupResult.runCount` 不再是字面量 16；coordinated 返回 16，pre-cutover 返回 1，sliceCount 仍为 16。

## 4. Pre-cutover backup 验证顺序

必须在 DB 写栅栏内完成数据库派生读取、复制和 source-after-copy 校验：

```text
精确 CLI/path 校验
-> capability blockedIds=[]
-> current release identity
-> maintenance runtime bundle digest/closed semantics
-> BEGIN IMMEDIATE + WAL checkpoint
-> final run 存在且 succeeded/importerVersion 正确
-> final aggregate report 正好 16 slice 且每项 evidence.passed=true
-> run verification integrity/FK/ledger/checksum/blocker/secret 全绿
-> decisions 文件摘要与 run.decisionsDigest 一致
-> PersistenceState=ready_for_activation 且绑定同一 run/source/effective
-> activatedAt/firstBusinessWriteAt=null
-> open MigrationIssue=0
-> 复制 DB/ready Asset/settings.redacted/run-summary
-> 副本 integrity/FK/账本/secret 校验
-> manifest + fsync + atomic rename + SEALED
```

任何失败不得留下 `SEALED`、最终 bundle 目录或明文临时副本。

## 5. Restore 契约

### 5.1 共同外层验证

- 目录名、manifest digest、bundleDigest、SEALED、DB/Asset/settings/run-summary 摘要继续严格验证。
- release effective identity 必须相等。
- secret sentinel 必须为 0。
- verify-only 不创建 target/staging。
- materialize 只接受不存在的两个目标根。

### 5.2 kind 分支

`verifyManifest()`、`verifyRunSummary()`、`verifyDatabase()` 必须按 `backupKind` 分支：

| kind | MigrationRun | PersistenceState | activate 可用 |
| --- | --- | --- | --- |
| coordinated | 16 条 shadow succeeded | shadow/null/null | 否 |
| pre-cutover | 1 条 final succeeded，内部 aggregate 16 slice | ready，同 final identity，未激活未首写 | 是 |

pre-cutover bundle 即使外层重新 seal，只要发生以下任一变化也必须 `RESTORE_VERIFICATION_FAILED`：

- final run ID/source/snapshot/decisions/report/effective 任一不一致。
- final report slice 缺失、乱序、failed、evidence 未通过。
- PersistenceState 与 final run 不一致。
- `activatedAt` 或 `firstBusinessWriteAt` 非空。
- open blocker、secret、ready Asset 摘要冲突。

materialize pre-cutover 后，恢复数据库仍必须是 `ready_for_activation`，不能在 restore 中自动 activate。

## 6. ReadyCoordinator 契约

输入改为可验证证据，不接受布尔替身：

```ts
interface ReadyCoordinatorInput {
  runId: string;
  releaseRoot: string;
  workspaceRoot: string;
  secretStoreRoot: string;
  maintenanceBundle: string;
}
```

`RuntimeBundleV1`/读取器需要提供或验证以下 closed 语义：

```text
maintenanceState=closed
activeMutations=0
activeStreams=0
每个 participant.active=0
每个 participant.queued=0
payloadDigest 有效
secret sentinel=0
```

若需要给 RuntimeBundle 增加字段，保持 `schemaVersion=1` 的兼容读取范围仅限旧 snapshot；M6 markReady/backup 必须要求新 closed evidence 完整，不能把字段缺失当作 closed。

## 7. 持久 CutoverEvidenceStore

### 7.1 目录

```text
<explicit-evidence-root>/
  cutover-evidence.json
  steps/C0.json
  ...
  steps/C7.json
  C6_READY
  COMPLETED
```

新 cutover 要求 evidence root 为空；resume 只接受已有、带合法 manifest 的同一根。禁止默认 cwd、默认 workspace 或自动搜索最新 run。

### 7.2 Manifest

```ts
interface CutoverEvidenceManifestV1 {
  schemaVersion: 1;
  kind: "airoaming_cutover_evidence_v1";
  cutoverId: string;
  appCommit: string;
  effectiveSchemaManifestDigest: `sha256:${string}`;
  sourceManifestDigest: `sha256:${string}` | null;
  finalRunId: string | null;
  completedThrough: "C0" | "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | null;
  stepDigests: Array<{ step: CutoverStep; digest: `sha256:${string}` }>;
  evidenceDigest: `sha256:${string}`;
}
```

每个 step 文件必须包含：

```text
schemaVersion/kind/cutoverId/step/status=passed
startedAt/finishedAt
inputDigest
previousStepDigest
artifactDigests（只含摘要和逻辑名，不含秘密）
summary
stepDigest
```

所有 JSON 使用 canonical digest，temp→write→fsync→rename；manifest 最后更新。C6 完成后写 `C6_READY` seal，activate 只接受该 seal 与 manifest/step digest 全部一致。

### 7.3 顺序、幂等与恢复

- 只能执行 `completedThrough` 的下一步。
- 已完成 step 以相同 inputDigest 重放，返回原 evidence，不再次执行 action。
- 已完成 step 输入不同，返回 `CUTOVER_RESUME_CONFLICT`。
- 任一步 action 失败，不写 passed step，不推进 manifest。
- 新 coordinator 实例读取同一 evidence root 后必须从下一步继续。
- C7 DB 已提交但 evidence 尚未落盘时，resume 可在“DB 已是同一 identity 的 db_only、firstBusinessWriteAt 仍为空”条件下补写 reconciled C7；不得再次更新 activatedAt。
- 写入 C7/COMPLETED 前不得开放业务写；因此 crash-reconcile 时 firstBusinessWriteAt 非空属于异常并停止。

## 8. DbActivate 契约

输入新增：

```ts
maintenanceBundle: string;
cutoverEvidenceRoot: string;
```

验证顺序：

```text
精确 CLI/绝对路径
-> current release identity
-> final run + verification
-> ready PersistenceState
-> closed maintenance runtime bundle
-> CutoverEvidence C0～C6 + C6_READY
-> AppRestoreService verify-only
-> typed manifest 必须 backupKind=pre-cutover
-> manifest finalRunId/source/snapshot/decisions/effective/state
   与 input/final run/PersistenceState/evidence 全相等
-> dry-run 返回或 execute 条件事务
```

`verifyBackup()` 必须返回 typed verified result（至少 manifest、manifestDigest、bundleDigest），不能继续返回 `void`。

明确拒绝：

| 输入 | 错误 |
| --- | --- |
| coordinated/shadow bundle | `ACTIVATE_BACKUP_UNVERIFIED` |
| final run/source/effective/decisions 不同 | `ACTIVATE_IDENTITY_MISMATCH` |
| maintenance 非 closed 或 evidence 未到 C6 | `ACTIVATE_NOT_READY` |
| bundle/SEALED/DB/Asset 篡改 | `ACTIVATE_BACKUP_UNVERIFIED` |
| ready 已有 first write/activatedAt | `ACTIVATE_NOT_READY` |

execute 事务只更新 `activationState=db_only` 和首次 `activatedAt`。提交后读回完整 identity；然后由 coordinator 原子保存 C7 evidence 和 COMPLETED，最后才允许 reopen。

## 9. 业务写边界

### 9.1 分类

业务写 owner 至少覆盖：

```text
project/chapter/script/story/storyboard/preflight
character/scene/asset/candidate/lock
layout/export/asset-package
dialogue/pending/session/message/tool
generation task/worker/lease/cancel/recover
settings/credential metadata
project delete/outbox
```

维护写只允许：

```text
migration audit/import/ledger/ready
backup consistency read/fence
activate state transition
test fixture bootstrap
```

### 9.2 统一入口

- 所有业务 UnitOfWork 调用 `PrismaService.runBusinessTransaction()`。
- 维护写如需统一入口，新增名字明确的 `runSystemTransaction(reason, operation)`；`reason` 是关闭枚举，不接受任意字符串。
- 业务模块不得直接调用 `$transaction`。
- 业务模块不得通过 `database()` 直接执行 create/update/delete/upsert/createMany/updateMany/deleteMany；读操作可以保留。
- 同一事务回调内允许通过 `tx` 执行多表 mutation。

### 9.3 源码门禁

新增生产源码 guard/registry，至少证明：

1. 业务目录不存在直接 `$transaction`。
2. 每个已知 mutation owner 有 file/function/evidence ID。
3. system transaction 只来自关闭 allowlist。
4. 新增 Prisma mutation surface 未登记时测试失败。

不得只用一条脆弱 regex 声称覆盖全部 mutation；可使用 TypeScript AST、明确 registry 加结构扫描或等价的可解释方案。测试输出必须列出未登记文件和函数。

### 9.4 运行语义

- `shadow`：允许测试/开发业务写，但不设置 first write。
- `ready_for_activation`/`recovery_required`：业务 mutation 在执行回调前拒绝。
- `db_only + firstBusinessWriteAt=null`：业务 mutation 成功后、同一事务提交前设置时间。
- 已有 first write：不更新原时间。
- 业务事务抛错：mutation 和 first write 一起回滚。
- 两个并发首写：最终只有一个时间值，后者不得覆盖。

## 10. 真实隔离 C0～C7 演练

### 10.1 必须使用真实组件

`m6-c0-c7.rehearsal.spec.ts` 应重写为真实临时链路，或拆为同职责的 integration spec；不得保留当前 fake 综合测试并继续称其为 Runtime Review。

测试链：

```text
临时 legacy source fixture
-> MaintenanceCoordinator drain/close/runtime bundle
-> SnapshotService sealed snapshot
-> fresh target migrate deploy
-> fake SecretStore prestage
-> FinalImportOrchestrator 真实 16 slice
-> ReadyCoordinator 真实 markReady
-> AppBackupService pre-cutover
-> AppRestoreService verify-only + materialize 到第二组空根
-> restored DB 以 closed maintenance 启动 Nest AppModule
-> GET /api/projects 等只读 smoke
-> runBusinessTransaction 故障注入并 rollback，证明无业务残留/first write
-> MetadataArchiveService
-> DbActivateService dry-run + execute（真实 restore verifier）
-> CutoverEvidenceStore 写 C7/COMPLETED
-> 真实公开业务 mutation
-> firstBusinessWriteAt 非空且只写一次
-> file bridge 启动拒绝
```

### 10.2 必须包含的故障链

- final import 失败：源字节不变、state 不 ready、无 pre-cutover bundle。
- pre-cutover materialize/第二 rename 失败：补偿规则继续成立。
- C5 rollback smoke：业务行和 first write 均无残留。
- activate 前 identity/evidence/maintenance 任一篡改：state 保持 ready。
- activate 提交后、C7 evidence 前 crash：同身份 resume 只补 evidence，不重写 activatedAt。
- 首写后 file-only/bridge 启动拒绝。

## 11. Secret 与证据卫生

sentinel 扫描必须覆盖：

```text
source/snapshot
target DB
settings.redacted
final report/run summary
cutover evidence/runtime bundle
backup bundle
materialized data/workspace roots
metadata archive
captured logs/errors
```

fake SecretStore 根可保存测试 secret，但必须位于扫描 allowlist 外，并单独证明其它根 0 命中。任何报告不得提交完整 prompt、用户正文、绝对路径或 secretRef 原值；只提交规范化摘要。

## 12. 文档状态规则

- A1-5 前：`real_cutover_no_go`。
- 定向测试绿但全量/Review 未完成：`m6_a1_verification_in_progress`。
- 全部完成：`ready_for_real_cutover_authorization`。
- 真实 C0～C7、真实 Keychain/provider、OBS-01～10：继续 `not_run`。

不得使用 `passed` 描述 mock、未运行或只靠代码阅读推断的项目。

## 13. 2026-07-13 Production entry 复核补充

后续按真实命令面核对发现，本契约第 6～8 节尚未完整落到 production CLI：

- final/ready 仍只接受 fake SecretStore root，不能验证 macOS Keychain。
- 现有 Keychain put 仍把 secret 放进 `security -w <secret>` argv，不能满足生产进程边界。
- `DbActivateInput.maintenanceBundle/cutoverEvidenceRoot` 仍 optional，二者同时缺失时会跳过校验。
- `db:activate` CLI 没有传入 maintenance/evidence 的参数。
- activate 未重算完整 evidence/step/C6_READY digest 和 source/effective/appCommit identity。
- CutoverCoordinator 与 MetadataArchiveService 没有生产 C0～C7 runner。

因此本契约的“全部完成”条件实际未满足。M6-A1 只保留 `isolated_complete`；production entry 转入：

`文档/05_执行与记录/任务记录/2026-07-13_R0-R2真实切换施工包/implementation_contract.md`
