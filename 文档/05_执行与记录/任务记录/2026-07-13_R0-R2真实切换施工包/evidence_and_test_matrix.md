---
doc_id: AIR-RCUT-EVIDENCE-001
status: active
created: 2026-07-13
updated: 2026-07-14
owner: AI漫游项目
audience: developer, qa, reviewer, release-owner, ai-agent
source: R0-A 实施契约、G1 SH/C/RB/OBS 验收项
---

# R0-R2 证据与测试矩阵

## 1. 状态规则

| 状态 | 含义 |
| --- | --- |
| `not_run` | 尚未实现或未执行 |
| `passed_isolated` | 仅临时根/fake executor 通过，不代表真实授权 |
| `passed_real` | 已在明确授权的真实 plan 上执行并有脱敏证据 |
| `passed_real_disposable` | 已在明确授权的临时 disposable 资源上执行并有脱敏证据；不代表真实用户资源或真实 plan |
| `failed` | 已执行但不符合契约 |
| `blocked` | 前置或人工授权缺失 |
| `observed_preliminary` | 在最终 release/root/source 修复前观察到的一致性，只作诊断，不算正式 SH 通过 |
| `not_ready` | 前置 gate 未通过，尚不能进入该人工或不可逆门 |

静态代码阅读不能改成 `passed_isolated`；隔离测试不能改成 `passed_real`；Luna/Codex 不能把 SH-10 或 AUTH 门自签为通过。

## 2. R0-A SecretStore

| ID | 场景 | 必须断言 | 状态 |
| --- | --- | --- | --- |
| RCUT-SEC-01 | production verifier + fake security executor | adapter=keychain、probe/credential/fingerprint match；真实 `security` 调用次数=0 | `passed_isolated` |
| RCUT-SEC-02 | Keychain unavailable/missing/mismatch | final/ready 前稳定失败；DB/settings/evidence 零写 | `passed_isolated` |
| RCUT-SEC-03 | 已脱敏 settings | 只读验证，不创建新 secretRef、不恢复 plaintext | `passed_isolated` |
| RCUT-SEC-04 | legacy plaintext prestage | Keychain put 成功后旧 settings 字节不变；evidence 无 secret | `passed_isolated` |
| RCUT-SEC-05 | prestage put/probe/fingerprint 失败 | 旧 settings 字节不变，无 plaintext temp 副本 | `passed_isolated` |
| RCUT-SEC-06 | C4 atomic redact 成功 | temp→fsync→rename；Keychain 可读；settings 无 plaintext | `passed_isolated` |
| RCUT-SEC-07 | C4 redact write/fsync/rename 失败 | 旧文件字节不变；不恢复/复制 plaintext | `passed_isolated` |
| RCUT-SEC-08 | fake CLI 保护 | 非 test、非 tmp root、缺 test-only flag 任一情况在 Prisma 前拒绝 | `passed_isolated` |
| RCUT-SEC-09 | 全证据扫描 | plan/evidence/report/log/backup/archive/restore 0 secret；fake root 单独 allowlist | `passed_isolated` |
| RCUT-SEC-10 | Keychain process boundary | put args 不含 secret；无用户可见/继承 stdout/stderr；fake executor 证明失败对象和 snapshot 均无 secret | `passed_isolated` |
| RCUT-SEC-11 | Keychain prompt option order | `add-generic-password` 使用 `-U -w`，`-w` 固定为最后选项；本机 `security(1)` help 要求该顺序，secret 不进入 argv | `passed_isolated` |
| RCUT-SEC-13 | macOS child stdin prompt protocol | 无 TTY `security -w` 写入 password+confirmation 两行；真实 disposable smoke 的 put/get fingerprint 一致，secret 不进 argv/stdout/stderr | `passed_real_disposable` |

## 3. Runtime bundle 与 Evidence

