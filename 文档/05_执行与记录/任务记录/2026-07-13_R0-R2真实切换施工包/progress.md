---
doc_id: AIR-RCUT-PROGRESS-001
status: completed
created: 2026-07-13
updated: 2026-07-14
owner: AI漫游项目
audience: orchestrator, worker, reviewer, human
source: R0-R2 task_plan
---

# R0-R2 进度

## 当前状态

```text
current = DB_ONLY_OBSERVATION_PASSED
completedThrough = C7
evidence = sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452
schedule_policy = NO_CALENDAR_SCHEDULE
```

AUTH-C5/AUTH-C7/R2 已消费；C5/C6/C7 activation/首写和 OBS-01～10 已通过；下方旧停止点不得覆盖本节。

当前执行快照（C7）：

- C7=`CUTOVER_C7_OK`，stepDigest=`sha256:d66707e25179cc01e53dda48a1a7130986f1c81d59d63b736387bc0e5135af60`。
- 最新 evidence=`sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452`，COMPLETED 已生成。
- activationState=`db_only`，activatedAt 已记录，firstBusinessWriteAt=`2026-07-14T13:40:39.000Z`。
- 首笔受控 DB-only 业务写/file guard 已完成；R2 授权已完成。

R2 观察摘要：OBS-01～10=`passed_real`，Scrutiny/Runtime=`passed`。OBS-06/07/08 的真实实现缺口已由 `62da892`、`0be5621`、`7ddeb21`、`a90f546` 关闭；G4 不再阻塞。

当前执行快照（2026-07-14）：

- AUTH-C5 authorizationDigest=`sha256:404fa13217b41f74da538393471e188cc3af15ec63606eb7d781503d4a0f5e25`，已绑定 C4 evidence 并通过校验。
- C5=`CUTOVER_C5_OK`，stepDigest=`sha256:f97780fc3594f0299df118b64fe4809d40465f3a9c27382ef0c8e06b0228204c`。
- C6=`CUTOVER_C6_OK`，stepDigest=`sha256:5008b1d9c9599d95d65a832bfbd9764df55f1268c57b5fa2c37acc65e80cb5bf`，C6_READY/archive 已生成并校验。
- 未生成 AUTH-C7；未执行 C7、activate、首笔业务写入。

## 2026-07-13 R0-DOC

状态：`completed`

已完成：

- 只读核对 maintenance/snapshot/final/ready/backup/restore/activate/cutover/archive/SecretStore 生产入口。
- 发现 fake-only SecretStore、Keychain secret-in-argv、optional activation evidence、弱 evidence parser、缺 production runner 五类关键阻塞。
- 明确 M6-A1 只能标记 `isolated_complete`，总体回到 `production_entry_changes_required`。
- 新建五份主施工资料：Handoff、实施契约、Runbook、证据矩阵、复核授权清单。
- 新建 task_plan/progress/findings 三件套。
- 同步 AI 上下文入口、路线图、G1 清单、D2/M6 状态、M6-A1 历史结论与长期/会话记忆。
- 完成 frontmatter/doc_id、事实源路径、命令脚本、状态流、Markdown fence、敏感模式与 `git diff --check` 静态复核。

未执行：

- 未修改业务代码、Schema、migration 或 trigger。
- 未访问真实 workspace/dataRoot/数据库。
- 未调用真实 Keychain/provider/OpenCode auth。
- 未执行停写、snapshot、final、backup、restore、archive、activate。

下一步：把 `handoff.md` 交给 Luna，只执行 R0-A；完成代码、测试、双 Review 和独立提交后停止，不自动进入 R0-B。

## 2026-07-13 R0-A1 Worker 开始

状态：`in_progress`

- 已读取 R0-A Handoff/实施契约、项目事实源和当前 SecretStore/Settings/Final/Ready/RuntimeBundle 代码。
- 当前首个实现目标：让 Keychain adapter 的 secret 不进入 argv，并建立 production credential verifier 的可注入边界；随后补 legacy settings deferred/prestage 入口。
- 仍未访问真实 workspace、真实数据库、真实 Keychain 或 provider。

## 2026-07-13 R0-A Worker 实施推进

状态：`in_progress`

已落地：

- `MacOSKeychainSecretStore.put()` 改为 secret 走受控 stdin，参数数组不再包含 secret；fake executor 增加进程边界断言。
- 新增 `CutoverCredentialVerifier`，只输出 fingerprint/匹配事实，不输出 secret、secretRef 或原始 Keychain 输出。
- 新增 `CutoverSettingsService`，支持已脱敏只读验证、legacy prestage、CAS + temp/fsync/rename 脱敏和安全回滚；旧 settings 在 C4 前保持字节不变。
- Runtime bundle 增加 cutover profile participant `active/queued/blockedReason` 严格验证。
- 新增 `CutoverPlanService`、`CutoverEvidenceStore`、`DbCutoverService` 与 `db:cutover` CLI 骨架；C0/证据链/授权身份/原子落盘已有隔离测试。
- final/ready 增加 production credential evidence 注入边界；activate CLI 增加 plan、maintenance、evidence、AUTH-C7 等强制参数。

当前仍未完成：

- `db:cutover` 已接入 C1 maintenance/runtime bundle、C2 snapshot、C3 无 shell Prisma deploy + settings prestage、C4 final/ready/backup/restore verify-only + settings CAS 脱敏、C5 DB smoke、C6 metadata archive、C7 dry-run/execute activate；动作已抽取到可注入的 `cutover-runner.service.ts`，并通过两个 fresh 临时根的真实 domain C0～C7 链。
- final/ready 的 production credential expectations 仍需由 runner 从 settings/plan 生成并绑定到 C3/C4；旧 fake CLI 兼容路径尚未完全收紧为显式 test-only。
- Cutover evidence manifest 的 source/snapshot/decisions artifact digest 已由 C2/C3/C4 action 写入；C7 crash reconcile、C6/C7 seal tamper 与备份路径指针校验均已有隔离证据。

隔离验证：Keychain/verifier/settings/runtime/evidence/plan/runner 定向 31 项通过；server 全量首轮 438/439，唯一失败为旧 activate rehearsal 兼容分支，修正后受影响的 rehearsal/activate/final 9 项通过；workspace/server typecheck、server build、web build、Prisma/G1/capability、`git diff --check` 通过。真实 SecretStore、workspace、数据库、provider、维护 API 调用次数均为 0。

## Worker 更新模板

## 2026-07-13 R0-A 最终隔离门禁

状态：`changes_requested`

已完成：

- 严格 evidence store：C6_READY/COMPLETED 内容校验、identity/resume conflict、semantic/raw tamper、rename failure、db_only completion reconcile。
- `db:cutover` exact step grammar；C5 使用 cutover runtime profile；ready/backup 生产入口可显式启用 cutover profile。
- fake secret root、activate required flags、unknown step 在 Prisma/plan 副作用前拒绝。
- R0-A 定向：14 个 spec、106 个测试通过。
- 服务端全量：69 个 spec、471 个测试通过（含 C5 smoke failure、C7 crash/reopen、首写 file-guard、RCUT-RB-01、RCUT-SEC-08、RCUT-PATH-01/02/03、RCUT-C0-01、RCUT-C3-ROLLBACK 与 RCUT-EVD-09）。
- workspace typecheck、server build、web build、Prisma validate、G1 manifest/schema/migration、capability `blockedIds=[]`、`git diff --check` 全部通过。

仍未完成：

