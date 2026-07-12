---
doc_id: AIR-G3M-TEST-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 导入/切换验收、G3 MIG/RST/FLT deferred 用例与当前代码
---

# G3-M 施工包：可执行验收与 Luna 交接

## 1. 当前结论

文档已达到 foundation 开发就绪；production cutover 尚未就绪。Luna 应从 G3-M0 开始，每次只领取一个切片。

| 范围 | 当前状态 |
| --- | --- |
| G3-core | passed，代码未提交 |
| G3-M0 maintenance | not_implemented |
| G3-M1 snapshot/runtime bundle | not_implemented |
| G3-M2 decision codec | not_implemented |
| G3-M3 full importer | not_implemented |
| G3-M4 verifier/shadow | not_implemented |
| G3-M5 backup/restore | not_implemented |
| G3-M6 activate/cutover | prerequisite_blocked |

## 2. 必读顺序

1. G3-M施工包_依赖边界与切片门禁。
2. G3-M施工包_维护快照与运行态封口。
3. G3-M施工包_导入器决议与迁移账本。
4. G3-M施工包_备份恢复与DB-only激活。
5. 本文。
6. 原 G1 DB-only 方案第 6.3～6.5、G1 验收第 10～14 节、G3 迁移字典第 9～12 节。

## 3. 预期 package scripts

以下命令是实现目标，当前尚不存在；Luna 在对应切片新增，不得提前把空壳命令标绿：

```text
maintenance
db:snapshot
db:audit
migration:decisions:check
db:import
db:verify
db:capabilities
app:backup
app:restore
db:activate
```

每个 CLI 支持 --format json；成功/失败都返回稳定 code，不打印物理根、正文、prompt 或 secret。

## 4. 测试文件责任

```text
apps/server/src/maintenance/maintenance-coordinator.spec.ts       MNT-01～06
apps/server/src/migration/snapshot.service.spec.ts                SNP-01～06
apps/server/src/migration/runtime-bundle.service.spec.ts          runtime/redaction
apps/server/src/migration/comic-format-migration.plugin.spec.ts   MAP-01～08
apps/server/src/migration/migration-decision.spec.ts               DEC-01～04
apps/server/src/migration/migration-import.integration.spec.ts    IMP/MIG
apps/server/src/migration/migration-verify.integration.spec.ts    SH/verification
apps/server/src/migration/db-capability-registry.spec.ts           CAP-01～02
apps/server/src/backup/app-backup-restore.integration.spec.ts     BAK/RST
apps/server/src/migration/db-activate.integration.spec.ts          ACT/RB
tests/e2e/api/g3m-maintenance-cutover.spec.ts                      临时进程用户路径
```

生产切换本身不由 E2E 自动触碰真实根；自动测试只用 seven-stage fixture 同等级的三根隔离和 marker。

## 5. 分切片绿色条件

### G3-M0

- open/draining/closed/handed_off 状态机、mutation lease、participant、loopback token 管理通过。
- Projects/Dialogue/Tasks/ToolCallback/Settings 的新写入都有覆盖。
- 退出证据：503 envelope、active=0 status、同 PID runtime bundle。

### G3-M1

- pre/post manifest、snapshot transform、redactor、symlink/path guard 与 sealed publish 通过。
- 源 hash/mtime 不变，两个绝对根同内容摘要一致。

### G3-M2

- MAP-01～08、DEC-01～04 全绿。
- 具体 issue code、detail/resolution codec、decisionsDigest 与旧 run 不可变通过。

### G3-M3

- G1 IMP-01～20 与 G3 MIG-01～15 全绿。
- 两个 fresh DB entity ID/reportDigest 一致；同库 replay 零新增；全量实体/指针，不只 comicFormat。

### G3-M4

- 连续两轮 fresh shadow：integrity=ok、FK=0、ledger exact、blocker=0、API DTO 等价、Asset hash 一致。
- DB-mode 修改旧 metadata 不影响响应；DB 写不改旧文件。

