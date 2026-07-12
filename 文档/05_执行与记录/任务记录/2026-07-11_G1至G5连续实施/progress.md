---
doc_id: AIR-TASK-20260711-G1-G5-IMPLEMENTATION-PROGRESS
status: in_progress
created: 2026-07-11
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 至 G5 连续实施时间线
---

# Progress

## 2026-07-11

- 用户指出不能把 G0 完成误判为整个 Goal 完成；重新建立 G0–G5 active Goal。
- 读取项目入口、产品流程、架构、数据、任务、素材、模块、G1 方案/Schema/验收与现有规划交接。
- 三名只读审计 Agent 分别核查 persistence、tasks/secrets/outbox/dialogue 和验收可执行性。
- 确认 G1 实现基本为 0，并发现 scoped legacy ID 与全局主键的必然碰撞。
- 决定先执行 G1-0 安全夹具，再进入 M0 Schema；正式真实数据切换保留动作级授权停止线。
- 建立本总控任务目录；尚未运行 migration，未修改真实 workspace、设置或密钥。

### G1-0 Worker：测试安全夹具

- 按 TDD 先增加 `ENV-01`：首轮因 `runtime.testRoot` 尚不存在而失败；最小加入三根路径和共享 marker 后目标用例 `1/1` 通过。
- 完成 `ENV-01～04`：每次 run 使用同一带 marker 的临时 `testRoot`，其下分离 `workspace/`、`data/`、`fake-secret-store/`；路径必须与 runId 精确绑定，危险覆盖、symlink、marker 不匹配均拒绝，递归清理前连续两次重读 marker 和 owned-root 类型。
- Server/Playwright 环境新增 `AIROAMING_DATA_ROOT`、`AIROAMING_SECRET_STORE_ADAPTER=fake`、`AIROAMING_FAKE_SECRET_STORE_ROOT`；删除 `OPENAI_IMAGE_API_KEY/GROK_IMAGE_API_KEY=e2e-fake-key` 直注入。唯一 `airoaming-test-secret-<runId>` 只写入 fake store 的 `image-provider.secret`。
- `SevenStageFixture` 同步使用三根临时目录、fake secret sentinel 和环境快照恢复；没有新增生产 SecretStore adapter、Prisma/schema 或业务绕过。
- 首轮静态审查未签收：发现 tempRoot 祖先 symlink 只做词法判断、marker/symlink 负例不足、父进程环境没有按 allowlist 重建、测试数据库变量没有显式隔离、fixture prepare 失败后环境恢复不完整。
- 返工 TDD：E2E 定向首轮出现 canonical alias 与 `DATABASE_URL` 两条 Red；SevenStageFixture 定向首轮 `3/3` Red（canonical 两条、reopen 失败环境未恢复一条）。实现 canonical realpath、完整环境栅栏和恢复后，E2E 定向 `5/5`、SevenStage 定向 `6/6` Green。
- 返工补齐：canonical tempRoot 同时拒绝指向 repo workspace、受保护 dataRoot 和 home 的 alias；合法 marker 克隆后逐字段篡改五项；testRoot/workspace/data/fake-secret-store 四根在 prepare/cleanup 两入口的 symlink 负例；startup failure 五根全清；父/Server/fixture 使用临时 `DATABASE_URL` 并固定 `persistence=file`；Playwright 父环境按 child 同一 allowlist 重建。
- 验证：`ENV-01～04` 扩为 `16/16`；`test:e2e:env` `22/22`；Server Vitest `14 files / 78 tests`；E2E prepare `3/3`；带 OPENCODE/Google/Docker/npm/arbitrary token 与真实 DB 毒值的实际 harness `1/1`；Playwright 全量 `3/3`。最终 `corepack pnpm test:all` 聚合门禁通过（shared `15/15`、server `78/78`、prepare `3/3`、Playwright `3/3`）。
- 二次静态审查再次未签收：指出 tempRoot 在 prepare 后发生 parent swap 时 cleanup 尚未复验、`repo/tests/.runtime` 有同类祖先 symlink 风险、maintenance 环境值不符合 accepted 契约、首次 start 失败与 `LC_*` allowlist 仍缺专项证据。
- 二次返工 Red：sandbox 定向 E2E `3/3` 失败（temp parent swap cleanup、runtime state parent swap、`maintenance=open`）；SevenStage 定向 maintenance 用例失败。修复后 sandbox `e2e-env.test.ts` `18/18`、SevenStage isolation `7/7`、E2E/Server typecheck 通过。
- 二次返工补齐：cleanup 开始与每次 `rm` 紧前重验 canonical temp parent；runtime state root 在 prepare/read/write/cleanup 与 `rm` 紧前重验；普通 file 测试完全删除 maintenance env；HOME/XDG 改到 run 临时目录；`LC_*` 改为精确 locale allowlist；首次 start 在环境应用后由确定性 Nest context 失败验证全部环境恢复和 owned root 清理。
- 主 Agent 独立重跑聚合门禁：typecheck、shared `15/15`、server `79/79`、E2E environment `24/24`、prepare `3/3` 和 API 用例通过；两个 Chromium 用例因隔离后的临时 `HOME` 改变 Playwright 默认 executable 查找位置而失败，teardown 仍完成清理。此结果定位出测试夹具自身的浏览器路径回归，不是业务断言失败。
- 浏览器路径返工 TDD：新增子进程配置契约，首轮以 `E2E_CHROMIUM_PATH_NOT_PINNED_BEFORE_HOME_ISOLATION` Red；最初曾用专用环境变量传递路径，但最新安全复核以 `/bin/sh` 毒值证明该变量既可能被错误信任也不应传播，方案已彻底删除。Playwright 1.61.1 worker 会重新加载配置：直接 `stat` 临时 HOME 路径和仅依赖首次配置值的两次真实运行均为 `3/3` Red，且 teardown 均完成清理。最终只对 Playwright 官方返回且位于精确 run-owned HOME/XDG cache 下的安全非空 suffix 重锚到 canonical 账户默认 cache，再做 `realpath + regular-file + X_OK` 验证；其他不可信或不存在路径失败即止。全局/项目 `launchOptions` 显式固定，主 runner/worker 两次求值收敛且同名继承变量从 parent/三个 webServer 环境消失。
- 第三轮安全复核发现 `os.homedir()` 会随临时 `HOME` 改变，可能让真实账户目录绕过保护。E2E runtime 与 SevenStageFixture 各新增一个“Fixture A 已改写 HOME，Fixture B 仍拒绝真实账户 home 且写入前失败”的 Red；改为模块载入时从 `userInfo().homedir` 捕获并 canonicalize 稳定账户目录后，两条回归 Green。
- 第四轮 P1 复核发现 `global.setup.ts` 直接写 `setup.json` 会跟随预置 symlink 截断外部文件。新增 symlink 外部 sentinel 与正常/重复替换两条测试，首轮因安全 helper 不存在而 `2/2` Red；随后写入收口到 `writeE2ESetupSummary`：先验证 canonical runtime parent 与 matching run state，拒绝 symlink/非文件目标，以随机 `wx` 临时文件写入，写后再次复验 parent/state/目标和临时文件，再 atomic rename；失败只在重新确认本 run 后清理 owned 临时文件。外部 sentinel 的 bytes/size/mtime 不变且无临时残留，`2/2` Green。
- 第五轮浏览器 trusted-root 复核指出 `PLAYWRIGHT_BROWSERS_PATH` 能让官方 API 返回任意 `/tmp`/`/opt` 可执行文件，且宽泛 HOME suffix 可能映射到真实账户 `.ssh`。新增 `/opt`、run HOME `.ssh`、run XDG `other`、账户 cache 内 symlink 逃逸和 sandbox 假 browser override 负例，首轮 `3/3` Red。最终允许根收紧为 canonical 账户默认 `ms-playwright` cache，或通过当前仓库 `@playwright/test` package 上下文精确解析出的唯一 `playwright-core/.local-browsers`；run 重锚还要求 HOME/XDG 与 `runtime.testRoot/home|xdg-cache` 精确相等。candidate realpath 后必须仍严格位于允许根内、为普通文件且满足 `X_OK`。真实 CLI 首轮另发现 `import.meta` 被 Playwright CJS loader 拒绝；改为从 canonical repo `package.json` 建立 `createRequire` 后转绿。
- 最新增量验证：`e2e-env.test.ts` `21/21`、SevenStage isolation `8/8`、浏览器纯函数/symlink/主 runner-worker/sandbox override 契约 `4/4`、`test:e2e:env` `31/31`、E2E/Server typecheck 均通过；显式清除 `PLAYWRIGHT_BROWSERS_PATH` 并带 `AIROAMING_E2E_CHROMIUM_EXECUTABLE_PATH=/bin/sh` 毒值隔离运行 `browser-path-runtime + harness-lifecycle + project-library-and-stage-rail` 为 `3/3`，并输出 `[e2e-teardown] cleaned`。最新改动后尚未再次运行整个 `test:all` 聚合命令，不能把分项通过误写成最新聚合通过。
- 真实目录证据前后完全一致：workspace 内容摘要 `c0928833…`、路径/大小/mtime 摘要 `169a8f74…`、settings 摘要 `f2ad389e…`、settings mtime/size `1783603711/1518`；用户服务端口 PID 仍为 `4310=16324`、`5173=48958`。
- 主 Agent 在最终共享树上独立运行 `corepack pnpm test:all`，聚合门禁通过：三包 typecheck、E2E typecheck、shared `15/15`、server `80/80`、`test:e2e:env` `31/31`、prepare `3/3`、真实 Playwright `4/4`；global teardown 输出 cleaned。随后复核 workspace 内容摘要、路径/大小/mtime 摘要、settings hash/mtime/size、4310/5173 PID 与临时残留，均保持上述基线。
- Scrutiny Review 与秘密/真实路径安全终审均明确签收，未发现剩余 P0/P1。保留的非阻塞边界只有：双重重读不能从 OS 层彻底消除 TOCTOU，以及 E2E runtime/SevenStageFixture 两套隔离实现待 M0 收敛。