- 新 `db:cutover` CLI 已在两个 fresh 临时根完成真实 C0～C7 domain chain；旧 M6 coordinator rehearsal 仅作为旁证，不再作为 runner 链主证据。
- `DbCutoverService` 协议层已在两个 fresh 临时根验证 C0～C7、AUTH-C1/C5/C7 历史 gate digest、replay 和独立 run identity；该测试使用 fake action，不能替代真实 domain action chain。
- C1/C3/C4/C5/C7 已有可注入 seam 与失败无后续写入证据；C1～C4 统一失败矩阵、C5 smoke failure、C7 crash/reopen（db_only 且首写为空时跳过重复 dry-run、只补 C7/COMPLETED）和 first-write/file-guard 已在 fresh 临时 SQLite 链通过；剩余缺口是独立 Scrutiny/Runtime Review。

## 2026-07-14 R0-A review execution

- 静态审计发现并修复 production runner 的 SecretStore 装配边界：`productionCutoverRunnerDependencies()` 现在直接绑定 `MacOSKeychainSecretStore`，不会被 `AIROAMING_SECRET_STORE_ADAPTER=fake` 环境变量劫持；测试新增 `RCUT-SEC-08`。
- SecretStore binding 修复后 R0-A 定向为 13 个 spec、98 个测试；随后路径安全修复、新增 evidence 权限、C7 指针摘要、C0 shadow gate 与 C3 资源清理红测，最新定向为 14 个 spec、106 个测试；服务端全量为 69 个 spec、471 个测试，全部通过。
- typecheck、server/web build、Prisma validate、G1 manifest/schema/migration、capability `blockedIds=[]`、`git diff --check` 全部重新通过。
- 当前仍未把本轮复核标成独立 Review；必须由 Luna 重新填写 Scrutiny/Runtime 结论并独立提交，真实系统操作仍为 0。
- Scrutiny/Runtime Review 已出具 `changes_requested`，不生成 AUTH-C1/C5/C7，不执行真实停写或真实凭据操作。

## 2026-07-14 Luna 独立复核结果

- Luna 上一轮基线独立重跑为定向 13 个 spec/103 个测试、服务端全量 68 个 spec/468 个测试；本轮新增 C0 shadow gate 与 C3 资源清理后，主工作树定向 14 个 spec/106 个测试、全量 69 个 spec/471 个测试，typecheck、server/web build、Prisma、G1、capability `blockedIds=[]`、`git diff --check` 全部通过，等待再次独立复核。
- 隔离 Runtime Review：`passed_isolated`；真实 security/Keychain/provider/workspace/dataRoot/维护 API/数据库操作仍为 0。
- 独立 Scrutiny 保持 `changes_requested`，不是自动通过。P1-A：`security add-generic-password -w -U` 通过 child stdin 的无 TTY macOS 行为未能在“禁止真实 Keychain”约束下证明；P1-B：C0 action 仍未在 R0-A 隔离环境执行 release-specific SH-01～10/人工 SH-10，因此不能把当前链路宣称为真实 C0 通过。
- R0-A 继续停在 `production_entry_changes_requested / real_cutover_no_go`；不得生成 AUTH-C1/C5/C7，不得进入 R0-B/R1。旧 `db-verify/db-audit/migration-decision` writer 不在本 runner C4 路径，登记为非本轮阻塞。

## 2026-07-14 R0-A P1 修复推进

- C3 统一失败边界现在会清理本轮新建的 target DB、SQLite `-wal/-shm` 和 data root；既有空 root/既有 DB 不删除。新增 `RCUT-C3-ROLLBACK`。
- C0 改为校验 plan 显式绑定的 `shadowGatePath`，gate 必须绑定 plan identity、SH-01～SH-10 evidence digest、MigrationReport digest 和人工 reviewer 摘要；新增 `RCUT-C0-01` 与 shadow-gate spec。隔离链使用明确标注的 isolated gate，不代表真实 SH 通过。
- 本轮修复后需重新锁定测试数量和独立 Review 结论；Keychain 无 TTY 平台证据仍保持未解决。

## 2026-07-14 R0-A 独立复核收口

- Luna 已针对最新工作树独立重跑：定向 14 个 spec/106 个测试通过；服务端全量 69 个 spec/471 个测试通过（exit 0）；typecheck、server/web build、Prisma、G1、capability `blockedIds=[]`、`git diff --check` 全部通过。
- 独立 Runtime Review 为 `passed_isolated`；确认未触碰真实 security/Keychain/provider/workspace/dataRoot/维护 API/数据库，未生成 AUTH。
- 独立 Scrutiny Review 为 `changes_requested`，当前仅保留 P1-A：macOS `security add-generic-password -w -U` 通过 child stdin 的无 TTY 平台行为仍未被真实 macOS 或 Security.framework/helper 证据证明。
- P1-B 已降级为 R0-B 真实 gate：C0 代码现在强制 identity-bound `shadowGatePath`，校验 SH-01～SH-10、每项 evidence digest、MigrationReport digest、人工 reviewer 与 gateDigest；当前隔离 gate 不代表真实 SH 通过。
- P1-C 已关闭：C3 失败清理本轮新建 DB、`-wal/-shm` 和 data root，保留既有目标，并由 `RCUT-C3-ROLLBACK` 复核。

结论：维持 `production_entry_changes_requested / real_cutover_no_go`；不生成 AUTH-C1/C5/C7，不进入 R0-B/R1/R2，等待独立 reviewer 基于最新工作树刷新结论。

## 2026-07-14 授权 disposable Keychain smoke 与最终回归

- 已按 release owner 授权执行 macOS disposable Keychain 隔离 smoke；隔离方式为临时 `HOME`（`Library/Keychains`、`Library/Preferences`）+ 临时默认 keychain，生产 adapter 不接收路径参数，`security add-generic-password` 保持 `-U -w` 且 `-w` 最后。
- 脱敏结果：`putSucceeded=true`、`fingerprintMatches=true`、`deleteSucceeded=true`、`getAfterDelete=SECRET_STORE_ENTRY_MISSING`、`probe.adapter=keychain`，secret 不在 argv/stdout/stderr；真实默认 keychain 与搜索列表前后不变，临时 HOME/keychain 已删除，未生成 AUTH。
- 最新服务端全量回归：69 个 spec、472 个测试通过（183.16s，exit 0）；typecheck、server/web build、Prisma、G1 manifest/schema/migration、capability `blockedIds=[]`、`git diff --check` 全部通过。
- 发现并修正 smoke 参数探测风险：早期错误地尝试把 keychain 路径作为 `-w` 参数时，`security` 将其当作密码，曾短暂创建合成 probe 条目；已用精确 account/service 删除并复核默认 keychain/search list 不变。该条目不含真实凭据。之后移除 `keychainPath` API，统一使用临时 `HOME` 隔离。
- 平台 smoke 证据已补齐；Luna 已基于最新工作树独立复核并将 Scrutiny 更新为 `passed`，Runtime 保持 `passed_isolated`。真实 C0～C7、SH gate、AUTH、真实凭据和真实数据仍禁止执行。

## 2026-07-14 R0-A Keychain 参数边界修正

