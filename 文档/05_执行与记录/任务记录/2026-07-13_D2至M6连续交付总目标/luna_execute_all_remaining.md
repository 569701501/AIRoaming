---
doc_id: AIR-D2-M6-LUNA-EXECUTE-001
status: ready_for_luna
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: ai-agent, developer, qa, human
source: 当前 git、capability CLI、M5-A4 验收证据与 D2/M6 总契约
---

# Luna 连续执行总施工单（当前唯一入口）

> 这份文件解决一个问题：Luna 领取后，不需要用户逐阶段盯进度；只要当前阶段没有真实授权边界、P0/P1 或连续三轮硬阻塞，就按顺序完成、复核、提交并自动进入下一阶段。

## 1. 当前事实，不要误判

### 1.1 M5 状态

M5-A0～A4 已完成。M5-A4 的 33/33 backup/restore 集成测试、server 49 files/340 tests、typecheck、Prisma/G1 门禁、临时根 Runtime/User Review 和 Scrutiny Review 均已通过。M5 的最终含义是“协调备份/空根恢复完成”，不等于 final import、activate 或真实切换完成。

因此：**M5 是最后一个已完成里程碑；当前不是继续施工 M5。**

### 1.2 当前代码基线

```text
branch: codex/g0-test-safety-net
last green commit: 075986f feat(d2): close project delete outbox
capabilities: 8
operations: 36
blockedIds: []
```

D2-A0、D2-A1-2、D2-A2-1、D2-A2-2、D2-A3-1、D2-A3-2A/B、D2-A4、D2-A5、D2-A6 已完成并有独立提交；D2-A6 的独立提交是 `075986f`。

当前工作树存在一份 **D2-A7 草稿但未验收、未提交** 的代码：

```text
apps/server/src/migration/final-import-report.ts
apps/server/src/migration/final-importer.ts
apps/server/src/migration/ready-coordinator.ts
apps/server/src/migration/db-ready.cli.ts
apps/server/src/migration/db-import.cli.ts           # final 分支草稿
apps/server/src/migration/migration-verify.service.ts # final verifier 草稿
apps/server/package.json                              # db:ready 草稿
```

这份草稿目前只确认 server typecheck 通过，**不能当作 D2-A7 完成**。Luna 必须先审查、补测试、修复、跑 Runtime Review，再独立提交；不得把它直接跳过，也不得把未通过的草稿当成 ready。

### 1.3 接管命令

```bash
git status --short
git rev-parse HEAD
cd apps/server
node --import tsx src/migration/db-capabilities.cli.ts --format json
node --import tsx src/migration/db-capabilities.cli.ts --check --format json
```

预期 `8/36/0`，`--check` 退出码为 0。若发现除上述 D2-A7 草稿以外的未识别改动，先保护并查清，不得 reset、checkout 或覆盖用户改动。

## 2. 连续执行顺序

严格按以下顺序。每个阶段完成后：定向测试 → 全量回归 → Scrutiny Review → 临时根 Runtime Review（适用时）→ 文档 → 独立 commit；通过后自动领取下一阶段。

| 顺序 | 阶段 | 目标 | 进入条件 | 退出状态 |
| --- | --- | --- | --- | --- |
| 1 | D2-A7 | final importer、final verifier、ready coordinator | D2-A6 `075986f`、当前草稿可审查 | `d2_final_import_ready` |
| 2 | D2-A8 | 双 fresh/replay/restart/secret/capability 综合见证 | D2-A7 独立提交且 FIN-01～10 全绿 | `d2_passed` |
| 3 | M6 | activate tooling、rollback 边界、隔离 C0～C7 | D2-A8 全绿且 `blockedIds=[]` | `m6_tooling_passed` |
| 4 | 总收口 | 生成最终证据和真实切换授权请求 | M6 C0～C7 及 RB 全绿 | `ready_for_real_cutover_authorization` |

## 3. D2-A7：先收口当前草稿

### 必须实现