| ID | 场景 | 必须断言 | 状态 |
| --- | --- | --- | --- |
| RCUT-RUN-01 | strict closed runtime bundle | top-level 与每 participant active/queued=0、blockedReason=null | `passed_isolated` |
| RCUT-RUN-02 | 缺 participant/status、queued>0、digest 篡改 | strict cutover profile 拒绝缺 participant/status 与 queued/blocked；activate 同 profile 复用 | `passed_isolated` |
| RCUT-EVD-01 | fresh evidence C0→C6 | manifest/step/schema/kind/identity/digest/C6_READY 全精确 | `passed_isolated` |
| RCUT-EVD-02 | 新实例 resume | 从下一步继续；同 input replay 不重跑 action | `passed_isolated` |
| RCUT-EVD-03 | 不同 plan/appCommit/run/source/effective | `CUTOVER_RESUME_CONFLICT`；旧证据字节不变 | `passed_isolated` |
| RCUT-EVD-04 | raw tamper | manifest/step/seal 任一字节改变均拒绝 | `passed_isolated` |
| RCUT-EVD-05 | semantic reseal tamper | 重新计算外层摘要仍因 identity/order/step chain 失败 | `passed_isolated` |
| RCUT-EVD-06 | C6_READY | 内容 digest 与 C6 manifest 精确一致；只存在空 marker 不通过 | `passed_isolated` |
| RCUT-EVD-07 | write/fsync/rename 故障 | 不产生 passed step；manifest 不前进；可安全 resume | `passed_isolated` |
| RCUT-EVD-08 | C7 crash reconcile | db_only 同 identity + first write null 只补证据，不改 activatedAt | `passed_isolated` |
| RCUT-EVD-09 | C7 backup pointer semantic tamper | bundleDigest 必须与 C4 backupDigest 一致，bundlePath 必须是安全目录 | `passed_isolated` |
| RCUT-C0-01 | shadow gate identity and SH checks | C0 只接受绑定当前 plan 的 SH-01～SH-10 gate，并校验人工审阅摘要 | `passed_isolated` |

## 4. Activate

| ID | 场景 | 必须断言 | 状态 |
| --- | --- | --- | --- |
| RCUT-ACT-01 | CLI required flags | maintenance/evidence/authorization 缺任一项在 Prisma 前失败 | `passed_isolated` |
| RCUT-ACT-02 | 两个 evidence 参数都省略 | 不再跳过；稳定 `ACTIVATE_NOT_READY`/参数错误 | `passed_isolated` |
| RCUT-ACT-03 | dry-run | DB/evidence/backup/target roots 字节不变 | `not_run` |
| RCUT-ACT-04 | wrong run/source/snapshot/decisions/effective/plan | fail-closed，state 保持 ready | `not_run` |
| RCUT-ACT-05 | C6 seal/step tamper | fail-closed，state 保持 ready | `not_run` |
| RCUT-ACT-06 | missing/wrong AUTH-C7 | dry-run/execute 均不可达；只接受绑定 C6 gate 的 AUTH-C7 | `not_run` |
| RCUT-ACT-07 | valid execute | 只写 db_only + activatedAt；first write 仍 null | `not_run` |
| RCUT-ACT-08 | first write 后 replay | activate/file-only 均拒绝，不改首次时间 | `not_run` |

## 5. Production runner

