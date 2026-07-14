---
doc_id: AIR-RCUT-TASK-001
status: in_progress
created: 2026-07-13
updated: 2026-07-14
owner: AI漫游项目
audience: orchestrator, worker, reviewer, human
source: R0-R2 真实切换 Handoff
---

# R0-R2 真实切换任务计划

## 目标

先完成 production cutover entry，再在三次独立人工授权下执行真实 C0～C7 和 DB-only 观察期，最终达到 `db_only_observation_passed`。

## 当前阶段

```text
R0-A passed_isolated
R0-B blocker_remediation_documented_waiting_luna_authorization
real_cutover_no_go
```

## 阶段

| 阶段 | 内容 | 当前状态 | 退出条件 |
| --- | --- | --- | --- |
| R0-DOC | 五份主施工资料 + 三件套 + 状态纠偏 | completed | 路径/命令/状态静态复核通过 |
| R0-A1 | production SecretStore 与两阶段 settings 迁移 | completed | RCUT-SEC 全绿并接入 final/ready |
| R0-A2 | strict runtime/evidence/activate | completed | RCUT-RUN/EVD/ACT 全绿；补 artifact/authorization reconcile |
| R0-A3 | production `db:cutover` runner | completed | C1～C7 domain action 全部接线，RCUT-CLI/CHAIN/RB 全绿 |
| R0-A4 | 全量门禁与双 Review | completed | 独立 Scrutiny=`passed`、Runtime=`passed_isolated`，已独立收口 |
| R0-B | 阻塞修复、真实 plan、release-specific shadow、SH-10 | blocked_preflight_source | 代码已提交 `74a6d71`，A/B clean overlay 已一致通过前 8 slice；第 9 个 preflight 因 legacy source 缺少 `sourceSnapshot` 停止。真实 source 尚未恢复，不能进入 SH-01～09/SH-10 |
| R1-C0 | 发布/根/空间/SH 只读落证 | blocked | AUTH-C1 可申请 |
| R1-C1～C4 | 停写、snapshot、target、final/backup | blocked | AUTH-C5 可申请 |
| R1-C5～C6 | closed DB smoke、archive | blocked | AUTH-C7 可申请 |
| R1-C7 | activate、COMPLETED、首写 | blocked | real_cutover_completed |
| R2 | OBS-01～10 | blocked | db_only_observation_passed |
| G4 | 候选定稿返修 | out_of_scope | R2 通过后另建任务 |

## 角色

- Orchestrator：读取事实源、维护阶段状态，不运行真实命令。
- Worker/Luna：下一任务只按 `luna_r0b_blocker_remediation_handoff.md` 执行 R0-B 阻塞修复；先 overlay，满足条件后才单文件恢复真实源，并停在 SH-10。
- Scrutiny Review：R0-A 完成后只读复核。
- Runtime Review：R0-A 只做隔离链；R0-B/R1/R2 由用户另行授权。
- Human release/migration/rollback owner：填写真实 plan、SH-10 和授权。

## 非目标

- 本轮文档编写不执行代码、不访问真实环境。
- R0-A 不修改 schema/migration/trigger。
- 不让 Luna 自签真实授权。
- 不进入 G4/G5。

## 关键决策

1. M6-A1 保留为隔离 service 证据，不再等同 production entry。
2. production final/ready 必须支持 Keychain，fake-only 只能留测试。
3. activate evidence 参数从 optional 改 required，并由单一 verified store 校验。
4. C0～C7 使用显式 plan 和 step runner，一次只执行一步。
5. AUTH-C1/C5/C7 分离，避免一次授权覆盖不可逆边界。
6. settings 起点分支处理：已脱敏只验证；legacy plaintext 使用两阶段 prestage/commit。
7. plan 在 C0 前冻结且 digest 全程不变；C0 无授权只读落证，AUTH-C1 绑定 C0 evidence 后才可停写。

## 退出标准

R0-DOC：

- 五份主资料可直接交给 Luna。
- 现有 CLI 与目标 CLI 已清楚区分，不把未来命令写成当前可用。
- 总状态、G1 边界、M6-A1 isolated/production 区分同步。
- 文档路径检查、frontmatter、`git diff --check` 通过。

总体任务：

- R0-A 自动化与双 Review 通过。
- R0-B SH-01～10 完成并停止等待 C0 授权。
- R1 C0 通过后单独生成 AUTH-C1，再完成 C1～C7 与真实回滚证据。
- R2 OBS-01～10 完成。
- 未泄密、未自动 down、未删除旧证据。