## 当前状态

- G0：`completed`
- G1：`in_progress`（G1-0 已签收；M0-A current 为 Pass 2 r7 `0/2 pending`。受摘要约束的 Schema/migration generator 与隔离 E0 已完成，正式 migration tree 等待 r7 双审）
- G2～G5：`pending`

### G1-1 M0-A：Schema 实施契约首轮打回

- Schema Worker 先用 TDD 固定 Prisma/Client `6.19.3`、44 模型名和关键字段 tracer；主 Agent 独立运行得到 `1 passed / 1 failed`，Red 精确落在未展开的 `PersistenceState` 关键字段。
- Worker 在未生成 migration 的前提下建立 1307 行实施契约，展开 44 模型的字段、物理映射、enum/open vocabulary、unique/index/FK/CHECK/trigger 和 0001～0008 归属。
- Acceptance Scrutiny 与 SQLite/Task/Secret Scrutiny 都拒绝签收。共同阻塞是约束只锁名字而没有锁语义、projection/source 投影可直写、legacy nullable 与非空字段冲突、激活/任务/Outbox/删除栅栏不足。
- 当前决议：只返工契约和相关 accepted 文档，不扩展 schema 字段壳、不生成 0001～0008 SQL。修订后重做双重只读签收。
- 子 Agent 在 Pass 1 返工与 E0 收尾时因额度中断；用户明确要求继续后，主 Agent 接管并完成剩余 Markdown 修订，未把中断误判为完成。
- Pass 1 已同步 G1 Schema 字典、G2 source/freshness、G4 Candidate DTO/线性索引、G5 Layout/Export 与开发方案；机械检查仍为精确 44 个模型/555 个标量字段，无重复字段，`git diff --check` 通过。
- E0 证明 Prisma 6.19.3 不在 migration.sql 外再包 SQLite 事务，显式 `BEGIN IMMEDIATE` 可用；迁移内 FK-count guard 放 COMMIT 前，COMMIT 后的 integrity/FK/manifest/ledger 由独立新连接 verifier 断言。
- Pass 1 二审继续打回 Persistence/ever-ready Asset、Task claim/finalize/heartbeat/slot、Outbox fencing、Credential ref、purge 根门禁、formal projection 时序和 source registry 等可绕过边界；主 Agent 逐项修订契约，仍未生成 migration。
- 当前契约已冻结 Task/Outbox 排他状态图、Attempt 驱动终结、Slot 同 statement 同步、Secret ref 唯一与 Outbox 清理、禁止直接 ready/processed、singleton/run 激活信任链、G1 base/后续 overlay 所有权和 canonical CHECK/Json/trigger 规则。
- 补齐 `TaskSourceProjectionV1 + TaskSourceRegistryV1` 的 snake_case token、target owner/digest policy，以及 `FormalProjectionRegistryV1` 的 Story/Storyboard V1/V2 JSON path；semanticDigest 明确由 Codec 测试，不伪造 SQLite SHA-256。
- 最新机械复核：44 模型，分组 `4/6/10/5/9/4/6`，555 标量字段、0 重复；`git diff --check` 通过。SCH-00 tracer 保持预期 TDD Red：模型清单通过，关键字段因 Prisma 仍是 id-only shell 在 PersistenceState 失败（`1 passed / 1 failed`）。第三轮双重只读签收进行中，Pass 2 尚未放行。