- macOS `security add-generic-password` 帮助明确要求 `-w` 为最后一个选项才能进入密码提示/stdin 路径；原 runner 的 `-w -U` 顺序不满足该平台契约。
- 已改为 `-U -w`，secret 仍只经 child stdin 传递，不进入 argv；新增 `RCUT-SEC-11` 锁定 `-w` 最后位置。
- 仅执行本机 `security add-generic-password -h` 平台文档证据检查，未执行真实 Keychain、未创建或修改任何凭据；等待 Luna 针对该证据重新复核 P1-A。
- 修复后服务端全量为 69 个 spec、473 个测试通过；SecretStore/runner 定向 19 个测试通过；typecheck、server/web build、Prisma、G1、capability、`git diff --check` 全部通过。

Luna 最新独立复核结论：`-w` 参数顺序代码问题已关闭；Scrutiny 仍为 `changes_requested`，Runtime 为 `passed_isolated`。剩余仅是一次获授权的 macOS 隔离 disposable-keychain put/get/delete/probe smoke；当前任务禁止触碰真实 Keychain，因此不执行、不提交、不生成 AUTH，继续停在 `real_cutover_no_go`。

随后为该 smoke 增加显式绝对 `keychainPath` 注入，生产默认不指定；新增 `RCUT-SEC-12`，等待 Luna 针对最终工作树重审。

显式路径使用 `-w -- <keychainPath>`，避免 `security(1)` 把路径误当成密码；其 `probe` 已改为只读 reserved-account lookup，避免把 disposable 路径传给不接受 positional 参数的 `default-keychain`；生产默认路径行为保持不变。

证据边界：

- 真实 `security`、真实 Keychain、真实 provider、真实 workspace/dataRoot、真实维护 API 调用次数均为 0。
- 本轮仅使用仓库 fixture、fake executor、临时目录和隔离 SQLite。

```text
日期/阶段：
状态：in_progress / passed_isolated / blocked / changes_requested
基线 commit：
修改文件：
新增测试 ID：
定向测试：
全量门禁：
SecretStore 真实操作次数：0
真实数据操作次数：0
Scrutiny：
Runtime：
提交：
停止点：
```

## 2026-07-14 R0-B 只读发现与 release-specific shadow

- 用户明确授权：`授权 R0-B 只读发现与 release-specific shadow，不授权停写、不生成 AUTH、不执行 C1～C7`。
- 发布冻结只读门禁通过：workspace/server typecheck、server/web build、Prisma validate、G1 manifest/schema/migration、capability `blockedIds=[]`；Node=`v22.22.2`、pnpm=`7.12.1`、G1 baseline machine manifest digest=`sha256:ad3b0e1ba884e20718e6e81994cbb8beaedbb9e6777e471ac2a21e4c94c2b1ea`。该值不是 release effective schema identity。
- 只读源发现：当前仓库工作区存在 87 个文件；settings 递归扫描发现 3 个 credential 字段、sentinel=0；未读取或打印 Keychain/真实凭据；源 workspace 在当前开发布局下位于 release root 内，私有 plan 的 root disjoint 校验返回 `CUTOVER_PLAN_ROOT_OVERLAP`，该项登记为真实 plan blocker，不绕过。
- sealed snapshot 已从同一源只读生成：source manifest=`sha256:e2d56eedcedd4ff81162fb1e5e4f3e51dc3c9a0caacc5ff1818fdcd84e283059`，snapshot manifest=`sha256:e53394f5cb9799a7fcaa98984a0a8b59d28a08836df2f7a40d385c6dd3ca3408`，transform=`sha256:2e2b97724884415e18dc869487ea84883868700e0db5cf9c3ca347cd93ff7f27`；settings 只进入 redacted artifact。
- 两个 fresh shadow target（A/B）均使用同一 sealed snapshot 和同一 decisions digest；规范化 full-shadow reportDigest 均为 `sha256:f96232cf31f8cf93db2bad3b9d4b7f807ad3a16aaa3b5f01ce6da363e1a3359f`，45 张表计数摘要均为 `sha256:709c2a3101c3efd0bd5076c17bb03c34c1d373cd389771779d1a9320855820f2`，结果一致。
- 影子导入在 `storyboard` slice 停止：`chapter:chapter_001:storyboard-source` unresolved blocker=1；只读核对显示源有 `storyboard.json` 但没有对应 `structure.json`，StoryVersion 导入数为 0，无法匹配其旧 `sourceStoryVersionId`。因此 SH-03 未通过，不能把该 shadow 记为可切换证据，也不能生成 AUTH 或进入 C0/C1。
- R0-B 当时停止点：因 SH-03 未通过，不能进入 SH-10；Codex 不自签、不执行备份恢复、停写、AUTH 或 C1～C7。

## 2026-07-14 R0-B 阻塞修复施工包

状态：`documented_waiting_luna_authorization`

- 只读核对 recovery archive 和目标成员摘要，确认候选 structure 与当前 project/chapter/story/script identity 匹配，12/12 projectCharacterId 对应当前 shared characters。
- 在仓库外临时 overlay 仅补入候选结构文件并重跑两个 fresh shadow；两次结果一致，但从原 storyboard blocker 推进到 Story importer 的 `MIGRATION_STORY_DOCUMENT_INVALID`。
- 复现根因为 43 个 beat character token 使用角色名；43/43 可唯一精确解析。进一步核对当前 storyboard 的 65/65 character token 同样可唯一精确解析。
- 确认当前 Storyboard importer 仍无条件拒绝非空人物引用、没有写 `storyboard_shot_characters`，且 full order 把 `characters` 放在 `storyboard` 后。
- 确定 root overlap 的正式解决方式：Luna 完成代码并提交后，从最终 remediation commit 创建仓库外 detached release worktree；不移动、不复制真实 source workspace 冒充生产源。
- 新增 Luna 五份施工资料：Handoff、实施契约、测试矩阵、文件函数地图、复核清单；主 Handoff/Runbook/Task/Findings/Evidence 已把下一步纠正为“先修 blocker 和 SH-01～09，再到人工 SH-10”。
- 本轮只写施工资料和仓库外临时验证；真实源仍未修改，未停写、未生成 AUTH、未执行 C0～C7、未触碰默认 Keychain/真实凭据。
## 2026-07-14 R0-B remediation 执行与停止

- 实现提交已固定为 `74a6d71`：新增纯函数 legacy character resolver；Story beat 支持 ID/唯一精确名称；Storyboard 支持 shared character ID/唯一精确名称、正式 Character scope 校验与 `StoryboardShotCharacter` replay；full shadow 顺序改为 `story -> characters -> storyboard`；verify contextual count 允许 `StoryboardShotCharacter`。
- 额外修复两个由真实候选 overlay 暴露的既有约束问题：Story 不再把已达到 `storyboard_done` 的章节降级为 `structured`；`preview_front` 不写 `confirmedAt`，满足 G1 `ck_character_visuals_confirmed_time`，final reference 仍绑定 `finalizedAt`。
- 定向 remediation 通过：4 个关键集成用例通过；resolver/完整 migration 定向合计 78 tests 通过。服务端全量回归：71 个 spec、482 个测试通过（199.95s，exit 0）。typecheck、server/web build、Prisma validate、G1 manifest/schema/migration、capability `blockedIds=[]`、`git diff --check` 全部通过。
- 外置 detached release worktree 固定到 `74a6d71`；source overlay、A/B target workspace、A/B SQLite/data root 已隔离，未改真实 workspace。
- clean overlay 使用同一 sealed snapshot：source manifest=`sha256:c16ff088f2aec751b3a48e4b1b63d83ff4ea27601bd3f1178406b3c9944beebb`，snapshot manifest=`sha256:effb0794414282f66460cafbc69baa7c7e13af80a47a4e6c96efcff6ce18161a`，decisions=`sha256:9efd2f56d97355d56972594a17e28a4c83318c8040a88211c20ccc2754b64fa9`。A/B aggregate reportDigest 均为 `sha256:20a85df7121a639738d0fb5f8c6231a9a21b9966e1328d91edb25cfacf96cf47`。
- A/B 均一致通过前 8 个 slice：Story 1/9/10、Characters 12、Storyboard 1/15/15/65、Assets 67、AssetVisuals 67/24/9；第 9 个 `preflight` 一致以 `PREFLIGHT_SOURCE_UNRESOLVED` 停止，原因是当前 legacy `preflight.json` 缺少 `sourceSnapshot`。这是 R0-B 范围外既有 blocker，不能在本任务中改写 preflight 或伪造 source evidence。
- 按 Handoff 强制停止条件停止：真实 `structure.json` 尚未恢复；未执行 real-source snapshot、SH-01～SH-09、SH-10、AUTH、停写、C0～C7、默认 Keychain 或真实凭据操作。

