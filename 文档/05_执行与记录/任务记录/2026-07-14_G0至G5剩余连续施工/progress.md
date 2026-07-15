---
doc_id: AIR-G05-REMAIN-PROGRESS-001
status: completed
created: 2026-07-14
updated: 2026-07-15
owner: AI漫游项目
audience: human, luna, reviewer
source: 本任务执行时间线
---

# 连续施工推进记录

## 当前状态

```text
current = G0_G5_COMPLETE
last_completed = G5_USER_ACCEPTANCE_PASSED
next_human_gate = none
schedule_policy = NO_CALENDAR_SCHEDULE
```

## 阶段看板

| 阶段 | 状态 | commit | Review | 备注 |
| --- | --- | --- | --- | --- |
| 施工包 | `completed` | 不适用 | Scrutiny=`passed`；Runtime=`not_applicable` | 仅规划，无功能实现 |
| S0 | `completed` | `f07f516` | Scrutiny=`passed`；Runtime=`passed_isolated` | R0-A、默认入口超时修复、三次根回归已通过 |
| W1 | `completed` | `3898182`, `4fe1dfa` | Scrutiny=`passed`；Runtime=`passed_isolated` | DB-only Web/API、唯一 Preflight 路由、里程碑单调性纠偏、fresh SQLite E2E 已通过 |
| R0B | `completed` | `9227e8d` release | SH-10=`passed_human_review` | release shadow 与 v5 gate 已完成 |
| R1 | `c7_activation_and_first_write_passed` | v5 私有 evidence | Scrutiny=`passed`；Runtime=`passed_real_through_c7_first_write` | completedThrough=C7；首写/file guard 已通过 |
| R2 | `completed` | `62da892`, `0be5621`, `7ddeb21`, `a90f546` + 私有 evidence | Scrutiny=`passed`；Runtime=`passed_real` | OBS-01～10 全部通过，backup/archive 保留 |
| G4 | `completed` | `79dc806`, `9cd599a`, `179be50`, `894d1e8`, `3826611`, `81c922a` | Scrutiny=`passed`；Runtime/User=`passed` | `G4_PASSED`，迁移/E2E/restart/backup restore 总体复核通过 |
| G5 | `completed` | `53b65e4`, `68b00cb`, `e93d70f`, `ec71594`, `93a58b2`, `cd35053`, `429ec69`, `d8ed6cc`, `fc9ea47` | M8 Scrutiny=`passed`；Runtime=`passed`；用户签收=`passed` | M0～M8 技术门禁与最终签收全部通过；总体=`G0_G5_COMPLETE` |

当前状态只以本节和 `luna_current_handoff.md` 为准。下方旧停止点是历史时间线，不是 Luna 当前停止点。

## 2026-07-14：施工包建立

- 复核当前 Git：branch=`codex/g0-test-safety-net`，HEAD=`e195cb3`，R0-A 代码/文档仍未提交。
- 复核代码确认 Web 仅 Script 接入 `g2_db`；Story/Storyboard/Preflight 仍有 legacy 写调用。
- 复核 Server 确认 preflight confirm 存在两个相同 Controller 路由。
- 复核当前 Playwright 文件：现有项目为 file-mode 基础路径，DB-only G2 用户路径尚缺。
- 复核 G4/G5 正式方案、契约和验收清单，按 G4-A～F、G5-M0～M8 纳入总计划。
- 建立 Handoff、总计划、实施契约、测试矩阵、文件地图、授权门、复核清单与 findings。
- 9 份 Markdown frontmatter/doc_id/code fence、事实源路径和 `git diff --check` 自检通过；本轮无实现，Runtime/User Review 明确记为 `not_applicable`。

## 2026-07-14：S0_CLOSEOUT

- baseline：branch=`codex/g0-test-safety-net`；HEAD=`e195cb3`；工作树存在既有 R0-A 与其他历史文档改动，未使用 `git add -A`。
- 实现：确认 `apps/server/src/persistence/g1-migration-plan.spec.ts` 的真实 Prisma 回滚测试需要超过 Vitest 默认 5 秒；仅给该单测增加局部 `30_000ms` timeout，未改业务断言、未跳过测试、未扩大全局 timeout。
- 测试：定向 `corepack pnpm --dir apps/server exec vitest run src/persistence/g1-migration-plan.spec.ts`，12/12，exit 0；修复后根目录 `corepack pnpm test` 连续三次均为 shared 8 spec/39 tests、server 69 spec/472 tests，exit 0；第三次 server duration 106.65s、tests 304.70s。
- 证据：`s0_scrutiny_review.md`、`s0_runtime_review.md`、`../../功能完成记录/2026-07-14_S0-R0A默认测试门禁收口.md`。
- Review：当前 S0 静态复核=`passed`；隔离运行复核=`passed_isolated`；旧历史 Review 的 `changes_requested` 保留为历史记录，不覆盖最新独立结论。
- 真实操作计数：真实数据=0；默认用户 Keychain=0；真实凭据/provider=0；AUTH=0；真实 C0～C7/SH-10/R2=0。
- next：进入 `W1_DB_WEB_GATE`，只使用 fresh SQLite、临时目录与 fake boundary；W1 完成并独立复核后停在 `WAIT_R0B_AUTH`。