| ID | 场景 | 必须断言 | 状态 |
| --- | --- | --- | --- |
| RCUT-CLI-01 | exact plan/step grammar | unknown/duplicate/relative/positional 在副作用前拒绝 | `passed_isolated` |
| RCUT-CLI-02 | root safety | symlink、重叠、非空目标、DB 不在 dataRoot 拒绝 | `passed_isolated` |
| RCUT-CLI-03 | status | 只读验证 plan/evidence，不创建目录或连接真实服务 | `passed_isolated` |
| RCUT-CLI-04 | step order | 不能跳步、并行或用不同 plan 续跑 | `passed_isolated` |
| RCUT-CLI-05 | child executor | 固定 executable + args，禁止 shell；测试注入 fake executor | `passed_isolated` |
| RCUT-CLI-06 | C6 archive | 通过 production runner 调真实 service；Asset bytes 不进入 archive | `passed_isolated` |
| RCUT-CLI-07 | C7 ordering | activate→C7→COMPLETED→reopen→first write，顺序不可交换 | `passed_isolated` |
| RCUT-CHAIN-01 | real isolated chain | 真实临时 SQLite/domain services C0～C7；仅 fake secret/provider/executor | `passed_isolated` |
| RCUT-CHAIN-02 | second fresh chain | 两个 fresh run inventory/digests 语义一致，run identity 独立 | `passed_isolated` |
| RCUT-RB-01 | C1～C4 任一步失败 | 无后续 passed step；旧源不变；可按证据 reopen | `passed_isolated` |
| RCUT-RB-02 | C5 smoke 失败 | first write null；materialized restore 可读；不 activate | `passed_isolated` |
| RCUT-PATH-03 | evidence step permissions | 0644 step evidence 被拒绝；不读取不安全证据 | `passed_isolated` |
| RCUT-C3-ROLLBACK | post-migration C3 failure | 只删除本轮新建 DB/data root/SQLite sidecars；旧目标不变 | `passed_isolated` |

## 6. R0-A 回归门禁

| ID | 命令 | 状态 |
| --- | --- | --- |
| RCUT-REG-01 | R0-A 定向 Vitest（single fork、显式 timeout） | `passed_isolated` |
| RCUT-REG-02 | server 全量 Vitest | `passed_isolated` |
| RCUT-REG-03 | workspace typecheck | `passed_isolated` |
| RCUT-REG-04 | server build + web build | `passed_isolated` |
| RCUT-REG-05 | Prisma validate + G1 manifest/schema/migration | `passed_isolated` |
| RCUT-REG-06 | capability CLI `blockedIds=[]` | `passed_isolated` |
| RCUT-REG-07 | `git diff --check` + 无 DB/secret/真实 artifact 被跟踪 | `passed_isolated` |
| RCUT-REG-08 | Scrutiny + Runtime Review | `passed_isolated` |

## 7. R0-B Shadow 与人工门

以下项目必须绑定 release-specific plan；M6 临时 fixture 只能作为先验，不能直接改为真实通过。

本轮 `passed_release_shadow` 仅表示同一只读 snapshot 在两个 fresh 目标上的一致性；它不等价于 `passed_real`，也不绕过 SH-03/SH-10。

| ID | 条件 | 状态 |
| --- | --- | --- |
| SH-01 | 同一只读 overlay snapshot 两次 fresh import | `observed_preliminary`（clean overlay A/B 一致；非 real-source） |
| SH-02 | 规范化 reportDigest 相同 | `observed_preliminary`（A/B=`sha256:20a85df7121a639738d0fb5f8c6231a9a21b9966e1328d91edb25cfacf96cf47`；非 real-source） |
| SH-03 | blocker=0 | `blocked_preflight_source`（两边在 preflight slice 同报 `PREFLIGHT_SOURCE_UNRESOLVED`） |
| SH-04 | integrity/FK/schema contract 全绿 | `not_run`（被 SH-03 阻断） |
| SH-05 | API DTO 对照通过 | `not_run` |
| SH-06 | DB-mode restart 通过 | `not_run` |
| SH-07 | old metadata mutation isolation | `not_run` |
| SH-08 | global secret sentinel=0 | `not_run` |
| SH-09 | release-specific backup/restore rehearsal | `not_run` |
| SH-10 | 人工审阅 MigrationReport 并签署 | `not_ready` |
| AUTH-C1 | C0 passed 后，用户授权真实停写及 plan 指定的 C3 Keychain verify/prestage | `not_run` |
| AUTH-C5 | 用户授权关闭旧 file 进程并进入 DB smoke/archive | `not_run` |
| AUTH-C7 | 用户理解不可逆边界并授权 activate execute | `not_run` |

