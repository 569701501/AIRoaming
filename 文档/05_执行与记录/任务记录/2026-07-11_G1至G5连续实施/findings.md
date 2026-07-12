---
doc_id: AIR-TASK-20260711-G1-G5-IMPLEMENTATION-FINDINGS
status: active
created: 2026-07-11
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 事实源与代码只读审计
---

# Findings

## 已确认事实

- G0 已完成；整个 G0–G5 Goal 尚未完成，当前从 G1 开始。
- `apps/server/prisma/schema.prisma` 只有 6 个未接线模型，无 migration history、PrismaService、UoW 或业务 CRUD。
- `ProjectRepository` 的 Map + workspace 扫描/整树重写仍是业务事实源；`ProjectStore.getReadyProject()` 读取时也可能写盘，不能复用为 DB-only 查询层。
- `TasksService`、Dialogue threads 和多类 pending 仍在内存；图片候选与角色/场景各有独立 Promise 队列。
- `SettingsService` 仍把文本和三类图片 key 明文写入 `app-settings.json`，公开 DTO 仍含 `keyPreview`。
- Asset 直接写最终路径后再保存聚合，没有 staged/ready、sha256、Outbox 或恢复扫描；项目删除与迟到 worker 存在竞态。
- G0 E2E 只有临时 workspace，尚无独立 dataRoot/fake SecretStore marker；直接注入 `e2e-fake-key` 不能作为 G1 泄密验收。

## G1-0 Worker 结论

- G1 自动化根目录契约已固定为 `<temp>/airoaming-e2e-<runId>/{workspace,data,fake-secret-store}`，共享 `.airoaming-test-root` 同时绑定 runId 和三根绝对路径；仓库内 runtime state 也绑定相同路径，不能跨 run 复用。
- fake sentinel 不进入 child env、marker、runtime state、workspace 或 dataRoot；测试扫描只允许它命中 `fake-secret-store/image-provider.secret`。
- `cleanupE2EWorkspace` 继续支持 Server 先释放 workspace；全局 teardown 随后在允许 workspace 已缺失的前提下，重新校验共享 marker 与其余 owned roots，再删除整个 testRoot。启动失败与正常 Playwright teardown 都已运行通过。
- `SevenStageFixture` 需要主动清除可能继承的图片/文本 provider key；否则空 settings 会从真实环境变量生成默认配置。当前 fixture 在 Nest context 创建前清除这些值，dispose 后逐项恢复原环境。
- tempRoot 必须先对现存父目录做 `realpath` 规范化，再从 canonical parent 构造 testRoot；这样可兼容 macOS `/var -> /private/var` 的合法别名，同时拒绝把 symlink 指向 repo workspace、真实 dataRoot 或 home。prepare 还会再次核对 canonical parent，避免只检查最终 testRoot。
- E2E 父进程不能靠删除一小组已知 key 保证隔离，因为 Playwright 会把父环境继续合并给 webServer；当前父环境与 child 共用 allowlist 重建，未列出的 OpenCode/Google/Docker/npm 和任意 token 不进入测试进程。
- 测试 DB 明确绑定 `file:<temp-dataRoot>/db/airoaming.sqlite`，并创建 `data/db/` 父目录；G1-0 固定 `AIROAMING_PERSISTENCE_MODE=file`。`AIROAMING_MAINTENANCE_MODE` 在普通测试中必须完全不设置；accepted 契约只允许 `true` 表示“启动即维护”，`open/draining/closed` 是进程内协调状态而不是环境枚举。
- marker 和 owned-root 在删除前连续重读只能降低校验与删除之间的 TOCTOU 风险，不能宣称从操作系统层面彻底消除竞态；当前安全边界还依赖 run-bound canonical parent、不可跟随的最终 symlink 检查和失败即拒删。
- canonical 栅栏必须同时覆盖临时业务根和仓库内 runtime state 根。`cleanupE2EWorkspace/cleanupE2ERuntime` 在动作开始与每次递归删除紧前复验 temp parent；`prepareRunState`、state read/write、process-state rename 和 runtime cleanup 同样复验 `repo/tests/.runtime` 的 canonical parent。parent swap 负例全部使用 sandbox repoRoot，不修改真实 `tests/.runtime`。
- 虽然当前 E2E 已固定 `OPENCODE_AUTO_START=false`、OpenCode/image 均指向 loopback fake，Settings 只读取临时 workspace，仍把 HOME、XDG_CONFIG_HOME、XDG_CACHE_HOME 指向 run 临时目录，阻断未来 SDK/SecretStore 默认发现真实 credential 文件的回归面。
- 安全边界中的“真实账户 home”不能在每次校验时调用受环境影响的 `os.homedir()`；E2E runtime 与 SevenStageFixture 都在模块载入时使用 `userInfo().homedir` 捕获并 `realpath` 规范化稳定账户目录。即使 Fixture A 已把 `HOME` 指向 run 临时目录，Fixture B 仍必须在创建任何 owned root 前拒绝真实账户目录。
- `sanitizeInheritedEnvironment` 不再允许任意 `LC_*`；只精确放行标准 locale 名。`LC_FAKE_TOKEN` 与 OpenCode/Google/Docker/npm/任意 token 一样必须从 parent 和三类 child 环境消失。
- HOME/XDG 隔离会改变 Playwright 默认的 Chromium 查找位置，而 Playwright 1.61.1 worker 反序列化时会重新加载配置。主 runner 在清洗前读取 `chromium.executablePath()`；worker 只有在当前 HOME/XDG 与 `runtime.testRoot/home|xdg-cache` 精确相等，且官方路径位于该根下精确的 `ms-playwright` cache 时，才允许将安全非空 suffix 重锚到稳定账户 cache。最终 executable 只允许位于 canonical `userInfo().homedir` 默认 `ms-playwright` cache，或当前仓库中经 `@playwright/test` 依赖上下文精确解析出的 canonical `playwright-core/.local-browsers`；candidate realpath 后仍须严格位于对应允许根内、为普通文件并满足 `X_OK`。`PLAYWRIGHT_BROWSERS_PATH` 指向 `/tmp`、`/opt`、其他账户目录或 symlink 逃逸一律失败即止，不猜测、不扫描、不下载，也不进入 allowlist。`AIROAMING_E2E_CHROMIUM_EXECUTABLE_PATH` 一律忽略并从 parent/三个 webServer 环境清除；最终路径只写入全局与 Chromium project 的 `launchOptions.executablePath`。
- `global.setup.ts` 不得直接写 `runtimeDir/setup.json`。公共 `writeE2ESetupSummary` 在写入前后都验证 canonical runtime parent、matching run state 和目标类型；目标已是 symlink 或非文件立即拒绝。内容先写入本 run 目录内随机、`wx` 创建的 `0600` 临时文件，复验后 atomic rename；失败时仅在重新确认 run ownership 后清理临时文件。sandbox symlink 指向外部 sentinel 的负例证明外部 bytes/size/mtime 不变，正常首次写与重复替换均无临时残留。
- E2E runtime 与 SevenStageFixture 目前各有一套隔离实现。两套已覆盖相同的 canonical tempRoot、五字段 marker、四根 symlink、secret/DB 环境和恢复契约；重复实现是待 M0 收敛为共享测试隔离模块的技术债，本切片不越界重构生产持久层。
- 本切片只建立 fake SecretStore 的隔离载体和环境约定；生产 `ImageCredentialStore` adapter 尚不存在，也没有业务代码读取 fake store。该能力属于 G1 M1.6，不能把当前 sentinel 文件误报为 SecretStore 生产实现。

