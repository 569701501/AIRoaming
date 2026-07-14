---
doc_id: AIR-RCUT-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: ai-agent, developer, reviewer, qa
source: 当前源码与 M6-A1/G1 契约差异复核
---

# R0-A 生产切换入口实施契约

## 1. 目标

把已经通过隔离 service 测试的 M6 能力，补成真正可由显式 CLI、同一 run identity 和持久证据驱动的生产入口。R0-A 只写代码、测试和文档，全部运行在临时根；不执行真实迁移。

## 2. 不变量

| ID | 不变量 |
| --- | --- |
| RCUT-INV-01 | 真实 secret 永不进入 argv、用户可见或继承的 stdout/stderr、日志、JSON evidence、数据库正文、backup 或 git |
| RCUT-INV-02 | production final/ready 不依赖 fake root；test fake 只能通过依赖注入并受临时根保护 |
| RCUT-INV-03 | activate 缺 maintenance bundle 或 cutover evidence 任一项时必失败，不存在“二者都省略则跳过” |
| RCUT-INV-04 | evidence 精确绑定 appCommit、runId、source/snapshot/decisions/effective manifest 和 plan digest |
| RCUT-INV-05 | C0～C7 顺序不可跳过；同输入幂等，不同输入冲突；失败 step 不写 passed |
| RCUT-INV-06 | `db:activate --dry-run` 对 DB、evidence、backup、target roots 零写 |
| RCUT-INV-07 | C7/COMPLETED 落盘前不得开放业务写；首笔业务写后禁止 file-only |
| RCUT-INV-08 | 测试不得调用真实 `security`、真实 provider、真实 workspace 或真实数据库 |
| RCUT-INV-09 | 本阶段不修改 Prisma schema、migration tree 或 trigger |
| RCUT-INV-10 | runner 不自动搜索默认根、最新 backup、最新 run 或当前用户目录 |

## 3. 当前差异

### 3.1 SecretStore

- `final-importer.ts` 明确要求 `AIROAMING_SECRET_STORE_ADAPTER=fake`。
- `ready-coordinator.ts` 同样要求 fake adapter/root，并把 fake secret 文件根加入 sentinel 扫描。
- 生产 `MacOSKeychainSecretStore` 已存在，但 final/ready CLI 没有注入或验证它。
- `SettingsService` 读取 legacy plaintext 时会立即 put + 原子脱敏；真实切换必须区分“已脱敏”与“尚未脱敏”，不能假定 C4 前 plaintext 一定仍存在。

### 3.2 Activate/Evidence

- `DbActivateInput.maintenanceBundle` 与 `cutoverEvidenceRoot` 仍为 optional。
- `verifyCutoverEvidence()` 在两者都缺失时直接返回。
- `db-activate.cli.ts` 不接收或传入这两个字段。
- 当前验证没有重算 evidence/step/seal digest，也没有核对完整 source/effective/appCommit identity。

### 3.3 Production runner

- `CutoverCoordinator` 只有 callback service；没有生产 CLI 把 C0～C7 domain action 与证据绑定。
- `MetadataArchiveService` 没有 CLI。
- 当前综合 rehearsal 是测试代码，不能被当成真实运行入口。

## 4. SecretStore 生产绑定

### 4.1 依赖注入

`FinalImportOrchestrator`、`ReadyCoordinator` 和真实 cutover runner 必须接收以下窄接口，不直接读取 fake 环境变量：

```ts
interface CutoverCredentialVerifier {
  probe(): Promise<{
    adapter: "keychain" | "fake";
    available: boolean;
  }>;
  verify(input: {
    runId: string;
    entries: readonly CredentialExpectation[];
    textAuthVerified?: boolean;
    requiredAdapter?: "keychain" | "fake";
  }): Promise<CredentialVerificationResult>;
}

interface CredentialExpectation {
  credentialId: string;
  expectedFingerprint: `sha256:${string}`;
  owner: "image_secret_store";
}
```

生产装配使用 `SecretStoreService`/`MacOSKeychainSecretStore`；测试装配使用 `FakeSecretStore` 或注入 fake `SecretCommandExecutor`。

