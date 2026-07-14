---
doc_id: AIR-RCUT-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: orchestrator, worker, reviewer, human
source: 当前源码、M6-A1 契约与 G1 正式验收清单
---

# R0-R2 Findings

## 已确认事实

| ID | 代码事实 | 结论 |
| --- | --- | --- |
| F-01 | `final-importer.ts` 要求 `AIROAMING_SECRET_STORE_ADAPTER=fake` 且 root 相等 | 真实 Keychain 无法通过 final CLI |
| F-02 | `ready-coordinator.ts` 同样只接受 fake root | production ready 无正式凭据证据 |
| F-03 | `DbActivateInput` 的 maintenance/evidence 为 optional | 类型未落实 M6-A1 required 契约 |
| F-04 | `verifyCutoverEvidence()` 在两个字段都缺失时 return | activate 存在完整证据绕过 |
| F-05 | `db-activate.cli.ts` 没有 maintenance/evidence flags | 生产 CLI 无法提供 C0～C6 证据 |
| F-06 | activate 只判断 stepDigest 是 string、C6_READY 存在 | 未重算 manifest/step/seal digest 和完整 identity |
| F-07 | `CutoverCoordinator` 与 `MetadataArchiveService` 无生产 CLI | C0～C7 只能由测试 callback 串联 |
| F-08 | runtime reader 不验证每个 participant active/queued=0 | closed 语义不足 |
| F-09 | `SettingsService` 读 legacy settings 时立即 Keychain put + 原子脱敏 | 与旧 G1“C4 前旧 settings 不变”存在时序差异，必须分起点处理 |
| F-10 | G1 SH/C/RB/OBS 和旧 real-cutover Handoff 仍停留在撤回状态 | 文档不能直接交给 Luna 执行真实切换 |
| F-11 | `MacOSKeychainSecretStore.put()` 把 secret 作为 `security -w` 的下一参数 | R0-A 必须改为非 argv 敏感输入通道并用 fake executor 证明边界 |

## R0-A 实施新增事实

