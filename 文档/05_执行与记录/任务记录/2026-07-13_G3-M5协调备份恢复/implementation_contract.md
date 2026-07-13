---
doc_id: AIR-G3-M5-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、G3-M backup/activate 施工资料与当前 CLI 约定
---

# G3-M5 实施契约

> 2026-07-13 独立复核后，本契约的验收收口由相邻任务目录 `2026-07-13_G3-M5A4验收收口/implementation_contract.md` 补充；冲突处以 A4 更严格规则为准。尤其 restore 必须新增显式 release root 并完成 ledger/release identity 核对。

## 1. Capability registry

### 1.1 数据结构

```ts
type CapabilityStatus = "implemented" | "partial" | "unsupported";

interface DbCapabilityEntry {
  id: string;
  ownerModule: string;
  readStatus: CapabilityStatus;
  writeStatus: CapabilityStatus;
  restartCovered: boolean;
  requiredForActivate: boolean;
  evidenceTestIds: string[];
  blocker: string | null;
}
```

首版至少登记以下稳定 ID：

```text
project_chapter_script
outline_story_storyboard_preflight
character_scene_asset_candidate_lock
layout_export
dialogue_pending_runtime
task_create_claim_complete_cancel_recover
settings_credential_secret_store
project_delete_outbox
```

当前只允许按真实公开 Service/API 路径判定；importer 能写表、底层 repository 有方法或测试直接调用内部 service，都不足以把公开 capability 标为 implemented。

当前基线的期望初值如下；Luna 应以代码复核为准，但不得把状态改得比下表更乐观：

| id | readStatus | writeStatus | restartCovered | 当前证据/阻塞 |
| --- | --- | --- | --- | --- |
| `project_chapter_script` | implemented | partial | true | 公开 create/draft/complete 重启通过；reset/import/clear 等仍被 `assertDatabaseOperationSupported` 阻断 |
| `outline_story_storyboard_preflight` | implemented | partial | true | M4 read-model 与部分 G2 DB service/worker 已覆盖；多项公开编辑/确认入口仍被阻断 |
| `character_scene_asset_candidate_lock` | implemented | partial | true | M4 read-model、Asset/Candidate worker 有证据；角色/场景参考与锁定等公开写入口未闭合 |
| `layout_export` | partial | unsupported | false | 仅有 legacy LayoutWorkingCopy read-model；build/export/package 写入口仍阻断 |
| `dialogue_pending_runtime` | unsupported | unsupported | false | importer 能恢复表不等于 Dialogue runtime 已改为 DB 事实源 |
| `task_create_claim_complete_cancel_recover` | implemented | implemented | true | PersistentTaskRepository/TasksService 公开 DB 分支、lease/retry/cancel/recover 测试已覆盖 |
| `settings_credential_secret_store` | unsupported | unsupported | false | `SettingsService` 仍读写含 apiKey 的旧 JSON；没有 SecretStore runtime |
| `project_delete_outbox` | unsupported | unsupported | false | DB mode delete 仍阻断，Outbox 删除闭环未接入公开路径 |

`evidenceTestIds` 使用 `相对测试文件#稳定用例名或ID`，例如 `src/migration/project-chapter-shadow-importer.integration.spec.ts#IMP-M4-API-01`；不得写笼统的 `server-tests-passed`。

### 1.2 CLI

```text
db:capabilities --format json
db:capabilities --check --format json
```

- 列表模式总是输出完整 registry，成功码为 `DB_CAPABILITIES_REPORTED`。
- `--check` 只有所有 `requiredForActivate=true` 项同时满足 `readStatus=implemented`、`writeStatus=implemented`、`restartCovered=true`、`evidenceTestIds` 非空时才成功。
- 当前基线必须以退出码 2 和 `MIGRATION_CAPABILITY_BLOCKED` fail-closed；不得为了让 M5 backup 可开发而改绿。
- 缺值、非法或重复 `--format` 返回 `DB_CAPABILITIES_ARGS_INVALID`，且不得初始化 Prisma。

## 2. Backup CLI