禁止把 `SecretString.reveal()` 的结果写入任何返回对象。fingerprint 在内存计算后只返回 match boolean 和 digest。

`MacOSKeychainSecretStore.put()` 使用 `security add-generic-password` 的受控 prompt/pipe 通道；生产执行器的参数数组只能包含 executable、account、service 等非秘密元数据，且 `-w` 必须是最后一个选项。secret 只能通过不进入 argv/继承 stdout/stderr 的受控输入通道交给 Keychain。允许两种实现：

1. `security -w` 的受控 prompt/pipe 通道，且由隔离平台验证证明 secret 不出现在 argv、公开输出和错误对象；
2. Security.framework helper 或等价窄接口，通过匿名 pipe 接收/返回敏感字节，stdout/stderr 仅允许受控状态码。

若无法证明第一种方案的进程可见性，必须采用第二种；禁止退回 `-w <secret>`。fake executor 必须记录非秘密 args，并只用 `SecretString`/敏感输入占位证明数据通道，不能把 secret 拼进 snapshot 或失败消息。

当前隔离实现采用 `-U -w`、受控 stdin + 私有 stdout/stderr pipe；本机 `security add-generic-password -h` 明确要求 `-w` 为最后选项，且无 TTY child pipe 需要写入两行相同 secret（密码与确认）。fake executor 已证明参数数组不含 secret。真实 macOS Keychain smoke 已验证该输入协议，结果只保留脱敏 fingerprint/状态。


### 4.2 CredentialEvidenceV1

正式 evidence 只记录非秘密验证事实：

```ts
interface CredentialEvidenceV1 {
  schemaVersion: 1;
  kind: "airoaming_credential_evidence_v1";
  runId: string;
  adapter: "keychain";
  probedAt: string;
  storeAvailable: true;
  textAuthVerified: boolean;
  entries: Array<{
    credentialIdDigest: `sha256:${string}`;
    expectedFingerprint: `sha256:${string}`;
    actualFingerprint: `sha256:${string}`;
    matched: true;
  }>;
  evidenceDigest: `sha256:${string}`;
}
```

不得记录：secret、原始 Keychain 输出、authorization header、cookie、token、完整 secretRef 或本机用户名。

### 4.3 两种 settings 起点

| 起点 | 行为 |
| --- | --- |
| 已脱敏且有 secretRef/fingerprint | 只验证 Keychain 可读和 fingerprint；不得重写或恢复 plaintext |
| 存在 legacy plaintext | C3 prestage 写 Keychain并验证，但旧 settings 字节保持不变；C4 final/verify 全绿后再原子脱敏 |

若现有 `SettingsService` 自动迁移会让 legacy plaintext 在 C0 提前消失，R0-A 必须提供显式 deferred/prestage 模式，或证明当前真实 settings 已经脱敏。不能通过文档假设绕过。

legacy prestage 还必须遵守：先读取目标 credentialId；若已存在且 fingerprint 不同则停止且零写，若相同则复用；若不存在才创建，并记录 `createdByCutoverRun=true`。C4 前回滚只能删除本 run 新建且 fingerprint 仍匹配的条目，绝不能删除或覆盖切换前已存在的 Keychain 项。

### 4.4 fake 限制

- process CLI 正式路径不接受 `--secret-store-root`。
- 测试通过 exported runner/dependency injection 注入 fake。
- 若保留兼容 fake CLI，只允许 `NODE_ENV=test`、root 在 `os.tmpdir()`、显式 `--test-only-fake-secret-store` 三条件同时成立；任一缺失必须在 Prisma 初始化前失败。

## 5. Runtime bundle 严格关闭语义

在现有 schemaVersion=1 上增加可验证 participant status，或新增严格 cutover profile；必须至少证明：

```text
maintenanceState=closed
activeMutations=0
activeStreams=0
每个注册 participant.active=0
每个注册 participant.queued=0
每个 participant.blockedReason=null
payloadDigest 有效
secret sentinel=0
```

建议 envelope：