## 实施前决议

旧数据中的 `chapter_001`、`shot_001`、`script_outline_current` 等 ID 只在项目/章节作用域稳定，不能直接进入全局字符串主键。G1 importer 使用：

```text
sourceKey = workspace-v1:<projectId>:<entityType>:<legacyId-or-relative-key>
entityId  = stable scoped rekey(projectId, entityType, legacyId-or-relative-key)
```

- 原 legacy ID、路径和摘要保存在 `ImportedEntitySource`。
- project ID、已验证全局唯一且无碰撞的旧 ID 可以保留；作用域 ID 必须稳定重键。
- 新 runtime 实体使用 UUID v4。
- 现有容错型 `ProjectRepository` 不能作为 importer；必须新建严格、只读、确定性的 `LegacyWorkspaceReader`。

## 新增门禁

- `ENV-01～04`：三根隔离、marker、环境秘密清洗、真实目录不变。
- `REV-00～06`、`SCH-00～15`、`DOC-01～09`：审查协议、Schema 清单与文档一致性。
- `REP-01～12`：Repository、读取纯度、并发与兼容行为。
- `SEC-01～11`：SecretStore、无明文与单向 credential clearing。
- `TSK-00～23`：TaskPolicy、冻结输入、claim/fencing、attempt 与终结闭环。
- `AST-01～08`：Asset staged/ready、摘要、恢复和不可变历史边界。
- `OTB-01～05`：Outbox claim/fencing/幂等/backoff。
- `DEL-00～05`：deleting 拒绝新写/新任务，并以三事实 coordinated purge 约束全部删除路径。
- `LAY-01～06`、`EXP-01～06`：Layout 来源投影、seal/current 与发布导出。
- `MNT-01～04`、`SNP-01～05`、`RUN-01～05`、`IMP-01～20`：同 PID maintenance、snapshot、无秘密 runtime bundle 与严格导入。
- `SH-01～10`、`ACT-01～09`：shadow、DB-only 启动/激活、fallback 禁止与 firstBusinessWriteAt。
- `WIT-01`：旧 fixture 经正式 snapshot/import 后以 DB-only reopen，语义等价。
- `RB-01～06`、`OBS-01～10`：回滚边界与可观测性；正式 C0～C7 仍需动作级授权。