### G1-1 M0-A：P0/P1 文档收口与 Pass 2 machine manifest

- 补齐 G1 验收清单中的 `TSK-00`、`OTB-01～05`、`DEL-00`、`MNT/SNP/RUN`、`ACT-01～08`、`WIT-01`；新增完整 10 类 `TaskPolicyRegistryV1` 和 5 类 `OutboxHandlerRegistryV1`，并同步 G2 strict DTO、G3 物理 SQL 名、G5 Task target/order、Preflight unresolved 决议等跨文档冲突。
- 建立 source-only manifest source modules：44 models / 555 scalar / 105 FK / 210 relation navigation；195 CHECK 与 185 trigger 全部拥有唯一 template+args physical binding。125 个 base CHECK 逐字节重展开，6 个既有 base trigger 同样与 template 展开做语义逐字校验。
- 生成 `apps/server/prisma/contracts/g1-schema-manifest.json`，状态 `ready_for_scrutiny`，completeness `0`，review gate `0/2 pending`，`migrationGenerationAllowed=false`；未读取或修改 schema/migration/SQLite 来生成期望值。
- 验证：manifest 定向 `4 files / 13 tests` 通过；Server typecheck 通过；`g1:manifest:generate` 与 `g1:manifest:check` 通过。SCH-00 tracer 继续保留预期 `1 passed / 1 failed` Red，未扩展 Prisma id-only 字段壳、未生成 migration。