```ts
participants[name] = {
  status: { active: 0; queued: 0; blockedReason: null };
  sealedState: unknown;
}
```

`RuntimeBundleFileService.readAndVerify(file, { profile: "cutover" })` 必须严格验证以上字段；旧 snapshot 兼容读取不得用于 markReady/backup/activate。

## 6. CutoverPlanV1

真实运行使用仓库外的 0600 私有 plan 文件；不允许用散落环境变量猜 identity。

```ts
interface CutoverPlanV1 {
  schemaVersion: 1;
  kind: "airoaming_cutover_plan_v1";
  cutoverId: string;
  appCommit: string;
  runId: string;
  releaseRoot: string;
  sourceWorkspaceRoot: string;
  targetDatabaseUrl: `file:${string}`;
  targetDataRoot: string;
  targetWorkspaceRoot: string;
  snapshotRoot: string;
  decisionsPath: string;
  finalReportPath: string;
  maintenanceBaseUrl: string;
  maintenanceTokenFile: string;
  runtimeBundlePath: string;
  backupRoot: string;
  restoreDataRoot: string;
  restoreWorkspaceRoot: string;
  archiveRoot: string;
  evidenceRoot: string;
  settingsStartState: "already_sanitized" | "legacy_plaintext_requires_two_phase";
  credentialAction: "verify_existing" | "prestage_legacy";
  effectiveSchemaManifestDigest: `sha256:${string}`;
  planDigest: `sha256:${string}`;
}
```

约束：

- 所有 path 必须绝对、无 NUL、非 symlink；要求为空的目标必须为空。
- source/target/backup/restore/archive/evidence/token/release roots 两两按契约不重叠。
- plan 不含 secret；base URL 只允许 loopback。
- plan 在 C0 前生成并冻结；`planDigest` 在整个 cutover 中不变，任何字段变化都必须新建 cutoverId，不能原地改写。
- C2/C4 才产生的 source/snapshot/decisions 实际 digest 写入 evidence manifest，不回写 plan，避免 AUTH-C1 因 plan revision 失效。
- plan 文件和 evidence root 不提交 git。

## 7. CutoverEvidenceV1

### 7.1 Manifest

```ts
interface CutoverEvidenceManifestV1 {
  schemaVersion: 1;
  kind: "airoaming_cutover_evidence_v1";
  cutoverId: string;
  appCommit: string;
  planDigest: `sha256:${string}`;
  runId: string;
  sourceManifestDigest: `sha256:${string}` | null;
  snapshotManifestDigest: `sha256:${string}` | null;
  decisionsDigest: `sha256:${string}` | null;
  effectiveSchemaManifestDigest: `sha256:${string}`;
  completedThrough: "C0" | "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | null;
  stepDigests: Array<{ step: string; digest: `sha256:${string}` }>;
  evidenceDigest: `sha256:${string}`;
}
```

### 7.2 Step

每个 `steps/Cn.json` 必须包含：

```text
schemaVersion=1
kind=airoaming_cutover_step_v1
cutoverId/appCommit/planDigest/runId
step/status=passed
startedAt/finishedAt
inputDigest/previousStepDigest
artifactDigests（逻辑名 -> sha256）
summaryCode（受控枚举，不写正文）
stepDigest
```

### 7.3 Seal

- `C6_READY` 绑定 C6 后 manifest `evidenceDigest`、run/source/effective/plan digest。
- `COMPLETED` 绑定 C7 后 manifest `evidenceDigest`、activation identity 和 `activatedAt`。
- activate 必须验证 seal 内容，不能只检查文件存在。

### 7.4 持久写

全部执行 canonical encode → temp 0600 → write → fsync file → rename → fsync parent directory。manifest 最后更新；任一步失败不产生 passed step。

## 8. DbActivate 强制契约

### 8.1 类型

```ts
interface DbActivateInput {
  cutoverId: string;
  appCommit: string;
  planDigest: `sha256:${string}`;
  runId: string;
  sourceManifestDigest: `sha256:${string}`;
  effectiveManifestDigest: `sha256:${string}`;
  releaseRoot: string;
  backup: string;
  maintenanceBundle: string;
  cutoverEvidenceRoot: string;
  authorizationFile: string;
  gate: "ACT-08";
  mode: "dry-run" | "execute";
}
```