## G1-1 M0-A 契约首审

- 首版 `G1数据库Schema实施契约` 已精确列出 44 模型，分组数为 `4/6/10/5/9/4/6`，`0008` 不增加模型；Export `scopeKey`、G1 comicFormat 两值与 G4/G5 后置边界方向正确。
- 主 Agent 独立重跑 SCH-00 tracer：Prisma 6.19.3 + 44 模型名用例通过，关键字段用例仍按预期 Red（`PersistenceState` 只有 `id`）；不得将模型壳误报为 SCH-00 完成。
- 双重只读审查拒绝签收。首要阻塞是 manifest 只列 CHECK/trigger 名称，同名 `CHECK(1)`/`WHEN 0` 空壳也可自证；必须独立锁定 normalized expression 与 trigger timing/event/WHEN/body。
- 其他阻塞包括：0008 foreign_keys OFF + rebuild 的事务边界未经 Prisma 6.19.3 E0 证明；Boolean/Int/digest/storageKey 类型可绕过；formal projection、Layout/Task source binding、ready Asset/ExportArtifact、Outbox intent 可独立篡改；Task attempt/claim/legacy 隔离不足；Project.deleting 单栅栏无法证明文件 Outbox 已完成。
- 契约内部还有事实冲突：`DialogueToolResult.status` 漏三值 CHECK；legacy source 允许未知，但 Story/Storyboard/Preflight source policy/digest 被写成非空；`PersistenceState.cutoverRunId` 无 FK/激活形状；Candidate legacy prompt/spec nullability 与 G4 DTO 冲突；G1 exact manifest 尚不支持 G2～G5 合法 overlay。
- 在修订契约再次双签前，不生成 migration SQL，SCH-00～14 仍为 `not_run/in_progress`。
- Pass 1 返工已落盘：Story/Storyboard legacy source 可 unresolved，Preflight 来源不全不插伪行；Candidate runtime/legacy provenance 分支明确；formal projection、ready Asset/ExportArtifact、TaskSource/LayoutBinding 已有封口设计；Persistence、Outbox、Task claim 与 purge 栅栏已细化。
- 为禁止父行建立后晚插 source/binding，批准在现有 44 模型中增加 `GenerationTask.sourceSetSealedAt` 和 `LayoutRevision.bindingSetSealedAt`；不增加第 45 个模型。
- Prisma 6.19.3/SQLite 3.51.0 E0 在唯一 `/tmp` 根完成：成功 migration 可幂等复跑；COMMIT 前故意失败返回 `P3018`并完全回滚，下次 deploy 因 failed ledger 返回 `P3009`；新 sqlite3 连接 `foreign_keys=0`，所以 deploy 后 verifier/PrismaModule 必须在新连接上显式启用并读回 1。临时根已清理，仓库无探针残留。
- M0-A 的 claim/finalize 不能依赖 Prisma default 在 SQLite trigger 内生效：claim trigger 使用冻结的 UUID v4 SQL 与 Service claimAt；Attempt finish 是 Task terminal/retry 与 Slot release 的唯一原子入口，heartbeat 由 OLD fencing + AFTER slot 同步闭环。
- Runtime Task input 固定 `sourceProjection`，与 append-only GenerationTaskSource 精确投影并 seal；sourceType 统一 snake_case，V1 registry 冻结 target/owner/digest policy。旧 PascalCase 只保留为代码 model 名，不进入数据库。
- Story/Storyboard projection 必须在 parent pending 时先写，再 formalize/current；JSON1 只核对 V1/V2 stable path/owner/ref，semanticDigest 由 Codec/Repository 重算，因为 SQLite 无内建 SHA-256。
- readyAt 是 Asset 的永久历史边界；即使 ready→missing/deleting，核心 owner/storage/hash/source/metadata 不解冻。Outbox、MigrationRun/Issue、Persistence singleton 也不能通过 DELETE/重插绕过历史。
- r1 初版当时的机械事实为 `44/555/105/210`、`195/195` CHECK、`185/185` trigger、10 类 TaskPolicy 和 5 类 OutboxHandler，completeness 为 0；该 checkpoint 后续已被 r1 双审驳回，不是 current 计数。
- machine manifest 的 0 issue 不是审查签收：当前明确保持 `ready_for_scrutiny`、`acceptedReviews=0/2`、`migrationGenerationAllowed=false`。两名独立 Reviewer 未签收前，仍禁止扩展 Prisma 字段壳或生成 0001～0008 SQL。