### G1-1 M0-A：摘要绑定 review gate P0 收口

- 主 Agent 对原交付增量审查发现 P0：base manifest 永久 hardcode `0/2 pending false`，却没有 digest-bound attestation/report 和机器入口，因此真实 Reviewer 无法让门禁到达 2/2。返工没有修改 base gate 为 accepted，而是新增只读 derived gate。
- TDD 首轮 `g1-schema-review-check` 模块不存在，定向 suite 预期 Red；实现后以 temp workspace 覆盖 0/1 pending、2/2 accepted、source/artifact/sidecar stale、非法 JSON/摘要、report tamper/missing、third file、rejected/open P0/P1 和 deterministic repeat，进程级 CLI 同时证明 pending exit 1、精确 2/2 exit 0。
- review round 固定为 `g1-m0a-pass2-r1`，目录固定为任务记录下同名 `reviews/` 子目录，只允许两角色各自的 `.attestation.json + .review.md` 四个文件；两 reviewerId 必须不同并声明 independent。Worker 未创建任何真实 sidecar。
- bundle loader 已封闭 workspace/各级目录 identity、symlink/hardlink/type/size、open/fstat/post-stat、entry set、文件与祖先 swap 等 TOCTOU；错误只输出稳定 code，不包含 report 内容或协议绝对路径。
- verifier 四个生产源码进入 manifest digest，TypeScript allowlist 从 12 增为 16，连同两份 Markdown 共 18 个 sourceDocuments；sidecars/reports/specs 排除，避免 circular digest。base artifact 仍保持 `0/2 pending false`。
- 父级文档复核修正 Schema 契约 frontmatter 日期与 `in_progress` 无循环定义后，先前摘要自动 stale；重新 generate/check 后唯一 current 摘要为 `sha256:5496ddcd51d62d6a4f9a5e92856e0dfd881b29d3d3e90d7ee0a024323873f39e`。当前真实 `g1:manifest:review-check` 为 0/2 pending、`migrationGenerationAllowed=false`、预期 exit 1；两名真实 Reviewer 尚未运行。
- 验证：manifest + attestation + bundle + review-check `4 files / 83 tests` 通过；Server typecheck 与 `git diff --check` 通过。未来 migration generator 必须调用同一 derived verifier 并断言 allowed，不能只读 base JSON。

### G1-1 M0-A：Pass 2 r1 双审驳回与 r2 返工