所有字段 required。删除“二者都缺失则 return”的兼容分支。

### 8.2 CLI

`db:activate` 增加并强制：

```text
--cutover-id <id>
--app-commit <commit>
--plan-digest <sha256>
--maintenance-bundle <absolute>
--cutover-evidence-root <absolute>
--authorization-file <absolute>
```

未知、重复、缺值、相对路径、额外 positional 必须在 Prisma 初始化前失败。

dry-run 与 execute 都必须要求同一份 `AUTH-C7`；authorization 的 cutoverId/planDigest/runId 与 C6 gate evidence 必须完全相同。不存在未授权的 production activate dry-run。

### 8.3 验证顺序

```text
exact CLI + absolute paths
-> release identity
-> final run + verification
-> ready PersistenceState
-> strict closed runtime bundle
-> verified CutoverEvidence C0-C6 + verified C6_READY
-> verified authorization identity/scope
-> AppRestoreService verify-only
-> typed pre-cutover manifest
-> run/source/snapshot/decisions/effective/state/plan identity 全等
-> dry-run return 或 execute 条件事务
```

evidence 的读取与验证必须复用单一 `CutoverEvidenceStore.readVerified()`；不得在 activate 中再写一套弱 JSON parser。

## 9. 生产 `db:cutover` runner

新增 package script：

```json
"db:cutover": "tsx src/migration/db-cutover.cli.ts"
```

精确命令面：

```text
db:cutover status --plan <abs> --evidence-root <abs> --format json
db:cutover step --step C0 --plan <abs> --evidence-root <abs> --format json
db:cutover step --step C1..C7 --plan <abs> --evidence-root <abs> --authorization-file <abs> --format json
```

要求：

- `status` 只读并验证 plan/evidence。
- `step` 一次只执行一个下一阶段；已完成同 inputDigest 返回 replayed，不重跑 action。
- C0 只做 release/root/space/shadow/SH-10 的只读检查并落证，不接收 AUTH；C0 passed 后才允许人类生成 AUTH-C1。
- C1 通过 loopback maintenance API drain/close/bundle。
- C2 调用真实 SnapshotService。
- C3 通过无 shell 的注入 executor 执行固定 Prisma `migrate deploy`，并验证 credential evidence。
- C4 调用 FinalImportOrchestrator、ReadyCoordinator、AppBackupService、AppRestoreService verify-only + materialize。
- C5 启动 closed DB-mode server，执行 read smoke 与事务 rollback smoke；进程管理使用注入 executor，测试不得启动真实应用目录。
- C6 调用 MetadataArchiveService 并扫描 archive/运行根。
- C7 先 dry-run，再验证 `AUTH-C7`，execute activate，写 C7/COMPLETED，最后才允许 reopen 和首笔业务写。
- 任何 child process 使用 `execFile/spawn` 参数数组，禁止 `shell:true`。

C0 的 `shadow` 输入必须是 plan 显式绑定的 `shadowGatePath`，文件类型为
`airoaming_cutover_shadow_gate_v1`，同时绑定 `cutoverId/appCommit/planDigest/runId/effectiveSchemaManifestDigest`，逐项包含 SH-01～SH-10 的 passed evidence digest、MigrationReport digest 和人工 reviewer 摘要。C0 只读取并校验该 gate，不接收 AUTH，也不把隔离 fixture 冒充真实 SH 通过。

C3 在 migration、settings inspect/prestage 或 expectations 落盘任一步失败时，必须先回滚本轮 prestage，再删除本轮新建的目标 DB、`-wal/-shm` 和 data root；已有空目标根或已有数据库不得删除。

## 10. 人工授权文件

授权文件位于证据根外的 0600 文件；由用户/责任人填写，Luna 只验证，不自签。

