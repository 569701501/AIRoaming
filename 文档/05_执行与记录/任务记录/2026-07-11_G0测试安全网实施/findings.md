---
doc_id: AIR-TASK-20260711-G0-IMPLEMENTATION-FINDINGS
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G0 实施代码、主代理静态复核、运行证据与 Runtime/User Review
---

# G0 七阶段测试安全网实施发现

## 1. 最终代码结构

- Vitest 继续负责 shared/server 测试；新增 8 条 Nest Service characterization，server 总数由 64 增至 72，shared 保持 15。
- Playwright Test 负责完整应用 E2E：基础设施 1 条、API-01～API-04 合并为 1 条 smoke spec、UI-01～UI-05 合并为 1 条 Chromium spec，共 3 条 Playwright 用例。
- E2E 环境契约使用 Node 内建 test runner，共 15 条；prepare 契约 3 条，真实运行 env suite 并拒绝零测试假绿。
- 所有测试只使用临时 workspace、独立端口、loopback fake provider 和假 key；不复用用户当前 4310/5173 开发服务。
- Node 22.17.1 不能依赖隐式 TypeScript 加载。正式命令与受控服务进程统一使用 `node --import tsx`，根依赖固定 `tsx@4.22.3`。
- `tests/e2e/tsconfig.json` 和 `tests/e2e/tsconfig.server.json` 将 `@airoaming/shared` 指向 `packages/shared/src/index.ts`；programmatic Vite 使用同一 source alias，并排除 shared 预构建。

## 2. 行为与边界结论

- Service fixture 通过 `ProjectsService`、`TasksService` 公开方法和真实 Repository/fs 建立状态，只在 `ImageProviderService` 外部边界使用确定性 fake。
- 8 条 Service 用例锁住：显式版式创建、剧本/结构/分镜推进、pending 不推进、preflight blocked/ready、候选任务门禁、全镜锁定、排版/素材包前置门禁、分镜变更后的 preflight 失效以及重开语义。
- blocked preflight 的公开响应当前只稳定暴露 `IMAGE_PREFLIGHT_BLOCKED`；具体 `missing_reference` issues 没有进入公开错误响应。G0 不通过私有 util 绕过这一契约缺口。
- API smoke 在项目创建后立即登记 cleanup ID；删除目标项目后再验证独立控制项目仍存在，证明删除隔离而不是只看目标消失。
- UI 网络守卫在 page 创建前同时拦截 HTTP 与 WebSocket，只放行当前 run 的 loopback origin；成功报告中 external continued 为 0。
- UI 只覆盖 API-01～API-04、UI-01～UI-05 和基础设施。UI-06、G1～G5 目标行为、G6/G7 后置行为均未实现。
- 当前一镜一页、复制源图与目录式素材包仍是 `record_only`，没有被写成绿色成功契约。

## 3. P0 审查事故

- 初版 `test:e2e:prepare` 调用 `@airoaming/shared build`，触发用户正在运行的 `tsx watch` server 重启，并使真实 `workspace/` 下 14 个文件的内容/元数据聚合发生变化。
- 事故前 workspace content aggregate 为 `86d9d788…`，metadata aggregate 为 `a3be899…`；事故后 content aggregate 为 `c0928833be03f817dbd2332dd8c2ad0c1179ad6ec5ca2a94e7b6954665c241c7`，metadata aggregate 为 `04ae178…`。
- 4310 child PID 从 `45299` 变为 `16324`；watcher PID `48934` 与 5173 PID `48958` 未变。
- 主代理没有恢复、覆盖或回滚用户数据，因此不能声称整个 G0 实施期间真实 workspace 从未变化。
- 问题退回 Worker A 后，prepare 不再 build shared；E2E 改为从 shared source alias 解析，并新增契约验证 `packages/shared/dist` 字节、mode、`mtimeNs` 不变。

## 4. 最终安全性结论

P0 修复后，主代理以事故后状态为基线完成 `test:all`、`repeat-each=3`、三次独立 `test:e2e` 与 Runtime/User Review。以下状态持续稳定：

| 项目 | 最终基线 |
| --- | --- |
| workspace content aggregate | `c0928833be03f817dbd2332dd8c2ad0c1179ad6ec5ca2a94e7b6954665c241c7` |
| settings hash | `f2ad389ee31752783a6b6ce6c8c745565d9cb9e27419d45af582e38548f58544` |
| shared/dist content aggregate | `c6d25bda00cf746df0072a1d1f25146a735963f22fbaa2cfb3a5cab304f7278d` |
| 用户开发进程 | 4310 child PID `16324`；5173 PID `48958` |
| 临时残留 | 无 `tests/.runtime`、`/tmp/airoaming-e2e-*` 或受控残留进程 |

该结论证明的是最终实现相对事故后基线非侵入，不代表事故前后的真实 workspace 等价。

## 5. 复核证据

- 类型与单元：三包 typecheck、E2E typecheck、独立 server E2E tsconfig typecheck、shared 15/15、server 72/72。
- 环境与 prepare：env 15/15；prepare 3/3，内部 env 15/15；harness lifecycle 1/1。
- Playwright：API + UI + infra 3/3；`test:e2e:repeat` 明确运行 9 项并 9/9。
- 三次独立 E2E run ID：`g0-53667-mrfy6b4e-27b277e7`、`g0-54920-mrfy6gi9-887e4b7b`、`g0-56258-mrfy6luj-c735d4f6`。
- UI trace-on run ID：`g0-59887-mrfy7wm2-903aec4f`，1/1；网络审计 total 111、continuedLoopback 110、continuedExternal 0、blockedExternal 1、blockedInvalid 0，DiceBear 外链被阻断。
- 应用内浏览器只读复核了用户当前项目库可见结构，没有打开、创建、删除或保存项目；复核后最终基线不变。
- ENV-07 通过一次临时只读故意失败 spec 验证：run ID `g0-74023-mrfyk3g3-6aff4225`，命令按预期 exit 1、global teardown 成功。失败产物包括 `test-failed-1.png`、含 DOM snapshot/断言位置的 `error-context.md`、含 21 entries 与 `0-trace.network` 的 `trace.zip`、HTML report、`e2e-browser-network-audit` 和 `e2e-browser-diagnostics`；审计 external continued 为 0。临时 spec 已删除；忽略产物位于 `test-results/e2e/g0-74023-mrfyk3g3-6aff4225/` 与 `playwright-report/g0-74023-mrfyk3g3-6aff4225/`，不提交。这是故障证据演练，不是回归失败。

## 6. 后续约束与文档注意

- G0 的 `migration_witness` 是文件态重开语义的临时适配器。G1 必须先让真实迁移和生产 DB-only 链路通过同等不变量，再删除或替换 witness；不得直接删掉证据。
- `文档/04_方案与决策/2026-07-11_G0至G5开发文档完备性复核.md` 是开发授权前的时间点快照，其中“G0 尚未实现”不再代表当前状态；当前实施状态以本任务记录、`自动化测试体系.md` 和 G0 功能完成记录为准。
- Git 提交由主代理完成，Worker C 不声明提交已完成。
