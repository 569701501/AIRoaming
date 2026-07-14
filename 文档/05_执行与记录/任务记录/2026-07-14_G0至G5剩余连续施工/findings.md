---
doc_id: AIR-G05-REMAIN-FINDINGS-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: human, luna, reviewer
source: 2026-07-14 代码、Git、文档与测试事实复核
---

# 当前事实与风险

## 1. 已确认事实

- 当前分支为 `codex/g0-test-safety-net`，S0 已提交于 `f07f516`，R0-A 已提交于 `fbfcbeb`；W1 当前仍在待提交工作树。
- R0-A production cutover entry 已完成 Luna 独立 Scrutiny=`passed`、Runtime=`passed_isolated` 和 disposable Keychain smoke。
- W1 后最近一次服务端全量为 70 spec/474 tests，shared 为 39 tests；typecheck、e2e typecheck、server/web build 均通过。
- R0-A 的 runner、SecretStore、cutover evidence/plan 已在 `fbfcbeb` 提交；W1 代码、测试与证据需独立提交，其他用户历史文档不得混入。
- R0-B/R1/R2 未获授权：真实 C0、SH-10、AUTH-C1/C5/C7、C1～C7、OBS-01～10 都未运行。
- G4/G5 的产品、契约和验收文档较完整，但正式功能实现未开始；现有 CandidateLock/Layout/Export 主要是 G1/D2 数据和基础闭环骨架。

## 2. 当前 P0 代码缺口

### DB-only Web 第 2～4 步

- `apps/web/src/stores/workbench-store.ts` 的 Script 已有 `g2_db` 分支。
- Story Structure、Storyboard、Image Preflight 的 `apps/web/src/services/api.ts` 与 store 仍调用 legacy `/story-structure/confirm`、`/storyboard/confirm`、`/storyboard/pending`、`/image-preflight/confirm` 等路径。
- server DB 模式对多条 legacy 写方法返回 `LEGACY_WRITE_ROUTE_DISABLED`。
- W1 已补齐 DB-only Story/Storyboard/Preflight 工作台路径；未通过 R0B/R1/R2 授权前，不能据此推断真实切换已完成。

### 重复路由

- `apps/server/src/projects/projects.controller.ts` 同时定义两个相同的 `POST :projectId/chapters/:chapterId/image-preflight/confirm`。
- 一个调用 `PreflightRevisionService.confirm`，另一个调用 legacy `ProjectsService.confirmChapterImagePreflight`。
- 路由解析行为不应依赖声明顺序；W1 必须合并成唯一入口和明确模式分派。

### 默认测试入口

- 项目审计中，带 single-fork/60s 的 server 全量通过。
- 复现确认根默认 `pnpm test` 的失败来自 `g1-migration-plan.spec.ts` 中两次真实 Prisma 子进程串行执行超过单测默认 5 秒；断言本身通过，失败是测试边界过窄。
- 已用最窄修复给该单测增加 `30_000ms` 局部 timeout，未改全局 Vitest 配置、业务断言或测试内容。
- 修复后根默认 `corepack pnpm test` 连续三次通过：shared 8 spec/39 tests，server 69 spec/472 tests，exit 0；因此默认门禁当前可重复通过。

### E2E 覆盖

- 当前 `tests/e2e` 主要有项目库/阶段 rail 与 API smoke，约 4 条主路径，显式为 file mode。
- 已新增 DB-only fresh SQLite 浏览器/API 门禁；当前证据覆盖顺序点击、重启启动、旧 legacy 写路径拒绝、file-mode 回归和三次重复。双标签冲突的真实浏览器交互仍是 W1 后续增强项，不得在清单中冒充已覆盖。

## 3. 阶段排序决定

```text
S0 -> W1 -> R0B -> R1 -> R2 -> G4 -> G5
```

理由：

1. 未提交 R0-A 不能作为真实 release 基线。
2. W1 不完成，DB-only 激活后第 2～4 步可能失败。
3. G4/G5 的正式前置是 DB-only 已激活且观察通过。
4. G5 来源返修依赖完整 G4 CandidateLockRevision 语义。

## 4. 范围决定

- 用户希望 Luna 按总目标连续执行，不再每个小切片都询问。
- 计划因此把 S0/W1、R2 后的 G4/G5 定义为自动区间。
- 真实数据/系统凭据相关动作仍保留 R0B、SH-10、AUTH-C1/C5/C7、R2 观察授权六道不可合并的人类门。
- G5 技术 E0 可由 Luna 根据硬指标和许可证证据选择；若没有明确通过方案才暂停。
- G5 完成仍需用户对运行产物最终签收；G6/视频不自动开始。

## 5. 主要风险

| 风险 | 影响 | 控制 |
| --- | --- | --- |
| dirty worktree 混入未知改动 | 丢用户代码或提交不可审计 | 阶段 manifest、只暂存列明文件、禁止 add -A/reset |
| file/DB adapter fallback | 双事实源、真实切换后数据分叉 | capability 单选、失败不 fallback、网络断言 |
| 重复 preflight 路由 | 运行时调用不确定/DTO 混淆 | 单一路由 + 模式 facade + 两模式测试 |
| E2E 只 mock capability | 假 DB-only 证据 | fresh SQLite、正式 migration、server snapshot 断言 g2_db |
| 过度加 timeout | 隐藏死锁、拖慢反馈 | 先重现/测时/修 fixture，最窄 timeout |
| G4 重复 Schema 基础设施 | 再次把精力花在门禁而非功能 | 复用 G1 base，只补 G4 缺失约束与垂直功能 |
| G5 先锁画布库 | 预览/正式渲染不一致 | E0 两条完整薄切片和 deterministic hard gate |
| 真实授权被合并 | 越权、不可逆首写 | 固定授权文本、identity binding、人工 stop |

## 6. 当前结论

```text
plan_ready
S0_CLOSEOUT = completed
W1_DB_WEB_GATE = implemented_pending_independent_commit
next_execution_state = WAIT_R0B_AUTH
real_cutover = no_go_until_explicit_R0B_authorization
```

本目录是 Luna 的连续施工入口；W1 仍需实现和复核，R0B/R1/R2 及真实数据操作仍为 `not_run`。