## Pass 2 review gate P0 与收口结论

- 主 Agent 发现首版 base manifest 虽声明需要两名 Reviewer，却把 gate 永久 hardcode 为 0/2 且没有 attestation/report 协议、固定路径或执行入口；这会让“必须双审”和“机器永远无法到 2/2”同时成立，属于阻止后续 migration 的 P0。
- 正确边界是 immutable base + derived gate：base JSON 永久保持 `0/2 pending false`，`g1:manifest:review-check` 每次从 stored artifact、fresh 18 sources 和固定 bundle 计算结果，绝不回写 base。artifact 自摘要不合法、source stale、review/report stale/tamper/rejected/open P0/P1/unknown 均 fail closed。
- r1 当时固定 round 为 `g1-m0a-pass2-r1`；其四份证据现作为被驳回的不可改写历史保留。current round 已切换为 r2，Worker 仍无权代写 Reviewer 证明。
- derived `evaluatedAt` 不使用墙上时间：0 review 固定 epoch，有 review 取最大 `reviewedAt`；固定 JSON 字段顺序与结尾换行保证相同输入字节稳定。
- bundle 必须绑定 workspace 和固定目录链 identity，并拒绝 symlink、hardlink、非普通文件、超限、open/read/post-stat 或 entry-set 期间的任何变更；稳定错误不得泄露 report 内容或绝对路径。
- verifier 四个生产 source 纳入 manifest digest，review sidecars/reports/specs 排除以避免循环。Schema 契约状态不记录双审；任一摘要源变化后旧 digest/sidecar 自动 stale，必须重新 2/2。
- r1 契约日期与状态定义校正后当时的 digest 是 `sha256:5496ddcd51d62d6a4f9a5e92856e0dfd881b29d3d3e90d7ee0a024323873f39e`；它已随 r2 摘要源变化而 stale，只作历史留痕，不是 current acceptance identity。

## Pass 2 r2 返工结论

- r1 Reviewer A/B 的 P0/P1 均已转换为 source、契约或真实 SQLite 回归：r2 当轮 inventory 为 `44/556/105/210`、`195/195` CHECK、`194/194` trigger、10 TaskPolicy、5 OutboxHandler 和 44 PurgeOwnership，completeness 为 0。
- `PersistenceState.sourceManifestDigest` 专门绑定迁移输入/工作区身份，新增 `effectiveSchemaManifestDigest` 绑定 final verification 与当前发布 Schema；shadow/ready/db_only/recovery 形状、cutover/激活二次校验和激活后不可变均同时覆盖 source/effective。
- Task policy 已分离 routing target 与 write target；`story_parse/shot_generate` 以 Chapter 路由，完成时对 active pending Story/Storyboard 行的 ID 与自身 rowVersion 做 CAS。`tts/video/package` 的 owner 分别是 `Asset.id/ExportRevision.id`，`chapterRule` 保持 nullable。
- Outbox terminal guard 的逻辑优先级、Storyboard `json_each.type`/V1 精确角色绑定、5 类 child reparent、Layout 全字段投影和 Candidate/Lock/Asset 来源链、deleting Task 终结、Credential clearing 单向迁移均已收口。高风险 JSON/SQL 谓词使用 `IS/IS NOT` 与 `COALESCE(...,0)` 拒绝 SQLite NULL 三值逻辑 fail-open。
- 44 张表的 purge ownership 已机器穷尽；8 个新的 cascade/history root 均有与 registry 精确匹配的 DELETE guard。review bundle 在全部首读完成后逐文件 secure reopen/fstat/read/post-stat/path-stat 并重算 digest，覆盖 earlier-file append/same-size rewrite/rename-replace 的 TOCTOU。
- 真实 SQLite 测试在内存库建立 44 张 loose authority table 并实际 CREATE 全部 194 个 trigger；33 条用例覆盖完整 Outbox lifecycle、Storyboard 空角色正例、完整 source-backed Layout seal、分离 source/effective activation、8 个 purge root 和 credential 回滚。
- current review round 固定为 `g1-m0a-pass2-r2`；r1 四份证据必须 byte-for-byte 保留，r2 仍必须由两名独立 Reviewer 针对最终 current digest 重新产生四份证据。在 r2 `2/2 accepted` 前不生成 migration。
- r2 摘要源最终固定后生成的 current digest 为 `sha256:2fef00a5c016b48784db675fb9e88778c6e073dd6e0798c0c0fdbbeb2b5d279f`。