```text
app:backup
  --database-url <explicit absolute file: sqlite url>
  --workspace-root <explicit absolute existing root>
  --data-root <explicit absolute existing root>
  --release-root <explicit absolute current release root>
  --app-commit <explicit 7～40 lowercase hex commit sha>
  --maintenance-bundle <explicit absolute runtime bundle file>
  --full-import-report <explicit absolute full shadow report>  # coordinated 必填
  --decisions <explicit absolute decisions artifact>           # coordinated 必填
  --run-id <verified final run id>                              # pre-cutover 保留，M5 不开放成功路径
  --output <explicit absolute empty output root>
  --kind coordinated|pre-cutover
  --format json
```

### 2.1 kind 语义

| kind | 允许范围 | 必须条件 |
| --- | --- | --- |
| `coordinated` | M5 临时根演练、观察期协调备份 | 规范 full-shadow artifact 覆盖全部 16 个 succeeded run；maintenance bundle 可验证；DB 健康；不要求 capability 全绿 |
| `pre-cutover` | 未来 M6 激活前正式备份 | capability 全绿；final run succeeded；PersistenceState=ready_for_activation 且身份匹配 |

M5 当前只能让 `coordinated` 成功；`pre-cutover` 必须保持 fail-closed。

### 2.2 full-shadow 证据集

- `coordinated` 不得只核对一条 succeeded MigrationRun。`--full-import-report` 必须为 `db:import --kind shadow --slice full` 产生的 `airoaming_full_shadow_import_v1`。
- report 必须 `status=succeeded`，`slices` 数量为 16，顺序与 `FULL_SHADOW_SLICE_ORDER` 完全一致；必须按 `FullShadowImporter` 的 canonical 输入重算聚合 `reportDigest`。
- 每个 slice 的 runId 必须在当前 DB 中存在，`kind=shadow`、`status=succeeded`、无 open issue，且 ledger reportDigest/counts 与 artifact 一致；nested report 必须通过现有 report codec 重算。
- 16 条 run 的 sourceManifestDigest、snapshotManifestDigest 和 decisionsDigest 必须分别唯一且一致；`--decisions` 必须通过现有 decision codec，并与该 sourceManifestDigest/decisionsDigest 两方绑定。
- `migration/run-summary.json` 由已验证的 artifact + ledger 派生，按 slice 固定顺序记录 runId/importerVersion/reportDigest/counts；不盲信用户手写 summary。

### 2.3 路径和 SQLite 前置

- `database-url` 只接受无 query/fragment 的绝对本地 SQLite `file:` URL，数据库文件必须位于 `data-root` 内。
- `release-root` 必须能由现有 `loadReleaseSchemaIdentityV1` 读取当前 Prisma Schema/migration identity；不得把 asset workspace root 当成 release root。
- `app-commit` 必须由调用方显式提供并写入 manifest；backup 工具不得依赖运行目录存在 `.git`，也不得自行猜 HEAD。
- `workspace-root`、`data-root`、`output` 两两不得相同、互为祖先/后代或通过 symlink 指向重叠位置。
- `output` 必须存在且为空；工具在其中创建临时目录，成功后原子发布唯一的 `backup-<bundleDigest>` 子目录。
- maintenance bundle 使用现有 `RuntimeBundleFileService` 校验权限、schema、digest 和 secret；它只证明进入 closed 时的封口证据，SQLite 复制期间仍必须取得排他写阻断。
- 固定顺序：验证参数与 bundle → 打开 SQLite → `wal_checkpoint(TRUNCATE)` → 取得排他写锁 → 确认 WAL 已收敛 → 复制 DB → 校验副本 → 复制 ready Assets → 释放锁 → 写 manifest/SEALED。
- 无法 checkpoint、存在活动 writer、无法取得排他锁或复制期间 DB 身份改变，返回 `BACKUP_NOT_OFFLINE`。

### 2.4 bundle 结构

```text
backup-<bundleDigest>/
  backup-manifest.json
  database/app.db
  assets/<Asset.storageKey>
  config/settings.redacted.json
  migration/run-summary.json
  SEALED
```

`settings.redacted.json` 只能从 DB `AppPreference/ProviderConfig/CredentialMetadata` 的非秘密字段生成；不得读取或复制旧 `app-settings.json`，不得访问真实 SecretStore。

### 2.5 manifest 最小字段

