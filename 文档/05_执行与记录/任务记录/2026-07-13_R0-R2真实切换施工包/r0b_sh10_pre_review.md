---
doc_id: AIR-RCUT-R0B-SH10-PRE-REVIEW-001
status: technical_remediation_completed_waiting_human
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: migration-reviewer, release-owner, rollback-owner, luna, ai-agent
source: R0-B 外置 release、real-source shadow、source recovery 与 SH-09 backup/restore 只读预审
---

# R0-B SH-10 人工签署前预审

## 结论

```text
pre_review = changes_requested
SH-01..SH-09 runtime evidence = substantially verified
SH-10 = awaiting_human_migration_reviewer
shadow gate = not_generated
AUTH-C1/C5/C7 = not_generated
C0..C7 = not_run
```

本记录不是 SH-10 人工签名。Codex 只做独立只读预审，不能代替真实 Migration reviewer。

## 已独立复核通过的证据

| 项目 | 复核结果 |
| --- | --- |
| release worktree | detached HEAD=`29f40bbe287c9d4428aa6bf464d93806c1c84307`，工作树 clean |
| G1 baseline manifest | `sha256:ad3b0e1ba884e20718e6e81994cbb8beaedbb9e6777e471ac2a21e4c94c2b1ea`；manifest/schema/migration check 全通过 |
| 实际 release schema identity | `sha256:2e9992459906946415f8072ef4ad210ba00c52393d6c83fc4d0af23e415b3559` |
| capability | `blockedIds=[]` |
| real-source A/B report | 两边 16/16 succeeded；aggregate reportDigest 均为 `sha256:daca7e9201c86589326a5847ad75591828b1ab28e591ab03ce9af810d663e781`；blocker=0 |
| 每 slice verify | A/B 各 16 份 verification 全部 `passed=true`；integrity=`ok`、FK=0、open issue=0 |
| API/restart witness | `IMP-M4-API-01` 与 `D2-WIT-01/02/03/04/05` 独立重跑通过 |
| source recovery | archive=`336c9f470c177e32473d01a2e1bd4f8c61101d8f23eea9117bbad85eca4b6f23`；member/target=`4eac7b63c79fa5408f19000aae1c3e4e6d56989bb562a6947f81003b076a0dd3`；pre/post 仅新增授权 `structure.json` |
| sealed snapshot | source=`sha256:c16ff088f2aec751b3a48e4b1b63d83ff4ea27601bd3f1178406b3c9944beebb`；snapshot=`sha256:effb0794414282f66460cafbc69baa7c7e13af80a47a4e6c96efcff6ce18161a` |
| secret scan | A/B artifact 与 SQLite dump sentinel 命中数=0 |
| SH-09 | coordinated backup verify-only 复核通过；bundle=`sha256:ef17078c48c6707e77fc3ad58162616e2575c648689ea58801089d2966ae2dd2`；67 assets；materialized DB integrity=`ok`、FK=0 |
| 越界操作 | final run=0；PersistenceState 未激活；未发现 AUTH 文件 |

## 阻塞 SH-10 的发现

### SH10-PRE-01：缺少可验证的真实 plan、plan identity 与 shadow gate

外置证据根中未找到 `airoaming_cutover_plan_v1`、`planDigest/cutoverId/runId` 绑定文件或 shadow gate。SH-10 必须绑定 `cutoverId/appCommit/planDigest/runId/effectiveSchemaManifestDigest`，不能只签脱敏摘要。release owner、rollback owner、窗口、恢复联系人、settings 起点与 credential action 也尚无可验证私有记录。

结论：`blocking`。

### SH10-PRE-02：执行记录把 G1 baseline digest 误写成 effective schema identity

仓库执行记录写的是：

```text
effective schema manifest = sha256:ad3b0e1b...c2b1ea
```

但 `db:verify`、backup manifest 与 release identity 实际共同绑定：

```text
effectiveSchemaManifestDigest = sha256:2e999245...5b3559
```

`ad3b...` 是 G1 baseline machine manifest digest，不是 `loadReleaseSchemaIdentityV1()` 计算的 release schema identity。若真实 plan/gate 使用错误 digest，C0 会按 identity mismatch 拒绝。

结论：`blocking`。

### SH10-PRE-03：私有证据权限不满足 0700/0600 契约

外置 R0-B 根目录为 `0755`；复核时发现 334 个可被其他用户 traverse 的目录、110 个 world-readable 文件。canonical clean A/B 中仍有 38 个 world-readable 文件，两份 shadow SQLite DB 均为 `0644`。虽然 full report 和 sealed backup 的关键文件部分为 `0600`，但整体不满足“私有报告根权限受限、evidence/backup/restore/archive roots 0700”的强制口径。

