---
doc_id: AIR-G3-M5-A4-2-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A4-RST-01/02 acceptance 与当前 restore fixture
---

# M5-A4-2 可执行测试矩阵

## 1. 公共断言

每个失败用例都必须断言：

- 错误码稳定。
- data target 和 workspace target 均不存在。
- 两个 parent 下不存在本次 `.restore-staging-*`。
- bundle 字节不被 restore 修改。
- fixture 全部位于临时根，不访问默认/真实 workspace、DB 或 SecretStore。

## 2. A4-RST-01：release + ledger identity

| 子 ID | 注入 | 期望 |
| --- | --- | --- |
| A4-RST-01A | 合法 bundle + 当前 repo releaseRoot | verify-only 通过，零目标写入 |
| A4-RST-01B | 临时复制 release tree 后修改一个 migration 字节 | `RESTORE_RELEASE_IDENTITY_MISMATCH` |
| A4-RST-01C | summary slice 顺序与 manifest.runIds 同时改乱并重新 seal | `RESTORE_VERIFICATION_FAILED`，fixed slice order 拒绝 |
| A4-RST-01D | summary importerVersion/report/counts 改动并重新 seal | `RESTORE_VERIFICATION_FAILED`，DB ledger mismatch |
| A4-RST-01E | bundle DB 中一个 run 的 source/snapshot/decisions/report/counts/verification 任一改动，重算 DB/manifest/SEALED | `RESTORE_VERIFICATION_FAILED` |
| A4-RST-01F | bundle DB 注入一个 open MigrationIssue，重算 DB/manifest/SEALED | `RESTORE_VERIFICATION_FAILED` |
| A4-RST-01G | DB 或 manifest 的 PersistenceState 改为非 `shadow/null/null`，重新 seal | `RESTORE_VERIFICATION_FAILED` |
| A4-RST-01H | CLI 缺失/重复/非绝对 `--release-root` | `RESTORE_ARGS_INVALID`，不读 DB、不写 target |

字段变体可以使用 `it.each`，但每个失败字段必须在用例名或 case label 中可见，不能用一个泛化 happy-path 声明全部通过。

## 3. A4-RST-02：bundle 篡改矩阵

| 子 ID | 注入 | 是否重算外层摘要 | 期望 |
| --- | --- | --- | --- |
| A4-RST-02A | manifest 任一字节 | 否 | `RESTORE_VERIFICATION_FAILED` |
| A4-RST-02B | SEALED 任一 digest | 否 | `BACKUP_NOT_SEALED` |
| A4-RST-02C | run-summary 任一字节 | 否 | `RESTORE_VERIFICATION_FAILED` |
| A4-RST-02D | DB 任一字节 | 否 | `RESTORE_VERIFICATION_FAILED` |
| A4-RST-02E | Asset 任一字节 | 否 | `RESTORE_VERIFICATION_FAILED` |
| A4-RST-02F | summary 的 runId/slice/counts 改动 | 是 | `RESTORE_VERIFICATION_FAILED`，由 fixed order/DB semantic binding 拒绝 |
| A4-RST-02G | DB ledger row 改动 | 是 | `RESTORE_VERIFICATION_FAILED`，由 ledger semantic binding 拒绝 |
| A4-RST-02H | DB PersistenceState 改动 | 是 | `RESTORE_VERIFICATION_FAILED`，由 state semantic binding 拒绝 |

## 4. 测试 helper 规则

允许在 spec 内创建以下 helper：

- `copyReleaseFixture(root)`：只复制 Prisma schema 与 migrations 到临时 release root。
- `recomputeBundleSeal(bundlePath)`：重算 DB/Asset/config/run-summary、manifest bundleDigest、manifestDigest 与 SEALED，并将 bundle 目录原子改名为新的 `backup-<bundleDigest>` 后返回新路径；只用于证明 semantic verifier。
- `mutateBundleDatabase(bundlePath, mutation)`：只操作临时 bundle DB。若 immutable trigger 阻止测试注入，可在临时副本中删除对应 trigger 后修改，但不得修改生产 schema/migration。
- `assertNoRestoreWrites(parent, targets)`：统一检查 target/staging 不存在。

禁止把这些 helper 放进生产模块，禁止通过环境变量打开篡改入口。

## 5. 回归

以下既有用例必须继续通过：

- A4-CLI-01、A4-BAK-01、A4-BAK-02。
- BAK happy、ready Asset missing、pre-cutover blocked。
- RST verify-only、materialize、existing target、restart/API。

所有 `AppRestoreService.restore()` 调用必须显式传入 `releaseRoot`，不得在测试构造器中偷偷默认 repoRoot。
