---
doc_id: AIR-G3-M5-A4-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5 原实施契约、独立复核发现 M5R-01～08
---

# M5-A4 实施契约

## 1. Backup 一致性栅栏

### 1.1 顺序

成功 coordinated backup 必须按以下顺序完成：

```text
参数/路径/runtime bundle/release identity 只读校验
-> 打开 source SQLite，wal_checkpoint(TRUNCATE)
-> BEGIN IMMEDIATE，取得写入栅栏
-> 在栅栏内读取并校验 16 MigrationRun/open issues/PersistenceState
-> 在栅栏内读取 Asset/settings metadata
-> 在栅栏内复制 DB 并做 integrity/FK
-> 在栅栏内复制并复核 ready Asset
-> 在栅栏末尾重新核对 DB 身份或保证全部 DB 读取来自同一稳定快照
-> 释放栅栏
-> 派生 run-summary/manifest，写 staging
-> 对完整 staging 做 secret scan
-> 最后写 SEALED 并原子发布
```

禁止先用 Prisma 读取 manifest 所需事实，再在另一个方法里晚到地取得锁。实现可以：

- 在同一 `node:sqlite` 连接上读取所需表；或
- 先用该连接取得 `BEGIN IMMEDIATE`，再通过只读 Prisma 查询，并在释放前做精确末尾复核。

无论采用哪种方式，测试必须证明栅栏生效后并发 writer 不能改变将写入 manifest 的事实。

### 1.2 Asset 稳定性

- Asset inventory 只来自栅栏内的 DB 查询。
- 每个 ready Asset 复制前后必须验证 regular file、非 symlink、storageKey 越界、bytes 和 sha256。
- 复制期间源文件发生变化时返回 `BACKUP_ASSET_MISMATCH`，不得 seal。
- `missingAssets` 只记录 DB 中非 ready 项；ready 项物理缺失仍是失败。

## 2. Restore 身份验证

### 2.1 CLI 补充 release root

```text
app:restore
  --backup <absolute sealed bundle>
  --release-root <absolute current release root>
  --target-data-root <absolute absent path>
  --target-workspace-root <absolute absent path>
  --mode verify-only|materialize
  --format json
```

`release-root` 必须由 `loadReleaseSchemaIdentityV1` 读取，manifest 的 `effectiveSchemaManifestDigest` 必须等于当前 release；不允许使用 cwd、仓库 HEAD 或默认路径猜测。

### 2.2 精确账本

restore 必须从 bundle DB 读取并逐项核对：

- manifest.runIds 正好 16 个、唯一、有固定顺序。
- run-summary.slices 的 slice/runId 顺序与 `FULL_SHADOW_SLICE_ORDER` 和 manifest.runIds 完全相同。
- 每条 MigrationRun 存在，`kind=shadow`、`status=succeeded`。
- source/snapshot/decisions/report/counts/importerVersion 与 manifest/run-summary 精确相等。
- 每条 run 的 open MigrationIssue 为 0。
- DB `PersistenceState` 与 manifest 的 activationState/cutoverRunId/firstBusinessWriteAt 精确相等，且 coordinated bundle 仍为 shadow/null/null。
- verification 中的 source identity 和 effective identity 满足当前 release 规则。

只检查表存在不算 ledger verification。

## 3. Secret scan

- 使用 `airoaming-test-secret-<runId>`、`sk-...`、`Bearer ...` 等测试 sentinel；不能只按字段名包含 `secret` 判定，因为合法 `secretRef`/schema 名称可存在。
- seal 前扫描 manifest、settings.redacted、run-summary、DB 中所有用户可写 TEXT/BLOB 值和所有 Asset 内容。
- materialize 后对恢复 DB 值和 workspace 文件再扫描一次。
- `SEALED.secretHandling.sentinelScan=passed` 必须由本轮真实扫描结果派生，不能写死。
- 仅 fake SecretStore 根允许包含测试 sentinel；backup/restore 不得访问真实 SecretStore。

## 4. 路径与补偿清理

- backup/release/data/workspace/output/两个 restore target 必须为显式绝对路径，拒绝 symlink、祖先/后代重叠、storageKey `..`/绝对路径/反斜线越界。
- materialize 第二根发布失败时，第一根只有在 marker 匹配且完整 inventory/digest 与发布时一致时才可自动删除。
- 如果第一根已被外部增加、删除或修改，必须保留目录并返回稳定错误 `RESTORE_COMPENSATION_UNSAFE`；不得递归删除。
- 允许引入小型内部 file-operations adapter 以确定性注入第二次 rename 失败；禁止依赖生产环境随机故障。

## 5. CLI 精确 grammar

- 参数必须严格由 `flag value` 或唯一布尔 flag 组成；任何额外 bare positional、孤立 value、重复 flag、缺值、未知 flag 都拒绝。
- `--format json` 正好一次。
- backup/restore 参数错误必须在 Prisma 初始化、读取 DB、创建 staging/target 前返回 `*_ARGS_INVALID`。
- `pre-cutover` 仍返回退出码 2 + `MIGRATION_CAPABILITY_BLOCKED`。

## 6. 稳定错误

沿用原错误码，并新增：

| code | 含义 |
| --- | --- |
| `RESTORE_RELEASE_IDENTITY_MISMATCH` | bundle effective identity 与当前 release 不同 |
| `RESTORE_COMPENSATION_UNSAFE` | 已发布目标被外部修改，自动补偿删除不安全 |

如实现能够无歧义地归入既有 `RESTORE_VERIFICATION_FAILED`，可不新增 identity 错误码；但测试和文档必须固定唯一选择。

## 7. 测试纪律

- 每条 acceptance ID 至少有一条直接测试；一个 happy-path 测试不能同时声明多个未注入故障通过。
- 所有 fixture 使用临时 data/workspace/DB/output/fake SecretStore。
- 测试不得连接默认根、真实用户数据库或系统 SecretStore。
- 不以增加 review bundle、attestation 或 digest 流程代码替代业务修复和测试。
