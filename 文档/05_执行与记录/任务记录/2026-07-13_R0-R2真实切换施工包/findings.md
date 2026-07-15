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

## 当前快照

v5 已通过 R0B、SH-10、C0～C4；production status=`completedThrough=C4`，evidence=`sha256:69d08d7b8a28343907fa939d4f6040d7807247eb46f9a2c39512c806f6328642`。当前为 `WAIT_AUTH_C5`；以下早期 blocker 和实现事实按编号保留为历史，不得解释为当前仍停在 R0-A/R0B。剩余步骤不设置工期或等待日期。

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

## R0-B remediation 最终证据

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-39 | `29f40bb` 从目标 DB 已导入行重建 legacy preflight sourceSnapshot；未知/歧义/不完整输入仍 fail-closed；全量 71 spec/483 tests 通过 | preflight blocker 已在代码层以兼容 adapter 收口，未修改 schema/migration/trigger |
| F-40 | recovery archive/member digest 与候选 identity 再核对后，真实 source 仅新增 `structure.json`；pre/post source manifest 除该新增项外 `removed=[]/changed=[]` | P5 原子恢复边界满足；未覆盖、删除或改写其他真实源 |
| F-41 | real-source sealed snapshot source=`sha256:c16ff088...4beebb`；A/B fresh target 16/16 succeeded；aggregate reportDigest=`sha256:daca7e92...663e781`、table-count=`sha256:25f14b5a...117fc0a` | SH-01/02/03 通过 |
| F-42 | A/B 每个 slice `db:verify` 通过，integrity=`ok`、FK=0；API/restart/legacy isolation witness 通过 | SH-04/05/06/07 通过 |
| F-43 | 初次 real shadow 生成的 67 个 `legacy-import` 文件已清理；重新 sealed snapshot source digest 恢复为 `sha256:c16ff088...4beebb`，最终 shadow 使用隔离 target workspace | 真实 source 未留下 shadow 生成物；SH-07 边界满足 |
| F-44 | A/B artifact 与 SQLite dump sentinel=0；coordinated backup + verify-only/materialize restore 全通过，bundle=`sha256:ef17078c...6ae2dd` | SH-08/09 通过；未访问真实 Keychain/真实凭据 |

## 当前结论

```text
R0-B = completed_SH10_gate_verified
R1-C0 = passed_read_only_waiting_explicit_AUTH_C1_instruction
SH-01..SH-09 = passed_release_shadow
SH-10 = passed_human_review
AUTH-C1/C5/C7 = not_generated
C1..C7/final importer = not_run
```

## SH-10 预审新增事实

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-45 | release `db:verify` 与 SH-09 backup manifest 共同绑定 `effectiveSchemaManifestDigest=sha256:2e999245...5b3559`；执行记录把 G1 baseline `sha256:ad3b0e1b...c2b1ea` 写成 effective identity | plan/gate 生成前必须纠正身份字段，否则 C0 fail-closed |
| F-46 | 外置证据根为 0755；canonical clean DB 为 0644；全根发现 334 个 world-searchable dirs、110 个 world-readable files | 不满足私有证据 0700/0600 口径，SH-10 暂不能签 |
| F-47 | 外置根未发现真实 cutover plan、planDigest/cutoverId/runId 绑定或 shadow gate；责任人/窗口/settings 起点未落私有证据 | SH-10 缺少 identity-bound 人工审阅对象 |
| F-48 | 当前 A/B 45 表只因 SH-09 在 A 新增 shadow PersistenceState 而相差 1；排除该控制表后完全一致，但 pre-SH09 count digest 未 sealed | 运行结果合理，证据链仍需补 canonical count checkpoint |
| F-49 | A/B `script-pending-revision` 均有 warningCount=1，表示旧 Dialogue reference 只保留 source evidence；blocker=0 | 必须由人工 reviewer 明确接受 warning |
| F-50 | 正式 G1 清单仍把 SH-01～SH-10 标为 not_run；外置根同时有旧失败/副作用运行和 clean 运行 | 文档状态与 canonical evidence index 均未收口；预审结论 `changes_requested` |

