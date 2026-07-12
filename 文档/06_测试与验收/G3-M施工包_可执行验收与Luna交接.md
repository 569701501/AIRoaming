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
| G3-core | passed，基线 commit `0dbf93d` |
| G3-M0 maintenance | implemented，commit `e2caa13` |
| G3-M1 snapshot/runtime bundle | implemented，commit `131fbc2` |
| G3-M2 decision codec | implemented，commit `317e65a` |
| G3-M3-A0 audit ledger | implemented，commit `830554f`；纯内存账本 + sealed snapshot 审计 |
| G3-M3-A1 database audit | implemented，commit `053c74f`；Prisma ledger + `db:audit`，不导入业务实体 |
| G3-M3-A2 Project/Chapter shadow | implemented，commit `36203c8`；sealed snapshot + decisions + `db:import --kind shadow` |
| G3-M3-A3 Script/Outline shadow | implemented，commit `5d8e9d2`；Outline + ScriptVersion + `--slice script-outline` |
| G3-M3-A4 Script pending/revision shadow | implemented，commit `1e121d2`；Pending + Revision + `--slice script-pending-revision` |
| G3-M3-A5 Story shadow | implemented，commit `fb6e9d4`；StoryVersion + Scene/Beat projections + `--slice story` |
| G3-M3-A6 Storyboard shadow | implemented，commit `1a579c7`；StoryboardVersion + Shot/Projection + `--slice storyboard` |
| G3-M3-A7 Character shadow | implemented，commit `b337c88`；Character + `--slice characters` |
| G3-M3-A8 Asset metadata shadow | implemented，commit `0bf84d6`；Asset metadata + staged-only + `--slice assets` |
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

以下命令按切片逐步提供；`db:verify` 仍不得视为完成，`db:import` 目前支持 `--slice project-chapter`（A2）、`script-outline`（A3）、`script-pending-revision`（A4）、`story`（A5）、`storyboard`（A6）、`characters`（A7）和 `assets`（A8），不能作为 final 入口。M3-A0 额外提供一个不写 DB 的中间审计命令：