## Pass 2 r3 返工结论

- r2 两名独立 Reviewer 均给出 `rejected`，其四份 raw report/attestation 与 r1 四份证据一样只作不可改写历史；current round 已切换为 `g1-m0a-pass2-r3`。Worker 不创建 r3 raw submission、sealed bundle 或 review root。
- r3 当轮 source-only manifest digest 为 `sha256:210e5718052872aff4059f128525c56f3eafc7594dd488bc6275b3585e328963`，inventory 保持 `44/556/105/210`、`195/194`、10 TaskPolicy、5 OutboxHandler、44 PurgeOwnership、18 sourceDocuments，completeness 为 0。
- 新增 gate ownership 机械门禁：测试从 G1 QA 解析每个 current gate ID，先拒绝重复定义，再展开总控计划每个 slice 的单值/范围，要求每个 ID exactly one owner 且计划无 ghost。首轮 Red 精确暴露 25 个漏配 ID；同步后 `2/2` Green。
- 10 个 TaskPolicy 均新增 machine-readable `idempotencyKeyBindings`；placeholder、binding、来源字段和顺序必须 exact match，且全部在 `task_creation` 冻结。`story_parse/shot_generate` 的 key 改绑 `input.expectedTargetId`，不再重读可变 pending pointer。
- `ConversationMessage`、`DialogueRuntimeSession`、`PendingDialogueArtifact` 的 DELETE guard 已改为 all-state `WHEN 1`；active/running/pending 行也必须同时具备 deleting、processed purge outbox、无 active runtime task 三事实才可删除，不能以 DELETE 释放 pending slot。
- review gate 改为 canonical sealed snapshot：Reviewer 只拥有各自 raw pair；父编排通过唯一 publisher CLI，以 expected-previous digest CAS 逐代发布 `review-bundle.v1.json`。无 sealed file 时即使已有 1/2 或 2/2 raw pair，derived gate 仍是 0/2。
- publisher 采用同目录 `wx` lock/temp、file fsync、atomic rename、directory fsync；raw 必须无损 UTF-8 round-trip，最终候选在两层 JSON escaping 后仍不得超过 16 MiB，并在 rename 前由同一 reader codec 完整重验。任何失败均保留上一代 sealed bytes，清理本次 temp/lock。
- sealed reader 使用单一 FD 建立读取线性化点；同 inode append/same-size rewrite fail closed，完整读取后 pathname 被原子替换时，本次只返回旧 snapshot facts/digest。snapshot self digest、exact envelope bytes、report/attestation digest、round/role/manifest 和 generation chain 均受检。
- `bundleSnapshotDigest` 已进入 derived output 与 `attestationSetDigest`；`G1_REVIEW_` finding namespace 保留给协议错误，Reviewer 不能用碰撞 code 伪装 source/manifest 资格问题。第一名即使 rejected/open P1，第二名仍可独立发布，但最终 gate 必须拒绝。
- 最终 Worker 自验：non-tracer persistence `9 files / 141 tests`、review protocol `93 tests`、真实 SQLite DSL `36/36`、gate ownership `2/2`、constraint registry `4/4`、Server typecheck、manifest generate/check 与 `git diff --check` 全绿。SCH-00 保持 `1 passed / 1 expected failed`；真实 r3 gate 为 `0/2 pending`、`bundleSnapshotDigest=null`、预期 exit 1，r3 root 不存在。
- 未生成 migration、未扩展 `schema.prisma` 字段壳、未运行真实数据库/workspace/SecretStore/维护切换。只有 r3 sealed `2/2 accepted` 且 verifier exit 0 才能进入 migration 实施。

## Pass 2 r4 返工结论

