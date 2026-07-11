---
doc_id: AIR-TASK-20260711-G1-G5-IMPLEMENTATION-PROGRESS
status: in_progress
created: 2026-07-11
updated: 2026-07-11
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
- G1：`in_progress`（G1-0 已签收并通过独立全量门禁；下一步 G1-1 M0-A Schema）
- G2～G5：`pending`