## SH-10 技术整改新增事实

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-51 | G1 baseline=`ad3b...`，release schema identity=`2e999...`；执行记录、Handoff、正式 SH 清单已同步 | digest 语义和文档冲突已关闭 |
| F-52 | 外置根最终 381 dirs 全 0700、1240 files 全 0600，permission violation=0 | 私有证据权限阻塞已关闭 |
| F-53 | fresh C/D 均 16/16 succeeded、32/32 verify passed；45 表计数 digest 均为 `beb518e2...cfabc5c`，checkpoint=`86863a95...eabd6f2d9`，两边 PersistenceState=0 | pre-SH09 可重算 count 证据缺口已关闭 |
| F-54 | canonical index 绑定 11 groups，digest=`7ec5e52f...f480636b`，seal=`d014fc85...b192008`；旧运行显式 non-canonical | reviewer 选错证据的风险已关闭 |
| F-55 | canonical roots 扫描 735 files + 6 SQLite dump，sentinel=0 | SH-08 的可重算安全证据增强 |
| F-56 | 技术收口时 `script-pending-revision warningCount=1` 尚未处理，真实 plan/责任字段也未填写 | 这是 plan 生成前的历史状态；后续已由 F-58～F-60 取代 |
| F-57 | 首次 migrate 对不存在的 DB 文件返回 schema engine error；按 C3 runner 先创建 0600 空 SQLite 文件后成功。`db:verify --workspace-root` 当前实际用于 release identity 根，误传 target workspace 会失败 | 已按当前生产实现纠偏并留痕；后续 Runbook 应保持创建空 DB 与传 release root 的顺序 |
| F-58 | Release owner 已直接提供责任角色、维护窗口、settings 两阶段分支、warning disposition 和 reviewer 标识；私有 input digest=`sha256:6deff7ff21bab219b1a984eda23f1a365a672cfe937bf6ee322d788607107df4` | 人工字段缺口已关闭；仓库只保留脱敏结论，原值留在仓库外 0600 记录 |
| F-59 | 私有 `CutoverPlanV1` 已绑定 commit `29f40bb`、release identity `2e999...`，plan digest=`d08b7e3a...12da`；生产 plan service 同字节实现读取通过，计划根 0700、4 文件 0600、所有未来 artifact 路径不存在 | 真实 plan 缺口已关闭，且尚未产生 token、gate、AUTH 或任何 cutover step 副作用 |
| F-60 | review packet=`a28ab7e1...35fd`、check bundle=`beed7036...d3e`，状态为 `awaiting_digest_bound_human_confirmation`；此前人类确认发生在实际 plan digest 生成前 | SH-10 仍不能签；必须由人类明确确认实际 plan/review digest，禁止先签后补或把字段确认冒充 digest-bound gate |
| F-61 | 人类随后明确确认实际 plan=`d08b7e3a...12da` 与 review packet=`a28ab7e1...35fd` | digest-bound 人工确认缺口关闭；该确认没有扩张为 AUTH 或 C0 指令 |
| F-62 | final SH-10 evidence=`b0d58efe...518e21`，绑定确认语句、reviewer、input/check/index/report/plan/review digests；gate=`e5d150ae...439d3c` 绑定 SH-01～SH-10 | SH-10 已通过人工审阅并形成可由生产 C0 reader 验证的私有 gate |
| F-63 | 生产 gate reader 验证通过，定向 spec 2/2；私有根 0700、6 files 0600，token/AUTH/cutover artifacts=0 | R0-B 已完成；保持 `real_cutover_no_go`，下一步只能在用户明确指示后进入 C0 |
| F-64 | C0 前置按生产契约新增随机 maintenance token，文件 0600，内容未打印且不来自用户现有凭据 | C0 输入完整；token 仅用于 C0 的非空/权限前置校验，未调用 maintenance API |
| F-65 | 冻结 release CLI 返回 `CUTOVER_C0_OK`、`replayed=false`；C0 evidence=`sha256:3444ae2d...9a3ba11`，链仅含 C0 | R1-C0 只读检查通过；release identity、空目标、SH gate 和 capability 门均已落证 |
| F-66 | C0 Scrutiny 通过：evidence root/steps root 0700、文件 0600，gate/report digest 精确绑定；3 files/17 tests 通过 | C1～C7、AUTH、停写、snapshot、migration、SecretStore、backup/restore、archive、activate 均未执行 |
| F-67 | 生产 `DbCutoverService.runStep()` 在 C0 之后对 C1～C4 强制要求 `authorizationFile`，并用 C0 gate evidence digest 验证 `AUTH-C1`；清单还要求 AUTH-C1 明确不授权 C5/C7 | R1-C1～C4 不能用普通“继续”或 SH-10 gate 代替；当前缺独立人工授权 |
| F-68 | 用户目标已扩展到 R1-C1～C7，但没有提供当前 C0 evidence 绑定的 AUTH-C1 人工确认；AUTH-C1/C5/C7 文件均不存在 | 保持 `blocked_waiting_auth_c1`，不代签、不执行停写或 C1 |

