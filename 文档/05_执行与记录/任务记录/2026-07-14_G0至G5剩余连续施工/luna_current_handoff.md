---
doc_id: AIR-G05-LUNA-CURRENT-HANDOFF-001
status: active
created: 2026-07-14
updated: 2026-07-15
owner: AI漫游项目
audience: luna, human, release-owner, migration-reviewer, qa
source: v5 C0～C7 production evidence、R2 OBS-01～10、G0～G5 总计划、用户无排期要求
---

# Luna 当前连续执行入口（无排期）

## 1. 任务目标

R2 DB-only 观察与 G4-A～F 已通过，从 G5-M0 开始把剩余主线按依赖顺序尽快连续推进到 G5 用户签收点：

```text
AUTH-C5 -> C5 -> C6 -> AUTH-C7 -> C7 -> R2 -> G4-A～F -> G5-M0～M8 -> 用户签收
```

本文件是 Luna 当前唯一总执行入口。不要重做 S0、W1、R0B、SH-10、C0～C7 或 R2；不要根据旧 `WAIT_R0B_AUTH`、`BLOCKED_R2_OBS_06_PURGE`、`BLOCKED_R2_OBS_07_DB_ONLY_BACKUP` 文档回退状态。

## 2. 无排期执行规则

1. 本计划不设置工期、预计天数、开始日期、结束日期或“等到某日再执行”。
2. frontmatter、进度记录和 evidence 中的日期只用于留痕，不是任务触发器，也不是最早开工时间。
3. 当前人工授权满足后立即执行获授权区间；区间内前一步通过就立即进入后一步，不等待、不逐步询问。
4. 只在本文件列出的人工门、fail-closed blocker、无法保留用户改动、G5 E0 无候选通过硬门或最终用户签收处暂停。
5. 速度优先服从证据与安全边界：不得用跳过测试、伪造 evidence、复用旧 AUTH、扩大授权范围或覆盖用户改动换取速度。
6. v5 plan 中的历史 `maintenanceWindow` 只绑定已完成的 C1 安全证据，不是 C5～G5 的排期；不得因为该窗口已结束而等待或重建剩余任务计划。

## 3. 当前不可覆盖事实

```text
branch = codex/g0-test-safety-net
cutover evidence appCommit = 9227e8dfefde59a25f81b53a41074f3971c24d05
current compatible implementation commit = 81c922a
cutoverId = cutover-20260714-immediate-sanitized-v5
planDigest = sha256:2ba999ffee2061cdf57110fc10cf4720748431ba1aeaf603dab12c19863fc096
completedThrough = C7
currentEvidence = sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452
currentState = G5_M0_IN_PROGRESS
```

已经完成：S0、W1、R0B、SH-10、C0～C7 激活、首笔 DB-only 写入、R2 OBS-01～10、R2 Scrutiny/Runtime Review、G4-A～F，状态=`G4_PASSED`。

尚未完成：G5-M0～M8、G5 用户签收。

## 4. Luna 开始前只读核验

按顺序读取：

1. 本文件。
2. `authorization_gates.md`。
3. `文档/05_执行与记录/任务记录/2026-07-13_R0-R2真实切换施工包/real_cutover_runbook.md` 第 11 节以后。
4. `文档/05_执行与记录/任务记录/2026-07-13_R0-R2真实切换施工包/v5_c1_c4_scrutiny_review.md`。
5. `task_plan.md`、`implementation_contract.md`、`test_matrix.md`、`review_checklist.md`。
6. G4/G5 正式方案、契约与验收清单。

执行只读断言：

- 当前分支历史必须包含上述 compatible implementation commit；cutover evidence 继续绑定历史 appCommit，不能用新提交重签旧 evidence。后续只含文档的留痕提交不构成身份漂移。开发工作树中的用户改动不得覆盖、清理或混入提交。
- production status 精确为 `completedThrough=C7`，evidence 精确等于上述 currentEvidence。
- C4 final/ready/backup/restore、C5 closed DB smoke、C6 archive/C6_READY 证据可重算；首笔业务写已记录。
- AUTH-C5、C5、C6、C6_READY、AUTH-C7、C7、COMPLETED 已存在并绑定；`firstBusinessWriteAt=2026-07-14T13:40:39.000Z`。R2 已获授权并通过 OBS-01～10 与双 Review。
- 私有 run root/authorization/evidence 权限仍满足 0700/0600；不打印真实路径、token、credentialId 或 Keychain 输出。