- r3 两名独立 Reviewer 均给出 `rejected`，父 Orchestrator 已将四份 raw 与 `review-bundle.v1.json` 正式 sealed。五个文件 SHA-256 与内部 `bundleSnapshotDigest=sha256:45414800250472f44b4389f4aee6d11c564970f3ece7c175f71441fa360b7b40` 已冻结；current round/root 切换为 `g1-m0a-pass2-r4`，Worker 未创建 r4 root、raw 或 sealed 文件。
- gate grammar 原先只接受两位纯数字，导致正式 `IMP-05A` 被静默过滤。当前完整 ID grammar 接受数字后的 uppercase suffix，QA 第一列 gate-like malformed/prefix token 与 plan code span 非法语法一律抛错；G1-9 显式 exactly-own `IMP-05A`。fixture gate ownership 从 `2/2` 扩为 `3/3`。
- 单审 derived status 已冻结为唯一语义：0 review=`pending`；1 accepted 且无 blocking=`pending`；首份 rejected/open P0/P1 立即=`rejected`，但 publish preflight 仍允许第二角色独立提交；只有 2/2 accepted 才 accepted/exit 0。API 与进程级单审断言均覆盖 rejected/open-P1 两分支。
- sealed file identity 新增 `ctimeNs`。固定 known mtime、同 inode/同尺寸改写后恢复 mtime的回归仍得到 `fileChanged`；after-read pathname atomic replace 只在旧 FD 的 dev/ino/size/mtime/nlink 不变、仅 rename 造成 ctime 变化时按旧 bytes 线性化，继续返回旧 snapshot facts/digest。
- publisher 已以 atomic rename 为 commit point：pre-rename error=`not_committed` 并保留 prior generation；rename 后首次 bundle-directory fsync 前失败返回 `committed_recovery_required`，预先 fsync 的完整 marker 保留且 reader=`publishLocked`；首次 fsync 后 generation 已 durable，lock close/unlink 失败且 marker仍在同样 recovery-required；unlink 已可见而 final sync 失败返回 `committed_cleanup_warning`，携带 new digest 且 reader可安全读取，不虚构无 lock 窗口。
- recovery API/CLI 要求 round/role/manifest/previous/new digest/sealed count/token 全匹配，并用同一 sealed codec 读回 generation；先 fsync bundle directory，再 unlink marker + final sync。错 token 保持 marker和 blocked reader；recovery 输出始终 `migrationGenerationAllowed=false`，必须另跑 review-check。
- 文档中的 `pnpm ... review-publish -- --role ...` 现可真实执行：CLI 原生接受 standalone `--`。真实 package-script temp-workspace 进程测试覆盖第一代、stale CAS、第二代和 recovery；`apps/server/package.json` 进入 manifest source allowlist，使 package alias 也受 r4 当轮 digest 约束。sourceDocuments 因而由 18 增为 19。
- r4 当轮 manifest digest 为 `sha256:0acc15df259d1744bb26c6b853e994dadc6c4be48fcb1d8e2c798254bc01a237`；inventory 仍为 `44/556/105/210`、`195/194`、10 TaskPolicy、5 OutboxHandler、44 PurgeOwnership，completeness=0。
- 当前最终 Worker 证据：non-tracer persistence `9 files / 150 tests`，review protocol `101 tests`（manifest 4 + attestation 33 + bundle 45 + check 19），SQLite DSL `36/36`，gate ownership `3/3`，constraint registry `4/4`；typecheck、manifest generate/check、diff-check 通过。SCH-00 仍是 `1 passed / 1 expected failed`；r4 root absent，真实 gate `0/2 pending`、`bundleSnapshotDigest=null`、预期 exit 1。
- 未生成 migration、未扩展 `schema.prisma`、未接触真实 DB/workspace/SecretStore/维护切换。r4 sealed 2/2 accepted 前仍是 `no-go for direct migration`。

## Pass 2 r5 返工结论