## R1-C1～C3 新增事实

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-69 | 用户确认 AUTH-C1 原文；私有 AUTH-C1 绑定 C0 gate evidence=`3444ae2d...9a3ba11`，authorization digest=`d310d5fe...e9472eb3`，文件 0600 | C1～C4 获得明确人工授权；C5/C7 未获授权，不能生成对应 AUTH |
| F-70 | C1 首次根维护 URL 与服务 `/api` 全局前缀不一致；改用同 release 正式编译产物 + 本机仅 maintenance 路由代理后，C1=`CUTOVER_C1_OK` | 计划和应用入口存在路径契约缺口；未改 release 源码，C1 证据已写入并可复核 |
| F-71 | C2=`CUTOVER_C2_OK`，snapshot sealed，证据链 `C0→C1→C2` 完整；C1/C2 后隔离服务已停止 | C1/C2 通过，未执行 C3 之后的目标导入、backup、restore 或 activate |
| F-72 | C3 对 `/workspace/settings/app-settings.json` 的生产 inspection 判定 `already_sanitized`：三个图片 provider 均只有 `secretRef + keyFingerprint`，没有 `apiKey` 明文；plan 固定为 `legacy_plaintext_requires_two_phase + prestage_legacy` | 真实 source 与已确认 plan 不一致；C3 按契约 fail-closed 为 `CUTOVER_SETTINGS_START_STATE_MISMATCH`，不能伪造明文、修改真实 settings 或篡改 plan digest |
| F-73 | C3 失败清理后，target-data、target-workspace、snapshot、credential-expectations 均不存在；evidence `completedThrough=C2`，无 C3/C4/C5/C6/C7 | 无半成品目标或后续证据污染；下一步需重新形成一致的 plan/C0 gate 后再继续 |

## C3 settings 起点修复新增事实

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-74 | 冻结 release 的生产 settings inspection 返回 `already_sanitized`、credential=3、legacy=0、allHaveSecretRef=true；source digest=`263586a8...34bc83` 与旧 C2 manifest 相同 | 根因是旧 plan 选错分支，不是 C1/C2 后 source 漂移，也不存在合法的 plaintext prestage 输入 |
| F-75 | 新私有根生成 v2 plan：`already_sanitized/verify_existing`，plan=`675bb346...6e185af`；旧 plan/root/evidence 未改 | 修复采用新 identity，满足“plan 字段改变必须新建 cutoverId/runId”的契约 |
| F-76 | v2 human input=`dd06eea1...97e1f`、check bundle=`48e2ad1c...093555`、review packet=`52b31571...7c522f`；4 文件均 0600、根 0700 | 新的 digest-bound 人工审阅对象已准备完成，但仍是 awaiting 状态 |
| F-77 | 正式 plan reader 与摘要重算通过；旧 shadow gate 用 v2 identity 校验返回 `CUTOVER_C0_SHADOW_GATE_INVALID` | 旧 SH-10 签名和旧 C0/AUTH 不能复用，必须重建 v2 gate、C0 与 AUTH-C1 |
| F-78 | v2 gate/token/AUTH/evidence 均不存在，4310/4311 无监听，真实 Keychain 未访问 | 当前安全停止在 `waiting_v2_sh10_digest_confirmation`，没有继续扩大真实运行副作用 |

