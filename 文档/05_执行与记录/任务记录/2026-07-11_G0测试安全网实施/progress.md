---
doc_id: AIR-TASK-20260711-G0-IMPLEMENTATION-PROGRESS
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G0 七阶段测试安全网实施、返工与主代理复核
---

# G0 七阶段测试安全网实施进度

## 1. 基线与 Service characterization

- 用户明确授权开始开发，并要求先检查计划、最多使用 3 个子代理、由主代理逐项审查并把问题退回原负责人返工。
- 实施前基线通过：`corepack pnpm typecheck` 成功；`corepack pnpm test` 共 79 项（shared 15、server 64）。
- 已建立分支 `codex/g0-test-safety-net` 和任务记录，生产代码、Schema 与业务协议不在本次修改范围。
- 首轮 Service characterization 交付 8 条用例。主代理发现 S3 直接确认门禁、章节标题/ScriptVersion 关联、preflight 失效和完整五步状态投影仍需加强，退回原负责人返工。
- 返工后主代理定向复跑 8/8、server 全量 72/72、server typecheck 均通过；阶段 1 完成。

## 2. E2E runtime、环境契约与行为用例

- Worker A 负责 E2E runtime、进程与命令契约；Worker B 负责 API/UI 行为用例。两者文件所有权互不重叠。
- 环境守卫完成 runId、marker、危险路径拒绝、最小环境变量 allowlist、假密钥、loopback、进程身份与清理契约。主代理复核中曾发现无效 `allowBuilds` 占位与凭据 denylist 设计，均已退回并改正。
- Worker B 实现 API-01～API-04 与 UI-01～UI-05：API 在创建项目后立即登记 cleanup ID，删除目标项目后确认独立控制项目仍存在；UI 在 page 创建前拦截 HTTP 与 WebSocket，只允许本次运行的 loopback origin。
- G0 没有把 UI-06、`record_only` 或 G1～G5 的未来行为写成当前绿色测试。
- Node 22.17.1 下的 TypeScript E2E 与服务进程统一显式使用 `node --import tsx`，根依赖固定 `tsx@4.22.3`；新增独立 server tsconfig，Vite 与 Nest E2E runtime 都从 `packages/shared/src/index.ts` 解析 shared。

## 3. P0 事故与返工

- 主代理首轮审查发现，初版 `test:e2e:prepare` 会执行 `@airoaming/shared build`。这触发用户正在运行的 `tsx watch` server 重启，并使真实 `workspace/` 下 14 个文件的内容/元数据聚合发生变化。
- 事故前 workspace content aggregate 为 `86d9d788…`，metadata aggregate 为 `a3be899…`；事故后 content aggregate 为 `c0928833be03f817dbd2332dd8c2ad0c1179ad6ec5ca2a94e7b6954665c241c7`，metadata aggregate 为 `04ae178…`。
- 用户 4310 server child PID 从 `45299` 变为 `16324`；watcher PID `48934` 未变，5173 Web PID `48958` 未变。
- 主代理没有恢复、覆盖或回滚用户数据。本记录不能被解读为“整个实施期间真实 workspace 从未变化”。
- 该问题按 P0 退回 Worker A。最终修复删除 prepare 中的 shared build，改由 E2E tsconfig、Nest runtime 与 Vite source alias 直接解析 `packages/shared/src/index.ts`。
- 新增 `e2e-prepare.contract.ts`：真实运行环境契约并拒绝零测试假绿，同时验证 `packages/shared/dist` 的字节、mode 与 `mtimeNs` 不变，并分别验证 Nest/TSX 与 Vite 的 shared source 解析。

## 4. 主代理最终验证

### 4.1 类型、单元与契约

| 验证 | 结果 |
| --- | --- |
| `corepack pnpm typecheck` | 三包通过 |
| `corepack pnpm typecheck:e2e` | 通过 |
| `corepack pnpm exec tsc -p tests/e2e/tsconfig.server.json --noEmit` | 通过 |
| `corepack pnpm test` | shared 15/15、server 72/72 |
| `corepack pnpm test:e2e:env` | 15/15 |
| `corepack pnpm test:e2e:prepare` | 3/3，内部真实执行 env 15/15 |
| Playwright harness lifecycle | 1/1 |
| API + UI + infra | 3/3 |
| `corepack pnpm test:e2e:repeat` | 明确输出 `Running 9 tests`，9/9 |
| `corepack pnpm test:all` | typecheck、E2E typecheck、shared 15、server 72、prepare 3（含 env 15）、Playwright 3 全部通过 |

