---
doc_id: AIR-RCUT-HANDOFF-001
status: active
created: 2026-07-13
updated: 2026-07-14
owner: AI漫游项目
audience: luna, human, ai-agent, developer, qa, release-owner
source: M6-A1 实现复核、G1 正式验收清单、G3-M 备份恢复与 DB-only 激活契约
---

# R0-R2 真实切换 Handoff

## 1. 当前判定

```text
M6-A1 isolated engineering evidence = passed
R0-A production cutover entry = passed
R0-B remediation / release shadow = passed
R0-B v2 SH-10 gate = passed
R1 v5 C0 = passed_read_only
R1 v5 C1-C7 activation = passed
R1 v5 Worker = completed_through_R2
R2 OBS-01～10 / Scrutiny / Runtime = passed
default user Keychain / real credentials = not_touched
```

本 Handoff 的 R0-A、R0-B 修复、release-specific shadow 和 SH-01～SH-10 已完成。v1～v4 只保留历史；当前有效 identity 是 v5，使用 `already_sanitized/verify_existing`，plan=`sha256:2ba999ff...fc096`，C0=`CUTOVER_C0_OK`、evidence=`sha256:385ab981...546d2`。

当前总执行入口是 `../2026-07-14_G0至G5剩余连续施工/luna_current_handoff.md`；R0-R2 命令面仍以 `real_cutover_runbook.md` 为准。`v5_immediate_window_handoff.md` 只保留 C1～C4 的历史 identity 与运行证据，不是剩余工作的排期。Luna 已从 v5 AUTH-C1/C1 连续执行到 C7 activation、首笔业务写和 R2 OBS-01～10；AUTH-C5/AUTH-C7/R2 已消费并校验通过；R2 双 Review=`passed`。

## 2. 当前剩余边界

| 边界 | 当前事实 | 下一动作 |
| --- | --- | --- |
| AUTH-C5 | 已绑定 C4 evidence 并消费 | C5→C6 已完成 |
| AUTH-C7 | 已绑定 C6 evidence 并消费，C7 activation/COMPLETED 已通过 | 首笔受控 DB-only 业务写后申请 R2 |
| R2 授权 | C7 已激活，首笔业务写/file guard 已通过 | 已授权并完成 OBS-01～10 与双 Review |
| G4/G5 | R2 已通过 | 按总入口从 G4-A 连续执行 |

因此当前总状态为：

```text
DB_ONLY_OBSERVATION_PASSED / G4_A_IN_PROGRESS
```

## 3. Luna 必读顺序

1. `../2026-07-14_G0至G5剩余连续施工/luna_current_handoff.md`（当前唯一总入口）。
2. `real_cutover_runbook.md` 第 11 节以后。
3. `v5_c1_c4_scrutiny_review.md`、`v5_c1_c4_runtime_review.md`、当前 C5/C6 复核记录。
4. `review_authorization_checklist.md` 第 7 节以后。
5. `evidence_and_test_matrix.md`。
6. 本文件、`task_plan.md`、`findings.md`、`progress.md`。
7. `implementation_contract.md`。
8. `文档/06_测试与验收/G1数据库迁移执行与验收清单.md` 第 11～18 节。

## 4. 连续执行范围

### R0-A1：生产 SecretStore 绑定

- final/ready 正式入口通过注入的 `SecretStore` 验证 production Keychain health、credentialId 和 fingerprint。
- 改造 Keychain 写入边界：secret 不得出现在 argv、用户可见 stdout/stderr 或日志；若 `security` prompt 通道不能满足，必须改用 Security.framework helper/等价窄接口，不能保留 `-w <secret>`。
- CLI 不得读取、打印或写证据文件保存明文 secret。
- 测试只允许 fake SecretStore 或注入 fake `security` executor，禁止触碰用户真实 Keychain。
- 兼容“旧 settings 已脱敏”和“仍有 legacy plaintext”两种输入；后者必须采用 prestage→verify→atomic redact 两阶段，不得失败后复制 plaintext。

### R0-A2：严格 CutoverEvidence

- 固化 manifest、step、C6_READY、COMPLETED 的 canonical digest 与 identity。
- activate 必须无条件要求 maintenance bundle 和 evidence root。
- 缺参数、缺 step、错 run/source/effective/appCommit、raw/reseal tamper、seal digest 不同均 fail-closed。

### R0-A3：生产 cutover runner

- 新增显式 `db:cutover` 入口，按 plan/evidence root/step 执行 C0～C7。
- runner 负责调用真实 domain service、保存 step evidence、resume/idempotency，并在 C7 前验证人工授权文件。
- C6 必须通过生产入口调用 `MetadataArchiveService`；不得用手写 marker 假装完成。
- 所有命令要求绝对路径，禁止自动发现默认 workspace、默认 DB 或“最新 run”。

### R0-A4：隔离验证、双复核和独立提交

- 只使用 `os.tmpdir()` 下唯一根、临时 SQLite、fake executor/provider/SecretStore。
- 先补红灯，再实现；测试名称必须包含 `RCUT-*` ID。
- 定向、server 全量、workspace typecheck、server/web build、Prisma/G1/capability、diff check 全绿。
- Scrutiny Review 与隔离 Runtime Review 通过后独立提交。
- 完成后状态只能是 `ready_for_real_cutover_authorization_review`，不得自动进入 R0-B。

## 5. R0-B、R1、R2 边界