## v2 SH-10 与 C0 新增事实

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-79 | 用户精确确认 v2 plan=`675bb346...6e185af`、review=`52b31571...7c522f`，授权范围仅为生成 gate + 只读 C0，明确排除 C1～C7/Keychain | v2 SH-10 与 C0 取得合法人工边界，不能扩张为 AUTH-C1 |
| F-80 | v2 SH-10 evidence=`89248a11...6e15c9`、gate=`be1209a7...047414`；冻结 release reader 验证 10/10 checks 与 MigrationReport 绑定 | v2 SH-10 gate 通过静态复核，旧 gate 未被复用 |
| F-81 | 冻结 release C0=`CUTOVER_C0_OK`、replayed=false、evidence=`e173a8e0...262cf1`；链仅含 C0 | v2 release/roots/token/capability/gate 只读门通过，可申请新 AUTH-C1 |
| F-82 | v2 target/snapshot/runtime/credential expectations/AUTH 均不存在；C0 代码路径在 gate reader 后返回，未调用 SecretStore 方法 | 用户“不访问 Keychain、不执行 C1～C7”的边界得到满足 |
| F-83 | 5 files/24 tests、生产 evidence reader、权限检查和 `git diff --check` 通过；代码目录无 diff | Scrutiny=`passed`，本轮只新增仓库外私有运行证据并更新文档留痕 |
| F-84 | 旧 AUTH-C1 绑定旧 C0=`3444ae2d...9a3ba11`，v2 C0=`e173a8e0...262cf1` | 旧 AUTH/C1/C2 不能继承到 v2；必须重新生成绑定 v2 C0 的 AUTH-C1，再从 v2 C1 顺序推进 |

## v2 C1～C4 与 runner 修复新增事实

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-85 | v2 AUTH-C1 digest=`ef5d3e50...f7f0a` 精确绑定 v2 C0；C1/C2/C3 gate evidence 分别为 `963458ca...6809f8`、`5e740004...a5b1`、`ca03a721...21cb2` | v2 C1～C3 顺序通过；already-sanitized 分支未写 settings、未创建 legacy credential |
| F-86 | v2 C4 final importer/ready 已执行，backup 在 `BACKUP_ASSET_MISMATCH` fail-closed；DB Asset storageKey 为 `legacy-import/...`，目标文件位于 target workspace，runner 输入却为 source workspace | 发现 production runner 的 C4 backup workspace 参数缺陷；不能复制/覆盖真实 source workspace 绕过 |
| F-87 | 修复 commit=`8679d84e2655bbe8f7e1a3a752664befa0dee995` 将 C4 backup workspace 改为 `plan.targetWorkspaceRoot`；新增 target-workspace 断言；隔离 runner/backup/cutover 定向 5 files/70 tests 通过 | 修复已具备测试证据，但 release identity 变化，旧 SH-10/C0/AUTH 全部失效 |
| F-88 | 新 detached release=`AIRoaming-release-r1-c4-8679d84`，v3 plan=`aca632bb...8081c7c`，settings=`already_sanitized/verify_existing` | 新 release 需要重新绑定 plan、SH-10 gate、C0 和 AUTH，不能沿用 v2 evidence |
| F-89 | v3 check bundle=`a60d4a99...ad9803`、review packet=`55f3dc73...503680`，私有根 0700、候选文件 0600；v3 gate/C0/AUTH 尚未生成 | 当前只完成候选准备，尚未取得 v3 digest-bound 人工确认 |
| F-90 | v2 C4 失败后没有写 C4 evidence、backup pointer 或 C4 gate；目标 DB/target workspace/final report 属失败运行私有留痕 | v2 链安全止于 C3；新 v3 必须从 C0→C1→C2→C3→C4 重新执行 |

## v3 SH-10 与 C0 新增事实

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-91 | 用户确认 v3 plan=`aca632bb...8081c7c`、review=`55f3dc73...503680`；release=`8679d84` | v3 plan/release digest-bound 人工确认已完成，旧 v2 identity 不再适用 |
| F-92 | v3 check bundle=`d759be24...7fd2c`、SH-10 evidence=`473c62a8...f502`、shadow gate=`ba5c324c...40fe`；冻结 release gate reader 通过，文件 0600 | v3 SH-10 gate 已完成且绑定新 release/plan |
| F-93 | v3 C0=`CUTOVER_C0_OK`、replayed=false、evidence=`d09fd4d7...bc6b6`；证据链仅 C0 | v3 只读门通过；没有执行 C1、C3、C4、C5、C6、C7 |
| F-94 | v3 私有根无 AUTH-C1、target/snapshot/runtime/credential expectations；旧 v2 AUTH 绑定不同 C0 | 当前停止在 `blocked_waiting_v3_auth_c1`，必须取得新 AUTH-C1 后从 v3 C1 顺序执行 |
| F-95 | 用户确认绑定 v3 C0 evidence=`d09fd4d7...bc6b6`，授权 C1/C2 与 C3 `already_sanitized/verify_existing`，不授权 C5/C7 | 生成唯一有效 `AUTH-C1-final.json`，digest=`536bd60c...b18f9`；旧格式错误临时文件未进入执行链并已清理 |
| F-96 | v3 C1/C2/C3/C4 依次返回 `CUTOVER_C*_OK`，最终 manifest `completedThrough=C4`、digest=`f4f46ea0...195f1` | final import、ready、backup、verify-only restore 通过；settings digest 保持 `263586a8...34bc83`，无 settings 写回 |
| F-97 | C1 维护 API 通过 v3 私有根内隔离迁移 SQLite 提供控制面，仓库无可绑定 source DB；C2 读取真实 workspace，C3 只读验证真实 settings/Keychain，C4 使用隔离 target DB/workspace | 证据可称为 release-specific isolated cutover chain；不能把 C1 解释为生产 source 进程已真实停写，进入 C5 前须重新做边界复核并取得 AUTH-C5 |

