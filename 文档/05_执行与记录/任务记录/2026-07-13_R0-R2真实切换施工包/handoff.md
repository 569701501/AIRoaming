---
doc_id: AIR-RCUT-HANDOFF-001
status: active
created: 2026-07-13
updated: 2026-07-14
owner: AI漫游项目
audience: human, ai-agent, developer, qa, release-owner
source: M6-A1 实现复核、G1 正式验收清单、G3-M 备份恢复与 DB-only 激活契约
---

# R0-R2 真实切换 Handoff

## 1. 当前判定

```text
M6-A1 isolated engineering evidence = passed
R0-A production cutover entry = passed
R0-B read-only discovery = blocker_reproduced
R0-B remediation = documented_waiting_luna_authorization
R1 real workspace / database / stop-write authorization = not_granted
default user Keychain / real credentials = not_touched
```

本 Handoff 的 R0-A 已完成并经 Luna 独立复核；R0-B 只读发现证明两个 shadow 报告一致但 blocker=1。进一步只读核对已找到摘要和 identity 匹配的结构恢复候选，并复现出两个 importer 兼容缺口：Story beat 仍使用角色名；Storyboard 非空人物引用被无条件拒绝且未落关系行。当前不是“等待 SH-10 签字”，而是必须先按施工包完成阻塞修复，让 SH-01～SH-09 全绿后再交人工 SH-10。

Luna 的唯一下一入口是 `luna_r0b_blocker_remediation_handoff.md`。该文件给出可一次授权连续执行的代码修复、overlay、条件式单文件恢复、外置 release worktree 和 real-source 双 shadow；完成后必须停止。R1 和 R2 仍需要用户新的、明确授权记录。

## 2. 当前剩余阻塞（R0-A 已部分收口）

| blocker | 当前代码事实 | 影响 |
| --- | --- | --- |
| RCUT-B08 | 新 runner 已通过两个 fresh 临时根真实 domain C0～C7；C1～C4 统一失败矩阵、C5 故障注入与 C7 crash/reopen 均已有隔离证据 | 自动化回滚证据与独立 Review 已通过；仅真实授权前置仍未完成 |
| RCUT-B09 | C7 成功链已验证 dry-run/execute/COMPLETED→reopen/resume；首笔业务写入后 file guard 稳定拒绝 | 真实环境仍未授权；不得生成 AUTH 或进入 R0-B |
| RCUT-B10 | Luna Scrutiny=`passed`，Runtime=`passed_isolated`；disposable Keychain smoke 已通过 | 只关闭 R0-A；真实 SH gate、AUTH 和 C0～C7 仍需新授权 |
| RCUT-B11 | C3 后置失败资源清理、C0 shadow gate 与 Keychain 平台证据均已补齐 | R0-B 仍需 release-specific plan、只读 shadow 和人工 SH-10 |

因此当前总状态为：

```text
R0_B_REMEDIATION_REQUIRED / real_cutover_no_go
```

## 3. Luna 必读顺序

1. `luna_r0b_blocker_remediation_handoff.md`（当前唯一下一步）。
2. `r0b_blocker_remediation_contract.md`。
3. `r0b_blocker_remediation_test_matrix.md`。
4. `r0b_blocker_remediation_file_map.md`。
5. `r0b_blocker_remediation_review_checklist.md`。
6. 本文件、`task_plan.md`、`findings.md`、`progress.md`。
7. `implementation_contract.md`、`real_cutover_runbook.md`、`evidence_and_test_matrix.md`。
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

### R0-B：真实授权准备（当前需先修复 blocker）

只有用户明确授权后才可以：

- 只读发现真实 release/data/workspace/settings 状态。
- 填写真实 plan，但不得把绝对路径、用户名、秘密写入仓库文档。
- 在独立目标根执行 release-specific shadow、backup/restore rehearsal。
- 由真实责任人审阅 MigrationReport 并完成 SH-10；Luna 不得自签。
- 登记维护窗口、空间、release owner、rollback owner 和恢复联系办法。

本轮证据：同一 sealed snapshot 的两个 fresh full shadow aggregate reportDigest 相同，但 `storyboard` slice 的 unresolved blocker=1（`chapter:chapter_001:storyboard-source`）。只读恢复核对找到固定备份中的匹配 `structure.json`；在临时 overlay 恢复该文件后又复现 `MIGRATION_STORY_DOCUMENT_INVALID`，根因是 43 个 beat token 使用角色名。当前 storyboard 另有 65 个名称 token，而 importer 会无条件报 `MIGRATION_STORYBOARD_CHARACTER_UNRESOLVED`，且 `characters` 排在 `storyboard` 后、没有落 `storyboard_shot_characters`。私有 plan root review 另发现 `CUTOVER_PLAN_ROOT_OVERLAP`，应通过最终 remediation commit 的外置 release worktree 解决。完整施工入口见 `luna_r0b_blocker_remediation_handoff.md`。

### R1：真实 C0～C7

必须设置三个人工门：

1. `AUTH-C1`：C0 全绿后，用户授权真实停写，并按 settings 起点明确授权 C3 Keychain 只读验证或 legacy credential prestage。
2. `AUTH-C5`：C4 final/ready/pre-cutover backup/materialize 全绿后，授权关闭旧 file 进程并进入 DB smoke。
3. `AUTH-C7`：C5/C6 全绿、firstBusinessWriteAt 仍为空后，授权 execute activation。

任何门缺失，runner 必须返回稳定错误并保持现状。

### R2：DB-only 观察期

按 G1 `OBS-01～10` 执行；观察期未退出前：

- 不删除旧 metadata archive 或 backup。
- 不执行 down migration。
- 不声称 G1 正式完成。
- 不进入 G4/G5 正式开发。

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