```ts
interface CutoverAuthorizationV1 {
  schemaVersion: 1;
  kind: "airoaming_cutover_authorization_v1";
  scope: "AUTH-C1" | "AUTH-C5" | "AUTH-C7";
  cutoverId: string;
  appCommit: string;
  planDigest: `sha256:${string}`;
  runId: string;
  evidenceDigest: `sha256:${string}`;
  authorizedAt: string;
  authorizedBy: string;
  acknowledgement: string;
  authorizationDigest: `sha256:${string}`;
}
```

`acknowledgement` 只允许文档规定的固定短句，不记录自由文本、路径或秘密。授权文件变更必须形成新 digest，不得覆盖历史授权。

授权与 evidence 绑定规则固定为：

| scope | 绑定的 gate evidence | 允许执行 |
| --- | --- | --- |
| `AUTH-C1` | C0 passed 后的 `evidenceDigest` | C1～C4；同时按 plan 的 settingsStartState 授权 Keychain verify 或 prestage |
| `AUTH-C5` | C4 passed 后的 `evidenceDigest` | C5～C6 |
| `AUTH-C7` | C6 passed/C6_READY 的 `evidenceDigest` | C7 内部 dry-run + execute |

验证后续 step 时应核对 authorization 绑定的历史 gate digest，而不是要求它等于不断前进的最新 manifest digest。

## 11. 文件地图

### 必改

```text
apps/server/src/migration/final-importer.ts
apps/server/src/migration/db-import.cli.ts
apps/server/src/migration/ready-coordinator.ts
apps/server/src/migration/db-ready.cli.ts
apps/server/src/migration/runtime-bundle-file.service.ts
apps/server/src/maintenance/maintenance.types.ts
apps/server/src/maintenance/maintenance-coordinator.service.ts
apps/server/src/migration/cutover-coordinator.service.ts
apps/server/src/migration/db-activate.service.ts
apps/server/src/migration/db-activate.cli.ts
apps/server/src/settings/secret-store.ts
apps/server/src/settings/settings.service.ts
apps/server/package.json
```

### 建议新增

```text
apps/server/src/migration/cutover-plan.types.ts
apps/server/src/migration/cutover-plan.service.ts
apps/server/src/migration/cutover-evidence.types.ts
apps/server/src/migration/cutover-evidence.service.ts
apps/server/src/migration/cutover-authorization.service.ts
apps/server/src/migration/cutover-credential-verifier.ts
apps/server/src/migration/db-cutover.cli.ts
apps/server/src/migration/db-cutover.service.ts
apps/server/src/migration/metadata-archive.cli.ts（若不内置于 db-cutover）
apps/server/src/settings/cutover-settings.service.ts
```

### 测试

```text
apps/server/src/migration/db-cutover.cli.spec.ts
apps/server/src/migration/cutover-evidence.service.spec.ts
apps/server/src/migration/cutover-credential-verifier.spec.ts
apps/server/src/migration/db-activate.service.spec.ts
apps/server/src/migration/m6-c0-c7.rehearsal.spec.ts
apps/server/src/backup/app-backup-restore.integration.spec.ts
apps/server/src/settings/macos-keychain-secret-store.spec.ts
apps/server/src/settings/settings.service.spec.ts
apps/server/src/settings/cutover-settings.service.spec.ts
```

## 12. 非目标

- 不执行真实 Keychain/provider/用户路径。
- 不运行真实 C0～C7。
- 不修改 Schema/migration/trigger。
- 不实现 G4/G5。
- 不删除旧 file metadata 或 backup。
- 不增加双 Reviewer 签名基础设施；只保留三个必要人工授权文件。

## 13. 退出标准

- `evidence_and_test_matrix.md` 的 R0-A 自动化项全部 `passed_isolated`。
- production CLI 不再存在 fake-only 和 evidence-optional 路径。
- 新 runner 在两个 fresh 临时根完成成功链、resume、tamper、rollback rehearsal。
- server 全量、workspace typecheck、server/web build、Prisma/G1/capability、diff check 全绿。
- Scrutiny 与隔离 Runtime Review 通过。
- 独立提交完成，真实操作次数为 0。
- 最终停止在 `ready_for_real_cutover_authorization_review`。