## 2026-07-14：W1_DB_WEB_GATE

- baseline：branch=`codex/g0-test-safety-net`；HEAD=`f07f516`；未混入用户历史文档改动。
- 实现：Web API 与 `workbench-store` 接入 Story/Storyboard Working Copy、Preflight V2；409 刷新服务端状态并提示重新确认；三处工作区增加 DB current/history/dirty/stale/attention 状态；Server 合并重复 Preflight confirm 路由并增加历史复制到 Working Copy；E2E harness 支持 DB 模式 fresh migration 与 PATCH。
- 测试：`corepack pnpm typecheck`、`typecheck:e2e`、`build` 全部 exit 0；root `corepack pnpm test` 为 shared 8 spec/39 tests、server 70 spec/474 tests，exit 0；定向 server 2 files/36 tests 通过；DB E2E `g2-db-web-gate.spec.ts --repeat-each=3` 3/3 通过；file E2E `project-library-and-stage-rail.spec.ts --repeat-each=3` 3/3 通过。
- 证据：`w1_scrutiny_review.md`、`w1_runtime_review.md`、`luna_execution_plan.md`、`../../功能完成记录/2026-07-14_W1-DB-only-Web门禁收口.md`。
- Review：Scrutiny=`passed`；隔离 Runtime=`passed_isolated`；真实数据、默认 Keychain、真实凭据、AUTH、R0B/C0～C7/R2 均为 0。
- commit：`3898182 feat(web): close g2 db-only workbench gate`；只暂存 W1 文件，未混入用户已有 M6/其他文档改动。
- next：完成 W1 独立提交后停在 `WAIT_R0B_AUTH`，等待用户发送 `authorization_gates.md` 中固定 `AUTH-R0B` 授权句。

## 2026-07-14：W1 corrective slice

- 触发问题：已有 Storyboard/Preflight 后确认新 Story，`milestone_status=structured` 触发 G1 单调里程碑约束，事务返回 `G2_DATABASE_CONTRACT_VIOLATION`。
- 实现：Story confirm 在已有下游时保留更高里程碑；ProjectsService 的 DB Workbench workflow 改读 `ChapterProductionQueryService`，让 stale 派生进入页面。
- 测试：typecheck、e2e typecheck、build、root shared 8 spec/39 tests + server 70 spec/474 tests；DB W1 spec 6/6（repeat-each=3）；file E2E 3/3；均 exit 0。
- Review：Scrutiny=`passed`；Runtime=`passed_isolated`；真实数据、默认 Keychain、真实凭据、AUTH、R0B/C0～C7/R2 仍为 0。
- commit：`4fe1dfa fix(web): close g2 stale milestone gate`；完成后唯一下一状态 `WAIT_R0B_AUTH`。

## 2026-07-14：R0B、v5 C0～C7 activation 已完成并切换为无排期执行

- frozen release：`9227e8dfefde59a25f81b53a41074f3971c24d05`，工作树 clean。
- production status 只读复核：`completedThrough=C7`，evidence=`sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452`。
- R0B/SH-10/C0/C1/C2/C3/C4/C5/C6/C7 激活、首笔业务写和 R2 OBS-01～10 已完成；G4、G5 尚未完成。
- 新增 `luna_current_handoff.md` 作为唯一当前执行入口；旧 v5 window 文档只作 C1 历史证据。
- 执行策略改为无排期：不写工期、预计天数或等待日期；AUTH-C5/AUTH-C7 已消费，C5→C6→C7 activation 已完成，后续按授权和依赖连续推进。
- R2 已获授权并通过 OBS-01～10。OBS-06 由 0011 协调 purge 关闭；OBS-07 DB-only sealed backup/fresh restore 通过；OBS-08 两章与 67/67 Asset 可读；OBS-09/10 隔离和秘密扫描通过。
- backup/archive 未删除，未执行 down migration，未进入 G6/视频链路。
- next：从 G4-A 继续。

## 2026-07-14：R2_DB_ONLY_OBSERVATION_PASSED

