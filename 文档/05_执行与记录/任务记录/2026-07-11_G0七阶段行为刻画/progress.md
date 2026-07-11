---
doc_id: AIR-TASK-20260711-G0-CHARACTERIZATION-PROGRESS
status: complete
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# G0 七阶段行为刻画与 E2E 测试骨架推进记录

## 2026-07-11

- 用户确认继续进入 G0。
- 本轮使用 `$deep-think` 管理跨前后端测试规划和正式留痕，使用 `tdd` 约束按公开行为、垂直切片、一次一个 red → green 推进。
- 已明确本轮只写开发级方案与行为矩阵，不实现测试、不安装依赖、不修改业务代码或真实 workspace。
- 已建立 G0 独立任务记录。
- 已复核根/shared/server/web package scripts、Vitest 配置、Nest/ Vite 启动、`PORT`、`AIROAMING_WORKSPACE_ROOT` 和 `VITE_API_BASE_URL`。
- 已确认打开项目会请求模型列表；若不隔离可能等待或启动本机 OpenCode，因此 E2E 强制使用 loopback fake OpenCode 和 `OPENCODE_AUTO_START=false`。
- 已确认现有候选契约测试可复用 Nest application context、临时 workspace、真实文件系统和 fake 图片 adapter。
- 通过 Playwright/Vitest 官方资料完成选型：保留 Vitest，新增独立 Playwright 管理 API smoke、Chromium、多个本地服务、fixture 和 trace。
- 已新增 `文档/04_方案与决策/2026-07-11_G0七阶段行为刻画与E2E测试骨架方案.md`。
- 已新增 `文档/06_测试与验收/G0七阶段行为用例矩阵.md`。
- 已同步 README、AI 上下文、自动化测试体系、验收策略、七阶段上位方案/基线、会话记忆和长期记忆。

## 验证记录

- 本轮只改文档，没有安装 Playwright、创建测试或修改 `apps/`、`packages/`、`workspace/`。
- 官方资料：Playwright webServer/fixtures/setup-teardown/best-practices；Vitest Browser Mode。
- `corepack pnpm test`：shared 15 + server 64 = 79 项通过。
- `corepack pnpm -w typecheck`：shared/server/web 三包通过。
- `git diff --check`：通过。
- frontmatter `doc_id` 重复检查、Markdown fence 配对和新增关联文档路径检查：通过。
- `git diff --name-only -- apps packages workspace`：空，本轮没有业务代码、测试、schema 或真实 workspace 改动。

## Scrutiny Review

**结论：G0 规划任务与静态复核已完成；用户随后要求继续 G1，按逐阶段确认口径，正式方案为 accepted。功能仍未实现。**

- 方案没有重新设计 workflow，也没有把 D2 自动调度、D6、R5 或 Prompt 大功能混入 G0。
- 当前正确行为、D7 迁移 witness、已知错误和未来 red 测试已分为四类，不会把错误现状固化。
- D1 缺省行为不进入 G0 契约；G0 只用显式 `vertical_scroll` 建测试项目，避免与 G3 冲突。
- 排版/素材包只测试前置门禁，不测试当前错误成功产物。
- E2E 明确拒绝真实 workspace、真实 key、真实 provider 和现有开发服务；首版串行，多进程通过 runId/端口显式隔离。
- 测试文件、命令、证据、退出标准和 G0-1 至 G0-6 垂直切片均已明确。

### 残留风险

- 尚未实际安装浏览器、启动 fake provider 或验证 trace；这些属于整套文档完成并获得开发授权后的 G0 实现。
- server wrapper 的跨平台关闭行为首版以当前 macOS 为准，未来 Windows 运行需复核 Playwright graceful shutdown 差异。
- G1 完成后必须用 DB 等价测试接替 `migration_witness`，不能直接删除旧迁移证据。

## Handoff

### 完成

- G0 开发级方案、行为矩阵、工具选型、环境隔离和静态复核。

### 未完成

- 未来获得开发授权后的测试实现与 Runtime/User Review。G6/G7 已后置，不影响 G0 规划完成。