结论：`remediation_code_committed_overlay_blocked_preflight`；R0-B 不能进入真实源单文件恢复，等待独立决定是否单独建立 preflight source 修复任务。

## 2026-07-14 R0-B preflight 兼容补齐与真实 shadow 收口

- 新增提交 `29f40bb`：legacy preflight `schemaVersion=1` 且缺少 `sourceSnapshot` 时，只从已导入的目标 DB 证据重建 V2 source snapshot；无法唯一解析、校验失败或字段不完整时仍 fail-closed 为 `PREFLIGHT_SOURCE_UNRESOLVED`。新增兼容测试；完整 integration file 74 tests、服务端全量 71 spec/483 tests 通过。
- release freeze 绑定 `29f40bb`；G1 baseline machine manifest digest=`sha256:ad3b0e1ba884e20718e6e81994cbb8beaedbb9e6777e471ac2a21e4c94c2b1ea`，实际 release effective schema identity=`sha256:2e9992459906946415f8072ef4ad210ba00c52393d6c83fc4d0af23e415b3559`；typecheck、build、Prisma、G1、capability、diff check 全绿。
- 条件式真实源恢复仅新增 recovery archive 中授权的 `chapter-001/structure.json`；archive digest=`sha256:336c9f...4b6f23`，成员 digest=`sha256:4eac7b...b076a0dd3`，22819 bytes。除该新增文件外，pre/post source manifest 无 removed/changed。
- 重新生成的 real-source sealed snapshot：source=`sha256:c16ff088...4beebb`，snapshot=`sha256:effb0794...618161a`，transform=`sha256:de410ec3...90f913d`。两个隔离 fresh target A/B 均 16/16 succeeded，aggregate reportDigest=`sha256:daca7e92...663e781`，table-count digest=`sha256:25f14b5a...117fc0a`，open blocker=0。
- 初次 real shadow 暴露 AssetVisual importer 会把 67 个待提升资产写入 source `legacy-import/`；该副作用已立即删除并重新核对 source digest 未变。最终重放使用独立 target workspace，真实 source 未再写入。
- SH-04 `db:verify` A/B 各 16 slices 全通过，integrity=`ok`、FK=0；SH-05/06 使用 `IMP-M4-API-01` 与 `D2-WIT-01/02/03/04/05` 证据；SH-08 A/B artifact/SQLite dump sentinel=0。
- SH-09 在 fresh shadow target A 上完成 coordinated backup、verify-only restore、materialize restore；bundle=`sha256:ef17078c...6ae2dd2`，manifest=`sha256:c0524a51...c59f7e1`，67 assets，恢复 DB integrity=`ok`、FK=0。
- 当前停止点：`R0-B=remediation_executed_waiting_human_SH10`；未生成 AUTH，未停写，未执行 C0～C7、final importer、默认 Keychain 或真实凭据操作。

## 2026-07-14 SH-10 签署前独立预审

- 只读重算确认 release commit、A/B 16/16 reports、32 份 slice verification、source 单文件恢复、secret scan 和 SH-09 restore 核心证据成立。
- 预审结论为 `changes_requested`，不是 SH-10 人工签名。阻塞项：真实 plan/plan identity/shadow gate 缺失；执行记录把 G1 baseline digest `ad3b...` 误写为实际 release identity（实际为 `2e999...`）；证据根/DB/部分报告权限未收紧；正式 G1 SH 状态仍为 `not_run`；table-count 缺 sealed pre-SH09 checkpoint；1 个 warning 未人工接受；旧/clean 证据缺 canonical index。
- 保持 `SH-10=awaiting_human_migration_reviewer`；未生成 gate/AUTH，未执行 C0～C7。

## 2026-07-14 SH-10 技术与证据整改

- 纠正 G1 baseline digest 与 release effective schema identity 的语义和值；正式 G1 清单同步 SH-01～09=`passed_release_shadow`、SH-10=`awaiting_human_migration_reviewer`。
- 外置证据根统一收紧为目录 0700、文件 0600；最终检查 381 dirs、1240 files、violation=0。
- 从固定 release `29f40bb`、同一 clean snapshot/decisions 新建 fresh C/D：两边 16/16 succeeded、aggregate reportDigest=`sha256:daca7e92...663e781`，32/32 `db:verify` passed。
- 在任何 SH-09 PersistenceState 写入前封存 45 表计数：两边 `persistence_states=0`，table-count digest=`sha256:beb518e2...cfabc5c`，checkpoint=`sha256:86863a95...eabd6f2d9`。
- canonical index 绑定 source pre/post、clean snapshot、A/B、fresh C/D、backup/restore、source recovery、secret/permissions evidence；index=`sha256:7ec5e52f...f480636b`，seal=`sha256:d014fc85...b192008`，重复生成/重算一致；旧运行标记 non-canonical。
- 全组 secret scan 覆盖 735 files + 6 SQLite dump，sentinel hit=0；仓库证据摘要不含私有绝对路径。
- 技术阻塞已关闭；剩余真实 plan/责任人/窗口、warning acceptance 与 SH-10 signature 必须由人类完成。未生成 shadow gate/AUTH，未执行 C0～C7。

## 2026-07-14 SH-10 人工字段记录与 digest-bound plan 准备

- Release owner 已明确提供三类责任人标识、`2026-07-14 22:00～23:00 Asia/Shanghai` 维护窗口、`legacy_plaintext_requires_two_phase / prestage_legacy` settings 分支、warning=`accepted` 和 Migration reviewer 标识；原值仅写入仓库外 0600 私有记录，仓库只保留脱敏状态与摘要。
- 已生成 `cutoverId=cutover-20260714-2200`、`runId=cutover-final-20260714-2200` 的 0600 私有 `CutoverPlanV1`，绑定 release commit `29f40bbe287c9d4428aa6bf464d93806c1c84307`、effective schema identity `sha256:2e9992459906946415f8072ef4ad210ba00c52393d6c83fc4d0af23e415b3559` 和 loopback maintenance endpoint。
- 实际 plan digest=`sha256:d08b7e3aa2561c556ad25348d6b9dbcd08f487a1c428233b59763fc9df0412da`；review packet digest=`sha256:a28ab7e1a59a9b8ba26a89e6522bd235ec0ad2176085b12a72574a3bc20f35fd`；check bundle digest=`sha256:beed7036fd493470ea4e020d9619e70c41529ed9f5ddc67992ff7b9dae6f2d3e`。
- 冻结 release 与当前 `CutoverPlanService`、canonical JSON 实现逐字节一致；正式 service 读取与独立摘要重算均通过。私有根为 0700、4 个文件均为 0600；目标/快照/report/token/runtime/backup/restore/archive/evidence/gate 均不存在。
- 当前 review packet 状态为 `awaiting_digest_bound_human_confirmation`；`shadowGateGenerated=false`、`authGenerated=false`、`cutoverStepsRun=[]`。必须先由人类确认上述实际 plan/review digest，不能把此前对字段的确认扩张为对尚未生成 digest 的签名。