### R0-B：真实授权准备（v5 已完成；以下为历史边界）

只有用户明确授权后才可以：

- 只读发现真实 release/data/workspace/settings 状态。
- 填写真实 plan，但不得把绝对路径、用户名、秘密写入仓库文档。
- 在独立目标根执行 release-specific shadow、backup/restore rehearsal。
- 由真实责任人审阅 MigrationReport 并完成 SH-10；Luna 不得自签。
- 登记维护窗口、空间、release owner、rollback owner 和恢复联系办法。

本轮证据：同一 sealed snapshot 的两个 fresh full shadow aggregate reportDigest 相同，但 `storyboard` slice 的 unresolved blocker=1（`chapter:chapter_001:storyboard-source`）。只读恢复核对找到固定备份中的匹配 `structure.json`；在临时 overlay 恢复该文件后又复现 `MIGRATION_STORY_DOCUMENT_INVALID`，根因是 43 个 beat token 使用角色名。当前 storyboard 另有 65 个名称 token，而 importer 会无条件报 `MIGRATION_STORYBOARD_CHARACTER_UNRESOLVED`，且 `characters` 排在 `storyboard` 后、没有落 `storyboard_shot_characters`。私有 plan root review 另发现 `CUTOVER_PLAN_ROOT_OVERLAP`，应通过最终 remediation commit 的外置 release worktree 解决。完整施工入口见 `luna_r0b_blocker_remediation_handoff.md`。

### R1：真实 C0～C7（C0～C4 已完成）

必须设置三个人工门：

1. `AUTH-C1`：C0 全绿后，用户授权真实停写，并按 settings 起点明确授权 C3 Keychain 只读验证或 legacy credential prestage。
2. `AUTH-C5`：C4 final/ready/pre-cutover backup/materialize 全绿后，授权关闭旧 file 进程并进入 DB smoke。
3. `AUTH-C7`：C5/C6 全绿、firstBusinessWriteAt 仍为空后，授权 execute activation。

任何门缺失，runner 必须返回稳定错误并保持现状。当前 C7 activation、首笔业务写、file guard 和 OBS-01～10 已完成；OBS-06 purge trigger 冲突已由 0011 与真实复核关闭，不设置日期或等待窗口。

### R2：DB-only 观察期

G1 `OBS-01～10` 已执行并退出观察期；以下边界继续有效：

- 不删除旧 metadata archive 或 backup。
- 不执行 down migration。
- 不因 R2 通过自动删除旧档案或执行 down migration。
- 可按总 Handoff 进入 G4/G5，但不进入 G6/视频链路。

## 6. 当前授权

本轮用户已授权：

- 在临时根、隔离 SQLite、fake SecretStore/fake executor 下实现和测试 R0-A。
- 更新 R0-A 施工资料、矩阵、progress/findings 和复核记录。
- 执行一次临时 HOME/disposable Keychain 隔离 smoke，不触碰默认用户 Keychain、真实凭据或 AUTH。

本轮没有授权：

- 修改真实 workspace/dataRoot/数据库；本轮只读访问源 workspace 并只写两个仓库外 fresh shadow target。
- 调用真实 Keychain 或读取 provider/OpenCode 凭据。
- 真实停写、AUTH、C1～C7、final import、backup、restore、archive、activate；shadow 仅限本轮已记录的两个 fresh release-specific target。
- `luna_r0b_blocker_remediation_handoff.md` §3 中的扩展 remediation 授权尚未由用户给出；现有只读授权不能推定为允许真实源恢复。
- 自动领取 R0-B、R1、R2、G4 或 G5。

下一步可执行动作是：用户把 `luna_r0b_blocker_remediation_handoff.md` 与其中 §3 的完整授权文本交给 Luna。Luna 可连续完成修复、验证和 SH-01～SH-09，但必须停在人工 SH-10；不包含停写、AUTH 或 C0～C7。

## 7. Stop 条件

遇到任一情况立即停止并报告：

- 需要把真实 secret 作为 CLI 参数、环境输出或证据 JSON。
- production runner 仍绕过 strict profile、历史 gate digest 或证据校验。
- C0～C7 无法由一个显式 plan identity 续跑。
- 需要修改 Prisma schema/migration/trigger；当前 R0-A 不授权该范围。
- 测试将触碰非临时根、真实 Keychain 或真实 provider。
- 全量回归存在用户改动冲突且不能隔离。

## 8. 交付格式

```text
结论：ready_for_real_cutover_authorization_review
R0-A 提交：<sha 列表>
SecretStore：production binding 已完成；默认用户 Keychain/真实凭据操作次数=0；disposable smoke=1
Activate：maintenance/evidence 是否 required；缺失是否 fail-closed
Cutover runner：C0～C7/resume/evidence/metadata archive 是否有生产入口
定向证据：14 个 spec / 106 tests；Keychain/runner 2 个 spec / 18 tests；全量证据：69 个 spec / 472 tests
全量门禁：workspace typecheck、server/web build、Prisma/G1/capability/diff 全绿
Scrutiny：passed
Runtime：passed_isolated
真实操作：默认用户 Keychain/真实凭据/真实数据=0；disposable smoke=1
此前停止点已解除：preflight 兼容修复、真实源单文件恢复和 SH-01～SH-09 已完成。当前停止点为人工 SH-10；未停写、未生成 AUTH、未执行 C0～C7。详见 `r0b_remediation_execution_record.md`。
```
