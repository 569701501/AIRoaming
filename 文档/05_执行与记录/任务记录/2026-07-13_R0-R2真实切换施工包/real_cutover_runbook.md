---
doc_id: AIR-RCUT-RUNBOOK-001
status: active
created: 2026-07-13
updated: 2026-07-14
owner: AI漫游项目
audience: release-owner, operator, qa, ai-agent
source: R0-A 实施契约与 G1 C0～C7 检查表
---

# R1 真实切换 Runbook

## 1. 执行状态

```text
R0_B_REMEDIATION_REQUIRED
```

本 Runbook 是 R0-A 完成后的目标命令面。仓库已具备 `db:cutover` 代码入口，两个 fresh C0～C7 隔离链、C1～C4 失败矩阵、C7 crash/reopen、首写 file-guard、Luna Scrutiny 和 disposable Keychain smoke 均已通过。R0-B 只读发现与两个 fresh shadow 已复现 blocker；进一步只读验证证明需要先恢复缺失结构源并修复 legacy character importer。完整执行入口是 `luna_r0b_blocker_remediation_handoff.md`。SH-01～09 尚未全绿，当前不能提交 SH-10，更不能升级为 C0/C1 或真实切换证据。

## 2. 角色

| 角色 | 职责 |
| --- | --- |
| Operator（可由 Luna 执行） | 只执行已授权 step，保存命令结果，不自签授权 |
| Release owner | 冻结 release、维护窗口和 plan identity |
| Migration reviewer | 人工审阅 MigrationReport，完成 SH-10 |
| Rollback owner | 确认备份可用、回滚窗口和恢复路径 |
| User/owner | 分别授予 AUTH-C1、AUTH-C5、AUTH-C7 |

同一人可兼任多个真实责任角色，但 Luna/Codex 不能代替人类完成 SH-10 或真实授权。

## 3. 运行文件

全部文件位于仓库外私有目录，权限 0600/0700；不提交绝对路径或内容。

```text
<private-run-root>/
  cutover-plan.v1.json
  authorizations/AUTH-C1.json
  authorizations/AUTH-C5.json
  authorizations/AUTH-C7.json
  evidence/
  snapshot/
  reports/
  backup/
  restore-data/
  restore-workspace/
  archive/
  logs/
```

真实 plan 由 R0-B 填写。仓库文档只记录 plan digest、runId、appCommit 和脱敏结果，不记录绝对路径。

## 4. R0-B 准备（阻塞修复后才能进入 SH-10）

本节是下一步唯一可申请的执行范围。原“只读发现与 release-specific shadow”授权已经用完，不能覆盖代码修改或真实源单文件恢复。下一次必须使用 `luna_r0b_blocker_remediation_handoff.md` §3 的完整授权文本；若用户未给出，Luna 最多只能阅读资料，不能开始 remediation。

### 4.1 Release freeze

- [x] 旧只读发现基线已记录（commit `3fda7d0`，Node `v22.22.2`，pnpm `7.12.1`）。
- [ ] Luna 完成 importer 修复后，以最终 remediation commit 创建仓库外 detached release worktree，并重新冻结 appCommit。
- [x] `prisma validate`、G1 manifest/schema/migration checks 全绿。
- [x] capability `blockedIds=[]`。
- [x] release identity 的 effective manifest 与目标值一致。
- [ ] 当前工作树干净；真实运行不使用未提交代码（当前存在用户既有文档修改，不能宣称 clean）。

R0-A 已固定证据：Scrutiny=`passed`、Runtime=`passed_isolated`、服务端全量 69 spec/472 tests。R0-B 只能在仓库外私有根填写真实 plan；绝对路径、用户名、token 内容、secretRef 原值不得写入仓库。

建议只读门禁：

```bash
pnpm typecheck
pnpm --dir apps/server build
pnpm --dir apps/web build
pnpm --dir apps/server prisma:validate
pnpm --dir apps/server g1:manifest:check
pnpm --dir apps/server g1:schema:check
pnpm --dir apps/server g1:migration:check
pnpm --dir apps/server db:capabilities -- --check --format json
```

### 4.2 Plan/root review

- [ ] 所有 root 为绝对路径、非 symlink。
- [ ] target DB/data/workspace/restore/archive/evidence 为空。
- [ ] source、target、backup、restore、archive、evidence 两两不重叠。
- [ ] 备份盘空间满足数据库 + ready Asset + 余量。
- [ ] maintenance base URL 为 loopback，token file 权限没有 group/other bit。
- [ ] Keychain probe 只返回 availability，不打印 secret。
- [ ] settingsStartState 与 credentialAction 已由人工核对；legacy 模式已确认目标 credentialId 不会覆盖 fingerprint 不同的旧项。