## v3 C1 否决与 v4 remediation 新增事实

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-98 | Runbook 要求 C1 操作仍在服务 source 的同一旧 file 进程；v3 实际连接的是私有根隔离 DB-mode server | v3 C1 不满足真实 source 停写证明；C4 digest 不具备 AUTH-C5 资格 |
| F-99 | v3 C1 执行发生在已冻结 `2026-07-14 22:00～23:00 Asia/Shanghai` 维护窗口之前；旧 plan schema/runner 未强制窗口 | 人工窗口不能只存在 review 文本中，必须进入 planDigest 并由 runner 在副作用前及 bundle 后执行校验 |
| F-100 | 新 identity endpoint 要求显式 file mode、source workspace、release root、40 位 appCommit，并返回 per-process UUID；C1 在 drain 前、close 后、bundle 三处绑定同一 UUID | 另一个进程、重启后的进程或代理转发的错误控制面不能再冒充 plan 绑定旧服务 |
| F-101 | 新定向 6 spec/52 tests、全量 71 spec/489 tests、typecheck/build/Prisma/G1/capability/diff 全绿；commit=`9227e8d` | 修复的静态与隔离自动化证据通过，但 release identity 已变化，必须创建 v4 并重走 plan/review/SH-10/C0/AUTH-C1 |
| F-102 | frozen release 临时 file-mode HTTP smoke：identity 精确匹配 source/release/commit，错误 token=403，drain 前/close 后/bundle 实例一致；临时资源已清理 | `/api` 实际路由与运行期 identity/bundle 绑定可用；该 smoke 不等于真实 source 停写，不授权 C1 |
| F-103 | v4 plan=`290674ad...c8ce6`、review=`d42300f0...ac1cb`；私有根 0700、4 文件 0600，plan reader/全部摘要/嵌套 checks/sentinel 通过 | v4 技术候选已准备好，但 SH-10 仍 awaiting；必须取得人类对实际 digest 的精确确认 |
| F-104 | v4 token/gate/AUTH/evidence/target/snapshot/backup/archive 均不存在，status completedThrough=null | 当前未产生真实切换副作用；下一授权最多覆盖 gate + 随机 token + 只读 C0 |
| F-105 | v4 SH-10 evidence=`46ed1af1...674f78`、gate=`718cb20e...614d1f`、C0=`CUTOVER_C0_OK`/`021bd122...5e770`；gate 10/10 checks、C0 chain 1 step | v4 只读发布门通过，摘要绑定新 release/plan，旧 v3 gate/AUTH 未复用 |
| F-106 | C0 后私有根无 AUTH-C1、C1～C7 evidence、target DB/snapshot/runtime bundle；Keychain/maintenance API 调用次数=0 | 当前安全停止在 `blocked_waiting_v4_auth_c1`，需新的人工 AUTH-C1 才能进入 C1 |

## v4 AUTH-C1 与窗口门禁

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-107 | 用户明确授权 v4 C1，并允许 C3 只读 Keychain 验证；明确未授权 C5/C7 | 允许范围只覆盖 C1～C4，不能生成 AUTH-C5/C7 或进入 activate/首写 |
| F-108 | 私有 `authorizations/AUTH-C1.json` 为 0600，绑定 C0=`sha256:021bd122...5e770`，authorization=`sha256:bae8fd93...7db48dd`；canonical digest、ACK、identity 复核通过 | v4 AUTH-C1 有效且不可与旧 identity 复用 |
| F-109 | 当前时间 `2026-07-14 20:00` 左右，早于 plan 绑定窗口 `22:00～23:00 Asia/Shanghai`；4310 等维护端口无监听 | C1 必须等待窗口；不得伪造时间、改 plan 或使用隔离 DB-mode/代理替代 source file runtime |