- r4 两名 Reviewer 均为 `rejected`；四份 raw 与 sealed snapshot 五个 SHA-256、内部 `bundleSnapshotDigest=sha256:af02b5ab0d6a476fd1be61fd4b71ccd40811c97bfae0b17a3035f17b393c2a27` 已冻结。current round/root 切换为 `g1-m0a-pass2-r5`，Worker 未创建 r5 root、raw、sealed、lock 或 temp。
- gate-like detector 改为捕获任意长度 uppercase prefix，正式 valid grammar 仍严格为 2～4 字母。QA 定义只解析 header=`ID/Gate` 的正式表，避免普通示例误报；QA/plan 同时新增 `A-01`、`ABCDE-01` 负例，受控 `DEL-00（引用 ...）` 保持非定义正例，exactly-one/no-ghost 仍为 `3/3` Green。
- Schema 实施契约在 r5 当轮的 source 边界统一为 `19 = 16 TypeScript + 2 Markdown + apps/server/package.json`；更早轮次的 18 只作历史，不改写不可变 evidence。
- sealed reader 初始 pathname/open FD 继续严格要求 regular `nlink=1` 与完整 identity 一致。post-read 不再先把旧 FD `nlink=0` 当 hardlink；仅当 pathname 已是不同 regular `nlink=1` inode，旧 FD dev/ino/size/mtime 不变且 `nlink 1→0` 时接受真实原子覆盖并返回已读旧 generation。删除无替换、读后新增 hardlink、in-place append/改写均 fail closed。
- 生产形态测试直接执行 `rename(candidate,target)` 并断言旧 inode `nlink=0`；另补 deletion/no replacement 与 late-hardlink 负例。三条在旧实现均 Red，修复后 bundle `47/47` Green。
- source 最终固定后 manifest generate/check 得到 `sha256:d981372c9051bf89fe6d01c4be94b50cfad7fd5bbe71dea36ae67dccb02e6825`；inventory 仍为 `44/556/105/210`、`195/194`、10/5/44、19 sources、completeness=0。
- 最终 Worker 证据：non-tracer persistence `9 files / 152 tests`，review protocol `103 tests`（manifest 4 + attestation 33 + bundle 47 + check 19），SQLite DSL `36/36`，gate `3/3`，constraint registry `4/4`；typecheck、manifest check、diff-check 通过。SCH-00 仍是 `1 passed / 1 expected failed`；真实 r5 root absent，derived gate `0/2 pending`、`bundleSnapshotDigest=null`、预期 exit 1。
- r1～r4 历史文件 SHA 与 r3/r4 internal digest 均逐项复算一致。未生成 migration、未扩展 `schema.prisma`、未接触真实 DB/workspace/SecretStore/维护切换；r5 sealed 2/2 accepted 前继续 `no-go for direct migration`。

## Pass 2 r5 sealed 签收与 M0-A 实施边界

- r5 final sealed snapshot 已存在且通过生产 verifier：manifest digest=`sha256:d981372c9051bf89fe6d01c4be94b50cfad7fd5bbe71dea36ae67dccb02e6825`，first bundle=`sha256:f267e32886af1f91f22e0e7cda1f5803709a2088d0fedd2d08e31cd60d2eb422`，final bundle=`sha256:970c80b9511730aee257fb0eb9f18084947f991fee154cf19eb8b4720e5bb0e6`，sealed file SHA-256=`e5cc71f73a1ad418e9f8730cee9aa4a4e2108024931d2b05604de6a8aaef2953`。
- derived gate 为 `2/2 accepted`、`migrationGenerationAllowed=true`、blocking=0。唯一 P2 advisory 是 `G1-CONTRACT-P2-MANIFEST-SOURCE-COMMENT`，不阻止 M0-A；但修复它会修改 frozen manifest source 并使当前签收失效，因此明确后置。
- M0-A 的实现事实源保持 byte-frozen：manifest artifact、两份 Markdown、16 个 TypeScript source、package.json 与 r1～r5 review evidence均不可改。Schema、migration 和非 allowlist 测试必须从已签 manifest 反向实现，不能通过改期望值让实现 Green。
- migration 写入前必须实际调用 derived verifier并核对当前 digest、2/2 accepted 与 `migrationGenerationAllowed=true`；base JSON 中永久的 `migrationGenerationAllowed=false` 不是阻塞，也绝不能被手工改写。
- 运行验证只允许 marker-owned temp roots 和 temp `DATABASE_URL`；不得触碰真实 DB/workspace/settings/SecretStore/dataRoot，不执行生产维护、snapshot、import 或切换。

## Pass 2 r6 exact-unique 最小修订

