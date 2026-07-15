---
doc_id: AIR-TASK-20260715-G0-G5-DOC-REGRESSION-PROGRESS
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# 进度记录

## 当前状态

```text
phase = P5_CLOSEOUT
result = COMPLETED_WITH_OBSERVATIONS
```

## 时间线

### P0：范围与入口确认

- 用户明确本轮不做素材包和轻量视频。
- 已确认 G0～G5 正式终态为 `G0_G5_COMPLETE`，但部分旧文档仍有过期状态。
- 已读取文档总入口、AI 上下文、写作与留痕规则、长期记忆、路线图、G0～G5 完成记录、自动化测试体系和阶段验收清单。
- 已确认当前工作区有既存未提交修改，本轮不覆盖无关文件。

### P1：文档事实审计与修正

- 结论：通过。
- 已将 `AI上下文入口.md` 的 migration catalog 更新为 0001～0016，并把 G1/G2/G3/G4/G5 状态同步为已完成。
- 已更新产品页面链路和当前 UI 信息架构：第 1～6 步分别标为 completed_g2/completed_g4/completed_g5；第 7 步素材包继续 deferred。
- 已更新模块总览：SQLite 是唯一业务事实源，持久任务、legacy 历史导入、G3 cutover、G4 CandidateLockRevision 和 G5 publication 均为完成态。
- 已清理路线图 M1/M2 的旧 file/workspace 叙述，明确 `ChapterScene + SceneVisual`、持久 Task/Asset/Candidate 与参考来源注入已经完成；独立场景模板 UI 等仅为后置增强。
- 已把 G1/G2/G3/G4 验收清单总状态同步为 completed，把旧 G3-M 交接标为 superseded，并写明 M6/C0～C7/R2 已完成、无需重复授权。
- 已更新自动化测试体系和七阶段基线：G0～G5 已完成，G6/视频不属于本轮；随后已用本轮顺序回归结果刷新最新基线。
- 文档校验：`git diff --check` 通过；本轮涉及的本地 Markdown 链接全部存在。

修改文件：

- `文档/00_索引/AI上下文入口.md`
- `文档/01_愿景与产品/功能清单与页面链路.md`
- `文档/01_愿景与产品/当前UI信息架构.md`
- `文档/03_模块梳理/模块总览与依赖.md`
- `文档/05_执行与记录/路线图与里程碑.md`
- `文档/06_测试与验收/自动化测试体系.md`
- `文档/06_测试与验收/G0七阶段行为用例矩阵.md`
- `文档/06_测试与验收/G1数据库迁移执行与验收清单.md`
- `文档/06_测试与验收/G2上游版本链与失效验收清单.md`
- `文档/06_测试与验收/G3漫画版式入口与锁定验收清单.md`
- `文档/06_测试与验收/G3-M施工包_可执行验收与Luna交接.md`
- `文档/06_测试与验收/G4候选定稿返修验收清单.md`
- `文档/06_测试与验收/七阶段完整链路验收基线.md`

### P2-G0：测试安全网

- 结论：通过。
- `corepack pnpm test:e2e:env`：33/33。
- `corepack pnpm test:e2e:prepare`：3/3；内部环境契约 33/33，shared build 产物保持不变。
- G0 Service/fixture 定向 Vitest：2 files、17/17。
- file 模式 Playwright：4/4；runId=`g0-97629-mrlhzjt8-57d18c66`，provider/server/web 均为 loopback，teardown 已清理。

### P2-G1：数据库、迁移与切换边界

- 结论：通过；存在一个已隔离确认的并行时间抖动，不是功能断言失败。
- G1 manifest/schema/migration direct check：全部通过；manifest=`sha256:dd80f3191a098dcce9add786c710f2c7da01fddb107e1b407bdf0cc64eafc64b`。
- Prisma validate：通过。
- 首次 16 files 并行：133/134；唯一失败为 Prisma fresh deploy 用例耗时 5.004 秒触发固定 5 秒 timeout。
- 失败用例隔离复跑：1/1，耗时 1.93 秒；`g1-migration-plan.spec.ts` 整文件复跑：12/12。
- 其余 15 files：122/122；包含 Schema、release identity、business write boundary、file guard、C0～C7 cutover 与 backup/restore。
- backup/restore 单文件复核：40/40。

### P2-G2：版本链、freshness 与任务适用性