### 4.3 Blocker remediation 与 release-specific shadow

- [x] 旧只读 source snapshot 已在两个 fresh 临时目标复现一致 blocker。
- [x] 固定恢复备份中的 `structure.json` 已完成只读 digest/identity 核对。
- [x] 临时 overlay 已证明下一代码阻塞为 Story beat 名称引用；Storyboard 名称引用、slice order 和 child projection 缺口也已静态确认。
- [ ] Luna 按五份阻塞修复施工资料完成代码、测试、外置 release worktree 与 overlay 双 shadow。
- [ ] 条件门全绿后原子新增真实源唯一缺失文件，再跑两个 fresh real-source shadow。
- [ ] SH-01～SH-09 全绿后，才把报告交人工 Migration reviewer 完成 SH-10；Luna 不自签。

### 4.4 AUTH-C1 模板准备

此处只准备固定短句，不能提前生成授权文件。必须先让 C0 无授权、只读执行并得到 passed evidence，再由用户选择与 plan `settingsStartState` 一致的确认文本：

```text
already_sanitized：我确认 C0 证据、plan、release、备份与回滚责任人，授权进入 C1 并在 C3 只读验证 Keychain；未授权 C5/C7。
legacy_plaintext_requires_two_phase：我确认 C0 证据、plan、release、备份与回滚责任人，授权进入 C1 并在 C3 预暂存既有图片凭据；未授权 C5/C7。
```

## 5. 命令总则

R0-A 完成后统一使用：

```bash
pnpm --dir apps/server db:cutover -- \
  <status|step> \
  --plan "${CUTOVER_PLAN}" \
  --evidence-root "${CUTOVER_EVIDENCE_ROOT}" \
  --format json \
  <step/authorization flags>
```

禁止：

- 用 shell glob 搜索“最新” snapshot/backup/report。
- 把 secret、token 内容或 Keychain 输出保存到变量、日志或证据。
- 在一个命令中并行执行多个 step。
- 手工编辑 evidence JSON 或 PersistenceState。
- 使用 `prisma migrate reset`、down migration 或 file-only 回退。

## 6. C0 发布准备

```bash
pnpm --dir apps/server db:cutover -- \
  step --step C0 \
  --plan "${CUTOVER_PLAN}" \
  --evidence-root "${CUTOVER_EVIDENCE_ROOT}" \
  --format json
```

必须输出并留证：

```text
code=CUTOVER_C0_OK
release/appCommit/effective digest 匹配
capability blockedIds=[]
plan/root/token/space 检查通过
shadowGatePath 已绑定 plan identity，SH-01～10 与 SH-10 人工摘要有效
```

任一失败：停止，不生成 AUTH-C1，不进入维护。

C0 passed 后，用户按 §4.4 对应起点确认，生成不可覆盖的 `AUTH-C1`，绑定 C0 后的 evidence digest。C1～C4 都校验这份授权绑定的 C0 历史 gate digest；不得要求其伪装成后续最新 evidence digest。

## 7. C1 维护与 runtime bundle

runner 内部必须等价执行并验证：

```bash
pnpm --dir apps/server maintenance -- \
  drain --base-url "${MAINTENANCE_BASE_URL}" \
  --token-file "${MAINTENANCE_TOKEN_FILE}" \
  --timeout-ms 120000 --format json

pnpm --dir apps/server maintenance -- \
  close --base-url "${MAINTENANCE_BASE_URL}" \
  --token-file "${MAINTENANCE_TOKEN_FILE}" \
  --format json

pnpm --dir apps/server maintenance -- \
  bundle --base-url "${MAINTENANCE_BASE_URL}" \
  --token-file "${MAINTENANCE_TOKEN_FILE}" \
  --output "${RUNTIME_BUNDLE}" \
  --format json
```

正式 step：

```bash
pnpm --dir apps/server db:cutover -- \
  step --step C1 --plan "${CUTOVER_PLAN}" \
  --evidence-root "${CUTOVER_EVIDENCE_ROOT}" \
  --authorization-file "${AUTH_C1}" --format json
```

断言：同一旧进程仍存活、closed、active mutation/stream/participant/queued 全 0；runtime bundle 严格验证且 secret scan=0。

失败：保持旧进程，修复后同 identity resume；若需退出维护，必须由 rollback owner 授权 reopen。

