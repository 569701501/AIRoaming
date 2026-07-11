---
doc_id: AIR-TASK-20260711-G0-IMPLEMENTATION-PLAN
status: active
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G0七阶段行为刻画与E2E测试骨架方案、G0七阶段行为用例矩阵、用户开发授权
---

# G0 七阶段测试安全网实施计划

## 1. 目标

在不修改七阶段产品框架、不连接真实模型、不读写真实用户 workspace 的前提下，建立可重复运行的 G0 自动化安全网：

1. 用 Nest Service characterization tests 锁住当前正确的阶段推进、待确认语义与门禁。
2. 用 Playwright API smoke 证明真实 HTTP 进程、响应信封与临时 workspace 可工作。
3. 用 Playwright Chromium 路径证明项目库、创建项目、进入工作区和七阶段导航门禁可被真实用户操作。
4. 把环境隔离、进程回收、失败证据和重复运行作为一等验收对象。
5. 只实现 `green_now` 用例；G1–G5 目标行为继续按对应切片 red → green，不把已知错误固化成绿色测试。

## 2. 非目标

- 不实现 G1 数据库切换、G2 freshness、G3 漫画版式、G4 候选修订或 G5 成稿编辑器。
- 不修正或绿测当前一镜一页排版、复制源图导出、目录形式素材包等已知临时行为。
- 不调用真实 OpenCode、图片供应商或读取后端真实密钥。
- 不复用本机正在运行的开发 server/web，不使用仓库默认 `workspace/`。
- 不以私有方法、内部 Map、DOM class 或文件写入调用次数作为长期契约。

## 3. 总体实施顺序

### 阶段 0：基线冻结与任务隔离

- [x] 记录当前分支、基线测试数量与工作区状态。
- [x] 建立独立实现分支 `codex/g0-test-safety-net`。
- [x] 创建本任务 `task_plan.md`、`progress.md`、`findings.md`。
- [x] 明确三个子代理文件所有权，禁止交叉修改。

**退出标准：** 基线清楚、工作树无未知改动、计划先于实现存在。

### 阶段 1：Service characterization 垂直切片

负责人：子代理 1。

文件所有权：

- `apps/server/src/projects/test-support/seven-stage-fixture.ts`
- `apps/server/src/projects/seven-stage.characterization.integration.spec.ts`

执行顺序：

1. 先写最小 fixture：每个测试独立临时 workspace，公开 Service 为操作入口，fake 图片 provider 为唯一外部替身。
2. 先完成“创建项目 → 默认章节 → 仅剧本激活”的 red → green。
3. 再完成“剧本完成 → 结构确认 → 分镜待确认/确认”的 red → green。
4. 再完成“preflight blocked/ready → 候选任务门禁 → 全镜定稿 → images_done”的 red → green。
5. 最后完成排版/素材包前置门禁与项目重开语义；不得断言当前错误成功产物。

**测试设计约束：**

- 断言公开 DTO、业务状态、错误码与必要落盘事实。
- 不直接调用被测对象私有方法，不断言内部调用次数。
- fixture 可以直接准备难以从当前公开 API 到达的前置事实，但业务动作必须走公开 Service。
- 每个用例独立清理，失败也不得残留临时目录。

**退出标准：** 新 Service 用例单独通过，server 全量 Vitest 通过，未改生产行为。

**状态：** 已完成。8 条 Service characterization、server 72/72 与 shared 15/15 均通过。

### 阶段 2：Playwright 进程与环境安全骨架

负责人：子代理 2。

文件所有权：

- 根 `playwright.config.ts`
- 根 `package.json` 与 `pnpm-lock.yaml` 中仅 Playwright/测试命令相关变更
- 根 `.gitignore` 中仅 E2E 产物规则
- `tests/e2e/setup/**`
- `tests/e2e/support/e2e-env.ts`
- `tests/e2e/support/fake-provider-server.mjs`
- `tests/e2e/support/start-e2e-server.mjs`
- `tests/e2e/tsconfig.json`