```json
{
  "schemaVersion": 1,
  "kind": "airoaming_backup_bundle_v1",
  "backupKind": "coordinated",
  "appCommit": "<sha>",
  "createdAt": "<iso8601>",
  "migration": {
    "runIds": ["<ordered 16 run ids>"],
    "runKind": "shadow",
    "sliceCount": 16,
    "sourceManifestDigest": "sha256:...",
    "snapshotManifestDigest": "sha256:...",
    "decisionsDigest": "sha256:...",
    "fullImportReportDigest": "sha256:...",
    "runSummaryDigest": "sha256:...",
    "effectiveSchemaManifestDigest": "sha256:..."
  },
  "persistenceState": {
    "activationState": "shadow",
    "cutoverRunId": null,
    "firstBusinessWriteAt": null
  },
  "database": { "storageKey": "database/app.db", "bytes": 0, "sha256": "sha256:..." },
  "assets": [],
  "missingAssets": [],
  "secretHandling": { "included": false, "sentinelScan": "passed" },
  "bundleDigest": "sha256:..."
}
```

- `assets` 按 storageKey 升序；每项至少含 assetId/storageKey/mimeType/bytes/sha256。
- `bundleDigest` 对排除自身后的完整 manifest canonical JSON 计算；绝对路径不得进入 manifest/digest。
- `SEALED` 必须绑定 manifest digest、DB digest、Asset inventory digest 和 config/run-summary digest。

## 3. Restore CLI

```text
app:restore
  --backup <explicit absolute sealed bundle>
  --target-data-root <explicit absolute absent path>
  --target-workspace-root <explicit absolute absent path>
  --mode verify-only|materialize
  --format json
```

- `verify-only` 不创建目标根，也不修改 bundle。
- `materialize` 为保证 rename 发布语义，两个目标路径必须不存在；存在目录即使为空也返回 `RESTORE_TARGET_NOT_EMPTY`。
- 先验证 manifest/bundleDigest/SEALED/每项摘要/secret sentinel，再对 DB 副本执行 integrity、FK、migration ledger 与 release identity 检查。
- staging 必须创建在各目标根同一父目录，完整校验后分别原子 rename；每个 staging 含相同 restore marker。
- 第二根发布失败时，只能清理带相同 marker、尚未被外部修改的第一根；不得递归删除未知目录。
- materialize 后 DB 固定落到 `<target-data-root>/db/airoaming.sqlite`，Asset 按原 `storageKey` 落到 `<target-workspace-root>/<storageKey>`。
- 恢复后保持 maintenance closed；本 CLI 不开放业务写、不改 `PersistenceState`。

## 4. 稳定错误与退出码

| code | 含义 |
| --- | --- |
| `DB_CAPABILITIES_ARGS_INVALID` | capability CLI 参数非法 |
| `MIGRATION_CAPABILITY_BLOCKED` | required capability 未全绿 |
| `BACKUP_ARGS_INVALID` | backup CLI 参数缺失/重复/非法 |
| `BACKUP_PATH_UNSAFE` | 根重叠、symlink、越界或 DB 不在 dataRoot |
| `BACKUP_NOT_OFFLINE` | checkpoint/排他写阻断失败或 writer 未停 |
| `BACKUP_RUN_INVALID` | full-shadow artifact/run 集不完整、非 succeeded 或身份不满足 kind |
| `BACKUP_RELEASE_IDENTITY_INVALID` | release root/commit/effective identity 无法核对 |
| `BACKUP_ASSET_MISMATCH` | ready Asset 缺失或 bytes/hash 不一致 |
| `BACKUP_SECRET_DETECTED` | bundle 任何非 SecretStore 区域命中 sentinel |
| `RESTORE_ARGS_INVALID` | restore CLI 参数非法 |
| `BACKUP_NOT_SEALED` | bundle 缺少合法 SEALED/manifest |
| `RESTORE_TARGET_NOT_EMPTY` | materialize 目标已存在 |
| `RESTORE_VERIFICATION_FAILED` | digest/DB/Asset/ledger/release 任一失败 |

参数/前置错误退出 1；已执行且得到业务阻断结果的 `--check`/pre-cutover gate 退出 2；成功退出 0。

## 5. 安全写入

- JSON 和 marker 使用 0600；bundle/staging 目录使用 0700。
- 所有文件先写临时文件、fsync、rename；`SEALED` 永远最后写。
- 失败目录必须带工具 marker 才允许精确清理；禁止对用户给出的根做无 marker 递归删除。
- stdout 只输出 code、bundle 路径的虚拟/相对表示、digest、计数；stderr 只输出稳定 code。不得打印绝对根、正文、prompt 或 secret。
