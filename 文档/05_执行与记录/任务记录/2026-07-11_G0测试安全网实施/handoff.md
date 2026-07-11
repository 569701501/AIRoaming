---
doc_id: AIR-TASK-20260711-G0-IMPLEMENTATION-HANDOFF
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G0 七阶段测试安全网最终实现与主代理复核
---

# G0 七阶段测试安全网 Handoff

## 1. 交付结论

G0 安全网的代码、自动化验证、Scrutiny Review、Runtime/User Review、会话记忆与 Git 提交均已完成。主体实现提交为 `185b83c`。

G0 完成只表示“后续 G1～G5 有可重复、隔离的安全网”，不表示七阶段最终出版链路完成。

## 2. 已交付能力

| 层级 | 已交付 |
| --- | --- |
| Service | 8 条七阶段 characterization；公开 Service、真实临时 fs、外部 provider fake |
| 环境契约 | 15 条路径、marker、密钥、loopback、状态目录与清理守卫 |
| Prepare 契约 | 3 条真实 env 执行、shared/dist 不变、Nest/Vite shared source 解析 |
| Playwright infra | 独立 provider/server/web、唯一 runId、临时 workspace、受控 PID 与 teardown |
| API | API-01～API-04，含立即登记 cleanup 与独立控制项目删除隔离 |
| Chromium | UI-01～UI-05，项目库、工作区、七阶段门禁、返回路径与 HTTP/WebSocket 网络审计 |
| 命令 | `typecheck:e2e`、`test:e2e:env`、`test:e2e:prepare`、`test:e2e`、`test:e2e:repeat`、`test:e2e:ui`、`test:all` |

关键运行时约束：Node 22.17.1；所有 E2E TypeScript/服务进程显式 `node --import tsx`；根依赖 `tsx@4.22.3`；Nest 与 Vite 都从 `packages/shared/src/index.ts` 解析 shared，不在 E2E prepare 中构建 `packages/shared/dist`。

## 3. 复现命令

```text
corepack pnpm typecheck
corepack pnpm typecheck:e2e
corepack pnpm exec tsc -p tests/e2e/tsconfig.server.json --noEmit
corepack pnpm test
corepack pnpm test:e2e:env
corepack pnpm test:e2e:prepare
corepack pnpm test:e2e
corepack pnpm test:e2e:repeat
corepack pnpm test:all
```

首次在新机器运行 Chromium 前：

```text
corepack pnpm exec playwright install chromium
```

## 4. 已验证结果

- shared 15/15，server 72/72。
- E2E env 15/15；prepare 3/3，内部真实 env 15/15；harness 1/1。
- Playwright API + UI + infra 3/3。
- `test:e2e:repeat` 明确 `Running 9 tests`，9/9。
- `test:all` 的三包 typecheck、E2E typecheck、shared/server、prepare 与 Playwright 全绿。
- 最终修复后三次独立 E2E run：`g0-53667-mrfy6b4e-27b277e7`、`g0-54920-mrfy6gi9-887e4b7b`、`g0-56258-mrfy6luj-c735d4f6`。
- Runtime/User Review run `g0-59887-mrfy7wm2-903aec4f`：UI spec 1/1；UI-01～UI-05 全部通过；network audit 为 total 111、loopback continued 110、external continued 0、external blocked 1、invalid blocked 0。
- 应用内浏览器只读确认用户当前 `/projects` 的项目库真实结构可见；没有打开、创建、删除或保存项目。
- ENV-07 失败证据演练 run `g0-74023-mrfyk3g3-6aff4225`：临时只读故意失败 spec 按预期 exit 1，global teardown 成功；`test-failed-1.png`、`error-context.md`、21-entry `trace.zip`、HTML report、网络审计与浏览器诊断附件均生成并由主代理实际检查。网络审计 external continued 为 0；临时 spec 已删除。忽略产物位于 `test-results/e2e/g0-74023-mrfyk3g3-6aff4225/` 与 `playwright-report/g0-74023-mrfyk3g3-6aff4225/`，不提交。这不是全量测试失败。

## 5. 必须知晓的 P0 事故

初版 `test:e2e:prepare` 曾执行 `@airoaming/shared build`，触发用户正在运行的 `tsx watch` server 重启，并使真实 workspace 下 14 个文件的内容/元数据聚合发生变化：

- workspace content aggregate：`86d9d788…` → `c0928833be03f817dbd2332dd8c2ad0c1179ad6ec5ca2a94e7b6954665c241c7`；
- workspace metadata aggregate：`a3be899…` → `04ae178…`；
- 4310 child PID：`45299` → `16324`；watcher PID `48934` 未变；
- 5173 PID `48958` 未变。

主代理没有恢复、覆盖或回滚用户数据。修复后 prepare 不再构建 shared，并以契约测试保护 shared/dist 的字节、mode 与 `mtimeNs` 不变。

最终实现只被证明“相对事故后基线非侵入”。最终基线为：workspace content `c0928833be03f817dbd2332dd8c2ad0c1179ad6ec5ca2a94e7b6954665c241c7`、settings `f2ad389ee31752783a6b6ce6c8c745565d9cb9e27419d45af582e38548f58544`、shared/dist `c6d25bda00cf746df0072a1d1f25146a735963f22fbaa2cfb3a5cab304f7278d`，4310 child PID `16324`、5173 PID `48958`；无测试临时目录或受控进程残留。

## 6. G1 接替条件

当前最后一条 Service characterization 是 `migration_witness`，证明文件态旧系统在重建 Nest application context 后仍能读回剧本版本、结构、pending 分镜、正式分镜与 preflight 语义。它不是 G1 的生产持久化实现。

G1 完成时必须同时满足以下条件，才能删除或替换该 witness：

1. 测试改走真实 G1 迁移入口和生产 DB 链路，不使用只为测试存在的平行持久化路径。
2. 完成 DB-only 切换后，重启进程并通过公开 Workbench/API 读取同等语义不变量。
3. 断言 current Script/Story/Storyboard/Preflight 指针、pending 与 confirmed 边界、workflow 投影和来源关系保持。
4. 证明 DB-only 激活后修改旧 JSON 不影响正式读取，并且生产代码不再回退旧文件事实源。
5. 新的 G1 测试先通过后，再删除或改写 G0 文件态 witness；保留同一组不变量断言和失败定位能力。

## 7. 未交付边界

- UI-06 未实现。
- G1 DB-only/迁移/持久任务、G2 freshness、G3 漫画版式强约束、G4 CandidateLockRevision、G5 成稿编辑器均未实现。
- G6 素材包 V2 与 G7 ZIP 总验收继续后置。
- 一镜一页、复制源图和目录式素材包仍是已知旧骨架，没有进入 G0 绿色成功契约。

## 8. 主代理收口确认

- [x] 更新本次会话记忆最终总结。
- [x] 审查 Worker C 文档差异并执行 `git diff --check`。
- [x] 确认没有越界生产代码或未来行为测试。
- [x] 提交 `codex/g0-test-safety-net`；主体实现提交为 `185b83c`。