- baseline：cutover evidence 继续绑定 `9227e8d`；兼容 release HEAD=`a90f54676ed13a1ca56a362cad3598b2aa60ff19`，clean release worktree 已核验。
- 实现：新增 0011 协调 purge；新增 `db-only-coordinated` backup/restore；DB Asset 按 storageKey 读取；DB Workbench 章节选择改为纯读取。
- 测试：server 全量 493/493；最终 DB 持久化回归 36/36；全仓 typecheck 与 server build 退出 0。
- 真实证据：目标/备份/恢复 DB digest=`sha256:cab0b96d88dc24a7e87925aea6bc04441d0f8db0e76fac5537ce4ab64c49d739`；1 项目、2 章节、67/67 ready Asset；secret scan 427 文件/4 SQLite/0 hit。
- Review：Scrutiny=`passed`；Runtime/User=`passed_real`。
- commit：`62da892`、`0be5621`、`7ddeb21`、`a90f546`。
- 风险/未运行：未删除 archive/backup，未执行 down migration，未进入 G6/视频链路。
- next：`G4_A_IN_PROGRESS`。

## 2026-07-15 00:32：G4-A Shared + Schema overlay

- baseline：branch=`codex/g0-test-safety-net`；R2 compatible HEAD=`a90f546`；只暂存 G4-A 代码，未混入工作树中的既有历史文档改动。
- 实现：新增 Shared CandidateLock 闭集、V2 DTO、严格 preview/commit parser；新增 0012 线性历史/CAS/current-final overlay 与 12 段 runtime ledger；legacy selected 只转 favorite、locked 不推断 current、direct ready evidence 才建 v1；现有服务端和 Web 不再以 Candidate `selected/locked` 表达当前定稿。
- 测试：Shared 46/46；G4 overlay/runtime/DB persistence 46/46；legacy/full/final importer 76/76；类型、E2E 类型、Server/Web build、Prisma validate、G1 三项检查通过。全量 502 项中 3 项在并行重负载下触发局部 5 秒 timeout，空闲环境定向复跑 3/3 通过。
- 证据：`g4_a_scrutiny_review.md`、`g4_a_runtime_review.md`；0012 checksum=`sha256:19b28fcccac149e5994ed16b43d7d329b8db25e6696bfcba8cff0a2846672f5f`。
- Review：Scrutiny=`passed`；Runtime=`passed_isolated`；G4 总体用户路径仍为 `not_run`。
- commit：`79dc8065e9cf410006be50d6b7074e6c9569e188`。
- 风险/未运行：真实目标 DB 未部署 0012；未删除 backup/archive，未执行 down migration、file-only 回退或 G6/视频链路。
- next：`G4_B_IN_PROGRESS`。

## 2026-07-15 01:03：G4-B 纯规则与 Resolver

- baseline：branch=`codex/g0-test-safety-net`；G4-A docs HEAD=`bc28e87`；只暂存 10 个 G4-B Shared/Server 文件，未混入既有历史文档改动。
- 实现：新增 A→B→clear→A 纯状态机与精确 replay predicate；严格 `CandidateLockSetSummary` codec；active Shot lock set、JCS/SHA-256 known-answer；legacy/V1 Working Copy 依赖投影；Layout/Export freshness；统一 Working Copy/Layout/Export/Task 影响集与 `candidate_lock_impact_v1` digest。
- 测试：定向 Shared 8/8、Server 22/22；完整回归 Shared 54/54、Server 519/524，5 项旧迁移/备份慢测仅在并行重负载下触发 5 秒 timeout，隔离串行复跑 10/10 通过；Shared/Server typecheck 与 build 退出 0；`git diff --check` 通过。
- 证据：`g4_b_scrutiny_review.md`、`g4_b_runtime_review.md`、`../../功能完成记录/2026-07-15_G4-B候选定稿纯规则与解析器.md`。
- Review：Scrutiny=`passed`；Runtime=`passed_isolated`；G4 总体用户路径仍为 `not_run`。
- commit：`9cd599a`。
- 风险/未运行：尚未接入 DB transaction/API，不把纯规则通过冒充 preview/commit/race/用户路径通过；未删除 backup/archive，未执行 down migration、file-only 回退或 G6/视频链路。
- next：`G4_C_IN_PROGRESS`。

## 2026-07-15 01:33：G4-C 事务命令与 API