- M0-A 首次真实 `prisma validate` 证明 r5 relation inventory 有一处不可表达：`Candidate.asset` 的 defining fields 是 `[assetId, projectId, chapterId]`，但唯一约束只覆盖严格子集 `asset_id`；Prisma 6.19.3 要求完整 defining fields exact unique 才能生成 singular inverse。SQLite 的 subset unique 虽然仍保证实际 0..1，不能据此把 Prisma SDL/manifest 声明为 1:1。
- 独立扫描 105 个 FK 关系确认 strict-subset-only 精确只有 `Candidate.asset`。r6 将反向关系改为 manifest 原生 `Asset.candidatesByAsset Candidate[]`，不新增 composite unique，不改变物理 `uq_candidates_asset(asset_id)`。
- Prisma 6.19.3 SQLite connector 不接受 relation FK `map`；renderer 仍 exact-match manifest FK name/local/ref/actions，但 SDL 省略 `map`。物理命名责任保留给 migration SQL + fresh SQLite 验证，不能把 SDL 限制误写成物理 FK 可匿名。
- renderer-only cardinality adapter 已删除；relation `list/optional/name` 完全来自 r6 manifest。r5 P2 JSDoc 在本轮自然 source 变更中关闭，注释现明确包含 package runner source。
- r6 当轮 digest=`sha256:356d2150ec848a1e4c583d170fee0b80b136bfe3c0990faefd49fe72aeadcfb6`，round/root=`g1-m0a-pass2-r6`；当时真实 root absent、gate `0/2 pending false`。r5 accepted 证据已成为旧摘要历史，不能授权 r6 migration。
- r6 当轮 Schema 已按 manifest 展开 44/556/210 并通过 `prisma validate`；当时 0001～0008 尚未生成，migration 目录不存在。随后双审整体 rejected。
- r6 最终自验为 9 suites/153 tests、Schema/renderer 4 tests、typecheck、manifest check、validate、diff-check 全绿；r1～r5 23 份历史文件 SHA 与 r3～r5 internal digest 复算一致。

## Pass 2 r7 source-bound Schema/migration generator

- r6 最终 sealed 结论是 Reviewer A accepted、Reviewer B rejected。Reviewer B 的两个 P1 分别是：FK physical name 只检查非空而非 exact 公式；production Schema renderer/CLI 未受 fixed manifest digest 绑定。r6 五份文件和 internal previous/final digest 已冻结为历史。
- r7 将 exact FK name 固定为 `fk_<local_table>_<ordered_local_columns>__<target_table>`：105 条 FK 必须逐条符合、全局唯一，并被唯一 defining relation 按 target/local/ref/actions 精确消费；wrong name/local/ref/actions、duplicate、unconsumed 都有 mutation 负例。
- Schema renderer/CLI、migration renderer/CLI 四个 production source 加入 allowlist，current sourceDocuments=`23 = 20 TypeScript + 2 Markdown + package.json`。transitive closure 扫描受摘要 TypeScript 的 relative static/dynamic import 与 relative require，未绑定本地 helper 会使 manifest check 失败。
- Schema writer 在 staging 前和 atomic replace 前重新验证 current exact 2/2、manifest identity、expected bytes与 staging identity；0/2 时 API/CLI 都失败，current schema bytes不变且无 stage residue。只读 `g1:schema:check` 当前通过。
- migration renderer 是 pure plan：九个 signed artifacts、8 migration、43 rebuild mappings 与 `4/6/10/5/9/4/6` model groups。0008 事务前 FK mode readback guard、每表 row-count + 双向全列 EXCEPT guard、COMMIT 前 FK guard 都是可执行 SQL，不以静态映射或 COMMIT 后 verifier 替代原子性。
- migration writer/checker 双重绑定 current 2/2、manifest 和 exact Schema；tree checker精确验证九个路径/bytes/SHA/entry set/单 FD identity，extra/missing/tamper、file/directory symlink 与 hardlink 均失败。fresh verifier 主动启用 FK 并要求读回 1，fresh ledger 只接受 8 条精确成功记录。
- marker-owned temp E0 证明：direct SQLite 双 replay exact inventory、0008 前数据逐列保持、FK OFF/ON 外层事务负例、same-count 值改写负例与 orphan rollback 均成立；真实 Prisma 6.19.3 为 8 success→no pending，orphan 失败为 P3018 rollback→P3009。
- current round/root=`g1-m0a-pass2-r7`，digest=`sha256:c32dd95ab61a2d8a89c25dbab45d0f3efb7323d504f6031dc2e51e38b5943d06`；真实 r7 root absent、gate `0/2 pending false`、migration tree absent。dry E0 不构成正式 `SCH-00～15` pass。
- 最终 source-freeze 验证为 Server `26 files / 253 tests`、typecheck、manifest check、Schema exact check、Prisma validate、diff-check 全绿；production Schema write、migration write/check 在 0/2 均按预期 exit 1且无残留；r1～r6 28 个历史文件 SHA 与 r3～r6 internal digest 复算一致。

## 风险

1. scoped legacy ID 全局碰撞。
2. file mode 读取即写入，误接线会污染旧源。
3. 整聚合保存与双 Promise 队列导致并发丢更新。
4. SecretStore 迁移后旧二进制不能恢复 plaintext，回滚必须使用兼容 G1 版本。
5. M4 正式切换是外部状态变更，必须在动作发生前重新取得用户明确授权。
