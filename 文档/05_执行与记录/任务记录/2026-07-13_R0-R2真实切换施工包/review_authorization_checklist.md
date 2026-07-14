---
doc_id: AIR-RCUT-REVIEW-001
status: active
created: 2026-07-13
updated: 2026-07-14
owner: AI漫游项目
audience: reviewer, qa, release-owner, human, ai-agent
source: R0-A 实施契约、R1 Runbook、G1 正式验收清单
---

# R0-R2 复核、授权与回滚清单

当前快照：v5 `completedThrough=C7`，evidence=`sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452`，R2=`DB_ONLY_OBSERVATION_PASSED`。AUTH-C5/AUTH-C7/R2 已消费；首写/file guard、OBS-01～10 与双 Review 已通过；v1～v4 和旧授权只作历史，不得覆盖本快照。后续不设置工期或等待日期。

## 1. 使用规则

- Worker/Luna 只能勾选“实现完成”和自动测试结果，不能勾选 Scrutiny、SH-10 或真实授权。
- Scrutiny Reviewer 只读复核，不在复核阶段修代码。
- Runtime Reviewer 的 `passed_isolated` 不等于真实切换授权。
- AUTH-C1/C5/C7 必须是三个独立、绑定当前 evidence digest 的授权文件，不能用一次“继续”覆盖全部阶段。
- 任一身份、路径、digest 或责任人变化，旧授权失效。

## 2. R0-A Scrutiny Review

### SecretStore

- [x] final/ready 生产入口不再硬编码 fake adapter/root。
- [x] production 通过 SecretStore 窄接口验证 Keychain health 和 fingerprint。
- [x] 自动化测试只用 fake store/fake executor，真实 `security` 调用为 0；另有授权 disposable smoke，未触碰默认用户 Keychain。
- [x] Keychain put 的 args 不含 secret；不存在 `-w <secret>`，敏感输入不进入继承 stdout/stderr 或错误对象。
- [x] secret 不进入 argv/stdout/stderr/evidence/DB/backup/archive/git。
- [x] legacy plaintext 使用 prestage→verify→atomic redact；失败旧字节不变。
- [x] 已脱敏起点不恢复 plaintext、不重写 secretRef。

### Runtime bundle

- [x] closed profile 验证 top-level active mutation/stream=0。
- [x] 每个 participant active/queued=0、blockedReason=null。
- [x] 缺字段、旧弱 bundle、digest/secret 篡改均拒绝。

### Evidence/Activate

- [x] evidence manifest 含 cutoverId/appCommit/plan/run/source/snapshot/decisions/effective identity。
- [x] step/manifest/C6_READY/COMPLETED canonical digest 可重算。
- [x] temp→fsync→rename→parent fsync；失败不推进。
- [x] activate 的 maintenance/evidence/authorization 字段 required。
- [x] CLI 缺任一字段在 Prisma 初始化前失败。
- [x] activate 复用单一 verified evidence loader，不保留弱 parser。
- [x] C6_READY 必须验证内容 digest，不只判断存在。
- [x] dry-run 零写；execute 只写 db_only+activatedAt。

### Production runner

- [x] `db:cutover status/step` 入口存在且 exact grammar。
- [x] C0 是无 AUTH 的只读证据步；C0 passed 后才能生成 AUTH-C1。
- [x] 一次只执行下一 step；同输入 replay、不同输入冲突。
- [x] C0～C7 调用真实 domain service，不用 marker 代替（仅隔离执行，真实运行仍待授权）。
- [x] C6 真实调用 MetadataArchiveService。
- [x] C7 顺序固定为 activate→evidence→COMPLETED→reopen→first write（隔离 fresh 链）。
- [x] child process 不使用 shell，测试可注入 fake executor。
- [x] 所有自动化测试仅临时根；disposable smoke 仅使用临时 HOME/Keychain，无默认用户 Keychain、真实 DB、provider、workspace 操作。

### 回归与文档