- baseline：branch=`codex/g0-test-safety-net`；G4-B docs HEAD=`9e1253e`；只暂存 11 个 G4-C Shared/Server 文件，未混入既有历史文档改动。
- 实现：新增 CandidateDecisionService/Repository、preview/commit/history/favorite/rejection API、事务内 exact replay/impact/CAS、writer 冲突重分类、完成门禁与 best-effort task cancel；删除旧公开 lock 路由和旧 DB 直接 revision/pointer writer。
- 测试：fresh SQLite + 真实 HTTP 定向覆盖 created/no-op/replay/revision conflict/impact changed/双 writer/favorite/reject/history/complete；Shared 54/54；Server 520/525，5 个旧慢测并行 timeout 隔离 5/5；Shared/Server typecheck/build、Prisma validate、diff check 通过。
- 证据：`g4_c_scrutiny_review.md`、`g4_c_runtime_review.md`、`../../功能完成记录/2026-07-15_G4-C候选定稿事务与API.md`。
- Review：Scrutiny=`passed`；Runtime=`passed_isolated`；Web/总体用户路径仍待 G4-E/F。
- commit：`179be50`。

## 2026-07-15 02:04：G4-D 工作流与下游来源门禁

- baseline：G4-C docs HEAD=`a45fde6`；仅提交 G4-D Shared/Server/测试文件，未混入工作树中的既有历史文档改动。
- 实现：Workbench/ProductionState 加入 lock set、Working Copy、current Layout/Export source summary 与四个 gate；工作流可派生 done/needs_update/blocked；迟到任务按 sealed sources 重算 current/historical。
- 门禁：build Working Copy、建正式 LayoutRevision、layout publication 与 asset package 均在写事务内复核 current source；stale/unresolved/digest mismatch 返回稳定 409，旧产物/current pointer/里程碑不改。
- 运行：fresh SQLite 真实完成候选→排版→导出→素材包；replace 后旧任务 historical、新 Candidate 不改定稿、三类下游写被拒绝，重启后 Workbench/ProductionState 完全一致。
- 回归：G4-D 定向 16/16、G4-B 纯规则 22/22、Shared 54/54；Server 全量检查点 510/525 中 14 个旧慢测并行 timeout 隔离 56/56，1 个旧写 owner 登记遗漏修复后隔离 3/3。
- 工程门：Shared/Server build、Server/Web typecheck、Prisma validate、G1 schema check、diff check 通过。
- 证据：`g4_d_scrutiny_review.md`、`g4_d_runtime_review.md`、`../../功能完成记录/2026-07-15_G4-D工作流与下游来源门禁.md`。
- Review：Scrutiny=`passed`；Runtime=`passed_isolated`；浏览器交互与总体 G4 用户路径仍待 G4-E/F。
- commit：`894d1e8`。
- 风险/未运行：当时 Web 新交互尚未完成，后续已由 G4-E 关闭；未删除 backup/archive，未执行 down migration、file-only 回退或 G6/视频链路。
- next：`G4_E_IN_PROGRESS`。

## 2026-07-15 02:34：G4-E 候选决策工作台

- baseline：G4-D docs HEAD=`a553a7e`；仅提交 G4-E Shared/Server/Web/E2E 文件，未混入工作树中的既有历史文档改动。
- 实现：DB Workbench 刷新权威候选状态；Web 接入 favorite、reject/restore、preview/commit lock/replace/clear、历史和来源摘要；409 自动重新 preview 但不自动 commit；DB image task 补齐 requestId；E2E 启动持久化 Worker。
- 测试：Server 完整 80 files/533 tests、Shared 完整 10 files/54 tests；Web build、Server/Web/E2E typecheck；E2E 环境支持 31/31；DB-only Playwright 候选工作台 1/1；均通过。
- 证据：`g4_e_scrutiny_review.md`、`g4_e_runtime_review.md`、`../../功能完成记录/2026-07-15_G4-E候选决策工作台.md`。
- Review：Scrutiny=`passed`；Runtime=`passed`；双窗口冲突重新确认、历史和排版 stale 用户路径已覆盖。
- commit：`3826611`。
- 风险/未运行：migration 冲突/unresolved、完整 A→B→clear→A、任务竞争、backup restore 与总体 G4 Review 留给 G4-F；未删除 backup/archive，未执行 down migration、file-only 回退或 G6/视频链路。
- next：`G4_F_IN_PROGRESS`。

## 2026-07-15 03:02：G4-F 迁移、恢复与总体关闭

