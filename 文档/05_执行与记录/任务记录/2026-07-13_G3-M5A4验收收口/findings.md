---
doc_id: AIR-G3-M5-A4-FINDINGS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: commit 91a450c～eb26743、M5 代码与验收文档独立复核
---

# M5-A4 复核发现

## 1. 已确认可用的部分

- capability registry 有 8 个稳定 ID，并诚实保留 7 个 required blocker。
- coordinated backup happy path 能生成 manifest、DB、ready Asset、脱敏 settings、run-summary 和 SEALED。
- restore happy path支持 verify-only、空根 materialize、DB restart 与 `GET /api/projects`。
- 2026-07-13 复跑基线定向测试 11/11、server typecheck 通过。

## 5. A4-1 实现后复核事实

- `AppBackupService` 先完成显式输入、路径、runtime bundle、full-shadow report 和 release identity 校验，再创建 staging 并取得 source SQLite 的 `BEGIN IMMEDIATE` 写入栅栏。
- runs、open issues、PersistenceState、Asset 元数据、DB 副本、ready Asset 文件校验/复制、settings 元数据读取均发生在同一个 fence operation 内；复制 DB 后再次读取源文件摘要并做 integrity/FK/ledger 表检查。
- 既有 writer 会在 checkpoint/BEGIN 阶段返回 `BACKUP_NOT_OFFLINE`；栅栏已持有时第二 SQLite writer 的 `BEGIN IMMEDIATE` 被阻断。任一失败清理 staging，不生成可接受的 `SEALED`。
- backup/restore CLI 的 exact grammar 在 parser 阶段拒绝额外 positional、孤立 value、重复/未知/缺值参数；parser 在 Prisma 初始化前执行。
- A4-1 定向测试 10/10 通过；server 全量回归 49 files/317 tests 通过，workspace typecheck、server typecheck、G1 三项检查和 diff check 通过。

## 6. A4-1 残留风险

- 当前只验证了 A4-1 的一致性栅栏与 CLI 门禁；restore release identity/ledger 精确核对、secret scan 扩展、路径/补偿故障矩阵仍未实现。
- WAL 未收敛分支已在生产逻辑中 fail-closed，但专门的非零 WAL 故障注入属于 A4-3/A4-4 证据，不能在本轮宣称完成。
- M5 仍保持 `hardening_required`，A4-2/A4-3/A4-4 未完成前不得推进 D2 或 M6。

## 7. A4-2 开工前复核（历史基线）

- 当前 `AppRestoreService.verifyDatabase()` 只检查 `integrity_check`、FK 和账本表存在；没有读取 16 条 MigrationRun、open MigrationIssue 或 PersistenceState。
- 当前 `verifyRunSummary()` 没有绑定 `FULL_SHADOW_SLICE_ORDER`、manifest.runIds 和每个 slice 的 exact keys。
- restore CLI/RestoreInput 没有显式 current `releaseRoot`，manifest 的 effective identity 只检查摘要形状。
- 现有 tamper 只覆盖 manifest 字节变化；A4-2 必须增加重算外层 seal 后的 ledger/run-summary/PersistenceState 语义篡改，避免把 digest 检查误写成账本验证。
- 已编写 `handoff_a4_2.md` 等五份施工资料；A4-2 已实现，A4-RST-01/02 已通过直接测试。

## 8. A4-2 实现后复核事实

- restore CLI/Service 现在必须显式接收 `releaseRoot`，使用 `loadReleaseSchemaIdentityV1()` 对 manifest effective identity 做精确绑定；缺失/重复/相对参数在副作用前返回 `RESTORE_ARGS_INVALID`，release 不兼容返回 `RESTORE_RELEASE_IDENTITY_MISMATCH`。
- run-summary 顶层和每个 slice 均 exact keys；16 个 slice 的顺序、runId、status、importerVersion、reportDigest 和 counts 与 `FULL_SHADOW_SLICE_ORDER`/manifest 三方绑定。
- bundle DB 使用 read-only `node:sqlite` + prepared statements，逐 run 核对 kind/status/四类 digest/counts/schema versions/verification，并要求每条 run 的 open MigrationIssue 为 0；PersistenceState 固定核对 `shadow/null/null`。
- 测试覆盖 resealed summary 顺序/字段篡改、resealed DB ledger/import issue/manifest state 篡改，以及 manifest/SEALED/run-summary/DB/Asset raw tamper；所有失败保持零 target/staging 写入。
- A4-2 定向 22/22、server 全量 49 files/329 tests、workspace/server typecheck、Prisma validate、G1 三项和 diff check 全部通过。

