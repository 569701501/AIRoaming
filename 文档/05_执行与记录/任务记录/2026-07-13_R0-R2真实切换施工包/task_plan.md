---
doc_id: AIR-RCUT-TASK-001
status: completed
created: 2026-07-13
updated: 2026-07-14
owner: AI漫游项目
audience: orchestrator, worker, reviewer, human
source: R0-R2 真实切换 Handoff
---

# R0-R2 真实切换任务计划

## 目标

在独立人工授权下完成真实 C0～C7 和 DB-only 观察期，最终达到 `db_only_observation_passed`。不设置工期或执行日期；授权与前置证据满足后立即连续推进对应区间。

## 当前阶段

```text
R0-A = passed_isolated
R0-B / SH-10 = passed
R1-v5 C0～C7 / first write = passed_real
R2 OBS-01～10 = passed_real
R2 Scrutiny / Runtime = passed
DB_ONLY_OBSERVATION_PASSED
```

## 阶段

| 阶段 | 内容 | 当前状态 | 退出条件 |
| --- | --- | --- | --- |
| R0-DOC | 五份主施工资料 + 三件套 + 状态纠偏 | completed | 路径/命令/状态静态复核通过 |
| R0-A1 | production SecretStore 与两阶段 settings 迁移 | completed | RCUT-SEC 全绿并接入 final/ready |
| R0-A2 | strict runtime/evidence/activate | completed | RCUT-RUN/EVD/ACT 全绿；补 artifact/authorization reconcile |
| R0-A3 | production `db:cutover` runner | completed | C1～C7 domain action 全部接线，RCUT-CLI/CHAIN/RB 全绿 |
| R0-A4 | 全量门禁与双 Review | completed | 独立 Scrutiny=`passed`、Runtime=`passed_isolated`，已独立收口 |
| R0-B | 阻塞修复、真实 plan、release-specific shadow、SH-10 | completed_v5 | v5 release shadow 与 gate=`sha256:6e66e807...786670` 通过 |
| R0-B-SH10-PRE | SH-10 技术、证据与人工绑定收口 | completed_v5 | v5 SH-10=`passed_human_review` |
| R1-C0 | 发布/根/空间/SH 只读落证 | v5 passed | v5 plan=`2ba999ff...fc096`、SH-10 gate=`6e66e807...786670`、C0=`385ab981...546d2` |
| R1-C1～C4 | 停写、snapshot、target、final/backup | completed_v5 | C1/C2/C3/C4 全部通过；最终 evidence=`sha256:69d08d7b...6328642`，C4 后停止 |
| R1-C5～C6 | closed DB smoke、archive | completed_v5 | C6 evidence/C6_READY 通过，可申请 AUTH-C7 |
| R1-C7 | activate、COMPLETED、首写 | completed_v5 | AUTH-C7、activation、首写/file guard 均通过 |
| R2 | OBS-01～10 | completed | `db_only_observation_passed`，双 Review 通过 |
| G4 | 候选定稿返修 | handed_off | 按总任务从 G4-A 连续执行 |

## 角色

- Orchestrator：读取事实源、维护阶段状态，不运行真实命令。
- Worker/Luna：v5 C1～C4 已完成；不得重做 R0-B/SH-10/C0～C4。收到新的 AUTH-C5 后立即连续执行 C5→C6。
- Scrutiny Review：R0-A 完成后只读复核。
- Runtime Review：R0-A 只做隔离链；R0-B/R1/R2 由用户另行授权。
- Human release/migration/rollback owner：v3/v4 仅保留历史；当前 AUTH-C5 必须绑定 v5 C4 evidence，AUTH-C7 必须绑定后续 C6 evidence，R2 另行授权。

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
8. `g1-schema-manifest.json.manifestDigest` 是 G1 生成 provenance；`loadReleaseSchemaIdentityV1()` 的 digest 才是 plan/gate/C0 必须绑定的 release schema identity，两者不得互换。

## SH-10 技术收口阶段

1. 修正 `ad3b...` 与 `2e999...` 的字段语义，并同步正式 G1 SH 状态。
2. 外置证据目录统一收紧为目录 0700、文件 0600，复核 group/world exposure 为 0。
3. 使用同一 sealed snapshot 与 decisions 在两个 fresh target 重放，先封存全表计数，再允许任何 SH-09 控制状态写入。
4. 生成唯一 canonical evidence index，完整 digest 绑定 snapshot、A/B report/verify/count、source recovery、secret scan 与 SH-09 restore；旧运行只标 non-canonical，不删除。
5. 生成真实 plan 所需的人工作业单和 warning disposition；责任人、窗口、settings 起点、credential action 和 reviewer 身份不由 AI 猜测。
6. Worker 完成后切换 Scrutiny 只读复核；不得生成 AUTH，不运行 C0～C7。
7. Release owner 已明确确认的 v3 plan/review/AUTH 仅绑定 v3；因 v3 C1 未命中真实旧 file 进程且窗口外执行，该链不得进入 AUTH-C5。修复必须生成 v4 release/plan 并重新取得 digest-bound 确认。

## 退出标准

R0-DOC：

- 五份主资料可直接交给 Luna。
- 现有 CLI 与目标 CLI 已清楚区分，不把未来命令写成当前可用。
- 总状态、G1 边界、M6-A1 isolated/production 区分同步。
- 文档路径检查、frontmatter、`git diff --check` 通过。

总体任务：

- R0-A 自动化与双 Review 通过。
- R0-B SH-01～SH-09 完成并停止等待人工 SH-10；SH-10 后仍需另行授权才可进入 C0。
- R1 C0 通过后单独生成 AUTH-C1，再完成 C1～C7 与真实回滚证据。
- R2 OBS-01～10 完成。
- 未泄密、未自动 down、未删除旧证据。