实施要求：

1. 每次运行生成唯一 `AIROAMING_E2E_RUN_ID`、独立 server/web/provider 端口和临时根目录。
2. 临时根目录名包含 `airoaming-e2e-<runId>`，并写入内容匹配的 `.airoaming-e2e-root` 标记。
3. 启动前拒绝仓库默认 workspace、仓库根、用户 home 和文件系统根。
4. 清理前再次校验绝对路径、命名和 marker 内容；任一不匹配时拒绝删除。
5. 所有服务只绑定 loopback；`reuseExistingServer = false`；首版 `workers = 1`。
6. 后端显式 `OPENCODE_AUTO_START=false`，供应商地址只指向 loopback fake provider，测试数据不得含真实 key。
7. setup/teardown 必须即使中途失败也回收子进程，并把 PID/端口/runId 写入仅限当前 run 的状态文件。

**退出标准：** `typecheck:e2e` 通过；空 spec/最小 smoke 可启动并退出；安全守卫具有自动化验证；无残留进程和临时目录。

**状态：** 已完成。环境契约 15/15、prepare 契约 3/3、Chromium 基础设施 1/1 均通过。

### 阶段 3：第一次总控审查与定向返工

负责人：主代理。

审查清单：

- 对照 G0 用例矩阵逐条检查覆盖，排除未来行为误入。
- 检查 fake 是否只位于外部边界，是否绕过了被测业务。
- 人工制造一次启动失败，验证 teardown 能回收进程。
- 人工给清理函数传入危险路径，验证其拒绝删除。
- 运行两个子任务的定向命令和 server 全量测试。
- 发现问题时只退回相应子代理修正；修正后重复本阶段，直到通过。

**退出标准：** 两个基础模块均经主代理静态审查和运行审查通过。

**状态：** 已完成两轮审查。主代理发现 `test:e2e:prepare` 预构建 shared 的 P0 后退回 Worker A；返工后以 shared source alias 和 prepare 契约消除该写入路径。ENV-07 另以 run `g0-74023-mrfyk3g3-6aff4225` 完成真实故障证据演练：预期 exit 1、teardown 成功，临时失败 spec 已删除。

### 阶段 4：Playwright API 与 Chromium 用户路径

负责人：子代理 3。该代理只在阶段 2 接口稳定并经阶段 3 审查后开始。

文件所有权：

- `tests/e2e/api/workflow-api.smoke.spec.ts`
- `tests/e2e/web/project-library-and-stage-rail.spec.ts`
- `tests/e2e/support/e2e-fixture.ts`（只封装稳定公开测试动作，不复制业务逻辑）

API smoke 最小链路：

1. `/api/health` 与 `/api/workspace` 返回成功信封。
2. 创建项目、列表可见、读取 workbench。
3. 断言默认章节和当前只激活剧本步骤。
4. 删除项目后列表不可见，且只影响本次临时 workspace。

Chromium 最小链路：

1. setup 通过公开 API 显式传 `vertical_scroll` 创建 `rain_smoke`，避免锁住 G3 尚未完成的创建弹窗形态。
2. 打开 `/projects`，看到项目库和 `rain_smoke` 项目卡。
3. 点击项目卡进入 `/projects/{id}/script`，看到项目工作区和七阶段导航。
4. 未完成前置步骤时后六个阶段按钮保持不可进入；点击后 URL 和工作区不变。
5. 点击返回项目列表，项目仍存在；使用 role、label、可见文本和 URL 等用户可感知锚点，不绑定 class 名。

**退出标准：** API 与 Chromium spec 各自通过；失败时生成 screenshot/trace；不依赖真实外部服务。

**状态：** 已完成。API-01～API-04、UI-01～UI-05 与基础设施 spec 共 3/3 通过。

### 阶段 5：第二次总控审查与定向返工

负责人：主代理。

审查清单：