- r1 两名独立 Reviewer 均给出 rejected；四份 report/attestation 已原样保留在 `reviews/g1-m0a-pass2-r1/`，Worker 没有修改旧证据。current round/root 固定为 `g1-m0a-pass2-r2`。
- 按主 Agent 裁决新增 `PersistenceState.effectiveSchemaManifestDigest`，将 source/workspace identity 与 released effective Schema identity 分离；模型库存更新为 44/556/105/210，激活、恢复、首写和 final MigrationRun 信任链均同时校验两个摘要。
- 增加穷尽 44 张表的 `PurgeOwnershipV1`，为 8 个新 cascade/history root 增加 DELETE guard；trigger 分区更新为 `39+67+34+54=194`，195 CHECK 保持不变。
- 收口 routing target/write target、`[5,30]` retry、legacy Preflight 无伪行、G4 lock summary nullability、G5 seal/current 事务顺序和 Prisma 路径；同步 G1～G5 active 契约/验收文档。
- 修复 Outbox terminal precedence、Storyboard JSON token/V1 解析、5 类 reparent、Layout 投影/来源链、deleting Task、Credential clearing 和 effective digest；对 SQLite NULL 三值逻辑的高风险 predicate 统一 fail closed。
- review bundle 在读完全部角色后再对四文件逐一 secure reopen 与 digest 重验；安全套件已覆盖 earlier-file append、same-size rewrite 与 rename replace。
- 新增真实 SQLite trigger 语义套件：实际创建 44 表/194 trigger，完整 Outbox lifecycle、Storyboard 空角色正例、source-backed Layout seal、source/effective 分离激活、purge 与 credential 等共 33 条当前通过。
- r2 摘要源固定后 generate/check 通过，current digest=`sha256:2fef00a5c016b48784db675fb9e88778c6e073dd6e0798c0c0fdbbeb2b5d279f`。非 tracer persistence `128/128`、typecheck、diff-check 全绿；SCH-00 精确 `1 passed / 1 expected failed`；r2 review-check 精确 `0/2 pending` 并 exit 1。r1 四 SHA 不变，r2 目录未由 Worker 创建。

### G1-1 M0-A：Pass 2 r2 双审驳回与 r3 返工

- r2 两名独立 Reviewer 均给出 `rejected`；r1/r2 各四份证据原样保留。current round 切换为 `g1-m0a-pass2-r3`，Worker 未创建 r3 review root、raw pair 或 sealed bundle。
- gate ownership 测试首轮 Red 精确列出 25 个 QA gate 无 slice owner；同步 task plan 的 12 个 G1 slice 范围，并消除 QA 重复 `DEL-00` 定义后，current QA ID exactly-one owner 与 no-ghost `2/2` Green。
- TaskPolicy 首轮审计暴露 story/shot idempotency key 仍可依赖 mutable pending pointer；现为全部 10 项补齐 exact `idempotencyKeyBindings`，`expectedTargetId` 只从 task creation 时冻结的 input 读取，unknown/missing/duplicate/multi-bound/reused/non-frozen/order drift 均被 validator 拒绝。
- 三张 active dialogue 表的 DELETE guard 改为 all-state；真实 SQLite Red/Green 覆盖 running/active/pending 普通删除、缺少任一 purge 事实、完整三事实成功，以及 pending slot 不可借 DELETE 释放。
- r2 sequential raw-file final revalidation 替换为 `review-bundle.v1.json` sealed generation chain。Reviewer 只写 raw pair，父编排以 expected previous digest CAS 发布；无 sealed file 时 0/1/2 raw pair 均不授权 gate。
- publisher/reader 收口 `wx` lock/temp、fsync、atomic rename、单 FD 读取、self/envelope/report/attestation digest、exact first-envelope preservation、strict UTF-8、两层 JSON escape 后 16 MiB candidate 上限、同 inode overlap 检测和 after-read path replacement 线性化。失败保留上一代 sealed bytes且无 temp/lock 残留。
- review protocol 加入 `bundleSnapshotDigest` 并纳入 `attestationSetDigest`；保留 `G1_REVIEW_` 协议 namespace，拒绝 Reviewer finding code 碰撞。publish CLI 不会因第一名 rejected/open P1 阻止第二名提交，但最终 gate仍 fail closed。
- r3 当轮 manifest generate/check 固定为 `sha256:210e5718052872aff4059f128525c56f3eafc7594dd488bc6275b3585e328963`；inventory=`44/556/105/210`、`195/194`、10 TaskPolicy、5 OutboxHandler、44 PurgeOwnership、18 sources、completeness=0。
- 最终验证：non-tracer persistence `9 files / 141 tests`，其中 review protocol 四 suite `93`、真实 SQLite DSL `36/36`、gate ownership `2/2`、constraint registry `4/4`；Server typecheck、manifest check、`git diff --check` 全绿。SCH-00 保持 `1 passed / 1 expected failed`。
- 真实 r3 review-check 为 `received=0, accepted=0, status=pending, bundleSnapshotDigest=null, migrationGenerationAllowed=false`，预期 exit 1；r3 root absent。未生成 migration、未扩展 Prisma 字段壳，也未接触真实 DB/workspace/SecretStore。