结论：`blocking_security`。

### SH10-PRE-04：正式 G1 验收清单仍把 SH-01～SH-09 标为 not_run

任务执行记录写 SH-01～SH-09 已通过，但正式 `G1数据库迁移执行与验收清单.md` 仍将 SH-01～SH-10 全部标为 `not_run`。当前形成两个事实源，人工 reviewer 不能在状态未统一时签署。

结论：`blocking_documentation`。

### SH10-PRE-05：表计数证据缺少不可变的 pre-SH09 checkpoint

当前 A/B 数据库的 45 表计数只相差 `persistence_states`：A 为 1、B 为 0。原因是 SH-09 coordinated backup 前在 A 写入合法 shadow PersistenceState。排除该控制表后 A/B 计数完全一致，但仓库记录的 `sha256:25f14b5a...117fc0a` 没有对应的完整、sealed、可独立重算 count artifact；当前数据库也不能原样重算该摘要。

结论：`blocking_evidence`。

### SH10-PRE-06：存在 1 个尚未由人工接受的 warning

A/B 的 `script-pending-revision` slice 均为 succeeded、blocker=0，但 `warningCount=1`。代码含义是旧 Dialogue reference 只作为 source evidence 保留，没有恢复为可执行 Dialogue FK。人工 reviewer 必须明确接受该降级或要求补充说明，不能把 warning 省略。

结论：`human_decision_required`。

### SH10-PRE-07：证据根同时保留旧失败/副作用运行与 clean 运行，缺少 canonical index

外置证据根同时存在旧 `real-shadow`、曾含 67 个 source `legacy-import` 副作用的 snapshot、clean shadow、两套 backup/restore 结果。当前没有 sealed canonical review index 指明 SH-10 只应读取哪组文件，存在 reviewer 选错证据的风险。

结论：`blocking_evidence`。

## 修复后再交人工 reviewer

1. 由 release owner 在仓库外创建 0600 的真实 plan，填入实际 release identity `sha256:2e999245...5b3559`、责任人、窗口、settings 起点和 credential action。
2. 收紧外置证据根：目录 0700、文件 0600；重新扫描并记录 group/world readable 数量为 0。
3. 生成唯一 canonical evidence index，使用完整 digest 绑定 clean snapshot、A/B reports、32 份 verify、source pre/post、secret scan、SH-09 bundle/restore；旧失败证据标记 non-canonical，不删除审计历史。
4. 重新封存可独立重算的 A/B pre-SH09 表计数证据，或重跑两个 fresh target 后在 SH-09 修改任何 target 前 seal count artifact。
5. 人工明确接受或拒绝 `script-pending-revision warningCount=1`。
6. 修正文档中 G1 baseline digest 与 release effective identity 的名称/值，并同步正式 G1 SH 状态。
7. 上述完成后，真实 Migration reviewer 才能生成包含 reviewerId/signedAt 的 SH-10 gate；该 gate 仍不等于 AUTH-C1。

## 当前停止点

保持 `SH-10=awaiting_human_migration_reviewer`。不得生成 passed shadow gate、AUTH、停写或执行 C0～C7。

## 2026-07-14 技术整改结果

| 原发现 | 当前状态 | 结果 |
| --- | --- | --- |
| SH10-PRE-01 plan/identity/gate/责任字段缺失 | `human_required` | 技术身份已明确；真实 plan、责任人、窗口和 gate 仍必须由人类完成 |
| SH10-PRE-02 digest 语义混淆 | `resolved` | G1 baseline=`ad3b...`，release identity=`2e999...`；执行记录和 Handoff 已纠正 |
| SH10-PRE-03 权限过宽 | `resolved` | 外置根全部目录 0700、文件 0600；复核 violation=0 |
| SH10-PRE-04 正式 G1 状态冲突 | `resolved` | 正式清单已同步 SH-01～09 passed、SH-10 awaiting human |
| SH10-PRE-05 count checkpoint 不可重算 | `resolved` | 新 fresh C/D 在任何 SH-09 状态写入前封存 45 表计数；checkpoint=`sha256:86863a95...eabd6f2d9` |
| SH10-PRE-06 warning 未接受 | `human_required` | warning 已完整披露；必须由真实 Migration reviewer 接受或拒绝 |
| SH10-PRE-07 canonical index 缺失 | `resolved` | 11 组证据已绑定；index=`sha256:7ec5e52f...f480636b`，旧运行标记 non-canonical |

整改后的状态是 `technical_evidence_prepared_waiting_human`，不是 `SH-10=passed`。人工入口见 `r0b_sh10_human_review_handoff.md`。