任一身份或 digest 不同，停止并报告 `IDENTITY_OR_EVIDENCE_DRIFT`；不得猜“最新 run”或改用其他 identity。

## 5. AUTH-C5 / C5 / C6（已完成）

用户已明确授予 AUTH-C5；AUTH-C5 已绑定 C4 evidence=`sha256:69d08d7b8a28343907fa939d4f6040d7807247eb46f9a2c39512c806f6328642`，C5/C6 已连续执行通过。

- C5：`CUTOVER_C5_OK`，step=`sha256:f97780fc3594f0299df118b64fe4809d40465f3a9c27382ef0c8e06b0228204c`。
- C6：`CUTOVER_C6_OK`，step=`sha256:500859d1c9599d95d65a832bfbd9764df55f1268c57b5fa2c37acc65e80cb5bf`，archive=`sha256:80d98d65c198ab75c843978da26d8bfdf10a1798f6149c99ca9b4a63320e633a`。
- C6_READY 已生成，manifest/evidence=`sha256:da5227c0c460fd07eed85d5148595a3ea7b2ee11d2c882ac64ded1783f48f19b`。
- C5/C6 期间未执行 C7、activate、COMPLETED 或首笔业务写入。

当前已推进到 C7 激活完成；首笔业务写入已完成。

## 6. AUTH-C7 / C7（已完成）

用户已明确授予 AUTH-C7；授权文件已绑定 C6 evidence=`sha256:da5227c0c460fd07eed85d5148595a3ea7b2ee11d2c882ac64ded1783f48f19b`。

- C7 返回 `CUTOVER_C7_OK`，step=`sha256:d66707e25179cc01e53dda48a1a7130986f1c81d59d63b736387bc0e5135af60`。
- production status=`completedThrough=C7`，evidence=`sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452`。
- `COMPLETED` 已生成，`activationState=db_only`，`activatedAt` 已记录；首笔业务写入时间为 `2026-07-14T13:40:39.000Z`。
- C7 runner 在 activation 后按设计停止，没有替用户执行业务数据写入；file bridge 在首写前仍处于允许回退窗口。

## 7. C7 后首笔业务写入边界（已完成）

首笔业务写是 C7 激活后的真实运行路径，不由 C7 activation runner 自动伪造。本次已在目标 DB 内执行最小语义变更（项目描述同值更新），事务内记录 `firstBusinessWriteAt`。

- `activationState=db_only` 保持不变。
- `firstBusinessWriteAt=2026-07-14T13:40:39.000Z`。
- file bridge 复核返回 `FILE_MODE_FORBIDDEN_AFTER_FIRST_WRITE`。

首写边界已完成；R2 OBS-01～10 与双 Review 均已通过。

## 8. 第三人工门：R2 观察授权

用户已发送 `authorization_gates.md` 中的 R2 固定授权文本。OBS-01～10 已真实执行，Scrutiny 与 Runtime/User Review 均为 `passed`，状态为 `DB_ONLY_OBSERVATION_PASSED`。

- OBS-06：0011 forward migration 仅放行三事实守卫下的协调 purge；原阻塞项目已清除，processed Outbox 审计行保留。
- OBS-07：`db-only-coordinated` sealed backup、verify-only、fresh materialize 和当前应用读回通过；目标/备份/恢复 DB 摘要一致。
- OBS-08：1 项目、2 章节逐一可读；67/67 ready Asset 经官方文件服务校验；读前后 DB 摘要不变。
- OBS-09：只修改 archive 副本，原 archive、目标 DB 与运行态不变。
- OBS-10：427 文件、4 SQLite，raw/JSON key/DB value 均 0 命中，symlink=0。

R2 不再阻塞 G4/G5。backup/archive 保持不动，不执行 down migration，不进入 G6/视频链路。

<!--
-->

## 9. G4 连续区间

严格按 `task_plan.md` 的 G4-A～F 执行：

```text
G4-A Shared + Schema overlay
-> G4-B 纯规则与影响 Resolver
-> G4-C 事务命令与 API
-> G4-D 工作流、任务和迟到结果门禁
-> G4-E Web 返修工作台
-> G4-F migration / E2E / Review / 独立提交
```

每个切片都要形成契约、失败测试、实现、定向测试、全量回归、证据、Scrutiny、Runtime/User Review 和可回退提交。一个切片通过后立即开始下一切片；遇到普通实现失败先按文档修复和复测，不把正常返工当成人工授权门。

