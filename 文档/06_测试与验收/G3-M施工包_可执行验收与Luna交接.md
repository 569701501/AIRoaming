---
doc_id: AIR-G3M-TEST-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 导入/切换验收、G3 MIG/RST/FLT deferred 用例与当前代码
---

# G3-M 施工包：可执行验收与 Luna 交接

## 1. 当前结论

M0～M4 foundation 已完成并正式签字；M5-A0～A3 已有实现，A4-1～A4-4 已完成并复核，M5 恢复为 `completed`。这不代表 full shadow 是 final importer，也不代表 pre-cutover/activate 或 M6 已完成。

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
| G3-M3-A8 Asset metadata shadow | implemented，commit `5d26fa5`；Asset metadata + staged-only + `--slice assets` |
| G3-M3-A9 Asset physical/Visual shadow | implemented，commit `b203647`；physical evidence + ready promote + `--slice asset-visuals` |
| G3-M3-A10 Preflight shadow | implemented，commit `775525f`；只接受可证明的 V2 source snapshot |
| G3-M3-A11A legacy Task shadow | implemented，commit `e45dbdf`；只导入不可执行历史任务 |
| G3-M3-A11B Candidate shadow | implemented，commit `ccd7c71`；验证 Shot/Task/Asset scope |
| G3-M3-A11C CandidateLock shadow | implemented，commit `ba132c3`；从原始 storyboard 锁定证据恢复修订 |
| G3-M3-A12 LayoutWorkingCopy shadow | implemented，commit `9e79deb`；旧 layout envelope 与来源绑定证据 |
| G3-M3-A13 Export evidence shadow | implemented，commit `ca5c449`；旧 manifest 只写 `legacy_unresolved` ExportRevision，不创建 ready Artifact/current |
| G3-M3-A14 Provider/settings shadow | implemented，commit `47c7680`；只导入脱敏 provider 元数据，旧 key 不进入 Secret |
| G3-M3-A15 Dialogue runtime shadow | implemented；captured 对话历史、closed session 与显式 pending Dialogue artifact 均导入并留证，deferred 状态零实体 |
| G3-M3 full importer | implemented，commit `9e04495`；新增 16 slice 依赖顺序编排与聚合摘要，仍不是 final importer |
| G3-M4 verifier/shadow | completed；来源注册表、full replay、双 fresh、API/Asset/DB-only、pending Dialogue、真实 CLI 与正式签字均已完成 |
| G3-M5 backup/restore | completed；A0～A3 与 A4-1～A4-4 已实现并复核，D2/M6 仍独立后置 |
| G3-M6 activate/cutover | prerequisite_blocked |

## 2. 必读顺序

1. G3-M施工包_依赖边界与切片门禁。
2. G3-M施工包_维护快照与运行态封口。
3. G3-M施工包_导入器决议与迁移账本。
4. G3-M施工包_备份恢复与DB-only激活。
5. 本文。
6. 原 G1 DB-only 方案第 6.3～6.5、G1 验收第 10～14 节、G3 迁移字典第 9～12 节。

## 3. 预期 package scripts

以下命令按切片逐步提供；`db:verify` 已有 M4 基础实现但仍不得视为完整验收，`db:import` 支持 16 个独立 shadow slice 以及显式的 `--slice full` 编排入口；`full` 只按依赖顺序运行 shadow，不是 final 入口。M3-A0 额外提供一个不写 DB 的中间审计命令：