### G1-1 M0-A：Pass 2 r3 sealed 驳回与 r4 返工

- r3 父编排已正式 sealed 两名独立 rejected 结论；四份 raw 与 sealed 文件五个 SHA、内部 bundle digest 均冻结。current round/root 切换为 `g1-m0a-pass2-r4`，Worker 未创建 r4 review root。
- gate coverage 首轮审计确认 `IMP-05A` 被旧纯数字 regex 静默过滤。parser 现支持完整 suffix gate ID，QA gate-like malformed/prefix 与 plan 非法 code span fail closed；task plan G1-9 显式拥有 `IMP-05A`，门禁 `3/3` Green。
- 一份 sealed review 的状态统一为：accepted/no blocking=`pending`；rejected/open P0/P1=`rejected`，但第二角色仍可发布。rejected 与 open-P1 两分支均增加 API + 真实进程断言。
- reader identity 加入 ctimeNs；新增 fixed mtime + same-inode equal-size rewrite + restore mtime 回归，并保留 after-read atomic path replacement 只返回旧 generation 的线性化语义。
- publisher fault-injection 完成 pre-rename、post-rename bundle sync、lock close、lock unlink、final sync 五阶段。rename 前错误明确 not-committed；rename 后结构化返回 recovery-required 或 cleanup-warning，全部携带 committed digest；marker 存在时普通 reader固定 blocked，final-sync warning 在 bundle 已 durable 且 unlink 可见时允许读取。
- 新增 recovery API/CLI：逐项校验 token/round/role/manifest/previous/new digest/count，同一 codec 读回并先 fsync bundle，再清 marker。错 token 保留 blocked；成功 recovery 自身不授权 migration。
- CLI 接受 package runner 传入的 standalone `--`；真实 `pnpm --filter @airoaming/server g1:manifest:review-publish -- ...` 测试覆盖 first/second/stale CAS，真实 recovery package script 覆盖 wrong token 与成功。`apps/server/package.json` 纳入 manifest，sourceDocuments 更新为 19。
- source 最终固定后 generate/check 得到 r4 digest=`sha256:0acc15df259d1744bb26c6b853e994dadc6c4be48fcb1d8e2c798254bc01a237`；inventory 仍为 44/556/105/210、195/194、10/5/44，completeness=0。
- 当前全套 Worker 自验为 non-tracer `9 files / 150 tests`，review protocol `101`、SQLite DSL `36/36`、gate ownership `3/3`、constraint registry `4/4`；typecheck、manifest check、diff-check 全绿。SCH-00 精确 `1 passed / 1 expected failed`；真实 r4 0/2 pending exit 1，root absent。

### G1-1 M0-A：Pass 2 r4 sealed 驳回与 r5 返工

- r4 父编排已 sealed 两名独立 rejected 结论；四份 raw 与 sealed 文件的五个 SHA 以及内部 bundle digest 均冻结。current round/root 切换为 `g1-m0a-pass2-r5`，r5 root 保持不存在。
- contract gate checker 的外围 detector 扩为任意 uppercase prefix；valid gate grammar 不变。`A-01`、`ABCDE-01` 已在 QA cell 与 plan code span 两侧 fail closed，受控 reference 不误报，门禁仍 `3/3`。
- r5 当轮 source 权威口径统一为 19；package.json 继续受摘要绑定。
- reader 对真实 `rename(temp,target)` 的旧 FD `nlink=0` 延迟解释：初始 path/FD 必须 `nlink=1`，替换后只接受不同 regular pathname + 旧 FD dev/ino/size/mtime 稳定 + `1→0`。删除无替换、late hardlink 与原有 in-place mutation 回归均拒绝。
- 定向 TDD 首轮新增三条均 Red，修复后 bundle `47/47`；最终 non-tracer `9 files / 152 tests`，review protocol `103`、SQLite DSL `36/36`、gate `3/3`、constraint `4/4`，typecheck、manifest check 与 diff-check 全绿。
- current digest=`sha256:d981372c9051bf89fe6d01c4be94b50cfad7fd5bbe71dea36ae67dccb02e6825`，真实 r5 review-check 为 `0/2 pending false`、`bundleSnapshotDigest=null`、exit 1。SCH-00 保持 `1 passed / 1 expected failed`；未生成 migration 或扩展 Prisma 字段壳。