| ID | 代码事实 | 结论 |
| --- | --- | --- |
| F-12 | 新增 `CutoverSettingsService` 以 inspection/prestage/commit 分开 legacy 起点 | C3 可暂存凭据而不改旧 settings；C4 才 CAS 脱敏 |
| F-13 | `RuntimeBundleFileService.readAndVerify(...,{ profile: "cutover" })` 严格验证 participant status | 旧 snapshot 读取保持兼容，markReady/activate 可切换严格 profile |
| F-14 | `CutoverEvidenceStore` 已能校验 step chain、manifest/step digest、C6_READY、COMPLETED、AUTH identity，并提供 db_only completion reconcile | source/snapshot/decisions 已由 C2～C4 artifact digest 绑定；C7 crash/reopen 与故障回滚矩阵已通过 fresh 隔离证据 |
| F-15 | `db:cutover` CLI 已接入 C1～C7 domain action，并抽取为 `cutover-runner.service.ts` 可注入执行器；两个 fresh 临时根已跑通真实 domain C0～C7，另有 fresh 链模拟 C7 execute 后崩溃并由新实例恢复，ready/backup/activate 使用 strict cutover runtime profile | C1～C5/C7 seam、RCUT-RB-01、C7 crash/reopen 与首写后的 file-guard 已有隔离证据；仅独立双 Review 尚未通过 |
| F-16 | 最新完整 R0-A 定向为 13 个 spec、103 个测试；服务端全量为 68 个 spec、468 个测试（含 C5 smoke failure、crash/file-guard、RCUT-RB-01、RCUT-SEC-08、RCUT-PATH-01/02/03 与 RCUT-EVD-09 链） | 静态门禁已绿；R0-A 仍因独立双 Review 为 changes_requested |
| F-19 | 已在临时 HOME/disposable Keychain 上完成真实 `/usr/bin/security` 子进程 put/get/delete/probe smoke；两行 stdin prompt 协议、fingerprint、删除后 missing 和默认 keychain/search list 不变均已验证 | 平台证据门已补齐；不等价于真实 SH gate、AUTH 或真实 C0～C7 |
| F-20 | 最新工作树服务端全量 69 spec/472 tests、SecretStore/runner 定向 18 tests、静态门禁全部通过；已移除显式 keychainPath API，生产 adapter 只保留 `-U -w`，隔离通过临时 HOME 完成 | 代码与 disposable 平台证据可交付独立复核；真实 SH gate 仍不能用隔离 evidence 替代 |
| F-21 | 早期错误 smoke 参数把路径当作 `-w` 密码，曾短暂创建合成 probe 条目；已按精确 account/service 删除并复核默认 keychain/search list 未改变，未使用真实凭据 | 作为安全留痕保留；后续 smoke 已改为临时 HOME 隔离且不再传路径参数 |
| F-17 | production runner 曾通过 `SecretStoreService` 间接受环境变量选择 fake adapter；已改为直接装配 `MacOSKeychainSecretStore`，并以 RCUT-SEC-08 证明 fake 环境不能劫持 production runner | production SecretStore 绑定边界收紧；测试 fake 仍只通过显式依赖注入进入隔离链 |
| F-18 | runner 的 credential expectations、final report、backup pointer 以及 token/decisions/证据 steps 路径曾允许直接 `writeFile` 或跟随 symlink；现已统一做 lstat 拒绝、temp→fsync→rename 和 parent fsync，并新增 RCUT-PATH-01/02 | C3/C4 输出不会跟随外部 symlink 或留下半写目标；仍需独立 Review 确认整体路径闭环 |
| F-17 | `CutoverPlanService` 现要求 targetDatabaseUrl 位于 targetDataRoot 内，和 `AppBackupService` 的 DB/dataRoot 约束一致；C3 只接受空 DB 文件并由 runner 创建 0600 文件 | 解决了原先 plan safety 与 backup path safety 互相冲突的问题 |

## 不受影响的既有能力

- pre-cutover backup/restore service 和隔离测试可复用。
- final 16-slice importer、verify、ready 的数据库语义可复用。
- business write boundary、firstBusinessWriteAt、file guard 可复用。
- maintenance loopback API/CLI、snapshot service、metadata archive service 可复用。
- macOS Keychain adapter 已存在，但写入仍有 secret-in-argv 缺口；production cutover 注入、进程边界和证据绑定都需在 R0-A 收口。

## 风险

- 只给 `db:activate` 增加两个 CLI 参数仍不够；弱 evidence parser 会继续接受错 identity 或空 seal。
- 只把 fake root 改成 Keychain probe 仍不够；Provider/CredentialMetadata 与实际 credentialId/fingerprint 必须绑定。
- 直接启动 bridge release 可能提前脱敏 legacy settings；未识别起点就按 C3/C4 执行会造成文档与真实状态不一致。
- 单一“授权继续”会把停写、关闭旧进程和不可逆激活混在一起，必须拆成三门。
- 把测试 rehearsal 当生产 runner 会缺少进程管理、人工门、resume 和真实 artifact 路径保护。

## R0-A 新增验证

- C7 execute 已提交 `PersistenceState=db_only + activatedAt` 后，在证据写入前模拟进程中断；新 `DbCutoverService` 实例按同一 identity resume，仅执行 execute，不重复 dry-run，不改写 `activatedAt`，随后补齐 C7/COMPLETED。
- 首笔 DB 业务写入通过 `PrismaService.runBusinessTransaction` 记录 `firstBusinessWriteAt` 后，`assertFileModeBridgeAllowed()` 稳定拒绝 file-only bridge。

## 结论

当前应判定为：

```text
M6-A1 isolated_complete
production_entry_changes_required
real_cutover_no_go
```

下一工作不是填写真实路径，而是先让 Luna 完成 R0-A 代码收口；完成后再次复核并停止，等待真实授权。
