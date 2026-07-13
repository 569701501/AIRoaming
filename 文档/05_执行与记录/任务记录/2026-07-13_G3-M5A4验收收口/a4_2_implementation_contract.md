---
doc_id: AIR-G3-M5-A4-2-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5-A4 implementation_contract 与当前 AppRestoreService
---

# M5-A4-2 实施契约

## 1. 输入契约

```ts
interface RestoreInput {
  backup: string;
  releaseRoot: string;
  targetDataRoot: string;
  targetWorkspaceRoot: string;
  mode: "verify-only" | "materialize";
}
```

CLI 必须精确接受：

```text
app:restore
  --backup <absolute sealed bundle>
  --release-root <absolute current release root>
  --target-data-root <absolute absent path>
  --target-workspace-root <absolute absent path>
  --mode verify-only|materialize
  --format json
```

- `--release-root` 必填、只出现一次、必须为绝对路径。
- 参数解析发生在读取 release/DB、检查 target parent 或创建任何文件之前。
- 不允许默认值、`process.cwd()`、仓库 HEAD 或环境变量补全 release root。

## 2. 验证顺序

```text
精确解析 CLI
-> 规范化 backup/release/两个 target 路径
-> 只读加载 current release identity
-> 只读解析 manifest/SEALED/settings/run-summary
-> 校验 bundle 外层 digest 与文件摘要
-> manifest effective identity == current release identity
-> 校验 fixed 16-slice run-summary
-> 只读打开 bundle DB
-> integrity/FK
-> 逐项核对 16 MigrationRun + open MigrationIssue
-> 核对 PersistenceState
-> 校验 Asset
-> verify-only 返回，或 materialize 才开始 staging
```

任何一步失败都不得创建 target 或 `.restore-staging-*`。

## 3. Release identity

调用既有 `loadReleaseSchemaIdentityV1(releaseRoot)`，不得复制其摘要算法。

```text
manifest.migration.effectiveSchemaManifestDigest
  === currentRelease.effectiveSchemaManifestDigest
```

固定错误选择：

- release root 不可读、结构非法、schema/migration 缺失或摘要不一致，统一返回 `RESTORE_RELEASE_IDENTITY_MISMATCH`。
- `--release-root` 缺失、重复、非绝对或带 NUL，返回 `RESTORE_ARGS_INVALID`。

## 4. Run-summary 精确结构

每个 slice 只允许以下键：

```text
slice
runId
importerVersion
status
reportDigest
counts
```

必须同时满足：

- slices 正好 16 个。
- `slice` 顺序精确等于 `FULL_SHADOW_SLICE_ORDER`。
- `runId` 顺序精确等于 manifest.migration.runIds，且 16 个唯一非空字符串。
- `status` 全部为 `succeeded`。
- `importerVersion` 为非空字符串。
- `reportDigest` 为规范 `sha256:<64 lower hex>`。
- `counts` 为 object 或 null；用 canonical JSON 比较，不用字符串顺序比较。
- summary 顶层 exact keys 和 `runSummaryDigest` 重算继续保留。

## 5. Bundle DB 账本验证

使用 `node:sqlite` read-only 连接，不初始化 Prisma，不执行 migration，不写 bundle DB。

对 manifest.runIds 中每个 ID 精确查询 `migration_runs`：

| DB 字段 | 期望来源 |
| --- | --- |
| `id` | summary slice.runId / manifest.runIds[index] |
| `kind` | 固定 `shadow` |
| `status` | 固定 `succeeded` |
| `importer_version` | summary slice.importerVersion |
| `source_manifest_digest` | manifest/summary sourceManifestDigest |
| `snapshot_manifest_digest` | manifest/summary snapshotManifestDigest |
| `decisions_digest` | manifest/summary decisionsDigest |
| `report_digest` | summary slice.reportDigest |
| `counts_json` | summary slice.counts，canonical JSON 相等 |
| `counts_schema_version` | 固定 `1` |
| `verification_json` | object，`schemaVersion=1`、`sourceManifestVerified=true`、`snapshotManifestVerified=true` |
| `verification_schema_version` | 固定 `1` |

每个 run 还必须满足：

```sql
SELECT COUNT(*)
FROM migration_issues
WHERE run_id = ? AND resolution_status = 'open'
```

结果为 0。缺 run、多 run、字段不符、schema version 不符、JSON 无法解析或 open issue 非零均返回 `RESTORE_VERIFICATION_FAILED`。

## 6. PersistenceState

必须读取唯一 `id='primary'` 行，并逐项比较：

| DB | manifest | coordinated 固定值 |
| --- | --- | --- |
| `activation_state` | `activationState` | `shadow` |
| `cutover_run_id` | `cutoverRunId` | `null` |
| `first_business_write_at` | `firstBusinessWriteAt` | `null` |

缺行、额外 primary 不可能但仍应 fail-closed；manifest 出现其他状态，即使 DB 与它一致，也不得通过 coordinated restore。

## 7. 外层摘要与语义验证的关系

外层摘要校验必须保留，但不能替代账本验证。

- raw-byte tamper：不重算摘要，应在 digest/SEALED 层失败。
- semantic tamper：测试修改 run-summary 或 DB 账本后，必须用测试 helper 重算合法的外层 digest/manifest/SEALED，并把 bundle 目录重命名为新的 `backup-<bundleDigest>`，再证明语义核对仍失败；不能让旧目录名提前触发 `BACKUP_NOT_SEALED`。
- 测试 helper 只存在于 spec，不得进入生产代码或对外导出。

## 8. 非目标

- 不扫描 DB/Asset secret sentinel；属于 A4-3。
- 不修复 symlink、storageKey、第二 rename 补偿；属于 A4-3。
- 不做 restart/API rehearsal 或 M5 completed 签字；属于 A4-4。
- 不实现 final/pre-cutover/activate、SecretStore 或任何 D2 capability。