### G1-1 M0-A：Pass 2 r5 sealed 签收与正式实施启动

- r5 两名独立 Reviewer 均为 accepted，父 Orchestrator 已完成两代 CAS sealing：first bundle=`sha256:f267e32886af1f91f22e0e7cda1f5803709a2088d0fedd2d08e31cd60d2eb422`，final bundle=`sha256:970c80b9511730aee257fb0eb9f18084947f991fee154cf19eb8b4720e5bb0e6`，sealed file SHA-256=`e5cc71f73a1ad418e9f8730cee9aa4a4e2108024931d2b05604de6a8aaef2953`。
- `g1:manifest:review-check` 对 current digest `sha256:d981372c9051bf89fe6d01c4be94b50cfad7fd5bbe71dea36ae67dccb02e6825` 输出 `receivedReviews=2`、`acceptedReviews=2`、`status=accepted`、`migrationGenerationAllowed=true`、blocking=0。
- 唯一非阻塞 advisory 为 `G1-CONTRACT-P2-MANIFEST-SOURCE-COMMENT`。M0-A Worker 不修改该 JSDoc，也不修改 manifest artifact、Schema 实施契约、Task/Outbox 注册表、16 个 TypeScript source 或 package.json；否则已签摘要会失效。
- 已冻结 r1～r5 全部 review evidence。当前只允许修改 `schema.prisma`、新 migrations/migration lock、非 allowlist 的实现/测试，以及 task/QA/session 留痕；只使用 marker-owned temp SQLite，不接触真实 DB/workspace/settings/SecretStore/dataRoot。
- 当前实施阶段：SCH-00 Red → 44 模型精确 Schema → review-gated 0001～0008 → fresh replay/ledger/checksum/constraint/integrity/FK → 父审与临时 Runtime Review。M0-B 明确不在本阶段。

### G1-1 M0-A：Prisma exact-unique checkpoint 与 Pass 2 r6

- Schema TDD 将 r5 manifest 确定性展开为 44 模型/556 scalar/210 relation navigation 后，真实 `prisma validate` 首轮得到 106 个错误：105 个来自 SQLite connector 不支持 relation FK `map`；另 1 个来自 `Candidate.asset` 三列 defining fields 不具备 exact composite unique，不能与 `Asset.candidateByAsset` 组成 Prisma 1:1。
- 105 个 named-FK 错误收口为 renderer 规则：仍逐 relation exact-match manifest 的 physical FK name/local/ref/actions，但 Prisma SDL 不渲染 `map`；未来 physical name 只能由 migration SQL 创建并由 fresh SQLite 对照。没有修改或丢弃 FK 物理契约。
- 对 Candidate 冲突曾短暂尝试 renderer-only list adapter；父审指出这会违反 manifest `relationFields.list` exact 合同，立即停止并删除。没有生成任何 migration。
- 新增 exact-unique TDD：旧逻辑精确 Red 在 `Asset.candidateByAsset`；`hasUniqueForeignKey` 改为 local relation fields 与 unique columns exact 同集合，独立扫描确认 strict-subset-only 只有 `Candidate.asset`。r6 manifest 原生产出 `Asset.candidatesByAsset Candidate[]`，而 `uq_candidates_asset(asset_id)` 仍在物理契约中保证实际 0..1。
- 权威 §13 明确 Prisma 6.19.3 exact-unique 与 named-FK SQLite 限制；renderer 删除全部 hardcoded cardinality adapter；r5 P2 JSDoc 在本轮自然 source 变更中关闭，明确 package runner source。
- review round/root 当时轮转为 `g1-m0a-pass2-r6`；r1～r5 证据均冻结。generate/check 得到 r6 当轮 digest=`sha256:356d2150ec848a1e4c583d170fee0b80b136bfe3c0990faefd49fe72aeadcfb6`。
- r6 当轮 `schema.prisma` 已从 manifest 确定性生成，`prisma validate` Green，Schema/renderer 定向 `4/4` Green。当时真实 r6 root absent，review-check=`0/2 pending false`、`bundleSnapshotDigest=null`、预期 exit 1。
- 最终机械门禁：9 个 non-tracer persistence suites=`153/153`，其中 review protocol=`103/103`、SQLite DSL=`36/36`、gate ownership=`3/3`；Server typecheck、manifest check、`prisma validate`、Schema/renderer `4/4`、`git diff --check` 均通过。r1～r5 共 23 份历史文件 SHA、r3～r5 internal digest 与 r5 previous digest 全部一致。
- 当时 0001～0008 未生成，migration 目录不存在；后续 r6 已完成双审并被整体驳回，见下一节。