## v4 时间输入根因与 v5 纠偏

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-110 | 早期人工字段中 maintenanceWindow 以“例如 22:00～23:00”出现，后续确认文本将其作为实际值确认；v4 human input/plan 均绑定该值 | 根因是把示例时间错误提升为正式决策，不是 runner 硬编码时间 |
| F-111 | v4 C1 复现=`CUTOVER_MAINTENANCE_WINDOW_CLOSED`，evidence 仍止于 C0，maintenance API/Keychain/停写均未发生 | 时间门禁本身 fail-closed 正常；应纠正输入，不应删除身份和窗口安全门 |
| F-112 | v5 窗口=`20:00～23:59`，plan=`2ba999ff...fc096`、review=`15b751e3...54f4de`；plan reader、4 外层 digest、10 个嵌套 digest 和权限通过 | v5 候选已覆盖当前执行时间，仍需 release owner 对实际摘要做一次绑定确认 |
| F-113 | 文档新增规则：任何带“例如/示例/比如”的时间禁止落盘，必须回显实际绝对区间；“现在开始”先解析再确认 | 防止同类人工输入错误再次发生；当前无可直接覆盖该对话解析错误的代码测试 seam |

## v5 SH-10 与 C0

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-114 | 用户精确确认 v5 plan/review/window，只授权 gate + C0；passed bundle=`c9b08578...ed82b2`、SH-10 evidence=`e5c36b49...ccced9`、gate=`6e66e807...786670` | v5 SH-10 人工与技术门绑定有效，不可扩张为 C1 授权 |
| F-115 | frozen release C0=`CUTOVER_C0_OK`、evidence=`385ab981...546d2`；manifest/step canonical digest、0600 权限和 artifact 复核通过 | v5 只读发布门完成，下一授权必须绑定该 C0 evidence |
| F-116 | C0 后无 AUTH、runtime bundle、target、snapshot、backup、archive，4310 无监听 | 用户未授权 C1/Keychain 的边界得到满足；当前为 `blocked_waiting_v5_auth_c1` |

## 执行角色纠偏

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-117 | 用户明确指出现有文档是 Luna 执行计划，不是让 Luna 写文档，也不是让 Codex逐步代执行 | 后续 Worker 固定为 Luna；Codex 只维护与复核既有计划 |
| F-118 | v5 C0 evidence 已知且 C1～C4 共用同一 AUTH-C1 gate | 用户把精确 handoff 交给 Luna并说“按本文执行”可作为一次人工授权来源；Luna 生成机器 AUTH 后连续执行 C1～C4，无需四次确认 |
| F-119 | C5/C7 分别绑定尚未产生的 C4/C6 evidence | 这两个不可逆边界不能由 C1～C4 任务推导；Luna 必须在 C4 后复核并停止 |

## v5 C1～C4 运行结果

| ID | 证据 | 结论 |
| --- | --- | --- |
| F-120 | AUTH-C1=`e2f3b337...93008e` 精确绑定 v5 C0；C1=`CUTOVER_C1_OK`，runtime=`487e1bab...260d159` | 真实旧 file runtime 已按 plan drain/close；identity/runtime bundle 绑定通过 |
| F-121 | C2=`CUTOVER_C2_OK`，source=`c16ff088...4beebb`、snapshot=`af33a4aa...79804e` | sealed snapshot 完成，source 未改写 |
| F-122 | C3=`CUTOVER_C3_OK`，settings=`already_sanitized/verify_existing`，source settings=`263586a8...34bc83` | 只读 Keychain probe/fingerprint 通过，未写 settings、未 prestage legacy credential |
| F-123 | C4=`CUTOVER_C4_OK`，report=`96497455...d61e72b`、backup=`960ae2bd...2e89f1` | final/ready、pre-cutover backup、verify-only restore 通过 |
| F-124 | manifest=`69d08d7b...6328642`、stepCount=5；无 C5/C6/C7/marker，4310 无监听 | 本轮已安全停止在 `blocked_waiting_auth_c5`；未执行 activate/首写 |