## 2026-07-14 SH-10 digest-bound 人工确认与 gate 收口

- 人类明确回复“确认绑定以上 planDigest 和 reviewPacketDigest。”，确认对象精确为 plan=`sha256:d08b7e3aa2561c556ad25348d6b9dbcd08f487a1c428233b59763fc9df0412da`、review packet=`sha256:a28ab7e1a59a9b8ba26a89e6522bd235ec0ad2176085b12a72574a3bc20f35fd`。
- 生成独立的 `airoaming_sh10_passed_evidence_v1`，绑定 confirmed reviewer、确认语句、原 human input、pre-review check bundle、canonical index、MigrationReport、plan/review digest；evidence digest=`sha256:b0d58efef766f8dc4dc2d57f14566f9187fbaf0b798d09e65001d14629518e21`。
- 使用 SH-01～SH-09 原 evidence digest 与 SH-10 passed evidence 生成 0600 `airoaming_cutover_shadow_gate_v1`；gate digest=`sha256:e5d150ae57baa4578b07d03a8e1bfdd508531695bb6c53c60cd1f5e040439d3c`，reviewer=`liyadong`，recorded/signed at=`2026-07-14T07:52:08.899Z`。
- Scrutiny 通过：生产 `readVerifiedCutoverShadowGate()` 验证身份、10 项 checks、MigrationReport 与 gate digest；冻结 release 的 gate/plan/canonical 实现和当前校验实现逐字节一致；`cutover-shadow-gate.spec.ts` 2/2 通过。
- 私有根保持 0700，6 个文件均 0600；maintenance token、AUTH、target/snapshot/final/runtime/backup/restore/archive/evidence 均未创建，C0～C7 未执行。
- Runtime/User Review：本阶段没有 UI 或生产运行路径；用户的 digest-bound 确认本身构成人工决定复核，结论=`passed`。下一状态仅为 `waiting_explicit_C0_instruction`，本轮停止。

## 2026-07-14 C0 只读执行与复核

- 用户明确要求继续执行；按约定只运行 C0，不运行 C1～C7，不生成 AUTH，不停写，不触碰默认 Keychain 或真实凭据。
- 按生产 runner 前置契约生成新的随机 maintenance token：只写入 plan 指定私有文件，权限 0600，内容未打印；未使用任何用户现有凭据。
- 从冻结 release worktree 执行 `db:cutover step --step C0 --plan ... --evidence-root ... --format json`，结果：`CUTOVER_C0_OK`，`replayed=false`，C0 evidence digest=`sha256:3444ae2d4b20fae8b5f01a7c0955aefdc8d80f6c46886f7d029f6322f9a3ba11`。
- C0 动作只验证 release identity、capability 状态、plan roots/空目标、SH-10 gate；未调用 maintenance API、snapshot、Prisma migrate、SecretStore、backup/restore、archive 或 activate。
- Scrutiny 通过：C0 evidence 链 `completedThrough=C0`、stepCount=1、summary=`CUTOVER_C0_OK`，shadowGateDigest 与 MigrationReport digest 精确匹配；evidence root/steps root=0700，manifest/C0 step=0600。
- 运行回归：`db-cutover.service.spec.ts`、`cutover-evidence.service.spec.ts`、`cutover-shadow-gate.spec.ts` 共 3 files/17 tests 通过；冻结 release 的 db-cutover/evidence service 与当前校验实现逐字节一致。
- 停止点：C0 已通过；AUTH-C1/C5/C7、C1～C7 及真实停写仍未执行，下一步必须单独取得 AUTH-C1 指示。

## 2026-07-14 R1-C1～C7 目标复核与授权门

- 用户最新目标要求继续 R1-C1～C7；当前 C0 evidence、plan、SH-10 gate 和私有 token 均存在且已复核。
- 生产 `DbCutoverService` 对任何 `index > 0` 的 step 强制要求 authorization file；C1～C4 必须验证 `AUTH-C1`，且 evidence digest 必须精确绑定 C0 gate evidence。项目清单同时要求 AUTH-C1 明确授权停写和 C3 Keychain/settings prestage，并明确不授权 C5/C7。
- 目前没有人类提供或确认这份独立 AUTH-C1；因此未生成 AUTH 文件、未调用 C1 drain/close、未触碰 settings/Keychain、未执行 C2～C7。
- 当前停止点：`blocked_waiting_auth_c1`。这不是 C0 或代码失败，而是不可逆停写边界缺少独立人工授权。

## 2026-07-14 AUTH-C1 通过与 C1～C3 阻塞

- 用户明确确认 AUTH-C1：确认 C0 证据、plan、release、备份与回滚责任人，授权进入 C1 并按 plan 执行 C3 凭据验证；未授权 C5/C7。
- 已生成私有 0600 `AUTH-C1.json`，绑定 C0 gate evidence=`sha256:3444ae2d4b20fae8b5f01a7c0955aefdc8d80f6c46886f7d029f6322f9a3ba11`；authorization digest=`sha256:d310d5fef6911a4954d58fce01c6c845dd1283cb29b9f92d4b08ac72e9472eb3`。未打印 maintenance token 或任何凭据。
- C1 首次调用发现冻结服务的全局 `/api` 前缀与 plan 根 maintenance URL 不一致；未写入 C1 evidence。改用同一 release 的正式 `tsc` 编译产物，并在本机 4310 仅转发 maintenance 路由到隔离 4311 服务后，C1 成功：`CUTOVER_C1_OK`，gate evidence=`sha256:0bc1d582cd12f5ae56bf9c29ccbd1e3db00b3b3ee097c3ddd0e361fdff9d69d0`。
- C2 成功：`CUTOVER_C2_OK`，gate evidence=`sha256:3b1254e5fb9f3923b042f62e791a79cde5f9632115a83f4c06faac0b96ea1680`；snapshot 已 sealed。C1/C2 后服务与临时代理均已停止。
- C3 按用户授权开始执行，但 fail-closed 为 `CUTOVER_SETTINGS_START_STATE_MISMATCH`：真实 source settings 当前没有 `apiKey` 明文字段，仅有 `secretRef + keyFingerprint`，生产 inspection 判定 `already_sanitized`；冻结 plan 却绑定 `legacy_plaintext_requires_two_phase + prestage_legacy`。C3 清理了本轮新建目标 DB/data root，未写 C3 evidence、credential expectations 或真实 Keychain。
- Scrutiny 结论：C0～C2 evidence 链完整且 AUTH-C1 绑定正确；C3 不能以伪造 plaintext、修改真实 settings 或篡改已绑定 plan 的方式绕过。当前必须停在 `blocked_before_c3_settings_start_state`，先修正 plan/source 起点并重新绑定 C0 后，才能继续 C3/C4；AUTH-C5/C7 仍未生成。

## 2026-07-14 C3 settings 起点修复与 v2 plan 准备

