---
doc_id: AIR-M6-A1-HANDOFF-001
status: superseded
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M6 独立复核、M6-A1 task_plan 与实施契约
---

# Handoff：M6-A1 隔离验收补强（已由 R0-R2 施工包接替）

## 1. 唯一目标

连续完成 A1-0～A1-5，把当前 M6 从：

```text
tooling complete / real_cutover_no_go
```

推进到：

```text
ready_for_real_cutover_authorization
```

完成后停止。不要执行真实 C0，不要自动领取 G4、G5 或其他下游。

## 2. 必读顺序

1. 本文件。
2. `implementation_contract.md`。
3. `file_map.md`。
4. `test_matrix.md`。
5. `review_checklist.md`。
6. `task_plan.md`、`findings.md`、`progress.md`。
7. `文档/04_方案与决策/2026-07-12_G3-M施工包_备份恢复与DB-only激活.md`。
8. `文档/06_测试与验收/G1数据库迁移执行与验收清单.md` 第 12～18 节。
9. 当前 backup/restore/final/ready/activate/cutover/persistence 源码与测试。

本施工包证明隔离 service 链路，但后续 production entry 复核发现 fake-only SecretStore、Keychain put 的 secret-in-argv、optional activate evidence 和缺生产 runner。当前工程事实改为 `M6-A1 isolated_complete / production_entry_changes_required`；唯一入口为 `文档/05_执行与记录/任务记录/2026-07-13_R0-R2真实切换施工包/handoff.md`。

## 3. 连续执行阶段

### A1-0：先建立失败证据

- 更新旧 M6 状态为 superseded/reopened，但保留历史 tooling 证据。
- 先新增会失败的 pre-cutover、activate identity、business boundary 和真实 rehearsal 测试。
- 不允许先把测试写成对当前 fake 行为通过。

### A1-1：pre-cutover backup/restore

- 把 `BackupManifest` 改成 coordinated/pre-cutover 判别联合。
- `app:backup --kind pre-cutover` 必须要求 `--run-id`，绑定 succeeded final run、ready PersistenceState、16 slice final report、release identity、maintenance bundle、decisions。
- restore 必须按 kind 分支验证；pre-cutover materialize 后仍为 `ready_for_activation` 且首写为空。
- shadow/coordinated bundle 不能被 activate 使用。

### A1-2：activate 与持久 cutover evidence

- 删除 `ReadyCoordinatorInput.backupVerified` 布尔假证据；改为验证真实 closed runtime bundle。
- 实现最小持久 evidence store，原子保存 C0～C7，支持同身份重启续跑、相同输入幂等、身份变化拒绝。
- `db:activate` 必须验证 C0～C6 已通过、maintenance closed、pre-cutover bundle 与同一 final run/ready identity 精确一致。
- dry-run 零数据库写和零 evidence 推进；execute 只做 ready→db_only，再写 C7 evidence。

### A1-3：全业务写边界

- 盘点所有生产 DB mutation，不只盘点 `$transaction`。
- Project/Chapter、versioning、Task/worker、Outbox、Settings、Dialogue、Character/Scene/Asset/Candidate、Layout/Export/AssetPackage 全部经过统一业务写边界。
- migration/audit/import/ready/backup/activate 走显式 system boundary/allowlist。
- ready/recovery 时任何业务写都拒绝；db_only 第一笔成功业务事务同事务写时间，回滚不留时间；并发最多写一次。
- 新增源码 guard，后续新增旁路必须让测试失败。

### A1-4：替换 fake C0～C7

综合 spec 必须使用：

```text
真实 MaintenanceCoordinator/RuntimeBundleFileService
真实 SnapshotService
真实 Prisma migrate deploy 后的临时 SQLite
真实 FinalImportOrchestrator + ReadyCoordinator
真实 AppBackupService + AppRestoreService
真实 DbActivateService
真实 MetadataArchiveService
真实 Nest AppModule/API read smoke
真实公开业务写入口
```

允许 fake SecretStore 和 loopback fake provider；禁止 fake Prisma、fake restore、手写 final state、marker 代替领域产物。

### A1-5：复核、文档、提交（已完成）