### 4.2 三次独立 E2E

最终修复后，主代理又独立执行三次 `corepack pnpm test:e2e`；每次 prepare、env、Playwright 与 teardown 都通过：

1. `g0-53667-mrfy6b4e-27b277e7`
2. `g0-54920-mrfy6gi9-887e4b7b`
3. `g0-56258-mrfy6luj-c735d4f6`

### 4.3 最终非侵入基线

P0 修复后，以事故后的状态作为最终基线反复复核：

- workspace content aggregate：`c0928833be03f817dbd2332dd8c2ad0c1179ad6ec5ca2a94e7b6954665c241c7`；
- settings hash：`f2ad389ee31752783a6b6ce6c8c745565d9cb9e27419d45af582e38548f58544`；
- shared/dist content aggregate：`c6d25bda00cf746df0072a1d1f25146a735963f22fbaa2cfb3a5cab304f7278d`；
- 4310 child PID：`16324`；5173 PID：`48958`；
- 无 `tests/.runtime`、`/tmp/airoaming-e2e-*` 或受控 Server/Web/provider 残留进程。

上述值在最终 `test:all`、重复运行、三次独立 E2E 与 Runtime/User Review 后保持不变。该结论只证明最终修复相对事故后基线非侵入，不抹除第 3 节事故。

## 5. Scrutiny Review 与 Runtime/User Review

- Scrutiny Review 已完成：Service/API/UI 只断言公开 DTO、稳定错误码、用户可见状态与临时 workspace；fake 只位于外部 provider 边界；`record_only/red_on_slice` 未被误写为绿色契约。
- trace-on 单独运行 UI spec：run ID `g0-59887-mrfy7wm2-903aec4f`，1/1 通过；HTML report 证明 UI-01～UI-05 的项目库、工作区、七阶段门禁和返回路径均通过。
- 网络审计：total `111`、continuedLoopback `110`、continuedExternal `0`、blockedExternal `1`、blockedInvalid `0`；`https://api.dicebear.com` 被阻断，没有外部请求被放行。
- 主代理随后通过应用内浏览器只读打开用户当前 `http://127.0.0.1:5173/projects`，确认“项目库 / 我的项目 / 项目卡片 / 新建项目 / 筛选”等真实可见结构和截图正常；没有打开、创建、删除或保存项目。
- 浏览器复核后，workspace/settings/shared-dist hash 与 4310/5173 PID 仍保持最终基线。
- ENV-07 失败证据演练已完成：主代理临时加入只读故意失败 spec（随后删除，不进入提交），run ID `g0-74023-mrfyk3g3-6aff4225`。命令按预期 exit 1，global teardown 仍成功清理；生成 `test-failed-1.png`、`error-context.md`、21-entry `trace.zip`、HTML report、网络审计与浏览器诊断附件。网络审计 total 96、continuedLoopback 95、continuedExternal 0、blockedExternal 1、blockedInvalid 0，DiceBear 被阻断。主代理已实际查看截图并检查 trace/DOM/网络附件；这是预期故障演练，不是全量回归失败。忽略产物位于 `test-results/e2e/g0-74023-mrfyk3g3-6aff4225/` 与 `playwright-report/g0-74023-mrfyk3g3-6aff4225/`，不提交。

## 6. 当前状态

- 阶段 0～6：完成。
- 阶段 7：正式文档、Handoff、Scrutiny Review、Runtime/User Review、会话记忆与 Git 提交已完成。
- `migration_witness` 仍是 G0 临时适配器；G1 必须以真实迁移与生产 DB-only 链路的等价测试替换。
- UI-06、G1～G5 与后置 G6/G7 仍未实现。
- G0 主体实现已提交为 `185b83c`（`test: add G0 seven-stage safety net`）。