## 8. C2 最终 snapshot

runner 内部使用现有入口：

```bash
pnpm --dir apps/server db:snapshot -- \
  --workspace-root "${SOURCE_WORKSPACE_ROOT}" \
  --staging-root "${SNAPSHOT_ROOT}" \
  --runtime-bundle "${RUNTIME_BUNDLE}" \
  --format json
```

正式 step：

```bash
pnpm --dir apps/server db:cutover -- \
  step --step C2 --plan "${CUTOVER_PLAN}" \
  --evidence-root "${CUTOVER_EVIDENCE_ROOT}" \
  --authorization-file "${AUTH_C1}" --format json
```

断言：pre/post manifest 相同、source 字节和 mtime 不变、settings 只生成 redacted artifact；冻结的 planDigest 不变，C2 evidence 绑定实际 source/snapshot digest。

失败：删除未 sealed staging；旧进程保持 closed，可授权 reopen。

## 9. C3 fresh DB 与 credential prestage

runner 使用参数数组执行固定 Prisma 命令，不使用 shell：

```bash
DATABASE_URL="${TARGET_DATABASE_URL}" \
  pnpm --dir apps/server exec prisma migrate deploy --schema prisma/schema.prisma
```

随后：

- Keychain 已脱敏起点：只 probe + fingerprint verify。
- legacy plaintext 起点：先读取目标 credentialId；已有且 fingerprint 不同则零写停止，已有且相同则复用，不存在才 prestage；settings 原文件字节仍不变。
- C4 前只允许删除本 cutover run 新建且 fingerprint 仍匹配的 prestage 项，不删除/覆盖任何切换前已存在项。
- OpenCode text auth 单独验证，AI漫游不复制文本 key。

正式 step：

```bash
pnpm --dir apps/server db:cutover -- \
  step --step C3 --plan "${CUTOVER_PLAN}" \
  --evidence-root "${CUTOVER_EVIDENCE_ROOT}" \
  --authorization-file "${AUTH_C1}" --format json
```

失败：清理本轮新建的目标 DB/未提交 credential prestage；不修改旧 settings。

## 10. C4 final、ready 与 pre-cutover backup

runner 内部依次调用 final import、verify、ready、backup、verify-only、materialize；任何一步失败都不写 C4 passed。

现有命令参数将由 R0-A 移除 fake root 并改为 production credential evidence。目标命令形态：

```bash
pnpm --dir apps/server db:import -- \
  --kind final \
  --snapshot "${SNAPSHOT_ROOT}" \
  --decisions "${DECISIONS_PATH}" \
  --database-url "${TARGET_DATABASE_URL}" \
  --report "${FINAL_REPORT}" \
  --workspace-root "${TARGET_WORKSPACE_ROOT}" \
  --data-root "${TARGET_DATA_ROOT}" \
  --release-root "${RELEASE_ROOT}" \
  --credential-evidence "${CREDENTIAL_EVIDENCE}" \
  --run-id "${RUN_ID}" --format json

pnpm --dir apps/server db:ready -- \
  --database-url "${TARGET_DATABASE_URL}" \
  --run-id "${RUN_ID}" \
  --release-root "${RELEASE_ROOT}" \
  --workspace-root "${TARGET_WORKSPACE_ROOT}" \
  --credential-evidence "${CREDENTIAL_EVIDENCE}" \
  --maintenance-bundle "${RUNTIME_BUNDLE}" \
  --format json

pnpm --dir apps/server app:backup -- \
  --kind pre-cutover \
  --database-url "${TARGET_DATABASE_URL}" \
  --workspace-root "${TARGET_WORKSPACE_ROOT}" \
  --data-root "${TARGET_DATA_ROOT}" \
  --release-root "${RELEASE_ROOT}" \
  --app-commit "${APP_COMMIT}" \
  --maintenance-bundle "${RUNTIME_BUNDLE}" \
  --decisions "${DECISIONS_PATH}" \
  --run-id "${RUN_ID}" \
  --output "${BACKUP_ROOT}" --format json

pnpm --dir apps/server app:restore -- \
  --backup "${PRE_CUTOVER_BACKUP}" \
  --release-root "${RELEASE_ROOT}" \
  --target-data-root "${RESTORE_DATA_ROOT}" \
  --target-workspace-root "${RESTORE_WORKSPACE_ROOT}" \
  --mode materialize --format json
```

正式 step：