- baseline：G4-E docs HEAD=`91a6d56`；仅暂存 G4-F 代码、测试和三张截图，未混入既有历史文档改动。
- 实现：legacy lock importer 为 Candidate 缺失、Asset 未 ready、scope 错误和 runtime current 冲突输出精确 blocker；OBS-07 增加 G4 revision/current/digest/Asset 恢复核对；浏览器覆盖 A→B→clear→A、已导出后新 Candidate、双窗口冲突和排版 stale；图片密钥重复保存幂等，非法轮换在覆盖持久化与运行内存前拒绝。
- 测试：Server 完整 80 files/535 tests 连续两次通过；Shared 54/54；migration 78/78；G4 规则 36/36；DB-only Playwright repeat 3/3；E2E 环境 31/31；P6/G4-D、OBS-07、typecheck、Prisma validate、全仓 build、diff check 全部通过。
- 证据：`g4_f_scrutiny_review.md`、`g4_f_runtime_review.md`、`evidence/g4_f_conflict_repreview.png`、`evidence/g4_f_candidate_history.png`、`evidence/g4_f_layout_stale.png`、`../../功能完成记录/2026-07-15_G4候选定稿返修完整闭环.md`。
- Review：Scrutiny=`passed`；Runtime/User=`passed`；总体=`G4_PASSED`。
- commit：`81c922a`。
- 风险/未运行：NFR-01/02 的 100 Shot 性能画像和 `EXPLAIN QUERY PLAN` 未单独执行，不是本轮正确性退出硬门；未删除 backup/archive，未执行 down migration、file-only 回退、G6 或视频链路。
- next：`G5_M0_IN_PROGRESS`。

## 2026-07-15 03:20：G5-M0 Fixture 与红灯

- baseline：branch=`codex/g0-test-safety-net`；G4 docs HEAD=`a0ea50c`；仅暂存 M0 代码、测试与 fixture，未混入工作树中的既有历史文档改动。
- 实现：建立 8 份正式命名的 LayoutDocument corpus、3 张本地生成 PNG、固定 sha 的 Inter WOFF2、20 canvas/200 element 性能样本；固定 document/source/profile/asset manifest/RenderPlan known-answer digest；增加四条 E2E vertical-slice 合同、`test:render`/`test:migration:g5`/`test:e2e:g5` 结构化红灯入口。
- 红灯：文件模式“PNG 页面”与 1×1 候选源文件逐字节相同；renderer、浏览器语义快照、受控 CJK 字体、G5 migration 和真实编辑器 E2E 尚未实现，均有稳定 code 与 owner milestone，不使用 skip/todo 或虚构输出 sha。
- 测试：fixture contract 连续三次 3/3；旧 copy export 临时 workspace 见证 1/1；Server 完整 80 files/536 tests；全仓 typecheck、E2E typecheck、build 与 diff check 通过。三个阶段红灯命令按设计 exit 1，并输出 machine-readable JSON。
- 证据：`g5_m0_scrutiny_review.md`、`g5_m0_runtime_review.md`、`evidence/g5_m0_commands.md`、`../../功能完成记录/2026-07-15_G5-M0固定语料与红灯基线.md`；corpus digest=`sha256:9acf40013492dd82003fc24af944897db834203e11d02cacee1c457ebe115527`。
- Review：Scrutiny=`passed`；Runtime=`passed_isolated`；正式 renderer/output/user path 仍为 M1～M8 红灯。
- commit：`53b65e4`。
- 风险/未运行：M0 不选择技术库、不生成 PNG/PDF/slice golden、不声称中日文字体可用；未删除 backup/archive，未执行 down migration、file-only 回退、G6 或视频链路。
- next：`G5_M1_IN_PROGRESS`。

## 2026-07-15 04:05：G5-M1 E0 技术路线定版

- baseline：M0 code=`53b65e4`，docs=`081a0c3`；原型只写 marker 保护的 `.runtime/`，未连接 DB/provider/用户 workspace。
- 实现：完成 A/B 两条完整薄切片；A 使用 Konva+DOM+独立 HTML RenderScene+pinned Chromium，B 使用 SVG-native+显式 glyph+resvg；resvg native 调用增加子进程故障隔离。
- 测试：最终 `corepack pnpm prototype:g5-e0` exit 0；A 的 roundtrip/rich text/IME/100 commands/stale crop/semantic/geometry/PNG golden/PDF/40 pages/slices/fonts/performance/page errors 共 15 门全部通过；B 在首个 1080×8192 slice 稳定 native abort。`corepack pnpm test:g5:fixtures` 3/3；全仓 typecheck、E2E typecheck、build、Shared 54/54、Server 536/536 通过；`test:render` 仅保留 M5/M7 负责的三个生产红灯。
- 产物：PNG sha=`sha256:26c7029eda5af46cea0c1a4b66310ee2472a136f64e28e1a0788a8a2fde3aec4`；PDF sha=`sha256:abcbacde62c69bddac427a8b788051d4f28a369d343bd49d54e9d395a2eb9e57`；40 页 PDF 通过；条漫拼接/source pixel digest=`sha256:bb1ef1dfa192ab6c5d24214d748a54559158ca0df5041b71f148f9981cb9211d`。
- 证据：`evidence/g5_m1_e0_report.json`、`g5_m1_scrutiny_review.md`、`g5_m1_runtime_review.md`、`../../功能完成记录/2026-07-15_G5-M1渲染技术路线定版.md`、ADR-0016。
- Review：Scrutiny=`passed`；Runtime/Visual=`passed_isolated`；原型已标记为归档证据，不能复制进生产。
- commit：`68b00cb`。
- 风险/未运行：正式 production renderer/task/publication 仍归 M7；Chromium 发行 notices 待 M7 按实际打包方式复核；未删除 backup/archive，未执行 down migration、file-only 回退、G6 或视频。
- next：`G5_M2_IN_PROGRESS`。