- [x] R0-A 矩阵所有自动化项 passed_isolated；RCUT-SEC-13 为 `passed_real_disposable`。
- [x] server 全量、typecheck、build、Prisma/G1/capability/diff check 全绿。
- [x] progress/findings/完成记录或阶段记录已同步。
- [x] 未跟踪 DB、图片、secret、真实报告、绝对路径或大型 trace。

Scrutiny 输出：

```text
结论：passed / changes_requested
生产 SecretStore：
证据/activate 绕过检查：
runner C0～C7 完整性：
测试隔离：
残留风险：
```

## 3. R0-A Runtime Review（隔离）

- [x] 两个 fresh 临时根完成完整 C0～C7（真实 domain service，fake maintenance/SecretStore，仅隔离 SQLite）。
- [x] C5 smoke 失败路径已通过隔离测试。
- [x] C7 crash/reopen、first-write/file-guard 故障路径已通过隔离 fresh 链。
- [x] RCUT-RB-01 C1～C4 统一失败矩阵完成。
- [ ] 真实 Prisma migrate/final/ready/backup/materialize/API/activate/first write。
- [ ] 允许的 fake 仅 SecretStore/provider/command executor。
- [ ] resume、tamper、C4 failure、C5 failure、C7 crash-reconcile 通过。
- [ ] fake executor 证明未调用系统 `security` 和真实应用进程。
- [ ] 全根 sentinel scan=0（fake secret root 单独 allowlist）。

Runtime 输出状态只能是：

```text
passed_isolated
changes_requested
```

## 4. R0-B Release/Plan Review

- [x] R0-A 独立提交已固定且工作树干净。
- [x] release appCommit、Node/pnpm/Prisma、schema/migration checksum 冻结。
- [x] plan 文件 0600；既有私有 evidence/backup/restore/archive roots 0700。
- [ ] 所有真实路径由 release owner 在仓库外填写。
- [ ] 根两两不重叠，目标为空，无 symlink，空间足够。
- [ ] maintenance loopback/token file 权限通过。
- [ ] 当前 settings 起点与 plan 一致：实际 source inspection=`already_sanitized`，但冻结 plan 仍为 `legacy_plaintext_requires_two_phase`，credential action=`prestage_legacy`；需重新生成一致 plan。
- [ ] Keychain 与 OpenCode auth 责任边界确认。
- [x] release-specific SH-01～09 全绿。
- [x] Migration reviewer 完成 SH-10；报告 blocker=0，warning 已接受，digest-bound gate 已通过生产 reader 校验。
- [x] rollback owner、窗口和恢复联系人已登记在仓库外 0600 私有记录。

2026-07-14 digest-bound gate/C0 说明：私有 plan=`sha256:d08b7e3a...12da`、review packet=`sha256:a28ab7e1...35fd` 已由人类明确确认；SH-10 evidence=`sha256:b0d58efe...518e21`、gate=`sha256:e5d150ae...439d3c` 已通过生产 reader 与独立重算。maintenance token 已按 C0 前置生成并为 0600；C0 返回 `CUTOVER_C0_OK`，evidence=`sha256:3444ae2d...9a3ba11`。根/空间只读复核已通过。

2026-07-14 v2 修复说明：上述已勾选的 SH-10/C0/AUTH 只对旧 identity 有效，不能用于 v2。当前恢复门如下：

- [x] source settings 由冻结 release 生产 reader 确认为 `already_sanitized`，且 digest 与旧 C2 manifest 一致。
- [x] v2 plan 已使用 `already_sanitized/verify_existing`，plan=`sha256:675bb346...6e185af`；正式 reader 与独立摘要复核通过。
- [x] 人类明确确认 v2 plan=`sha256:675bb346...6e185af` 与 review packet=`sha256:52b31571...7c522f` 的 digest 绑定。
- [x] 基于该确认生成并复核 v2 SH-10 passed evidence=`sha256:89248a11...6e15c9` 与 shadow gate=`sha256:be1209a7...047414`。
- [x] 运行并复核 v2 C0：`CUTOVER_C0_OK`，evidence=`sha256:e173a8e0...262cf1`。
- [x] 取得精确绑定 v2 C0 evidence 的新 AUTH-C1；authorization=`sha256:ef5d3e50...f7f0a`。