### G3-M5

- offline backup→空 data/workspace restore→maintenance API smoke 通过。
- 篡改、secret、ready Asset 缺失、非空目标均 fail-closed。

### G3-M6

- CAP required 全绿；用户重新授权；C0～C7 顺序执行。
- G1 RST/RB/ACT 与 G3 RST-03/RST-05/FLT-04 全绿。
- firstBusinessWriteAt 前后回滚边界分别演练。

## 6. 验证命令模板

每切片至少执行：

```bash
corepack pnpm -w typecheck
corepack pnpm --filter @airoaming/server test
corepack pnpm --filter @airoaming/server g1:manifest:check
corepack pnpm --filter @airoaming/server g1:schema:check
corepack pnpm --filter @airoaming/server g1:migration:check
git diff --check
```

增加模块后再执行对应的定向 Vitest 和 CLI fixture。M4 后执行临时 DB E2E；M6 才执行经用户授权的真实 Runtime/User Review。

## 7. 证据目录

```text
文档/05_执行与记录/任务记录/<date>_G3-M实施/
  task_plan.md
  progress.md
  findings.md
  handoff.md
  scrutiny_review.md
  runtime_user_review.md
  evidence/
    commands.md
    maintenance-status.json
    source-manifest.json
    snapshot-manifest.json
    decisions.example.json
    migration-report.summary.json
    verification.summary.json
    backup-restore.summary.json
```

仓库只提交脱敏小摘要；不提交真实 DB、workspace 副本、图片、密钥、完整正文或绝对路径。

## 8. Scrutiny Review

每轮只读复核必须回答：

1. 新 mutation 是否全部走同一个 maintenance lease，包括内部 tool/worker。
2. snapshot 是否只读 sealed source，pre/post 是否精确一致。
3. runtime bundle/报告/日志是否通过统一 redactor。
4. file reader 与 importer mapper 是否仍是两个模块。
5. four_panel/missing/invalid 是否无默认，旧 run 是否不可改。
6. sourceManifestDigest、snapshotManifestDigest、decisionsDigest、reportDigest 是否各自语义清楚并精确绑定。
7. final importer 是否全量覆盖，是否存在只插 Project 的假完成。
8. capability registry 是否由测试证明，而不是手填 completed。
9. backup 是否真实恢复到空根并校验 DB/Asset/API。
10. activate 是否验证 final run、current release、backup、first write 和用户授权。

任一答案为否，当前切片不得通过。

## 9. 第一张 Luna 任务书

```text
目标切片：G3-M0 maintenance gate
当前 commit：交付前填写 git rev-parse --short HEAD
必读：G3-M 五份施工资料；G1 方案 6.3.2、6.5 C0～C2
允许修改：apps/server/src/maintenance/**、必要的 App/Projects/Dialogue/Tasks/ToolCallback/Settings 模块接线、对应测试与 package script
明确禁止：snapshot/importer/backup/activate、真实 workspace、G5、改变 G3-core enum/0010
实现：open→draining→closed→handed_off；runMutation；五类 participant；loopback+token 本地控制；closed runtime bundle 骨架
最小测试：MNT-01～06 + server 全测 + typecheck + G1 三项 check
退出证据：状态 JSON、503 envelope、同 PID bundle、残留 blocker
Stop：任何写入口无法被可靠枚举或需要触碰真实数据时停止并报告
```

M0 完成并复核后再发 M1，不要一次把 M0～M6 全交给 Luna。

## 10. 最终 go/no-go

可以开始 Luna 开发：yes，仅 G3-M0。

可以直接要求 Luna 完成全部 G3-M：no，范围跨 G1 maintenance/full importer/SecretStore/backup/cutover，必须逐切片。

可以现在运行真实 DB-only activate：no，capability/SecretStore/importer/backup/user authorization 门均未满足。