- 逐个查看 Playwright spec，确认测试的是公开用户路径而非实现细节。
- 验证 API 测试和 UI 测试数据隔离；验证刷新/重开不是偶然共享内存。
- 检查 UI 测试没有经过当前创建弹窗，避免把 G3 尚未实现的“漫画版式”交互误写为当前绿色行为。
- 检查 stage rail 只锁正确门禁，不锁临时布局/素材包成功行为。
- 发现问题时退回子代理 3 修正并重新运行。

**退出标准：** E2E spec 经静态与运行双重审查通过。

**状态：** 已完成。API 清理隔离、UI HTTP/WebSocket 网络守卫和未来行为边界均经主代理复核。

### 阶段 6：整体验证与稳定性复跑

负责人：主代理。

必须执行：

1. `corepack pnpm typecheck`
2. `corepack pnpm typecheck:e2e`
3. `corepack pnpm test`
4. `corepack pnpm test:e2e`
5. `corepack pnpm test:all`
6. 将完整 E2E 连续运行 3 次，检查随机性、端口、临时目录和进程泄漏。
7. 人工检查一次 Chromium 路径的截图/trace 或可见页面。

**退出标准：** 所有命令通过；连续 3 次无 flaky；最终修复相对验收基线无真实 workspace/settings 变化；无残留服务进程。审查事故单独留痕，不以最终基线结论覆盖。

**状态：** 已完成。最终修复后三次独立 `test:e2e`、一次 `repeat-each=3` 的 9/9、`test:all`、静态复核与 Runtime/User Review 均通过；“无变化”结论仅相对 P0 事故后的最终基线成立，事故本身见 `findings.md`。

### 阶段 7：留痕、复核与提交

负责人：主代理。

- [x] 更新 `progress.md`、`findings.md` 与 `handoff.md`。
- [x] 更新 `文档/06_测试与验收/自动化测试体系.md` 中“已实现”状态、命令与证据。
- [ ] 更新会话记忆（由主代理最终收口）。
- [x] 将长期有效的测试约定合并进 `文档/记忆/MEMORY.md`。
- [x] Scrutiny Review：核对范围、契约、测试与文件差异。
- [x] Runtime/User Review：核对真实 Chromium 用户路径、隔离和清理。
- [ ] 主代理检查最终 diff 后提交当前分支。

**退出标准：** G0 实施结果可由下一位开发者复现，文档不把未完成的 G1–G5 写成已实现。

## 4. 子代理协作与返工规则

1. 最多使用 3 个子代理，按上述三个互不重叠的文件所有权执行。
2. 子代理不得自行扩大到业务功能开发；发现现有行为不符合文档时，先报告，不擅自修生产代码。
3. 主代理对每个交付执行 diff 审查、定向测试和边界核对。
4. 任一问题必须发回原负责人修正；修正后重新审查，不以口头说明替代验证。
5. 只有三个交付均通过主代理审查，才进入整体验证和提交。

## 5. 强制验收标准

- Service、HTTP、Chromium 三层都至少存在一条真实垂直链路。
- 测试只写临时 workspace，且安全守卫能拒绝危险路径。
- 默认测试不会启动 OpenCode 或访问公网，不需要任何真实 key。
- 当前 7 阶段框架和“用户确认后推进”语义被锁住，但当前已知错误成功路径未被绿测。
- E2E 可重复运行 3 次，不复用服务，无残留进程、端口和临时目录。
- 全仓类型检查、Vitest、Playwright 与聚合命令全部通过。
- 文档、证据、Handoff 和提交完整。

## 6. 风险与处理

| 风险 | 处理 |
| --- | --- |
| Playwright 浏览器未安装或本机依赖缺失 | 使用项目固定版本安装 Chromium；把安装命令写入测试文档，不把浏览器缓存提交 Git |
| Vite 固定代理指向 4310 | E2E 通过 `VITE_API_BASE_URL` 显式指向独立 server，避免修改开发默认值 |
| 后端启动会探测 OpenCode | 强制 `OPENCODE_AUTO_START=false`，测试不触发文本生成；涉及供应商的 Service 测试只替换外部 provider |
| 现有文件态跨进程恢复不完整 | G0 只锁当前正确重开语义；G1 的持久化迁移证据继续归 `migration_witness` |
| UI 文案或结构变化导致脆弱测试 | 优先 role/label/URL 与用户可见状态，必要时才新增稳定 `data-testid`，并说明它是测试契约 |
| 并行修改冲突 | 文件所有权分离；子代理 3 在骨架接口审查后才开始 |