当前停止点已从 `blocked_waiting_v2_auth_c1` 推进到 v2 C4 backup 失败；v2 C5/C7 仍未授权且未执行。

2026-07-14 v3 release 修复门：

- [x] C4 backup workspace 缺陷修复已提交 `8679d84e2655bbe8f7e1a3a752664befa0dee995`，隔离 5 files/70 tests 通过。
- [x] v3 plan 使用 `already_sanitized/verify_existing`，plan=`sha256:aca632bb...8081c7c`。
- [ ] 人类确认 v3 plan=`sha256:aca632bb...8081c7c` 与 review packet=`sha256:55f3dc73...503680`。
- [ ] 生成 v3 SH-10 gate、重新执行 C0，再生成绑定 v3 C0 的 AUTH-C1。

当前停止点：`waiting_v3_digest_bound_plan_review_confirmation`。

不得写入仓库的字段：

```text
真实绝对路径
用户名/账户名
token file 内容
secretRef 原值
Keychain 输出
用户正文、完整 prompt、真实图片
```

## 5. C0 与 AUTH-C1

C0 先行检查：

- [x] C0 未接收 authorization file，只执行 release/capability/root/space/SH-01～10 的只读检查。
- [x] C0 passed evidence 可独立重算，planDigest 与 R0-B 冻结值一致；evidence=`sha256:3444ae2d...9a3ba11`。

授权文件检查：

- [x] scope=`AUTH-C1`；私有文件 0600。
- [x] cutoverId/appCommit/planDigest/runId/evidenceDigest 精确匹配 C0 passed gate；evidence=`sha256:3444ae2d...9a3ba11`。
- [x] 用户确认只授权停写及 plan 指定的 C3 Keychain verify/prestage，不授权 C5/C7。
- [x] authorizedAt/authorizedBy/authorizationDigest 有效；authorization=`sha256:d310d5fe...e9472eb3`。
- [x] Luna/Codex 没有代签；授权来自用户明确确认。

缺失时最终结论：`blocked_waiting_auth_c1`（已被用户 AUTH-C1 确认取代；当前实际停止点为 `blocked_before_c3_settings_start_state`）。

v2 当前状态：旧段落仅是历史 identity 记录。v2 C0 evidence=`sha256:e173a8e0...262cf1` 已通过，但 v2 AUTH-C1 尚未生成；当前结论为 `blocked_waiting_v2_auth_c1`。

### v3 当前状态（2026-07-14）

- [x] v3 plan/review digest 已由用户确认；plan=`sha256:aca632bb...8081c7c`、review=`sha256:55f3dc73...503680`。
- [x] v3 SH-10 gate 与 C0 通过；C0 evidence=`sha256:d09fd4d7...bc6b6`。
- [x] v3 `AUTH-C1-final.json` 绑定 C0 evidence，authorization=`sha256:536bd60c...b18f9`，文件 0600。
- [x] v3 C1/C2/C3/C4 runner 顺序完成，manifest `completedThrough=C4`、evidence=`sha256:f4f46ea0...195f1`；仅保留为 `passed_isolated`。
- [ ] AUTH-C5 未生成；C5/C6 未执行。
- [ ] AUTH-C7 未生成；C7/activate/首笔业务写入未执行。
- [x] 独立复核确认 v3 C1 使用隔离 DB-mode maintenance server，未绑定 plan 的真实旧 file 进程，并早于已绑定维护窗口执行；v3 C1 不满足真实验收。
- [x] v4 修复提交、冻结 release、plan/review/SH-10/C0/AUTH-C1 已完成；但 release owner 已否决误由示例产生的 22:00～23:00 窗口，v4 不再进入 C1，也不得申请 AUTH-C5。

### v4 当前状态（2026-07-14）

