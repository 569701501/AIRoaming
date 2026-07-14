---
doc_id: AIR-RCUT-PROGRESS-001
status: in_progress
created: 2026-07-13
updated: 2026-07-14
owner: AI漫游项目
audience: orchestrator, worker, reviewer, human
source: R0-R2 task_plan
---

# R0-R2 进度

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
- 发布冻结只读门禁通过：workspace/server typecheck、server/web build、Prisma validate、G1 manifest/schema/migration、capability `blockedIds=[]`；Node=`v22.22.2`、pnpm=`7.12.1`、effective schema manifest=`sha256:ad3b0e1ba884e20718e6e81994cbb8beaedbb9e6777e471ac2a21e4c94c2b1ea`。
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
