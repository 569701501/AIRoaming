---
doc_id: AIR-G3-M5-A4-2-FILEMAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer
source: 当前 backup/restore、release identity 与 full-shadow 代码
---

# M5-A4-2 文件与函数地图

## 1. 生产文件

| 文件 | 当前入口 | A4-2 改动 |
| --- | --- | --- |
| `apps/server/src/backup/app-restore.cli.ts` | `parseArgs()` | names 增加 `--release-root`，映射到 `RestoreInput.releaseRoot`；保持 exact grammar |
| `apps/server/src/backup/app-restore.service.ts` | `RestoreInput` | 增加 `releaseRoot` |
| 同上 | `verifyRunSummary()` | exact slice keys、fixed order、manifest.runIds 绑定，返回规范化 summary 供 DB 核对 |
| 同上 | `verifyDatabase()` | 改为接收 manifest + summary，核对 16 runs/issues/PersistenceState，不再只检查表存在 |
| 同上 | `AppRestoreService.restore()` | 加载 current release identity；全部 semantic verification 通过后才允许 materialize |

## 2. 只读依赖

| 文件 | 复用内容 | 禁止做法 |
| --- | --- | --- |
| `apps/server/src/persistence/release-schema-identity.ts` | `loadReleaseSchemaIdentityV1()` | 不复制 checksum 算法，不修改 release identity 规则 |
| `apps/server/src/migration/full-shadow-importer.ts` | `FULL_SHADOW_SLICE_ORDER` | 不在 restore 内重写一份 16 slice 常量 |
| `apps/server/src/backup/backup.types.ts` | `BackupManifest`、`BackupRunSummary` | 不放宽字段为任意 string/object |
| `@airoaming/shared` | `digestCanonicalJson()` | 不用普通 `JSON.stringify` 比较 JSON 语义 |

## 3. SQLite 查询最小集

```sql
SELECT
  id, kind, status, importer_version,
  source_manifest_digest, snapshot_manifest_digest,
  decisions_digest, report_digest,
  counts_json, counts_schema_version,
  verification_json, verification_schema_version
FROM migration_runs
WHERE id = ?;
```

```sql
SELECT COUNT(*) AS count
FROM migration_issues
WHERE run_id = ? AND resolution_status = 'open';
```

```sql
SELECT id, activation_state, cutover_run_id, first_business_write_at
FROM persistence_states
WHERE id = 'primary';
```

不要用字符串拼接 runId；使用 prepared statement 参数。JSON 列可能以字符串形式返回，必须安全 parse 后做 canonical 比较，解析失败即 `RESTORE_VERIFICATION_FAILED`。

## 4. 函数职责建议

```text
verifyManifest(raw)
  -> 只做 manifest exact shape + bundleDigest

verifyRunSummary(raw, manifest.migration)
  -> 返回规范化 BackupRunSummary

verifyReleaseIdentity(releaseRoot, manifest)
  -> current release digest 精确相等

verifyDatabase(databasePath, manifest, runSummary)
  -> integrity/FK + 16 run/schema versions + issue + PersistenceState

verifyAssets(bundlePath, manifest)
  -> 保持现有职责
```

避免把所有逻辑继续堆进 `restore()`；但本轮不要求为了行数拆新生产模块。若拆 helper，只能是无状态、单一职责、A4-2 所需的小模块。

## 5. 测试文件

首选继续扩展 `app-backup-restore.integration.spec.ts` 的 fixture，确保 backup 产出的真实 bundle 进入 restore。若文件过长，可新增：

```text
apps/server/src/backup/app-restore-ledger.integration.spec.ts
```

新 spec 仍必须使用现有 fresh SQLite + Prisma migrate deploy fixture；禁止用手写空壳 DB 代替生产 schema。