```bash
pnpm --dir apps/server db:cutover -- \
  step --step C4 --plan "${CUTOVER_PLAN}" \
  --evidence-root "${CUTOVER_EVIDENCE_ROOT}" \
  --authorization-file "${AUTH_C1}" --format json
```

断言：final succeeded、16 slices、blocker=0、integrity/FK/secret=0、ready identity 精确、settings 明文原子清除、backup sealed、restore materialize/API/Asset hash 全绿、firstBusinessWriteAt=null。

## 11. AUTH-C5

Migration reviewer 与 rollback owner 审阅 C4 报告和恢复产物。用户固定确认：

```text
我确认 final/ready/pre-cutover backup 与 materialize 恢复均通过，授权关闭旧 file 进程并进入 C5/C6；未授权 C7 激活。
```

Luna 不得代签。授权文件必须绑定 C4 evidence digest。

## 12. C5 关闭态 DB smoke

```bash
pnpm --dir apps/server db:cutover -- \
  step --step C5 --plan "${CUTOVER_PLAN}" \
  --evidence-root "${CUTOVER_EVIDENCE_ROOT}" \
  --authorization-file "${AUTH_C5}" --format json
```

runner 必须：

- 关闭旧 file 进程后以 maintenance closed 启动目标 DB server。
- 读取 health、项目列表、每项目章节/七阶段关键 DTO。
- 执行 ephemeral business transaction 并强制 rollback。
- 断言无业务残留、firstBusinessWriteAt=null、无 fallback/secret/未处理 lease/outbox。

失败：不得 activate；使用 materialized pre-cutover 恢复证据，按 RB-02 处理。

## 13. C6 metadata archive

```bash
pnpm --dir apps/server db:cutover -- \
  step --step C6 --plan "${CUTOVER_PLAN}" \
  --evidence-root "${CUTOVER_EVIDENCE_ROOT}" \
  --authorization-file "${AUTH_C5}" --format json
```

断言：metadata-only、Asset bytes 不复制、archive 与活动 root 隔离、archive manifest/digest/权限正确、全局 secret scan=0、`C6_READY` 内容与 manifest digest 一致。

## 14. AUTH-C7

在 firstBusinessWriteAt 仍为空时，用户固定确认：

```text
我确认 C5 关闭态 DB smoke 与 C6 archive 通过，理解首次 DB 写后禁止 file-only 回退，授权执行 C7 激活。
```

授权文件绑定最新 C6 evidence digest、run/source/effective/plan identity。

## 15. C7 激活

runner 内部先调用 dry-run：

```bash
pnpm --dir apps/server db:activate -- \
  --database-url "${TARGET_DATABASE_URL}" \
  --cutover-id "${CUTOVER_ID}" \
  --app-commit "${APP_COMMIT}" \
  --plan-digest "${PLAN_DIGEST}" \
  --run-id "${RUN_ID}" \
  --source-manifest-digest "${SOURCE_MANIFEST_DIGEST}" \
  --effective-manifest-digest "${EFFECTIVE_MANIFEST_DIGEST}" \
  --release-root "${RELEASE_ROOT}" \
  --backup "${PRE_CUTOVER_BACKUP}" \
  --maintenance-bundle "${RUNTIME_BUNDLE}" \
  --cutover-evidence-root "${CUTOVER_EVIDENCE_ROOT}" \
  --authorization-file "${AUTH_C7}" \
  --gate ACT-08 --dry-run --format json
```

dry-run 全绿后，runner 以相同 identity 改为 `--execute`。随后严格顺序：

```text
PersistenceState ready -> db_only + activatedAt
-> 写 C7 step
-> 写 COMPLETED seal
-> 验证 evidence
-> reopen DB writes
-> 执行一笔风险最低、可后续清理但本次事务必须提交的公开业务写
-> firstBusinessWriteAt 非空且只写一次
-> 验证 file bridge 拒绝
```

正式 step：

```bash
pnpm --dir apps/server db:cutover -- \
  step --step C7 --plan "${CUTOVER_PLAN}" \
  --evidence-root "${CUTOVER_EVIDENCE_ROOT}" \
  --authorization-file "${AUTH_C7}" --format json
```

execute 后、COMPLETED 前 crash：仅在 db_only identity 相同且 firstBusinessWriteAt=null 时 resume 补证据，不重写 activatedAt；否则停止人工处理。

## 16. R2 观察期

真实切换完成后逐项执行 G1 OBS-01～10。每项记录命令、时间、runId、脱敏结果和责任人；全部通过后状态才可改为：

```text
db_only_observation_passed
```

此后才允许进入 G4 候选定稿返修开发。