## 2026-07-15 04:27：G5-M2 Shared Layout Domain Kernel

- baseline：M1 code=`68b00cb`，docs=`110adfd`；Shared 原先没有 Layout 生产 codec。
- 实现：新增 Document/Profile/Element/RichText/Publication strict codec、规范化/JCS/source projection、受控 Asset sha/尺寸 source/crop 复核、Unicode 17 grapheme、cover geometry、气泡路径、七类 preset、39 类命令 payload/reducer/inverse/batch/history。
- 测试：先见证 4 个缺模块红灯；最终 M2 4 files/29 tests、Shared 14 files/83 tests、fixture 3/3、Server 80 files/536 tests，全仓 typecheck/E2E typecheck/build 通过；100 次文档 round-trip 和 100 命令逆序 Undo digest 不变。
- 证据：`evidence/g5_m2_domain_kernel_report.json`、`g5_m2_scrutiny_review.md`、`g5_m2_runtime_review.md`、`../../功能完成记录/2026-07-15_G5-M2共享排版领域内核.md`。
- Review：Scrutiny=`passed`；Runtime=`passed_isolated`；无 DOM/DB/文件/宿主 Intl 依赖。
- commit：`e93d70f`。
- 风险/未运行：M3/M4 必须在 Server 保存时注入真实 Asset sha/尺寸；字体/renderer 红灯仍归 M5/M7；未删除 backup/archive，未执行 down migration、file-only 回退、G6 或视频。
- next：`G5_M3_IN_PROGRESS`。

## 2026-07-15：G5-M3 Schema overlay、Working Copy、编辑器外壳

- baseline：M2 code=`e93d70f`，docs=`4d181c3`；只暂存 M3 代码与门禁文件，未混入工作树既有历史文档改动。
- 实现：新增 0013 forward-only overlay 与 13 段 ledger；Shared Working Copy strict codec；Server DB-only 初始化/保存/CAS/recovery API；Web 800ms autosave、内存 Undo/Redo、三栏编辑器与窄屏只读；默认 E2E 改为 file/DB 精确矩阵。
- 测试：Shared 86/86、Server 84 files/544 tests、E2E 环境 33/33、file Playwright 4/4、DB Playwright 3/3；全仓 typecheck/build、E2E typecheck、Prisma validate、G1 manifest/migration、fixture 与 diff check 通过。
- 证据：`evidence/g5_m3_working_copy_editor_report.json`、`g5_m3_scrutiny_review.md`、`g5_m3_runtime_review.md`、`../../功能完成记录/2026-07-15_G5-M3数据库草稿与编辑器外壳.md`。
- Review：Scrutiny=`passed`；Runtime/User=`passed`；真实浏览器覆盖桌面锁定/Undo/autosave rowVersion 1→2→3、800px 只读 0 写入和 G4 来源门禁。
- commit：`ec71594`。
- 风险/未运行：M4～M8 仍需关闭画格/图片、字体/文字、正式 Revision、renderer/出版和 legacy/AI 总体路径；结构化阶段红灯保持非零。未删除 backup/archive，未执行 down migration、file-only 回退、G6、视频或 push。
- next：`G5_M4_IN_PROGRESS`。

## 2026-07-15：G5-M4 画格、图片、模板与裁切