## 8. R1 真实 C0～C7

| ID | 必须证据 | 状态 |
| --- | --- | --- |
| C0 | release/capability/plan/root/space/SH；只读落证，不要求 AUTH | `not_run` |
| C1 | 同 PID closed runtime bundle；active/queued=0 | `not_run` |
| C2 | final sealed snapshot；source pre/post 相同 | `not_run` |
| C3 | fresh DB、migration exact、credential evidence | `not_run` |
| C4 | final/verify/ready/settings redaction/pre-cutover backup/materialize | `not_run` |
| C5 | closed DB API/read/rollback smoke；first write null | `not_run` |
| C6 | metadata-only archive + C6_READY | `not_run` |
| C7 | AUTH-C7、dry-run、execute、COMPLETED、first write、file guard | `not_run` |

## 9. R1 回滚

| ID | 场景 | 状态 |
| --- | --- | --- |
| RB-01 | final import 失败，旧源未改变 | `not_run` |
| RB-02 | C5 smoke 失败，恢复 bridge/pre-cutover 且无首写 | `not_run` |
| RB-03 | settings 已脱敏回 file，继续从 Keychain 读取 | `not_run` |
| RB-04 | 首写后 file-only 明确拒绝 | `not_run` |
| RB-05 | coordinated backup 恢复兼容应用 | `not_run` |
| RB-06 | 无自动 down migration 路径 | `not_run` |

## 10. R2 DB-only 观察期

| ID | 用户/运行路径 | 状态 |
| --- | --- | --- |
| OBS-01 | 连续三次正常重启 | `not_run` |
| OBS-02 | 临时项目保存/完成章节，无旧文件写 | `not_run` |
| OBS-03 | fake 图片任务运行中杀进程 | `not_run` |
| OBS-04 | 取消 + provider 迟到 | `not_run` |
| OBS-05 | Asset 故障点恢复 | `not_run` |
| OBS-06 | 删除临时项目 + Outbox/文件/DB 一致 | `not_run` |
| OBS-07 | coordinated backup -> 新根 restore | `not_run` |
| OBS-08 | 真实项目逐阶段只读查看 | `not_run` |
| OBS-09 | 修改 metadata archive 副本，运行态不变 | `not_run` |
| OBS-10 | 全局 secret scan=0 | `not_run` |

## 11. 建议 R0-A 命令

```text
pnpm --dir apps/server test -- --run \
  src/migration/cutover-credential-verifier.spec.ts \
  src/migration/cutover-evidence.service.spec.ts \
  src/migration/cutover-cli-guards.spec.ts \
  src/migration/cutover-plan.service.spec.ts \
  src/migration/cutover-shadow-gate.spec.ts \
  src/migration/db-cutover.service.spec.ts \
  src/migration/cutover-runner.service.spec.ts \
  src/settings/cutover-settings.service.spec.ts \
  src/settings/macos-keychain-secret-store.spec.ts \
  src/migration/credential-redactor.spec.ts \
  src/migration/snapshot.service.spec.ts \
  src/migration/db-activate.service.spec.ts \
  src/migration/m6-c0-c7.rehearsal.spec.ts \
  src/backup/app-backup-restore.integration.spec.ts \
  --pool=forks --poolOptions.forks.singleFork=true --testTimeout=60000

pnpm --dir apps/server test -- \
  --pool=forks --poolOptions.forks.singleFork=true --testTimeout=60000 --reporter=dot

pnpm typecheck
pnpm --dir apps/server build
pnpm --dir apps/web build
pnpm --dir apps/server prisma:validate
pnpm --dir apps/server g1:manifest:check
pnpm --dir apps/server g1:schema:check
pnpm --dir apps/server g1:migration:check
pnpm --dir apps/server db:capabilities --check --format json
git diff --check
```

若 Luna 采用不同 spec 名，必须同步本文件；不得保留指向不存在文件的命令。
