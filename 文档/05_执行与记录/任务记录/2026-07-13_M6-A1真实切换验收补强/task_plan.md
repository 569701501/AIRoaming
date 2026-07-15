---
doc_id: AIR-M6-A1-TASK-PLAN-001
status: superseded
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: orchestrator, worker, reviewer, human
source: 2026-07-13 M6 独立复核、G3-M 备份恢复与 DB-only 激活契约
---

# M6-A1 真实切换验收补强任务计划

## 1. 目标

把当前“工具骨架 + fake 编排测试”补强为可申请真实切换授权的工程证据，且全程只使用显式临时根、临时 SQLite、fake SecretStore 和 fake provider。

最终状态只能是：

```text
ready_for_real_cutover_authorization
```

该状态只表示代码和隔离演练满足申请条件，不表示真实切换已授权或已执行。

## 2. 当前事实（最终收口）

- M5 coordinated backup/restore、D2 final importer 和 capability 8/36 已完成。
- `app:backup --kind pre-cutover` 已绑定 succeeded final run、ready state、closed maintenance 和当前 identity，失败时 fail-closed。
- restore 支持 coordinated/pre-cutover；activate 只接受已验证的 pre-cutover bundle。
- C0～C7 已使用真实临时 SQLite、真实 domain services 和持久 evidence；仅 SecretStore/provider 为 fake。
- 生产业务 mutation 已统一经过 `PrismaService.runBusinessTransaction`，file bridge 在首写后拒绝。
- 隔离矩阵项均为 `passed`；后续 production entry 复核发现正式 SecretStore/evidence/runner 未闭合，因此当前总体状态为 `production_entry_changes_required`，转入 R0-A。

## 3. 非目标

- 不访问真实 workspace、真实 dataRoot、真实数据库、真实 Keychain 或真实 provider。
- 不运行真实 `db:activate --execute`、真实停写、真实 metadata archive 或真实 final import。
- 不实施 G4、G5、G6、G7。
- 不新增双 Reviewer、attestation、CAS review bundle 或其他流程基础设施。
- 不修改 Prisma Schema、migration tree 或 trigger；若确实无法在现有模型内完成，停止并报告。

## 4. 阶段

| 阶段 | 目标 | 退出条件 | 建议提交 |
| --- | --- | --- | --- |
| A1-0 | 基线与状态纠偏 | 旧 M6 通过结论已标记 superseded；测试先红；无业务代码改动 | `docs(m6): reopen real cutover acceptance` |
| A1-1 | pre-cutover backup/restore | final/ready bundle 可生成、verify、materialize；shadow/stale/tamper 全拒绝 | `fix(migration): implement final pre-cutover backup` |
| A1-2 | activate 与持久证据 | activate 精确绑定 final backup、closed maintenance、C0～C6 evidence；可恢复续跑 | `fix(migration): bind activation to cutover evidence` |
| A1-3 | 全业务写边界 | 业务写无旁路；ready/recovery 全拒绝；首笔时间原子且只写一次 | `refactor(persistence): enforce business write boundary` |
| A1-4 | 真实隔离 C0～C7 | 真实临时 SQLite + 真实 domain services 完成成功/回滚演练；无 fake Prisma/restore | `test(migration): run real isolated cutover chain` |
| A1-5 | 双复核与收口 | 定向/全量门禁、Scrutiny、Runtime、G1 映射和完成记录齐全 | `docs(m6): close real cutover readiness evidence` |

每阶段完成自测、更新 `progress.md`、执行内部复核并独立提交后，Worker 自动领取下一阶段，不等待用户逐项确认。

## 5. 当前角色

- Orchestrator：本施工包已完成并完成最终复核。
- Worker：Luna 执行链已收口，不再领取下游。
- Scrutiny Review：A1-5 只读复核，不在复核时改代码。
- Runtime Review：只运行隔离临时根全链路；真实用户数据验收明确不在本轮。

## 6. 关键决策

1. C2 只负责最终源 snapshot；pre-cutover DB backup 必须在 C4 final run 成功并进入 `ready_for_activation` 后生成，消除当前时序矛盾。
2. `ReadyCoordinator` 不再接受无法验证的 `backupVerified: boolean`；改为验证真实 maintenance runtime bundle。pre-cutover backup 在 ready 之后生成。
3. activate 必须读取 typed pre-cutover manifest 并逐字段绑定同一 final run/source/snapshot/decisions/effective identity，不能只依赖 restore 成功。
4. C0～C7 证据使用最小、原子、摘要链式的文件 evidence store，不新增数据库表。
5. 生产业务写统一进入 `PrismaService.runBusinessTransaction`；迁移/备份/激活的维护写必须走显式、受限的 system boundary，不能混用。

## 7. 退出标准

- `test_matrix.md` 的 M6A1-BK、RST、ACT、EVD、TX、C0～C7、RB、SEC、PATH、REG 全部 `passed`；真实授权、真实根、OBS-01～10 仍未执行。
- 原 fake 综合演练被真实隔离链路替换；不得保留“fake 也算全链路”的表述。
- Scrutiny Review 和隔离 Runtime Review 分别出具通过结论。
- G1 清单只回填被本轮直接证明的项目，未执行项继续保持 `not_run`。
- 新增功能完成记录，所有文档状态一致。
- 独立提交完成，工作树只允许存在用户原有无关改动。
- 最终停止，不自动执行真实 C0，也不自动领取 G4/G5。