```text
maintenance（G3-M0 已提供）
db:snapshot
migration:audit:check（M3-A0：只读 sealed snapshot，不写 DB）
db:audit
migration:decisions:check
db:import
# 全量 shadow 编排（仍不等于 final）
db:import --kind shadow --slice full --workspace-root <workspace-root>
db:verify
# 需要与本次 shadow run 一起提供已校验的 decisions artifact
db:verify --snapshot <sealed-dir> --decisions <normalized-decisions.json> --import-report <slice-report.json> --database-url <explicit sqlite url> --run-id <id> --report <output> --workspace-root <repo-root> --format json
db:capabilities（已实现；required blocker 存在时退出 2）
app:backup（coordinated 已实现；M5-A4 已完成）
app:restore（verify/materialize 已实现；M5-A4 已完成）
db:activate（未实现，D2/D3 阻塞）
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
- M3-A9 已完成物理资产与 Visual shadow slice：校验快照文件的 sha256/bytes/MIME/图片尺寸，在显式 workspace 安全落盘后 promote ready；导入 CharacterVisual、SceneVisual 和 current 指针，缺文件仍不创建视觉关系。
- M3-A10 已完成 Preflight shadow slice：只接受与 current Storyboard 摘要匹配的 V2 source snapshot；来源不足写 blocker，不创建伪 ready/current。
- M3-A11A 已完成 legacy Task shadow slice：完整旧任务导入 `legacy_imported`，残缺任务导入不可执行 `legacy_stub`，不进入 runtime claim。
- M3-A11B 已完成 Candidate shadow slice：验证 Candidate 的 Shot/Task/Asset 同 scope；旧 selected/locked 仅转为 generated 历史。
- M3-A11C 已完成 CandidateLock shadow slice：只从 sealed snapshot 原始 storyboard 的 `lockedCandidateId` 恢复不可变 lock revision，并验证 Candidate/Shot scope。
- M3-A12 已完成 LayoutWorkingCopy shadow slice：旧 `layout/layout.json` 包成 `legacy_chapter_layout_v1` envelope，完整来源记录 lock-set digest，来源不足标 unresolved，不设置 current LayoutRevision。
- M3-A13 已完成旧导出证据 shadow slice：扫描章节/项目 exports 目录，保留 manifest 摘要和物理来源 digest，写入 `ExportRevision(kind=layout_publication,status=failed,origin=legacy_import,completionApplicability=legacy_unresolved)`；不创建 ExportArtifact、不设置 currentExport，replay 保持单条历史。
- M3-A14 已完成 Provider/settings shadow slice：读取 sealed snapshot 的脱敏 `settings.redacted.json`，导入 ProviderConfig、CredentialMetadata 和 AppPreference 非秘密元数据；所有旧 key 保持未配置状态，不写入 SecretRef、fingerprint 或运行时可用凭据。
- M3-A15 已完成 Dialogue runtime shadow slice：maintenance 可注册对话状态 provider，明确 `captured=true` 时导入 ConversationThread、ConversationMessage、DialogueToolResult、closed DialogueRuntimeSession 和显式捕获的 PendingDialogueArtifact；M0 deferred bundle 不捏造对话实体。
- M3-A0 明确不是 full importer：当时账本仍是纯内存实现，不接 Prisma，不创建 Project/Chapter。
- M3-A1 已接 Prisma，但仍不是 full importer：`db:audit` 只审计并写 MigrationRun/MigrationIssue，不创建 Project/Chapter，不消费 decisions artifact。
- M3-A2 仍不是 full importer：Script/Outline、Story、Storyboard/Shot、Preflight、Task、Asset/Visual、Candidate/Lock、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
- M3-A3 仍不是 full importer：pending/revision、Story、Storyboard/Shot、Preflight、Task、Asset/Visual、Candidate/Lock、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
- M3-A4 仍不是 full importer：Story、Storyboard/Shot、Preflight、Task、Asset/Visual、Candidate/Lock、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
- M3-A5 仍不是 full importer：Storyboard/Shot、Preflight、Task、Asset/Visual、Candidate/Lock、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
- M3-A6 仍不是 full importer：Character、Asset/Visual、Candidate/Lock、Preflight、Task、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
- M3-A7 仍不是 full importer：Asset/CharacterVisual/SceneVisual、Candidate/Lock、Preflight、Task、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
- M3-A8 仍不是 full importer：CharacterVisual/SceneVisual、物理文件 hash/bytes/尺寸、Candidate/Lock、Preflight、Task、Layout/Export、Dialogue 和 provider metadata 尚未导入；`db:import --kind final` 固定 fail-closed。
- 当前已提供 full shadow orchestration：`full-shadow-importer.ts` 固定按 16 个 slice 的依赖顺序运行，尾部明确为 `layout → exports → dialogue → providers`；每个 slice 使用显式 runId，保留 MigrationRun，blocked/failed 都会进入聚合摘要并 fail-fast，不创建下游空 run；对不含 runId 的稳定结果摘要计算聚合 reportDigest。pending Dialogue artifact、read-model/API 等价和 DB-only 写隔离已实现，backup 和 activate 尚未实现，`db:import --kind final` 继续 fail-closed。
- G1 IMP-01～20 与 G3 MIG-01～15 全绿。
- 两个 fresh DB entity ID/reportDigest 一致；同库 replay 零新增；全量实体/指针，不只 comicFormat。

### G3-M4

- 当前基础实现：`MigrationVerifyService`/`db:verify` 只读 sealed snapshot 与目标 DB，检查 run/manifest、`integrity_check`、FK、blocker 和来源追溯锚点；CLI 只接受 `--format json`，非法格式在数据库初始化前 fail-fast；`effectiveSchemaManifestDigest` 使用 Prisma Schema + 全部有序 migration checksum 的 release identity，不再使用 G1 source manifest digest。
- G3 CLI 参数门禁已统一：`db:verify`、`db:import`、`db:audit`、`migration:audit:check`、`migration:decisions:check`、`db:snapshot`、`maintenance` 和旧格式审计均只接受单个 `--format json`；缺值、非法值、重复 flag 在各自副作用前返回稳定错误码，并由 `cli-format.spec.ts` 与入口 fixture 覆盖。
- `migration-source-evidence.registry.ts` 已按 entityType 注册单文件允许 storage-key pattern、Chapter 复合（chapter.json + script.md，缺 script.md 时复用 importer 的 chapter.json.sourceText fallback）和 runtime bundle canonical 摘要算法；`db:verify` 同时检查 source/snapshot manifest，settings/runtime 转换输入不会被误判为越界来源。
- 来源注册表契约测试已动态核对所有 shadow importer 的来源写入 entityType，并要求 single/composite/runtime 策略互斥；新增 importer 未登记来源类型会在测试阶段 fail-closed。
- `MigrationVerifyService` 只接受 `MigrationRun.kind=shadow`；成功 audit run 返回 `MIGRATION_RUN_KIND_INVALID`，`IMP-M4-11` 防止非导入账本被误报为 shadow 验证通过。
- `MigrationVerifyService` 只接受已注册的 A2～A15 shadow importerVersion；未知版本返回 `MIGRATION_IMPORTER_VERSION_INVALID`。成功 shadow run 必须带非空 `reportDigest`，否则返回 `MIGRATION_REPORT_DIGEST_MISSING`；`IMP-M4-12/13` 已锁定两项门禁。
- 已知 shadow importer 的 `counts.entityCounts` 必须存在、键完整、值为非负整数，并只允许来源注册键或明确上下文键（Project、A6 Shot）；缺失/非法分别返回 `MIGRATION_SOURCE_ENTITY_COUNTS_MISSING/INVALID`，`IMP-M4-14/15` 已锁定。
- succeeded shadow 的 run verification 必须是 schemaVersion=1 且同时声明 source/snapshot manifest 已验证；缺失/无效分别返回 `MIGRATION_RUN_VERIFICATION_MISSING/INVALID`，`IMP-M4-16/17` 已锁定。
- succeeded shadow 还必须带规范 `decisionsDigest`，且 `reportDigest` 必须符合 `sha256:<64位小写十六进制>`；缺失/非法分别返回 `MIGRATION_DECISIONS_DIGEST_MISSING`、`MIGRATION_DECISIONS_DIGEST_INVALID` 或 `MIGRATION_REPORT_DIGEST_INVALID`，`IMP-M4-18/19` 已锁定。该门禁只验证摘要存在性与形状，不把数据库字段自报当作报告正文重算。
- `db:verify` 现在必须读取显式 decisions artifact，并校验 artifact 的 sourceManifestDigest 对 sealed snapshot、decisionsDigest 对 MigrationRun 三方一致；缺失/非法/不一致分别返回 `MIGRATION_DECISIONS_ARTIFACT_MISSING`、`MIGRATION_DECISIONS_ARTIFACT_INVALID`、`MIGRATION_SOURCE_DIGEST_MISMATCH` 或 `MIGRATION_DECISIONS_DIGEST_MISMATCH`，`IMP-M4-20/21/22` 已锁定。
- `db:verify` 现在还必须读取本次 shadow slice 的 `--import-report` artifact；使用同一报告 codec 重算规范 `reportDigest`，并与 `MigrationRun.reportDigest` 绑定。缺失、非法或摘要不一致分别返回 `MIGRATION_REPORT_ARTIFACT_MISSING`、`MIGRATION_REPORT_ARTIFACT_INVALID` 或 `MIGRATION_REPORT_DIGEST_MISMATCH`，`IMP-M4-23/24/25` 已锁定。`--report` 仍是 verifier 自身输出路径，不能代替 `--import-report`。
- `IMP-M4-26/27` 已通过真实 `db:verify` CLI 成功路径和缺失 `--import-report` 的入口 fail-fast；前者验证 CLI 输出文件与 artifact 绑定，后者确认 Prisma 初始化前返回 `MIGRATION_VERIFY_ARGS_INVALID`。
- `IMP-M4-28` 已通过真实 `db:import --kind shadow --slice full` CLI 临时 SQLite 回归；聚合报告、16 个 slice 顺序、16 条 MigrationRun 和成功退出码均符合契约。
- `IMP-M4-29` 已通过 full CLI blocked prerequisite 回归；返回稳定 `MIGRATION_IMPORT_BLOCKED`/退出码 2，报告只含首个 blocked slice，不创建下游 run。
- `IMP-M4-30` 已通过真实 `db:import --kind final` CLI 回归；在 Prisma 初始化前返回 `MIGRATION_FINAL_IMPORT_NOT_READY`，不产生 stdout 或数据库副作用。
- `IMP-M4-31` 已通过 16 个独立 `db:import --kind shadow --slice <slice>` CLI 回归；每个入口按依赖顺序成功并写出合法报告，fresh DB 保留 16 条 MigrationRun。
- M4 证据矩阵见任务目录 `acceptance_checklist.md`；2026-07-13 已由 Codex 受用户委托完成静态与临时运行证据复核，状态为 `completed`。
- 单次 succeeded、转换来源、full replay、blocked/failed fail-fast、双 fresh 的 16 slice 逐片验证，以及 API/Asset/DB-only 写隔离门禁均已完成；当前 HEAD 复跑迁移集成 58/58、server 47 文件/303 tests 与全部静态门禁通过。
- 双 fresh DB 已证明：integrity=ok、FK=0、ledger exact、blocker=0，聚合 reportDigest、规范化 slice summary 和业务 inventory digest 一致（提交 `140092a`）。
- `IMP-M4-API-01` 已证明移走旧 workspace 后 DB 重启仍可读取，file/DB `WorkbenchSnapshot` 语义 DTO 一致；ready Asset 的 sha256/bytes 与旧物理文件一致；DB-mode 草稿写入不重建旧 workspace，归档旧文件字节不变（代码提交 `f05f8da` 后续补强）。
- `IMP-M4-03` 已证明 verifier 对未注册 `entityType` 返回 `MIGRATION_SOURCE_EVIDENCE_UNREGISTERED` 并保持 fail-closed；`IMP-M4-04/05/06` 已证明摘要、runtime 锚点和单文件 storage-key 越界均返回 `MIGRATION_SOURCE_DIGEST_MISMATCH`；`IMP-M4-07` 已证明缺失 `script.md` 的合法 Chapter fallback 可通过复合摘要校验；`IMP-M4-08` 已证明 unchanged replay 不更新 `lastRunId` 时，成功 run 的空当前来源查询返回 `MIGRATION_SOURCE_EVIDENCE_MISSING`；`IMP-M4-09` 已证明摘要正确但来源行超出 importer 报告计数时返回 `MIGRATION_SOURCE_EVIDENCE_COUNT_MISMATCH`，不会 vacuous pass；`IMP-M4-10` 已证明成功 full shadow 的 16 个 slice 均能通过精确来源计数与注册表校验；`IMP-M4-12/13` 已证明未知 importerVersion 与缺失 succeeded reportDigest 均被拒绝；`IMP-M4-14/15` 已证明已知 importer 的计数结构缺失或出现未注册键均被拒绝；`IMP-M4-16/17` 已证明 succeeded shadow 缺失或无效 verification attestation 均被拒绝；`IMP-M4-18/19` 已证明 decisions/report digest 形状门禁均 fail-closed；`IMP-M4-20/21/22` 已证明 decisions artifact 缺失、run digest 不一致或 source manifest 不一致均 fail-closed；`IMP-M4-23/24/25` 已证明导入报告 artifact 缺失、非法或与 run 摘要不一致均 fail-closed；`IMP-M4-26/27` 已证明真实 `db:verify` CLI 成功输出和缺参 fail-fast 均符合契约；`IMP-M4-28` 已证明真实 `db:import --slice full` CLI 聚合报告、16-slice 顺序、MigrationRun 数量和成功退出码均符合契约；`IMP-M4-29` 已证明 full CLI blocked prerequisite 返回稳定失败码、保留首个 blocked run 且不创建下游 run。
- final cutover 前投影读取点静态审计已记录：业务 read-model/Task 走 DB，Asset physical storage 是允许的文件边界；SettingsService 仍依赖旧 `app-settings.json`，M5-A0 必须如实登记为 unsupported，并在 D2/M6 前另行闭合，不能作为 M4 或 production-ready 证据。
- `IMP-A15-02` 已证明 captured pending Dialogue artifact 能按稳定 sourceKey 导入，维持 project/chapter/thread scope、payloadDigest 和 runtime-bundle 来源证据，并在 replay 时保持单行。
- DB-mode 修改旧 metadata 不影响响应；DB 写不改旧文件。

### G3-M5

- 原始实现记录：`文档/05_执行与记录/任务记录/2026-07-13_G3-M5协调备份恢复/`；最终收口证据：相邻 `2026-07-13_G3-M5A4验收收口/`。
- M5-A0 truthful capability registry、A1～A3 happy path 与 A4-1～A4-4 故障矩阵均已实现并复核，M5 状态为 `completed`。
- 当前 `db:capabilities --check` 仍可能因 D2 业务 capability 返回 `MIGRATION_CAPABILITY_BLOCKED`；这不是 M5 未完成。

### G3-M6

- M6 tooling 和带 marker 的临时 C0～C7 rehearsal 可在 D2 全绿后由连续总 Handoff 自动执行，不需要逐阶段用户回复。
- 真实 CAP/C0～C7 执行仍要求用户重新授权；真实阶段必须顺序执行。
- G1 RST/RB/ACT 与 G3 RST-03/RST-05/FLT-04 在临时根先全绿。
- firstBusinessWriteAt 前后回滚边界先在隔离 fixture 分别演练；真实切换后再留 Runtime/User Review 证据。

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

## 9. 当前 Luna 连续任务书

M5-A4-1～A4-4 已完成并复核。用户已把执行方式改为一个连续总目标：内部仍按 D2-A2～A8、M6 tooling 顺序逐阶段验收和提交，但阶段通过后自动续跑，不再等待用户逐步确认。

唯一入口：

`文档/05_执行与记录/任务记录/2026-07-13_D2至M6连续交付总目标/handoff.md`

第一内部阶段继续使用 D2-A2-1 五份详细资料。连续任务可以完成 D2 全部代码、final importer、activate tooling 和临时根 C0～C7 演练；不得触碰真实数据、真实凭据或执行真实 cutover。

## 10. 最终 go/no-go

可以开始 Luna 连续开发：yes；总 Handoff 已覆盖 D2-A2～A8 与 M6 tooling。

可以让 Luna 按一个总目标连续完成剩余开发：yes，但内部必须逐切片、自测、复核、独立提交，不得并行越级。

可以现在运行真实 DB-only activate：no；其余 capability、final importer、activate tooling、真实停写与用户授权门仍未满足。
