---
doc_id: AIR-RCUT-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-14
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

## R0-B 只读发现新增事实

| ID | 只读证据 | 结论 |
| --- | --- | --- |
| F-22 | 当前 release 仓库内的开发期 `workspace/` 位于 `releaseRoot` 之下；私有 plan 使用真实路径复核时返回 `CUTOVER_PLAN_ROOT_OVERLAP` | 真实 plan 不能直接复用当前开发布局；必须由 release owner 提供不与 release root 重叠的正式 workspace 根，不能复制临时根冒充生产源 |
| F-23 | 同一 sealed snapshot 在两个 fresh SQLite shadow target 上执行，两个 aggregate reportDigest 相同；45 张表计数摘要相同 | SH-01/SH-02 只读 shadow 一致性通过；A/B 目标未接触源 workspace |
| F-24 | 两个 shadow 均在 storyboard slice 停止，issue=`chapter:chapter_001:storyboard-source`，unresolvedBlockerCount=1 | SH-03 未通过；MigrationReport 不能签 SH-10，不能生成 AUTH 或进入 C0/C1 |
| F-25 | settings 只读递归扫描发现 3 个 credential 字段、sentinel=0；snapshot 将 settings 转为 redacted artifact | settings 起点暂按 `legacy_plaintext_requires_two_phase / prestage_legacy` 记录，最终仍需 release owner/ Migration reviewer 人工核对；未读取 Keychain 值 |
| F-26 | shadow A/B 目标的 45 张表计数摘要均为 `sha256:709c2a3101c3efd0bd5076c17bb03c34c1d373cd389771779d1a9320855820f2`，目标 workspace 未产生源文件回写 | fresh target isolation 与数据库计数一致；不代表 integrity/FK/API/restart/backup-restore/SH-10 已通过 |
| F-27 | 源章节存在 `storyboard.json`，其 `sourceStoryVersionId` 指向旧 StoryVersion；同章没有 `structure.json`，Story shadow 导入数量为 0 | `storyboard-source` blocker 的直接原因是当前源缺少可匹配的 StoryVersion；必须由 release owner 决定补齐/恢复结构源或登记正式迁移决议，不能在 shadow 中猜测或改写真实源 |
| F-28 | recovery backup 的 archive digest=`336c9f...6f23`，其中 structure member digest=`4eac7b...0dd3`、22819 bytes；project/chapter/story/script identity 与当前源一致，12/12 projectCharacterId 唯一对应 shared characters | 已有可审计恢复候选；仍须先 overlay 验证，真实源只允许在明确授权后 no-clobber 原子新增该单文件 |
| F-29 | 临时 overlay 仅补入候选 structure 后，两个 fresh shadow 都在 Story slice 以 `MIGRATION_STORY_DOCUMENT_INVALID` 失败，aggregate reportDigest 同为 `sha256:50884a02b5e92b0ddefdfd8070064647adf03313cd9aebaa23ccb96853717f1a` | 不能只恢复文件；当前 importer 不兼容旧 Story beat 的名称引用 |
| F-30 | 候选 structure 的 43/43 beat character token 均能按唯一精确名称解析到 structure character card id，0 缺失、0 歧义 | Story importer 可做确定性 ID/唯一名称兼容；未知或重复名称必须 fail-closed |
| F-31 | 当前 storyboard 的 65/65 shot character token 均能按 shared characters 唯一精确名称解析，0 缺失、0 歧义；现 importer 对任一非空数组直接失败且未创建 `storyboard_shot_characters` | 必须同时补 resolver、正式 Character 目标验证、child relation 投影与 replay，不能只删掉错误判断 |
| F-32 | full shadow 当前顺序为 `story -> storyboard -> characters` | 改为 `story -> characters -> storyboard` 才能让 V2 Storyboard 引用正式 Character；16-slice consumer 必须全量回归 |
| F-33 | release identity loader 和 runner 需要 repo-style releaseRoot；从最终 remediation commit 创建仓库外 detached worktree 可与真实 source workspace disjoint | root overlap 不需要移动或复制真实 source workspace；appCommit 必须从旧 `3fda7d0` 更新为最终修复提交 |

## R0-A 新增验证

- C7 execute 已提交 `PersistenceState=db_only + activatedAt` 后，在证据写入前模拟进程中断；新 `DbCutoverService` 实例按同一 identity resume，仅执行 execute，不重复 dry-run，不改写 `activatedAt`，随后补齐 C7/COMPLETED。
- 首笔 DB 业务写入通过 `PrismaService.runBusinessTransaction` 记录 `firstBusinessWriteAt` 后，`assertFileModeBridgeAllowed()` 稳定拒绝 file-only bridge。

## 结论

当前应判定为：

```text
M6-A1 isolated_complete
R0-A isolated_complete
R0-B blocker_remediation_documented_waiting_luna_authorization
real_cutover_no_go
```

下一工作不是人工签 SH-10 或执行 C0～C7，而是把 `luna_r0b_blocker_remediation_handoff.md` 及其授权文本交给 Luna。Luna 完成代码修复、overlay、条件式单文件恢复、外置 release worktree 和 SH-01～09 后必须停下，再由 Migration reviewer 人工完成 SH-10；在此之前不得生成 AUTH、停写或进入 R1。
## R0-B remediation 执行新增事实

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-34 | `74a6d71` 的 resolver、Story/Storyboard importer、full order、child relation 与 contextual count 改动；78 项定向测试和 71 spec/482 tests 全量通过 | R0-B 代码阻塞已在代码层收口，未修改 schema/migration/trigger |
| F-35 | 真实候选 overlay 暴露旧章节已是 `storyboard_done`；Story 无条件写 `structured` 触发 G1 单调保护 | Story importer 改为只在当前 milestone 低于 `structured` 时推进，不降级既有状态 |
| F-36 | 旧 shared character 的 preview 记录带 `previewConfirmedAt`，但 G1 要求 `preview_front.confirmed_at IS NULL` | 预览确认旧证据由 source digest 保留，DB preview relation 不写 confirmedAt；final reference 继续绑定 finalizedAt |
| F-37 | clean A/B overlay 使用独立 source/target 根，前 8 slice 两边完全一致，Storyboard child=65；第 9 slice 两边同报 `PREFLIGHT_SOURCE_UNRESOLVED` | 代码修复后的 R0-B gate 已推进到既有 preflight blocker；不是角色引用或目标 workspace 隔离问题 |
| F-38 | preflight legacy 文件 `schemaVersion=1` 且没有 `sourceSnapshot`，当前 importer 明确要求 `schemaVersion=2 + sourceSnapshot` | 该 blocker 超出 R0-B 契约；不得为了让 full shadow 变绿而修改其他真实源或伪造证据 |

## R0-B 执行停止条件

- 真实 source target 仍不存在，recovery archive/member digest 未改变。
- source overlay 未被 target workspace 回写；A/B target 均为独立根。
- 未生成 AUTH、未停写、未执行 C0～C7、未访问默认 Keychain/真实凭据。