- 结论：通过。
- Shared versioning：6 files、21/21。
- Server G2 overlay/runtime/repository boundary：7 files、13/13。
- DB 集成关键链：8/8，覆盖 Script/Story/Storyboard/Preflight、ProductionState、TaskSource、claim fencing、story_parse current/historical completion。
- G2 DB-only API/Chromium：2/2；runId=`g0-8220-mrli5qg2-ba44d705`，teardown 已清理。

### P2-G3：漫画版式、迁移与 DB-only 激活

- 结论：通过。
- Shared ComicFormat：3/3。
- Server G3 overlay/runtime/input/legacy mapper/candidate spec：7 files、25/25。
- 完整 shadow/final importer：78/78，覆盖 16 slice、幂等重放、decision、Asset/Task/Candidate/Layout/Dialogue 导入、DB API 读回和旧文件隔离。
- 隔离 C0～C7 rehearsal：2/2，覆盖 final import、restore、closed ready、API smoke、first write 和篡改 fail-closed。

### P2-G4：候选定稿、返修与来源门禁

- 结论：通过。
- Shared candidate lock/rules：2 files、15/15。
- Server overlay、lock set、impact、source query、layout dependency/freshness：8 files、33/33。
- DB replacement/late task/new candidate/restart 集成：1/1。
- G4 Chromium 完整链：1/1；runId=`g0-14928-mrlias0w-bee31b7e`，teardown 已清理。

### P2-G5：成稿编辑、渲染与 publication

- 结论：通过。
- fixture contract：3/3。
- Shared LayoutDocument、命令、publication 与 renderer 契约：14 files、61/61。
- Server G5 定向：13 files、29/29。
- G5-M3/M5 DB 集成：2/2。
- `corepack pnpm test:render`：通过；corpus digest=`sha256:c0e7e80b40d7f2b3c4293ce4d32972ab22f315f4c098948dceba603fdb0abf56`。
- `corepack pnpm test:migration:g5`：通过；corpus digest 与 render gate 一致。
- `corepack pnpm test:e2e:g5`：DB-only Chromium 8/8；runId=`g0-21824-mrlids0d-4fed00f9`，teardown 已清理。

### P2：全量收口门禁

- `corepack pnpm typecheck`、`corepack pnpm typecheck:e2e`：通过。
- Shared 全量：115/115。
- Server 默认并发首次为 566/568；两条 backup/restore 用例分别在 5.035 秒和 5.026 秒触发固定 5 秒 timeout，没有业务断言失败。
- 失败项隔离复跑可通过；完整 backup/restore 文件此前同轮 40/40。
- 不改代码、不放宽 timeout，使用单 worker 完整复跑 Server：93 files、568/568，耗时 295.35 秒；其中 backup/restore 40/40、final importer 78/78、DB 集成 38/38。
- shared/server/web 生产 build：通过；Prisma validate：通过；`git diff --check`：通过。
- Web build 报告 `AppShell` 约 985.28 kB 的 chunk size 提示；不影响本轮正确性，但属于后续性能优化项。
- G5 Chromium 完成后出现一次 `ERR_STREAM_PREMATURE_CLOSE` 服务端日志；浏览器断言、Artifact 读回和 teardown 均通过，未形成测试失败或残留进程。

### P3：Scrutiny Review

- 结论：`passed_with_observations`。
- G0～G5 的文档状态、代码测试、DB-only 边界与阶段完成记录一致。
- 两条固定 5 秒并发抖动已如实保留；单 worker 全量与隔离复跑证明其不是功能断言失败。
- 详见 `scrutiny_review.md`。

### P4：Runtime/User Review

- 结论：`passed_automated_runtime`。
- file Chromium 4/4、G2 DB-only 2/2、G4 Chromium 1/1、G5 DB-only 8/8，运行根和受控进程均完成 teardown。
- render、migration、DB integration、backup/restore 和 file guard 均已复核。
- 本轮是回归复核，不调用真实 provider、不改真实业务数据，也不测试延期的 G6 素材包和轻量视频。
- 详见 `runtime_review.md`。

### P5：最终留痕

- 已补充本任务双 Review、功能完成记录、会话记忆和长期记忆。
- 本轮没有修改业务代码、数据库 schema 或协议；只修正文档并执行测试。
- 最终状态：`G0_G5_REGRESSION_PASSED`。
