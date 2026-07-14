---
doc_id: AIR-G05-REMAIN-PROGRESS-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: human, luna, reviewer
source: 本任务执行时间线
---

# 连续施工推进记录

## 当前状态

```text
current = G4_A_IN_PROGRESS
last_completed = R2_DB_ONLY_OBSERVATION
next_human_gate = WAIT_G5_USER_ACCEPTANCE
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
| G4 | `in_progress_g4_a` | — | — | 从 Shared + Schema overlay 连续执行，不设日期 |
| G5 | `blocked_until_g4_passed` | — | — | G4 通过后连续执行，最终用户签收 |

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