- baseline：M3 code=`ec71594`，docs=`19fa0ef`；只暂存 M4 代码、测试和本轮证据，未混入工作树既有历史文档与 G4 截图改动。
- 实现：新增 current CandidateLockRevision-only source catalog；PanelFrame/contentImage、FreeImage、Shot tray 可见放置、七类模板、cover crop/zoom/offset/rotate/flip、reading order、页漫/条漫批量初始化和 canvas reorder；全部通过 Shared command 与 M3 DB-only autosave。
- 测试：Shared 17 files/91 tests、Server 85 files/546 tests、E2E 环境 33/33、file Playwright 4/4、DB Playwright 4/4、M4 定向 1/1、fixture 3/3；全仓 typecheck/E2E typecheck/build、Prisma、G1 manifest/schema/migration 与 diff check 通过。
- 证据：`evidence/g5_m4_panel_image_template_report.json`、`evidence/g5_m4_layout_editor.png`、`g5_m4_scrutiny_review.md`、`g5_m4_runtime_review.md`、`../../功能完成记录/2026-07-15_G5-M4画格图片模板与裁切.md`。
- Review：Scrutiny=`passed`；Runtime/User=`passed`；真实 DB-only 页面覆盖当前定稿、批量排版、双格模板、裁切翻转、detach/attach、自由图、阅读顺序、条漫段落重排和保存；源 Asset sha 不变，pageerror=0。
- commit：`93a58b2`。
- 风险/未运行：CJK FontAsset、富文本/气泡、正式 Revision/source remediation、renderer/publication、legacy/AI 总体路径仍归 M5～M8；结构化阶段红灯保持非零。未删除 backup/archive，未执行 down migration、file-only 回退、G6、视频或 push。
- next：`G5_M5_IN_PROGRESS`。

## 2026-07-15：G5-M5 富文本、气泡与受控字体

- baseline：M4 code=`93a58b2`，docs=`dcbd712`；仅暂存 M5 代码、测试和新文件，未混入工作树既有 R0/M6 文档与回归覆盖的旧截图。
- 实现：新增严格 FontAsset metadata/cmap/embedding/overflow 规则；Server 从固定字体包校验并按 staged→Outbox→ready provision 400/700 WOFF2，提供 catalog/provision/verified file API；Web 用 Asset-ID 隔离 FontFace，完成横竖排富文本、IME composition、纯文本 paste、grapheme 范围样式、overflow、四类气泡与单尾巴。
- 测试：Shared 18 files/96 tests、Server 86 files/549 tests；全仓 typecheck/build、Prisma validate、E2E typecheck 通过；E2E 环境 33/33、file 4/4、DB 5/5，M5 DB-only 连续复跑 3/3。fixture 3/3；`test:render` 只剩 M7 的 renderer/browser semantics 两个结构化红灯。
- 证据：`g5_m5_font_evidence.md`、`g5_m5_scrutiny_review.md`、`g5_m5_runtime_review.md`、`evidence/g5_m5_text_balloon_fonts.png`、`../../功能完成记录/2026-07-15_G5-M5受控字体富文本与气泡.md`。
- Review：Scrutiny=`passed`；Runtime/User=`passed`；正式 PDF 字体嵌入/子集化仍由 M7 验收，没有提前签收。
- commit：`cd35053`。
- 风险/未运行：M6 来源返修/Revision/预检、M7 renderer/publication、M8 legacy/AI/总体路径尚未完成；未删除 backup/archive，未执行 down migration、file-only 回退、G6、视频或 push。
- next：`G5_M6_IN_PROGRESS`。

## 2026-07-15：G5-M6 来源返修、不可变版本与预检

- baseline：M5 code=`cd35053`，docs=`d49bdb1`；仅暂存 M6 代码、测试、0014 migration 与新证据，未混入工作树既有 R0/M6 文档和旧回归截图。
- 实现：Shared 增加来源替换、预检和 Revision 严格契约；Server 增加 preview/commit、正式预检、线性不可变 Revision/SourceBinding、历史详情与恢复到 Working Copy；Web 增加来源返修、逐项警告确认、保存版本与历史恢复。0014 只替换矛盾的 source binding insert trigger，不改表、不做 down migration。
- 测试：Shared 21 files/104 tests、Server 87 files/551 tests；全仓 typecheck、E2E typecheck、Prisma validate、diff check 通过；E2E 环境 33/33、file 4/4、DB 6/6，Undo/Redo 补强后 M6 定向 1/1。未知 warning acknowledgement 定向集成、Revision request strict codec 与 P6/G4-D/M6 事务路径均通过。
- 证据：`evidence/g5_m6_source_replacement_preview.png`、`evidence/g5_m6_repair_revision_history.png`、`evidence/g5_m6_source_revision_preflight_report.json`、`g5_m6_scrutiny_review.md`、`g5_m6_runtime_review.md`、`../../功能完成记录/2026-07-15_G5-M6来源返修版本与预检.md`。
- Review：Scrutiny=`passed`；Runtime/User=`passed`；正式 renderer、PNG/PDF/slices/publication task 仍由 M7 验收，没有提前签收。
- commit：`429ec69`。
- 风险/未运行：M7 renderer/publication 与 M8 mobile/AI/legacy/总体路径尚未完成；`test:render` 与 `test:migration:g5` 仍保留各自 owner 的结构化红灯。未删除 backup/archive，未执行 down migration、file-only 回退、G6、视频或 push。
- next：`G5_M7_IN_PROGRESS`。