- 定向测试、server 全量、workspace typecheck、web build、Prisma/G1 门禁全部通过。
- Scrutiny Review 只读复核；Runtime Review 只运行隔离全链路。
- 只回填 G1 中有直接证据的行；OBS 真实观察期继续 `not_run`。
- 新增功能完成记录，修正 execution status 和 real cutover handoff。
- 提交后停止，等待用户决定是否授权真实切换。

最终隔离门禁：server 全量 `61 files / 425 tests`，workspace typecheck、server/web build、Prisma/G1、capability CLI 和 diff check 均通过；test matrix 中隔离项全部 `passed`。

## 4. 硬性验收

以下任一缺失都不能标记完成：

1. 存在真实生成并验证的 `backupKind=pre-cutover` bundle。
2. activate 会拒绝 coordinated/shadow、不同 run、不同 source/effective、已首写和未 closed 的输入。
3. C0～C7 证据跨 coordinator 实例可恢复，不能跳步或覆盖旧证据。
4. 生产源码 mutation guard 证明没有业务写旁路。
5. 综合演练没有 fake Prisma/restore，且至少执行一次 materialize restore、Nest read smoke、rollback smoke、execute activate 和真实业务首写。
6. secret sentinel 扫描覆盖 snapshot、DB、settings、report、log/evidence、archive 和 restore 根，结果为 0。
7. 原 G1 未运行的真实观察期项目没有被误改为 passed。

## 5. 授权与禁止项

本 Handoff 授权 Luna：

- 修改 `file_map.md` 列出的代码、测试和事实文档。
- 在显式临时根运行 migrate、final import、backup、restore、activate execute 和 Nest smoke。
- 使用 fake SecretStore/fake provider。
- A1-0～A1-5 连续开发、内部复核、独立提交。

本 Handoff 不授权：

- 读取或修改仓库默认 `workspace/` 中的真实用户数据。
- 读取真实 Keychain、provider key、浏览器凭据或系统账户信息。
- 对任何非临时数据库运行 final/import/backup/restore/activate。
- 修改 Prisma schema/migration/trigger、自动 down migration 或删除旧 metadata。
- 开始 G4/G5、真实切换或 DB-only 观察期。

## 6. 环境保护

每个破坏性命令前必须断言：

```text
root 位于 os.tmpdir() 或测试创建的唯一临时根
DATABASE_URL 是该临时根内的绝对 file: URL
workspace/data/output/restore/evidence/secret roots 两两不重叠
AIROAMING_SECRET_STORE_ADAPTER=fake
AIROAMING_FAKE_SECRET_STORE_ROOT 位于同一临时根
AIROAMING_TASK_WORKER_ENABLED=false，除非当前用例专门验证 worker
```

任一断言失败，测试必须在初始化 Prisma 或写文件前停止。

## 7. 提交规则

- 每个 A1 子阶段独立提交；不要把全部改动压成一个无法复核的大提交。
- 每次提交前执行对应定向测试和 `git diff --check`。
- 不覆盖用户已有改动，不提交真实 DB、图片、秘密、绝对路径报告或大型 trace。
- 建议提交名见 `task_plan.md`，实际提交哈希写入 `progress.md`。

## 8. Stop 条件

遇到以下情况立即停止并报告，不自行扩权：

- 必须修改 schema/migration/trigger 才能持久化证据或封锁写入。
- 现有 public API 无法在不访问真实 provider/Keychain 的条件下完成首写证据。
- 需要放宽 final run、release identity、maintenance closed、secret scan 或 backup seal 才能通过。
- 无法在临时根重现完整 C0～C7，或只能退回 fake Prisma/fake restore。
- 发现真实路径、真实凭据或用户数据将被访问。
- 全量回归出现与本阶段无关且无法隔离的用户改动冲突。

## 9. 最终交付格式

```text
结论：`isolated_complete`（production entry 由 R0-A 接替，真实切换仍 no-go）
阶段提交：A1-0=<sha> ... A1-5=<sha>
定向证据：<测试 ID、文件数、测试数>
全量证据：<命令与结果>
Scrutiny Review：<路径、结论>
Runtime Review：<路径、结论>
G1 回填：隔离直接证据已回填；真实授权、真实 C0～C7、OBS-01～10 保持 `not_run`
真实操作：0
残留风险：<真实 C0～C7、真实 Keychain/provider、观察期>
停止点：未执行真实切换，未进入 G4/G5
```