## 9. A4-2 残留风险

- A4-2 只闭合 release identity 与账本语义，不包含 A4-3 secret scan、路径门和补偿安全，也不包含 A4-4 的最终 M5 双 Review/完整 rehearsal。
- M5 仍保持 `hardening_required`；下一步只能另行创建并复核 A4-3 handoff。

## 10. A4-3/A4-4 完成事实

- A4-3 已闭合 DB/Asset/report/settings/restored roots sentinel、symlink/重叠/storageKey 和第二根发布补偿故障矩阵；外部修改第一根时保留目录并返回 `RESTORE_COMPENSATION_UNSAFE`。
- A4-4 在临时根完成 materialize 后 sentinel=0、closed maintenance、项目 API 读取和 `PersistenceState shadow/null/null` 运行复核。
- 全量 server 49 files/340 tests、workspace/server typecheck、G1 三项、Prisma validate、diff check 全部通过；Scrutiny/Runtime Review 均通过。
- M5-A4 全部 acceptance ID 已通过，M5 可恢复 `completed`；D2/M6、SecretStore、final importer、pre-cutover、activate 仍不属于本任务。

## 2. 阻止 M5 正式通过的发现

| ID | 级别 | 代码事实 | 风险 |
| --- | --- | --- | --- |
| M5R-01 | P1 | `app-backup.service.ts` 先通过 Prisma 读取 runs/issues/PersistenceState/Asset/settings，之后才在 `copyDatabaseOffline()` 中 `BEGIN IMMEDIATE` | 读取事实与 DB 副本之间存在写入窗口，manifest 可能描述另一时刻的状态 |
| M5R-02 | P1 | restore 的 DB 验证只做 integrity/FK 和确认 `migration_runs/persistence_states` 两张表存在 | 被替换或不匹配的 ledger 仍可能通过恢复 |
| M5R-03 | P1 | run-summary 只验证 16 和 runId 唯一，没有与 manifest.runIds、固定 slice 顺序和 DB ledger 逐项匹配 | summary、manifest 与 DB 可各自合法但彼此不一致 |
| M5R-04 | P1 | restore 输入没有 release root，`effectiveSchemaManifestDigest` 只做格式校验 | 不兼容当前发布包的 backup 可能被 materialize |
| M5R-05 | P1 | secret 检查只遍历 manifest/settings 值，没有扫描 DB、Asset、run-summary、SEALED 和 restored roots | 清单写了 sentinel=0，但真实泄密面未覆盖 |
| M5R-06 | P1 | 第二根 rename 失败时，只要 marker 文本匹配就递归删除第一根 | 外部在发布后写入第一根时仍可能被补偿逻辑误删 |
| M5R-07 | P2 | backup/restore CLI 只拒绝未知 `--flag`，不会拒绝额外 bare positional token | “精确参数契约”和 fail-fast 证据不成立 |
| M5R-08 | P1 | 原验收把缺 slice/乱序/重复、active writer/WAL、DB/Asset tamper、nonsealed、symlink/重叠、secret、补偿失败等未执行项统一标记为 passed | 文档状态不能作为 D3 证据使用 |

## 3. 证据范围纠正

当前测试真实覆盖：

```text
CAP：4 tests
BAK：happy path、ready Asset 缺失、pre-cutover 阻断
RST：verify-only、materialize、manifest 篡改/目标已存在、重启项目列表 API
```

未覆盖项必须保持 `not_run`，不能用“服务中有检查分支”替代故障注入。

## 4. 后续阻塞

即使 M5-A4 完成，D2 仍有 7 个 required capability 未全绿；`db:import --kind final` 当前明确返回 `MIGRATION_FINAL_IMPORT_NOT_READY`，Settings 仍读写 `app-settings.json`，`db:activate` 脚本不存在。