- 冻结 release 的生产 `CutoverSettingsService.inspect()` 再次只读确认 source settings=`already_sanitized`：3 个图片 credential、legacy=0、均有 secretRef、无 legacy text credential。当前文件 digest=`sha256:263586a8bba356fbcb744d83716db4855172c11f80a1106e5f8eefe24234bc83`，与旧 C2 source manifest 完全一致；根因确定为旧 plan 准备阶段分支判断错误，不是 C1/C2 后 source 漂移。
- 旧私有根、旧 plan、旧 SH-10 gate、AUTH-C1 和 C0～C2 evidence 均未修改；旧 evidence 继续止于 C2。旧 4310/4311 服务与临时代理均未运行。
- 在新的仓库外 0700 私有根生成 `cutoverId=cutover-20260714-2200-sanitized-v2`、`runId=cutover-final-20260714-2200-sanitized-v2` 的 v2 候选；`settingsStartState=already_sanitized`、`credentialAction=verify_existing`，全部 4 个候选 JSON 为 0600。
- v2 plan digest=`sha256:675bb34632e79bd0fc45f7ee81c6ca1c8747b03e7164f965defb6c4526e185af`；human input digest=`sha256:dd06eea1a31c908206e51547723b0365d6760d98da1a8ff2a16dc239dda97e1f`；check bundle=`sha256:48e2ad1cc537f443fd8d8ad48632b72f8dcc604dc4f98551d88ab664fe093555`；review packet=`sha256:52b31571d5715f4f6eb84e37a6408b391a4f7242a2a3068c2a4e492ef07c522f`。
- 正式 `CutoverPlanService` 读取通过，plan/human/check/review 摘要独立重算一致；当前与冻结 release 的 plan/gate/canonical 实现逐字节一致。旧 gate 对 v2 identity 按预期返回 `CUTOVER_C0_SHADOW_GATE_INVALID`，证明旧人工签名不能误复用。
- 当前 review packet=`awaiting_digest_bound_human_confirmation`；尚未生成 v2 SH-10 passed evidence、shadow gate、maintenance token、AUTH 或 cutover evidence，未执行新 C0，未触碰真实 Keychain。下一步只允许先取得人类对上述 v2 plan/review digest 的明确绑定确认。

## 2026-07-14 v2 SH-10 确认、gate 与只读 C0

- 用户明确确认 v2 plan=`sha256:675bb34632e79bd0fc45f7ee81c6ca1c8747b03e7164f965defb6c4526e185af`、review packet=`sha256:52b31571d5715f4f6eb84e37a6408b391a4f7242a2a3068c2a4e492ef07c522f`，并只授权生成 v2 SH-10 gate 后执行只读 C0；明确不授权 C1～C7、不授权访问 Keychain。
- 生成不可覆盖的 v2 `airoaming_sh10_passed_evidence_v1`，evidence=`sha256:89248a11f76ff2974377f5bb0e55e6da397e30b5d596b6d72d64dc37896e15c9`；生成绑定 SH-01～SH-10 的 `airoaming_cutover_shadow_gate_v1`，gate=`sha256:be1209a74c698aac24c57b1db690826217f91764ea65aecf6c4eadbb9a047414`。
- Scrutiny：冻结 release 的生产 plan/gate reader 校验通过，10/10 checks、MigrationReport=`sha256:daca7e9201c86589326a5847ad75591828b1ab28e591ab03ce9af810d663e781` 和用户确认摘要精确绑定；私有根 0700、文件 0600。
- 按 C0 前置生成新的随机 0600 maintenance token，内容未打印。冻结 release 执行 v2 C0 返回 `CUTOVER_C0_OK`、`replayed=false`，C0 evidence=`sha256:e173a8e0f42fb8c80c8c641065772bdbf27d9e137e345adecc59c1e967262cf1`。
- C0 evidence 生产 reader 复核通过：`completedThrough=C0`、stepCount=1、summary=`CUTOVER_C0_OK`，artifact 仅为 v2 shadow gate digest 与 MigrationReport digest；evidence/steps 目录 0700、文件 0600。
- 运行边界复核：v2 AUTH-C1、target DB/data/workspace、snapshot、runtime bundle、credential expectations 均不存在；C0 分支只读取 gate，未调用 SecretStore/Keychain 方法，未停写、未启动 C1。
- 定向回归：`db-cutover.service.spec.ts`、`cutover-evidence.service.spec.ts`、`cutover-shadow-gate.spec.ts`、`cutover-plan.service.spec.ts`、`cutover-settings.service.spec.ts` 共 5 files / 24 tests 全通过；`git diff --check` 通过，`apps/`、`packages/`、`tests/` 无代码改动。
- Runtime/User Review：用户的 digest-bound 确认通过；C0 CLI 真实运行复核=`passed_read_only`。本阶段无 UI/导出物，相关人工页面复核不适用。
- 当前停止点：`blocked_waiting_v2_auth_c1`。旧 identity 的 AUTH-C1/C1/C2 只保留历史证据，不能用于 v2；下一步必须由用户以 `already_sanitized` 模板单独授权新的 AUTH-C1。

## 2026-07-14 v2 AUTH-C1 与 C4 backup 阻塞

- 用户以 `already_sanitized` 口径确认 v2 C0 evidence=`sha256:e173a8e0f42fb8c80c8c641065772bdbf27d9e137e345adecc59c1e967262cf1`，授权进入 C1/C3 只读 Keychain 验证，明确未授权 C5/C7；生成 v2 AUTH-C1，authorization digest=`sha256:ef5d3e500af59742eb6e300184e27123e65eaf58ed4f1978aa2312eb351f7f0a`。
- v2 C1=`CUTOVER_C1_OK`，gate evidence=`sha256:963458ca15870bf9f504ae852c0adba57c4ca8b2fbe778e59f06c69c696809f8`；C2=`CUTOVER_C2_OK`，gate evidence=`sha256:5e740004640e08f43b12d5844cc1646503cb9527e03617fb6e799b688968a5b1`；C3=`CUTOVER_C3_OK`，gate evidence=`sha256:ca03a721e662b2830fa1ef33131c4fa8bc97919ad09a7d7ff68e2b047db21cb2`。already-sanitized 分支未写 settings、未创建 legacy credential。
- v2 C4 已完成 final import/ready，但在 pre-cutover backup 资产校验处 fail-closed 为 `BACKUP_ASSET_MISMATCH`。目标 DB 的 Asset storageKey 指向 `targetWorkspaceRoot/legacy-import/...`，runner 却将 `sourceWorkspaceRoot` 传入 backup；C4 evidence 未写，未进入 C5/C6/C7。
- 修复已提交 `8679d84e2655bbe8f7e1a3a752664befa0dee995`：C4 backup 改用 target workspace，并在隔离完整 C0～C7 runner chain 增加断言；相关定向 5 files/70 tests 通过。旧 v2 release/plan/C0/AUTH 不再复用。
- 新 release worktree=`AIRoaming-release-r1-c4-8679d84`，v3 候选 plan/review 已在仓库外 0700 私有根生成：plan=`sha256:aca632bbf787971d918e8890a8f0d012b962a57ff2bc12c7c936200888081c7c`，check bundle=`sha256:a60d4a994f05dd093dbaf963d805138d6503407211802d4d5c131c0f96ad9803`，review packet=`sha256:55f3dc735947a6398620e089d5609f911a0ebaba659dc3f5a0342dfab5503680`。尚未生成 v3 SH-10 gate/C0/AUTH。
- 当前停止点：`waiting_v3_digest_bound_plan_review_confirmation`。需要 release owner 确认 v3 plan 与 review packet digest 后，才能生成 v3 gate、执行 C0，再重新生成 v3 AUTH-C1；C5/C7 仍不授权。