## 2026-07-15：G5-M7 固定 renderer 与持久出版

- baseline：M6 code=`429ec69`，docs=`bee7937`；仅暂存 M7 代码/测试/0015 与新证据，未混入工作树既有 R0/M6 文档和旧截图。
- 实现：Shared 增加 publication/RenderPlan/slice/manifest 契约；Server 增加固定 Chromium renderer、DB-only publication API、`layout_export` worker、精确 Asset promotion、staged recovery 与 0015 trigger overlay；Web 增加正式出版预检、任务、历史、取消和 Artifact 链接。
- 测试：`test:render` 绿色；Shared 108/108、Server 555/555；M7 DB-only Playwright 1/1；全仓 typecheck/E2E typecheck/build、Prisma validate、G1 manifest check 与 diff check 通过。M8 legacy migration gate 仍按 owner 保持红色。
- 证据：`evidence/g5_m7_publication_ready.png`、`g5_m7_scrutiny_review.md`、`g5_m7_runtime_review.md`、`../../功能完成记录/2026-07-15_G5-M7确定性出版.md`。
- Review：Scrutiny=`passed`；Runtime/User=`passed`；mobile/AI/legacy/总体五条路径明确保留给 M8。
- commit：`d8ed6cc`。
- 风险/未运行：未删除 backup/archive，未执行 down migration、file-only 回退、G6、视频或 push。
- next：`G5_M8_IN_PROGRESS`。

## 2026-07-15：G5-M8 手机、AI、legacy cutover 与技术收口

- baseline：M7 code=`d8ed6cc`、docs=`380d293`；只提交 M8 代码、测试、0016 与本阶段证据，保留工作树内其他任务文档和旧截图改动。
- 实现：新增手机 lazy GET-only 预览；AI `PendingEditorCommandSet` 严格 codec、DB-only preview/apply/discard/expire、来源/CAS 门禁和一次 Undo；legacy layout convert/rebuild 与旧 build/export 入口删除；Page/Strip profile resize 预览、`keep_coordinates`/`scale_uniform`、段高单命令；PNG/JPEG/WebP 字节识别、EXIF/色彩空间/动画标准化门禁；复制 canvas/element 生成全新嵌套 ID；补齐键盘、label 与 reduced-motion。
- 测试：Shared 24 files/115 tests；Server 93 files/568 tests；`typecheck`、`typecheck:e2e`、`build`、Prisma validate、`test:render`、`test:migration:g5` 和 `git diff --check` 全部通过；DB-only G5 Playwright 8/8，包含 profile resize/段高一次 Undo、AI preview/discard/apply/Undo、stale source 拒绝和手机 0 写请求。
- 证据：`evidence/g5_m8_mobile_ai.png`、`g5_m8_scrutiny_review.md`、`g5_m8_runtime_review.md`、`g5_user_acceptance_handoff.md`、`../../功能完成记录/2026-07-15_G5-M8手机AI与旧排版切换.md`。
- Review：Scrutiny=`passed`；Runtime 技术复核=`passed`；最终用户签收尚未发生，不能标记 `G0_G5_COMPLETE`。
- commit：`fc9ea47`。
- 边界：backup/archive 保留；未执行 down migration、file-only 回退、G6、视频、删除或 push。
- next：`WAIT_G5_USER_ACCEPTANCE`。

## 2026-07-15：G5 最终用户签收

- 用户明确确认 G5 M0～M8 运行结果通过，并授权将 G5 和本轮 G0～G5 标记完成。
- 状态从 `WAIT_G5_USER_ACCEPTANCE` 单向推进为 `G0_G5_COMPLETE`；没有新增代码、数据库写入或运行环境变更。
- 用户边界继续生效：不进入 G6，不删除 backup/archive，不执行 down migration。
- 文档、验收清单、`../../功能完成记录/2026-07-15_G0至G5阶段完成.md`、会话记忆与长期记忆已同步。
- next：无自动后续阶段；只有用户另行提出新目标时再开始新任务。

## Luna 每次推进必须追加的格式

```md
## YYYY-MM-DD HH:mm：<phase/task id>

- baseline：<sha + dirty summary>
- 实现：<文件和行为>
- 测试：<命令、数量、退出码>
- 证据：<相对路径/digest>
- Review：<结论>
- commit：<sha>
- 风险/未运行：<事实>
- next：<唯一状态>
```

只记录状态变化、关键决策和证据，不粘贴大段终端输出或完整代码。