```text
maintenance（G3-M0 已提供）
db:snapshot
migration:audit:check（M3-A0：只读 sealed snapshot，不写 DB）
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
- 当前实现：`apps/server/src/maintenance/`、五类写入口接线、`maintenance` CLI、MNT-01～06。
- M0 bundle 仍是诚实骨架，明确标记 bridge 前不可观察的对话、任务和运行态；不能作为 M1 snapshot 或 importer 输入。

### G3-M1

- pre/post manifest、snapshot transform、redactor、symlink/path guard 与 sealed publish 通过。
- 源 hash/mtime 不变，两个绝对根同内容摘要一致。
- 当前实现：`apps/server/src/migration/snapshot.service.ts`、`runtime-bundle-file.service.ts`、`credential-redactor.ts`、`db:snapshot` CLI、SNP-01～06 与 runtime bundle 测试。
- M1 仍不包含 importer、decision codec、DB audit/import/verify、backup 或 activate；sealed snapshot 只能交给后续 M2/M3。

### G3-M2

- MAP-01～08、DEC-01～04 全绿。
- 具体 issue code、detail/resolution codec、decisionsDigest 与旧 run 不可变通过。
- 当前实现：`comic-format-migration.plugin.ts`、`migration-issue.ts`、`migration-decision.ts`、`migration-report.ts`、`migration:decisions:check` CLI；M2 只做 codec，不写 MigrationRun/目标 DB。commit：`317e65a`。

### G3-M3

- M3-A0 已完成：`migration-ledger.ts` 固化 run/issue/source 状态语义；`migration-audit.service.ts` 验证 sealed snapshot 并生成 comicFormat report；定向 7 项、全量 230 项测试通过。
- M3-A1 已完成：`prisma-migration-ledger.repository.ts` 接入 fresh SQLite，`db:audit` 持久化 audit run/issue/source；数据库集成 RUN-DB-01～03、AUDIT-DB-01 和全量 235 项测试通过。
- M3-A2 已完成 Project/Chapter shadow slice：读取 sealed snapshot，消费 comic-format decisions，在同一事务写入 Project/Chapter/ImportedEntitySource，稳定 ID 与 source/payload digest 可 replay；A2 集成 4 项、全量 239 项测试通过。
- M3-A3 已完成 Script/Outline shadow slice：导入 Outline version 1 与 ChapterScriptVersion history，恢复 current 指针并遵守 G2 working-copy/rowVersion 约束；A3 链路纳入集成测试，全量 240 项测试通过。
- M3-A4 已完成 Script pending/revision shadow slice：导入 `script-pending.json` 与 `script.revisions/latest.json`，不把 pending 误转 ScriptVersion；未导入 Dialogue 时旧 FK 置空并保留 source evidence；A4 纳入集成测试，全量 241 项测试通过。
- M3-A5 已完成 Story shadow slice：导入 `structure.json` 为 StoryVersion 与 Scene/Beat projections；source 可证明时按 pending→projection→confirmed→current formalize，source 不足时写 `STORY_SOURCE_UNRESOLVED` blocker，不插入伪 confirmed；A5 集成 2 项。
- M3-A6 已完成 Storyboard shadow slice：导入 `storyboard.json` 为 StoryboardVersion、Shot 与 ShotProjection；source 绑定 current Story，按 pending→Shot/Projection→confirmed→current formalize；A6 集成链路已通过。
- M3-A7 已完成 Character shadow slice：导入 `shared/characters.json` 的 Character 文本身份，并把 Story V2 旧角色 ID映射到同一稳定 target；Asset/Visual 仍未导入。
- M3-A8 已完成 Asset metadata shadow slice：导入 `shared/assets.json` 的稳定 Asset 身份、章节归属、类型、MIME 推断和 `meta` JSON 摘要；无物理文件证据时保持 `staged`，不创建 CharacterVisual/SceneVisual，也不标记 `ready`。
- M3-A0 明确不是 full importer：当时账本仍是纯内存实现，不接 Prisma，不创建 Project/Chapter。
- M3-A1 已接 Prisma，但仍不是 full importer：`db:audit` 只审计并写 MigrationRun/MigrationIssue，不创建 Project/Chapter，不消费 decisions artifact。
- M3-A2 仍不是 full importer：Script/Outline、Story、Storyboard/Shot、Preflight、Task、Asset/Visual、Candidate/Lock、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
- M3-A3 仍不是 full importer：pending/revision、Story、Storyboard/Shot、Preflight、Task、Asset/Visual、Candidate/Lock、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
- M3-A4 仍不是 full importer：Story、Storyboard/Shot、Preflight、Task、Asset/Visual、Candidate/Lock、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
- M3-A5 仍不是 full importer：Storyboard/Shot、Preflight、Task、Asset/Visual、Candidate/Lock、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
- M3-A6 仍不是 full importer：Character、Asset/Visual、Candidate/Lock、Preflight、Task、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
- M3-A7 仍不是 full importer：Asset/CharacterVisual/SceneVisual、Candidate/Lock、Preflight、Task、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
- M3-A8 仍不是 full importer：CharacterVisual/SceneVisual、物理文件 hash/bytes/尺寸、Candidate/Lock、Preflight、Task、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
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
目标切片：G3-M3-A0 audit ledger + sealed snapshot comicFormat audit
当前基线 commit：`317e65a`；A0 当前工作区提交后补入。
必读：G3-M 五份施工资料；G1 方案 6.3.2、6.5 C0～C2
允许修改：apps/server/src/migration/migration-ledger.ts、migration-audit.service.ts、migration-audit.cli.ts、对应测试与 package script
明确禁止：真实数据库写入、完整 importer、backup/activate、真实 workspace、G5、改变 G3-core enum/0010
实现：run/issue/source 纯内存状态机、sealed snapshot manifest/payload 验证、project comicFormat audit、确定性 report、audit CLI
最小测试：RUN-01～03 + AUDIT-01～03 + server 全测 + typecheck + G1 三项 check（已通过，证据见任务目录）
退出证据：blocked/succeeded run、source conflict、report digest、篡改 fail-closed、明确未完成 full importer
Stop：任何写入口无法被可靠枚举或需要触碰真实数据时停止并报告
```

M0 完成并复核后再发 M1，不要一次把 M0～M6 全交给 Luna。

## 10. 最终 go/no-go

可以开始 Luna 开发：yes，仅 G3-M0。

可以直接要求 Luna 完成全部 G3-M：no，范围跨 G1 maintenance/full importer/SecretStore/backup/cutover，必须逐切片。

可以现在运行真实 DB-only activate：no，capability/SecretStore/importer/backup/user authorization 门均未满足。