## 2026-07-14 v3 SH-10 与 C0 收口

- 用户确认 v3 plan=`sha256:aca632bbf787971d918e8890a8f0d012b962a57ff2bc12c7c936200888081c7c` 与 review packet=`sha256:55f3dc735947a6398620e089d5609f911a0ebaba659dc3f5a0342dfab5503680`。
- 新 release `8679d84e2655bbe8f7e1a3a752664befa0dee995` 的 v3 SH-10 check bundle=`sha256:d759be24450155a7c228aec901235ae63d9ca0e56da66f81ddbdb742a577fd2c`，SH-10 evidence=`sha256:473c62a8e70c318134b783d35b710afe037c717978f59ec0a99efa69fe7af502`，shadow gate=`sha256:ba5c324c40080b762b49396c88b04bb1d1d7f0376de0c7f66346a791867740fe`；文件 0600，gate reader 通过。
- v3 C0 从冻结 release 返回 `CUTOVER_C0_OK`、`replayed=false`，C0 evidence=`sha256:d09fd4d7663a4c651ea84f8fb2bca4ad0b4fe00d9f955411860fb781cf0bc6b6`；Scrutiny 核验 `completedThrough=C0`、链仅含 C0、无 AUTH/target/snapshot/runtime/credential expectations。
- 当前停止点：`blocked_waiting_v3_auth_c1`。旧 v2 AUTH-C1 不可复用；需要用户单独确认绑定 v3 C0 evidence，授权 C1 及 C3 只读 Keychain 验证，仍不授权 C5/C7。

## 2026-07-14 v3 AUTH-C1 与 C1～C4 收口

- 用户以“确认”绑定 v3 C0 evidence=`sha256:d09fd4d7663a4c651ea84f8fb2bca4ad0b4fe00d9f955411860fb781cf0bc6b6`，授权 C1/C2 及 C3 `already_sanitized/verify_existing` 只读凭据验证，未授权 C5/C7。
- 生成最终私有 0600 `AUTH-C1-final.json`，只保留一份有效授权；authorization digest=`sha256:536bd60c7fb72f91fcfc31e8a77791fec744b1d3299c68baca977eeb9f6b18f9`。此前两份格式错误的临时授权文件已删除，未被执行链接受。
- v3 C1=`CUTOVER_C1_OK`，evidence=`sha256:7111a994d16e2eb3ad7f7890dd14625c3017604cea5678519bbdb95df7a6c382`；C2=`CUTOVER_C2_OK`，evidence=`sha256:ac8b077628f6c2141d2fe7acf3a367c45ad4c2e7ed1204e1e53d94384bca968f`；C3=`CUTOVER_C3_OK`，evidence=`sha256:7e9d98e49358022557c5fb46636edc997099de54befa3a52adb9930a8d95c280`；C4=`CUTOVER_C4_OK`，evidence=`sha256:f4f46ea0c1641cf6e927f3257e47ee029732be95e809babb387f6614759195f1`。
- C4 final import、ready、pre-cutover backup 与 verify-only restore 均通过；backup digest=`sha256:3e4ffe7bdc494fd738d25ae6ac924f8573f6a08e1032802235270c1153cac723`，final report digest=`sha256:27567b5bb026c6f25994af074b8398e380073c84e07d376d05473084f7a5f7db`。settings 未写回，`app-settings.json` 当前 digest 仍为 `sha256:263586a8bba356fbcb744d83716db4855172c11f80a1106e5f8eefe24234bc83`。
- 当前 evidence manifest `completedThrough=C4`、evidence=`sha256:f4f46ea0c1641cf6e927f3257e47ee029732be95e809babb387f6614759195f1`；AUTH-C5/C7、C5～C7、activate、首笔业务写入和 R2 观察期均未执行。
- 运行边界：C1 维护控制面使用 v3 私有根内已迁移的隔离 SQLite（当前仓库没有可绑定的 source DB），因此本轮证据证明的是冻结 release 的维护/导入/备份链和真实 workspace 只读快照，不应表述为已完成生产 source 进程的真实停写切换；继续进入 C5 前需单独复核该边界并取得 AUTH-C5。

## 2026-07-14 v3 C1 验收否决与 v4 门禁补强

- Scrutiny 对照 Runbook 复核确认：v3 C1 的 maintenance server 为私有根内隔离 DB-mode 进程，不是 plan 绑定的旧 file 进程；同时执行时间早于人工冻结的 `2026-07-14 22:00～23:00 Asia/Shanghai` 窗口。v3 C1 不满足真实切换验收，v3 C1～C4 只保留 `passed_isolated` 证据，AUTH-C5 状态改为 `not_ready`。
- production maintenance 新增受 token/loopback 保护的只读 identity：显式返回 file mode、source workspace、release root、完整 app commit 与本进程随机 `runtimeInstanceId`；缺少显式绑定或 mode 非 file 时返回 503。
- C1 runner 在首次 drain 前强制验证维护窗口与 identity，close 后再次验证 identity，并要求 sealed runtime bundle 的 `runtimeInstanceId` 与前两次相同；错误进程、进程重启、错误 bundle 或窗口外执行均 fail-closed。
- plan reader 支持 loopback `/api` 根，校验 `Asia/Shanghai` 与显式 `+08:00` 的维护窗口；AUTH-C5/C7 固定确认语句已与 Runbook 对齐。
- 修复后的定向验证为 6 spec/52 tests；server 全量 71 spec/489 tests、workspace typecheck、server/web build、Prisma、G1、capability `blockedIds=[]` 与 `git diff --check` 全部通过。
- 代码已独立提交 `9227e8dfefde59a25f81b53a41074f3971c24d05`，冻结 release 为 `AIRoaming-release-r1-c1-identity-9227e8d`。临时 file-mode HTTP smoke 验证 `/api/_local/maintenance/identity`、错误 token=403、drain 前/close 后/bundle 实例一致；临时 workspace/token/server 已删除或停止。
- v4 Scrutiny=`passed`、Runtime=`passed_isolated`。下一步必须基于新 release 生成 plan/review，重新完成 SH-10/C0/AUTH-C1，再在窗口内从 C1 顺序重跑；旧 v3 evidence 和 AUTH 不复用。
- v4 四份候选已在仓库外私有根生成：plan=`sha256:290674add0e9bec645fd787f2da6b8d103665692c8eabb254f259be07afc8ce6`、human input=`sha256:17d4f95bfe310431dc0f2b4388c1848eb39c35244d5d6ef5ee2bd28a256ac8fd`、check bundle=`sha256:1e49e910b274b0aa155de9b6b68952273e8b2ced349f137d473381db71f705b7`、review packet=`sha256:d42300f03b0209bdfe508159eca73460bb7de52f8baf4ca8e304087e12aac1cb`。
- production plan status reader 返回 `completedThrough=null/evidenceDigest=null`；四个外层摘要和 SH-01～SH-10 嵌套摘要独立重算一致，SH-01～09 passed、SH-10 awaiting，sentinel hit=0。token/gate/AUTH/evidence/target 均不存在。
- 当前停止点：`waiting_v4_digest_bound_plan_review_confirmation`。下一步必须由人类确认实际 plan/review digest；该确认只允许生成 gate + 随机 token + 只读 C0，不自动授权 C1～C7 或 Keychain。

## 2026-07-14 v4 SH-10 与 C0 收口