1. final 入口只接受 sealed snapshot、normalized decisions、显式绝对 `database-url/workspace-root/data-root/release-root/secret-store-root`、唯一 `run-id`、`report` 和 `--format json`；缺参、相对路径、默认根、真实 SecretStore 一律在副作用前失败。
2. 复用 `FullShadowImporter` 的固定 16 slice mapper，不复制第二套导入逻辑；只新增一个权威 `MigrationRun(kind=final)`，子 shadow run 只能作为证据。
3. final report 固定记录 16 slice 顺序、runId、count、digest、status、source/snapshot/decision/effective identity；report、ledger、verification 必须互相重算绑定。
4. 目标 DB/data/workspace 非空、snapshot/decision/report digest 冲突、slice 失败或 blocked、integrity/FK 失败、secret sentinel 非零时 fail-closed；不得写 `ready_for_activation`。
5. 同 identity replay 必须零新增且返回相同 report；不同 identity 使用相同 runId 必须稳定冲突；旧 terminal run 不可修改。
6. verifier 必须校验 integrity、FK、ledger/open issue、16 slice、source/effective identity、current/pending、Asset bytes/hash、公开 DTO 和 secret scan。
7. ready coordinator 只有在 final succeeded、verify 通过、capability `blockedIds=[]`、blocker=0、secret=0、backup/maintenance 前置满足且 `activatedAt/firstBusinessWriteAt` 均为 null 时，才可把 `PersistenceState.activationState` 写成 `ready_for_activation`。

### 必须交付的证据

```text
FIN-01 16-slice final success
FIN-02 blocked slice fail-closed
FIN-03 same-identity replay
FIN-04 different-identity conflict
FIN-05 non-empty target
FIN-06 report/decision tamper
FIN-07 secret prestage/sentinel
FIN-08 final verify
FIN-09 ready state shape
FIN-10 capability regression / precondition rejection
```

`db:import --kind final` 在不满足条件时必须继续 fail-closed；不得用“能写表”代替 final 验证。

## 4. D2-A8：综合见证

在两个相互独立的临时 `dataRoot/workspaceRoot/SQLite/fake SecretStore` 中，使用正式 CLI/Service 完成：

```text
sealed snapshot → decisions → final import → verify → ready_for_activation
```

必须额外证明：同库 replay 零新增、Nest restart 后 DTO/状态一致、旧 metadata 变更不影响 DB 事实、Asset sha256/bytes 一致、DB/settings/report/log/task/artifact/export 全范围 SEC sentinel 为 0、8 capability/36 operation/`blockedIds=[]` 不回退。通过后更新总状态并独立提交综合见证。

## 5. M6：只做工具和隔离演练，不做真实切换

### 必须实现

- `CutoverCoordinator`（或等价编排器）。
- `db:activate --dry-run` 与 `db:activate --execute`；dry-run 零写。
- release/effective manifest/commit/marker/capability/final identity 校验。
- maintenance drain/closed、read/API smoke、rollback summary。
- metadata-only archive；Asset path/bytes 保留可读。
- 首笔业务写事务设置 `firstBusinessWriteAt`；设置后禁止 file-only rollback。
- file bridge fence、重启恢复、失败补偿和“不提供 down migration”的边界。

### 只允许的演练顺序

```text
C0 release/门禁
→ C1 drain/closed
→ C2 snapshot/备份恢复
→ C3 fresh DB + fake SecretStore
→ C4 final/verify/ready
→ C5 DB maintenance/read/API smoke
→ C6 metadata-only archive
→ C7 activate execute/reopen/首写
```

用例必须覆盖 `ACT-01～09`、`RB-01～06` 以及适用的 RST/FLT。所有根都必须带唯一 marker；真实 workspace、真实 DB、真实 Keychain、真实 provider、真实停写和真实 `db:activate --execute` 均禁止。

## 6. 每阶段统一门禁

```bash
corepack pnpm --filter @airoaming/server test -- --testTimeout=30000
corepack pnpm -w typecheck
corepack pnpm --filter @airoaming/web build
corepack pnpm --filter @airoaming/server g1:manifest:check
corepack pnpm --filter @airoaming/server g1:schema:check
corepack pnpm --filter @airoaming/server g1:migration:check
git diff --check
```

阶段记录至少写入：修改文件、定向结果、全量结果、review 结论、runtime 根、残留风险、commit。不要新建 review-attestation、双签、CAS review bundle 等审查基础设施。

## 7. 允许连续执行；只有这些情况才停

普通测试失败、类型错误、重构、补测试、补 0011+ 小 migration、fixture 不完整，都留在当前阶段修复，不向用户逐步询问。

只有以下情况停止并汇总一次：

- 需要真实环境、真实数据、真实凭据、真实停写或真实切换授权。
- 同一个硬阻塞经过至少三轮有记录的实验仍没有安全路径。
- 存在无法安全绕开的用户未提交冲突改动。
- 权威文档互相冲突，且无法由更新、更强证据消解。

## 8. 最终停点

完成 P9/P10/P11 后，新增最终完成记录、Scrutiny Review、Runtime Review、总进度和 `real_cutover_handoff.md`，最终状态只能是：

```text
ready_for_real_cutover_authorization
```

到此停止，把真实 C0～C7 留给用户另行授权；本施工单不执行真实切换。