- [x] C1 identity/window/runtime-instance 门禁修复提交 `9227e8d`；Scrutiny=`passed`、Runtime=`passed_isolated`。
- [x] frozen release build、G1、capability 与临时 file-mode HTTP identity smoke 通过。
- [x] v4 私有候选文件 0700/0600；production plan reader 与全部外层/嵌套摘要重算通过。
- [x] v4 plan=`sha256:290674add0e9bec645fd787f2da6b8d103665692c8eabb254f259be07afc8ce6`。
- [x] v4 review packet=`sha256:d42300f03b0209bdfe508159eca73460bb7de52f8baf4ca8e304087e12aac1cb`。
- [x] 人类已确认上述两个实际 digest；生成 SH-10 passed evidence=`sha256:46ed1af1...674f78`、gate=`sha256:718cb20e...614d1f`。
- [x] v4 只读 C0=`CUTOVER_C0_OK`，evidence=`sha256:021bd122...5e770`；链仅含 C0，token 为随机 0600 文件。
- [x] v4 AUTH-C1=`sha256:bae8fd93...7db48dd` 已生成；C1 在维护 API 前以 `CUTOVER_MAINTENANCE_WINDOW_CLOSED` 无副作用失败，证据仍止于 C0。
- [x] v5 candidate 窗口=`20:00～23:59`，plan=`sha256:2ba999ff...fc096`、review=`sha256:15b751e3...54f4de`；当前时间验证位于窗口内。
- [x] v5 digest-bound 人工确认、SH-10 gate 与只读 C0 已完成；C0 evidence=`sha256:385ab981...546d2`。
- [x] v5 AUTH-C1=`sha256:e2f3b337...93008e`；C1/C2/C3/C4 全部通过，最终 evidence=`sha256:69d08d7b...6328642`。
- [ ] v5 AUTH-C5 未生成；C5/C6、C7、activate、首笔业务写入仍未执行。

当前停止点：`blocked_waiting_auth_c5`。C4 后必须取得独立 AUTH-C5，不能由 AUTH-C1 或本轮任务下发覆盖。

## 6. C1～C4 运行复核

- [x] 旧 identity C1/C2 已完成并留作历史；不用于 v2/v3。
- [x] v2 AUTH-C1 精确绑定 v2 C0；v2 C1=`963458ca...6809f8`、C2=`5e740004...a5b1`、C3=`ca03a721...21cb2`。
- [ ] v2 C4 final/backup/restore：final/ready 已完成，但 backup=`BACKUP_ASSET_MISMATCH`，未写 C4 evidence。
- [x] v3 C1～C4 已重跑，但因 C1 控制面与窗口不合格，只能作为隔离证据，不能勾选真实运行验收。
- [x] v4 C1 门禁必须校验 `maintenanceWindow`、`persistenceMode=file`、source/release/commit 和三方一致的 `runtimeInstanceId`。
- [x] Luna 根据任务下发生成精确绑定 v5 C0 的 AUTH-C1，从 v5 C1、C2、C3、C4 顺序执行并复核。
- [x] ready identity 精确；activatedAt/firstBusinessWriteAt=null。
- [x] v5 起点为 `already_sanitized/verify_existing`；legacy plaintext 清除不适用，settings 未写回。
- [x] pre-cutover backup sealed；verify-only/materialize/API/Asset hash 全绿。
- [x] C0～C4 evidence 可由 production reader 独立读取并重算。

历史 C3 阻塞已由 v2 `already_sanitized/verify_existing` 关闭；当前 v2 C4 的阻塞是 backup workspace 参数缺陷，已由 `8679d84` 修复，必须在 v3 release identity 上重新走 C0/AUTH。

v2 修复状态：一致 plan 与新 C0 已完成；C3 原因已关闭，但 v2 证据链仍必须在新 AUTH-C1 后从 C1、C2 顺序重建，不能直接跳到 C3。

## 7. AUTH-C5 与 C5/C6

当前为 `passed_consumed`：v5 C1～C6 与独立复核已通过；C4 evidence=`sha256:69d08d7b8a28343907fa939d4f6040d7807247eb46f9a2c39512c806f6328642`，C6 evidence=`sha256:da5227c0c460fd07eed85d5148595a3ea7b2ee11d2c882ac64ded1783f48f19b`。AUTH-C5 已绑定并消费，当前转入 AUTH-C7。