- 用户精确确认 v4 plan=`sha256:290674add0e9bec645fd787f2da6b8d103665692c8eabb254f259be07afc8ce6`、review packet=`sha256:d42300f03b0209bdfe508159eca73460bb7de52f8baf4ca8e304087e12aac1cb`，明确只授权生成 gate 与只读 C0，未授权 C1～C7/Keychain。
- 生成 v4 SH-10 passed evidence=`sha256:46ed1af1f2f763c037ca491549008450093430d91b4267da8b3c9f2ae7674f78`、passed check bundle=`sha256:876165cb90197a27aacf3b39d64e2c413b1694f21b4e55c123144de5a67c6a46`、shadow gate=`sha256:718cb20eb099f28bac3dbca90b7f65da940b7c2b4a337c12a431dff0a5614d1f`；外层与嵌套摘要均独立重算一致。
- 生成随机 0600 maintenance token 后，从 frozen v4 release 执行只读 C0：`CUTOVER_C0_OK`，evidence=`sha256:021bd122001542eefecddd94207903afae9063a6f2e79c842584db9e8635e770`；status=`completedThrough=C0`，stepCount=1。
- C0 只验证 release/capability/roots/space/token/SH gate；未调用 maintenance API、SecretStore/Keychain、snapshot、Prisma migrate、final importer、backup/restore、archive、activate。AUTH-C1、C1～C7、真实停写均未执行。
- 当前停止点：`blocked_waiting_v4_auth_c1`。下一步必须单独确认绑定 C0 evidence 的 AUTH-C1；确认范围仅 C1/C2 与 plan 指定的 C3 `already_sanitized/verify_existing`，仍不覆盖 C5/C7。

## 2026-07-14 v4 AUTH-C1 已生成，等待维护窗口

- 用户确认 v4 C0、plan、release、备份与回滚责任人，授权进入 C1，并授权 C3 只读 Keychain 验证；明确未授权 C5/C7。
- 已生成私有 0600 `authorizations/AUTH-C1.json`，精确绑定 v4 C0 evidence=`sha256:021bd122001542eefecddd94207903afae9063a6f2e79c842584db9e8635e770`；authorization digest=`sha256:bae8fd939d441958244680ddd83d7c49addc4a95a24b1272a35e147d87db48dd`。授权文件通过 canonical digest、scope、ACK、identity 与权限复核；maintenance token 未打印。
- 当前时间早于 plan 绑定的 `2026-07-14 22:00～23:00 Asia/Shanghai` 窗口，未启动 source file runtime、未执行 drain/close、未访问 Keychain；不能提前运行 C1 或修改 plan/window。
- 当前停止点：`blocked_waiting_maintenance_window`。进入窗口后只允许以 v4 frozen release、plan 绑定 source workspace、显式 file mode 和同一 runtime identity 顺序执行 C1→C4；C5/C7 仍禁止。

## 2026-07-14 v4 窗口输入纠偏与 v5 候选

- 用户指出 `22:00～23:00` 不是实际要求。追溯确认该时间最初以“例如”出现，随后被错误当成正式 maintenanceWindow 写入并确认；根因是人工输入解析错误，不是代码硬编码。
- 使用现有 v4 plan/AUTH 对 C1 做无副作用复现，稳定返回 `CUTOVER_MAINTENANCE_WINDOW_CLOSED`；失败发生在 token/maintenance identity/drain/Keychain 之前，v4 evidence 仍为 C0，4310 无监听。
- 不篡改 v4 plan/evidence，创建 v5 私有候选，窗口调整为覆盖当前执行的 `2026-07-14 20:00～23:59 Asia/Shanghai`。plan=`sha256:2ba999ff...fc096`、human input=`sha256:68d6afe0...c33144`、check bundle=`sha256:7a206058...2919b`、review packet=`sha256:15b751e3...54f4de`。
- production plan reader 与所有外层/嵌套摘要复核通过；私有根 0700、四文件 0600，SH-01～09 passed、SH-10 awaiting；token/gate/AUTH/evidence/target 均不存在。
- 当前停止点：`waiting_v5_digest_bound_confirmation`。确认后才生成 v5 gate/C0/AUTH-C1 并执行 C1～C4；C5/C7 仍禁止。

## 2026-07-14 v5 SH-10 与只读 C0

- 用户精确确认 v5 plan=`sha256:2ba999ff...fc096`、review=`sha256:15b751e3...54f4de` 与 `20:00～23:59 Asia/Shanghai` 窗口，只授权生成 gate 和只读 C0，未授权 C1～C7/Keychain。
- 生成 passed check bundle=`sha256:c9b08578...ed82b2`、SH-10 passed evidence=`sha256:e5c36b49...ccced9`、shadow gate=`sha256:6e66e807...786670`；canonical digest 和权限复核通过。
- 随机 0600 maintenance token 已创建，内容未输出。frozen release 执行 C0 返回 `CUTOVER_C0_OK`、replayed=false、evidence=`sha256:385ab981...546d2`。
- Scrutiny=`passed`、Runtime=`passed_read_only`：manifest/step digest 可重算，completedThrough=C0；无 AUTH/runtime bundle/target/snapshot/backup/archive，4310 无监听，未访问 Keychain。
- 当前停止点：`blocked_waiting_v5_auth_c1`。必须由用户精确绑定 v5 C0 evidence 后，才能执行 C1～C4；C5/C7 仍禁止。

## 2026-07-14 执行角色纠偏

- 用户澄清：现有文档本来就是给 Luna 的执行计划，Luna 应按文档执行；Codex 不应切换成 Worker 自己执行，也不应把计划变成逐步审批表。
- 已在现有 `v5_immediate_window_handoff.md` 和 Runbook 中明确：用户把 handoff 交给 Luna 并说“按本文执行”即为本次 AUTH-C1 的人工授权来源；Luna 生成绑定 v5 C0 的机器授权后连续执行 C1～C4，中间不逐步询问。
- 不新建重复 Luna 文档。当前 v5 C0 保留为已完成只读基线；下一执行者为 Luna，从 AUTH-C1/C1 开始，C4 后停止。AUTH-C5/C7 仍不在范围内。

## 2026-07-14 Luna Worker 执行 v5 C1～C4

- 用户将既有 v5 handoff/Runbook 作为 Worker 任务下发，授权范围为 C1～C4；C3 仅只读 Keychain verify，未授权 C5/C7。
- 生成 AUTH-C1=`sha256:e2f3b337...93008e`，绑定 C0=`sha256:385ab981...546d2`；从 frozen release 启动 plan 绑定的 file runtime，C1=`CUTOVER_C1_OK`。
- C2=`CUTOVER_C2_OK`，source=`sha256:c16ff088...4beebb`，snapshot=`sha256:af33a4aa...79804e`；source 未被改写。
- C3=`CUTOVER_C3_OK`，settings=`already_sanitized/verify_existing`，只读验证 Keychain，settings digest 仍为 `sha256:263586a8...34bc83`。
- C4=`CUTOVER_C4_OK`，final report=`sha256:96497455...d61e72b`，pre-cutover backup=`sha256:960ae2bd...2e89f1`，verify-only restore 通过。
- 最终 manifest `completedThrough=C4`、evidence=`sha256:69d08d7b...6328642`；服务已停止，4310 无监听；无 C5/C6/C7 evidence、C6_READY/COMPLETED、activate 或首笔业务写入。
- 当前停止点：`blocked_waiting_auth_c5`。必须另行授权 AUTH-C5，不能由本轮 C1～C4 自动推导。