### G1-1 M0-A：Pass 2 r6 sealed 驳回与 r7 generator source freeze

- r6 两名独立 Reviewer 的结论为 `contract_consistency=accepted`、`sqlite_dsl_machine=rejected`；父 Orchestrator 已密封整体 rejected snapshot。r6 五份文件 SHA、internal previous/final digest 均冻结，不能授权新摘要。
- r6 Reviewer B 的两项 P1 已在 r7 关闭：105 个 FK physical name 必须精确满足 `fk_<local_table>_<ordered_cols>__<target_table>` 且被唯一 exact defining relation 消费；Schema renderer/CLI 与 migration renderer/CLI 四个生产入口全部进入 manifest digest。
- source 边界更新为 `23 = 20 TypeScript + 2 authoritative Markdown + apps/server/package.json`；新增 transitive closure 扫描，所有受摘要 TypeScript 的 relative static/dynamic import 与 relative require 都必须继续落在 allowlist，漏绑本地 helper 失败。
- Schema check/write 已分离：check 在 0/2 可只读证明 current bytes；write 在 staging 前与 atomic replace 前重验 exact current 2/2、manifest/identity/expected bytes，使用同目录 `wx` 0600、fsync 与 atomic replace。current 0/2 下 API/CLI write 失败且 bytes/stage 不变。
- migration pure plan 确定性返回 migration lock + 0001～0008 九个 artifacts；0001～0007 精确按 `4/6/10/5/9/4/6` 分组，0008 在事务前读回 FK mode=0，只 rebuild 43 张 CHECK 表，每表执行 row-count + 全列双向 EXCEPT guard，COMMIT 前执行 executable FK check guard。
- production writer/checker 要求 current 2/2、exact Schema 与 current manifest；staging pre-rename 和正式 tree post-rename 均执行 exact nine-artifact tree check，拒绝 missing/extra/tampered、file/directory symlink 与 hardlink。fresh verifier 主动启用 FK 并读回 1，只接受精确八条成功 ledger。
- marker-owned temp E0 已覆盖：两个 direct SQLite fresh replay inventory 一致且 0008 前行逐列保留；outer transaction 导致 FK OFF/ON 无效、same-count 值改写和 orphan 均 fail closed；真实 Prisma 6.19.3 首次应用 8 个 migration、第二次 no pending，失败路径为 P3018 rollback 后 P3009。
- current round/root=`g1-m0a-pass2-r7`，manifest digest=`sha256:c32dd95ab61a2d8a89c25dbab45d0f3efb7323d504f6031dc2e51e38b5943d06`。真实 r7 root absent，review-check=`0/2 pending false`、exit 1；Schema/migration write 与 migration check 均按预期 exit 1，migration tree 与 stage residue不存在。
- source freeze 最终机械证据：Server `26 files / 253 tests` 全绿；typecheck、manifest check、Schema exact check、Prisma 6.19.3 validate、`git diff --check` 全绿；r1～r6 共 28 个历史文件 SHA 与 r3～r6 internal digest 逐项复算一致。
- 下一步只能由两名独立 Reviewer 针对 current r7 digest 产生 raw pair，再由父 Orchestrator CAS sealing。2/2 accepted 后才能 materialize 正式 Schema/migration tree并执行正式 SCH 门禁；当前 dry E0 不冒充 `SCH-00～15` pass。