G4-A 已由提交 `79dc806` 完成：Shared/parser、0012 线性历史 overlay、12 段 ledger、legacy importer 与旧状态权威清理通过静态和隔离运行复核。

G4-B 已由提交 `9cd599a` 完成：状态机/replay、严格 lock set codec 与 known-answer、Working Copy dependency projector、Layout/Export freshness、统一 impact resolver/digest 均通过静态和隔离运行复核。

G4-C 已由提交 `179be50` 完成：preview/commit/history/favorite/reject/restore/complete、事务内 impact/CAS、丢响应 replay、双 writer 与旧 Server DB 权威入口删除均通过 fresh SQLite/真实 HTTP 隔离复核。

G4-D 已由提交 `894d1e8` 完成：Workbench/ProductionState source summary、工作流 needs_update、stale/unresolved/digest Server 事务门禁、运行中旧任务 historical fence、新 Candidate 隔离和 restart 均通过。

G4-E 已由提交 `3826611` 完成：DB Workbench 权威刷新、Web 收藏/废弃/恢复、两阶段 lock/replace/clear、409 重新 preview 不自动 commit、历史与排版 stale 摘要均通过；完整 Server 533/533、Shared 54/54、DB-only Playwright 1/1。

G4-F 已由提交 `81c922a` 完成：legacy direct evidence/conflict/unresolved、A→B→clear→A、已导出后新 Candidate、双窗口、运行中任务、restart/backup restore 和总体双 Review 均通过；Server 535/535 两轮、Shared 54/54、migration 78/78、DB-only Playwright repeat 3/3。G4 总体=`G4_PASSED`，当前进入 G5-M0；不得重做 G4-A～F。

## 9. G5 连续区间

严格按 M0～M8：

```text
M0 fixture 与红灯
-> M1/E0 两条完整技术薄切片
-> M2 Layout Domain Kernel
-> M3 Schema / Working Copy / 编辑器外壳
-> M4 画格、图片、模板、裁切
-> M5 富文本、气泡、字体
-> M6 来源返修、Revision、历史、预检
-> M7 固定 renderer、PNG/PDF/条漫、manifest
-> M8 手机预览、AI 权限、legacy cutover、完整 Review
```

E0 只有两种合法结果：

- 至少一条候选通过全部硬门且许可证可接受：记录 ADR，立即进入 M2。
- 没有候选通过，或结果需要新的付费/系统权限/产品决策：停止并提交对比证据，状态为 `BLOCKED_G5_E0_DECISION`。

M2～M8 连续执行，不做 G6 ZIP/视频。完成后交付真实页面路径、PNG/PDF/条漫样例、三次确定性 sha、性能/字体/许可证证据和完整 Review，停止在 `WAIT_G5_USER_ACCEPTANCE`。

## 10. 唯一合法停止点

| 状态 | 为什么停 | 恢复条件 |
| --- | --- | --- |
| `WAIT_AUTH_C5` | C4 后人工门（已通过） | 不适用 |
| `WAIT_FIRST_BUSINESS_WRITE` | C7 activation 后首写边界 | 首写/file guard 证据后申请 R2 |
| `WAIT_R2_AUTH` | C7 后真实观察授权门 | 用户明确 R2 授权 |
| `BLOCKED_R2_OBS_06_PURGE` | 历史状态，已由 0011 与真实 purge 复核关闭 | 不再作为恢复点 |
| `BLOCKED_*` | fail-closed、身份漂移、证据损坏或无法保留用户改动 | blocker 修复并重新复核；不得按日期自动恢复 |
| `BLOCKED_G5_E0_DECISION` | E0 无候选过硬门或需要新授权 | 用户完成技术/许可/权限决策 |
| `WAIT_G5_USER_ACCEPTANCE` | G5 运行产物需最终签收 | 用户签收 |

除此之外，不因“一个文件完成”“一个测试完成”“一个切片提交完成”或“今天先到这里”停止。

## 11. 每阶段回报模板

```text
阶段：<phase>
结论：passed | changes_required | waiting_human_gate | blocked
基线：<appCommit / evidence / branch>
实现：<真实改动>
测试：<命令、数量、退出码>
Scrutiny：<结论>
Runtime/User Review：<结论>
证据：<仓库相对路径或脱敏 digest>
真实操作边界：<数据 / Keychain / credential / provider / AUTH>
未完成：<明确 blocker；没有则写无>
下一动作：<立即执行的下一阶段或唯一人工门>
```

不要在回报中写预计天数、截止日期或下一阶段开始日期。