- [x] AUTH-C5 绑定 C4 evidence digest，authorizationDigest=`sha256:404fa13217b41f74da538393471e188cc3af15ec63606eb7d781503d4a0f5e25`。
- [x] 用户明确授权关闭旧 file 进程并进入 smoke/archive，未授权 C7。
- [x] C5 DB-mode closed 启动健康，关键只读路径通过；`CUTOVER_C5_OK`。
- [x] ephemeral business write 完整 rollback，firstBusinessWriteAt=null。
- [x] 日志无 fallback/secret/未处理 lease/outbox。
- [x] C6 archive metadata-only、Asset bytes 未复制、活动 Asset 可读；`CUTOVER_C6_OK`、C6_READY 已校验。
- [ ] archive/evidence/runtime roots secret scan=0。
- [ ] C6_READY 内容与 manifest digest 精确一致。

缺失时最终结论：`blocked_before_activation`。

收到有效 AUTH-C5 后，Luna 立即连续执行 C5→C6；不得根据日期等待，也不得在 C5 通过后再次询问是否执行 C6。

## 8. AUTH-C7 与不可逆边界

- [ ] AUTH-C7 绑定最新 C6 evidence digest。
- [ ] 用户明确理解首次业务写后禁止 file-only/down migration。
- [ ] activate dry-run 零写且全绿。
- [ ] execute 前 PersistenceState=ready、firstBusinessWriteAt=null。
- [ ] execute 后仅 db_only+activatedAt。
- [ ] C7/COMPLETED 在 reopen 前落盘并复核。
- [ ] 第一笔真实业务写与 firstBusinessWriteAt 同事务。
- [ ] file bridge 启动明确拒绝。

缺失时不得把状态写成 `real_cutover_completed`。

## 9. 回滚决策

| 时点 | 允许动作 | 禁止动作 |
| --- | --- | --- |
| C0 前或 C0 失败 | 修文档/plan，重新运行 C0；不得生成授权 | 无授权停写 |
| C1～C3 失败 | 保持旧进程 closed；授权后 reopen；清理新目标/prestage | 双边写、恢复 plaintext 副本 |
| C4 失败 | 丢弃目标；按 settings 起点从 Keychain 或旧字节恢复服务 | 伪造 ready、跳过 blocker |
| C5/C6 失败且无首写 | 使用 snapshot/runtime/pre-cutover 证据恢复同 bridge release | 更旧应用、down migration |
| execute 后无首写 | 仅经授权恢复 pre-cutover bundle或 reconcile C7 | 手改 PersistenceState |
| 首写后 | 兼容 DB 应用或 coordinated backup restore | file-only、自动 down、旧 metadata 覆盖 DB |

每次回滚必须新建 rollback run/evidence，不删除原 final/cutover 证据。

## 10. R2 观察期与最终结论

- [x] OBS-01～05 `passed_real`。
- [x] OBS-06 通过：0011 三事实守卫下协调 pointer teardown，原阻塞项目 purge 成功，Outbox 审计保留。
- [x] OBS-07～10 全部 `passed_real`。
- [x] 观察期内未读写旧业务 JSON/Markdown 作为运行态事实源。
- [x] 三次重启、任务 crash、迟到结果、Asset 恢复、删除 Outbox、backup restore 通过。
- [x] 真实项目 2 个章节逐一只读可用，67/67 ready Asset 匹配。
- [x] 全局 secret scan=0（427 文件、4 SQLite）。
- [x] 旧 metadata/backup 仍保留，未自动删除。

允许的状态流：

```text
production_entry_changes_required
-> ready_for_real_cutover_authorization_review
-> blocked_waiting_auth_c1
-> authorized_for_c1
-> blocked_waiting_auth_c5
-> authorized_for_c5
-> blocked_waiting_auth_c7
-> authorized_for_c7
-> real_cutover_completed
-> db_only_observation_passed
```

只有 `db_only_observation_passed` 后，才允许进入 G4。
