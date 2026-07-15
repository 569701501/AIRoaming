---
doc_id: AIR-M6-A1-REVIEW-001
status: superseded
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa, reviewer
source: M6-A1 实施契约与测试矩阵
---

# M6-A1 复核清单

本清单由 Worker 完成后交给 Scrutiny/Runtime 角色复核；最终勾选仅表示隔离工程证据通过，不表示真实切换已执行。

## 1. A1-0 状态纠偏

- [ ] 旧 M6 tooling 记录保留为历史事实，但原 Scrutiny/Runtime “通过”已标记 superseded。
- [x] 当时隔离 evidence 判定已完成；production entry 后续复核将总体状态纠正为 `production_entry_changes_required / real_cutover_no_go`。
- [ ] M6-A1 测试先出现预期红灯，再进入实现。

## 2. Backup / Restore

- [ ] `BackupInput`/`BackupManifest` 是 coordinated/pre-cutover 判别联合。
- [ ] pre-cutover 必须绑定 succeeded final run、16 slice report、ready state 和 current release。
- [ ] ready/final/source/snapshot/decisions/effective/maintenance 任一不一致都 fail-closed。
- [ ] restore 同时支持两种 bundle，但 activate 只接受 pre-cutover。
- [ ] raw tamper 和合法 reseal 后的 semantic tamper 都有直接测试。
- [ ] verify-only 零写；materialize 目标为空；失败补偿不删除外部改动。

## 3. Ready / Maintenance / Evidence

- [ ] `backupVerified`、`maintenanceClosed` 布尔假证据已从 ReadyCoordinator 退役。
- [ ] runtime bundle 明确证明 closed、active/stream/participant active/queued 全 0。
- [ ] evidence root 显式、隔离、原子写、摘要链完整。
- [ ] 新实例可 resume；同输入幂等；不同输入/identity 拒绝；不能跳步。
- [ ] C6_READY 是 activate 前置；C7/COMPLETED 在 reopen 前落盘。
- [ ] activate commit 后 crash 可安全 reconcile，不重写 activatedAt。

## 4. Activate

- [ ] dry-run 对 DB、evidence、target roots 全部零写。
- [ ] verifyBackup 返回 typed manifest，不是 `void`。
- [ ] coordinated/shadow、stale final、不同 decisions、不同 effective 全拒绝。
- [ ] execute 事务只做 ready→db_only + activatedAt，不写 firstBusinessWriteAt。
- [ ] maintenance/evidence 未闭合时 execute 不可达。

## 5. Business write boundary

- [ ] mutation registry 覆盖所有业务 owner，而不是只覆盖 ProjectRepository。
- [ ] 业务生产代码没有直接 `$transaction`。
- [ ] 直接 create/update/delete/upsert/*Many 只能发生在 business transaction callback。
- [ ] system boundary 是关闭 allowlist，不能被普通 service 使用。
- [ ] ready/recovery 的代表性公开写均在业务 mutation 前拒绝。
- [ ] 首笔成功、回滚、并发和后续写语义全部有真实 SQLite 测试。
- [ ] 首写后 file bridge 拒绝。

## 6. 真实隔离 Runtime Review

- [ ] 综合演练使用真实临时 SQLite/Prisma migrate deploy。
- [ ] 使用真实 SnapshotService、FinalImportOrchestrator、ReadyCoordinator。
- [ ] 使用真实 AppBackupService、AppRestoreService、DbActivateService。
- [ ] 使用真实 Nest AppModule/API read smoke 和真实公开业务 mutation。
- [ ] 没有 fake Prisma、fake restore、手写 final run/state、marker 代替领域产物。
- [ ] fake SecretStore/provider 根显式且没有触碰真实系统。
- [ ] C0～C7 每步 evidence 可独立重算和追溯。
- [ ] rollback、crash-resume、secret、path 隔离负例通过。

## 7. 文档与证据

- [ ] `test_matrix.md` 每个 passed 都有测试 ID、spec、命令和结果。
- [ ] G1 只回填直接证明的项；SH-10、真实授权、真实 Keychain/provider、OBS-01～10 未伪造通过。
- [ ] `progress.md` 记录 A1-0～A1-5 的提交和门禁结果。
- [ ] `findings.md` 记录实施中新增风险和偏差。
- [ ] 新增功能完成记录，索引/长期记忆同步。
- [ ] 没有提交 DB、用户素材、秘密、绝对路径报告或大型 trace。

## 8. Scrutiny Review 输出

单独创建 `scrutiny_review.md`，只读复核后填写：

```text
结论：passed / changes_requested
代码范围：
manifest/final/ready/activate identity：
业务写边界完整性：
测试矩阵完整性：
文档状态一致性：
残留风险：
```

若发现缺口，Scrutiny Reviewer 不直接修代码；退回 Worker。

## 9. Runtime Review 输出

单独创建 `runtime_review.md`，状态只能是：

```text
passed_isolated
changes_requested
```

必须写清：

```text
临时根 marker：<脱敏逻辑名，不写本机绝对路径>
真实 domain services：<列表>
允许的 fake：SecretStore/provider
C0～C7：<逐项测试 ID>
rollback/crash resume：<结果>
secret/path scan：<结果>
真实用户数据/Keychain/provider 操作：0
```

`passed_isolated` 不是 `real_cutover_completed`。

## 10. 最终判定

以下是 M6-A1 编写时的历史目标；后续 production entry 复核已经推翻其作为真实授权前置的充分性：

```text
ready_for_real_cutover_authorization
```

当前不得使用该状态申请或执行真实切换。M6-A1 最终只保留 `isolated_complete`；后续必须从 `../2026-07-13_R0-R2真实切换施工包/handoff.md` 的 R0-A 开始，完成生产入口代码收口后再重新复核。不得执行真实切换，不得进入 G4/G5。

## 11. 2026-07-13 最终复核记录

- [x] M6A1-BK/RST/RDY/ACT/EVD/TX/C0～C7/RB/SEC/PATH/REG 均有直接测试证据并在 `test_matrix.md` 标为 `passed`。
- [x] server 全量 `61 files / 425 tests` 通过；workspace typecheck、server/web build、Prisma/G1、capability CLI 通过。
- [x] Scrutiny Review：`passed`；Runtime Review：`passed_isolated`。
- [x] `settings_credential_secret_store` 保持 `implemented`、`restartCovered=true`，capability `blockedIds=[]`。
- [x] 未触碰真实 workspace、真实数据库、真实 Keychain/provider、真实用户凭据；真实操作次数为 `0`。
- [x] 隔离判定：`isolated_complete`；production entry 转入 R0-A，真实 C0～C7、OBS-01～10、G4/G5 均未执行。

范围说明：ACT-06 为 DB-only resume 单测，未做进程级 kill；BK-02 直接覆盖 missing final run + shadow state；PATH-01 直接覆盖 symlink/overlap。不得把这些隔离范围扩大解释为真实切换证据。