## 7. 2026-07-11 停机续作调整

### 7.1 现场结论

- 阶段 1 的 8 条 Service characterization 已通过，不重新实现，只纳入最终回归。
- 阶段 2/3 的安全骨架主体已存在，但当前默认 Node 22.17.1 无法直接加载 E2E `.ts` 文件；必须重新打开并修复可复现运行契约。
- 阶段 4 的 API-01～API-04、UI-01～UI-05 文件已经存在；按“审计现有实现、最小修正、主代理复核”推进，不从零覆盖。
- 阶段 5–7 尚未形成正式通过结论；Handoff、完成记录和提交均不存在。

### 7.2 续作文件所有权

Worker A 只负责 E2E runtime 与命令契约：

- `package.json`
- `pnpm-lock.yaml`
- `playwright.config.ts`
- `.gitignore`（仅必要的 E2E 产物规则）
- `tests/e2e/setup/**`
- `tests/e2e/support/e2e-env.ts`
- `tests/e2e/support/e2e-env.test.ts`
- `tests/e2e/support/e2e-process-lifecycle.test.ts`
- `tests/e2e/support/fake-provider-server.mjs`
- `tests/e2e/support/fake-provider-server.test.ts`
- `tests/e2e/support/start-e2e-server.mjs`
- `tests/e2e/support/start-e2e-server.test.ts`
- `tests/e2e/support/harness-lifecycle.spec.ts`
- `tests/e2e/tsconfig.json`

Worker B 只负责 API/UI 行为测试：

- `tests/e2e/api/workflow-api.smoke.spec.ts`
- `tests/e2e/web/project-library-and-stage-rail.spec.ts`
- `tests/e2e/support/e2e-fixture.ts`

主代理在两份交付后执行静态审查和定向复跑；任何问题退回原 Worker，不由主代理代写责任文件。代码稳定后，Worker C 再负责阶段 7 正式文档和 Handoff，避免文档提前宣称通过。

### 7.3 续作门禁

1. 当前默认 Node 22.17.1 下，正式仓库命令必须可加载并运行 E2E TypeScript；不得依赖未声明的 Node 补丁版本行为。
2. `test:all` 必须确实包含环境安全自测，不能只因直接运行 `test:e2e` 的 lifecycle hook 才偶然覆盖。
3. 重复运行命令必须被输出证明真实执行 3 倍用例；不能把 `--` 误当位置参数后仍只跑一遍。
4. API/UI 测试必须只覆盖矩阵 `green_now`，不得经过当前创建弹窗或锁定 G3–G6 目标行为。
5. 所有 E2E 进程只允许 loopback；测试结束后 runtime、临时 workspace 和本次服务进程必须收敛。
6. 阶段 5–7、最终 Scrutiny Review、Runtime/User Review、文档同步和提交全部完成前，G0 不得标记完成，也不得进入 G1。

## 8. 最终实施状态

截至 2026-07-11，阶段 0～6 已完成；阶段 7 的正式文档、Handoff、Scrutiny Review 和 Runtime/User Review 已完成。剩余动作只有主代理更新会话记忆、复核最终文档 diff 并提交当前分支。

G0 的实现边界保持不变：只覆盖 Service characterization、API-01～API-04、UI-01～UI-05 和 E2E 基础设施。UI-06、G1～G5 目标行为及 G6/G7 后置行为均未实现。`migration_witness` 仍是 G0 临时适配器，G1 必须先以真实迁移和生产 DB-only 链路提供语义等价测试，再删除或替换该 witness。
