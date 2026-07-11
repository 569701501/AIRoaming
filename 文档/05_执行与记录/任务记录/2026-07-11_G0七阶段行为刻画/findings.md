---
doc_id: AIR-TASK-20260711-G0-CHARACTERIZATION-FINDINGS
status: complete
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、现有代码、测试与官方工具文档
---

# G0 七阶段行为刻画与 E2E 测试骨架发现

## 已确认事实

- 根 `test` 脚本目前只聚合 shared/server Vitest；Web 没有测试脚本、组件测试依赖或浏览器 E2E 依赖。
- Server Vitest 使用 `src/**/*.spec.ts`、文件隔离和 ESM/TypeScript 原生编译；现有测试共 79 项。
- 现有候选图契约集成测试已证明可用 Nest application context、临时 `AIROAMING_WORKSPACE_ROOT`、真实文件系统和 fake 图片 provider 完成确定性测试。
- Server 端口可由 `PORT` 设置；Web 开发端口和代理目标目前硬编码为 5173/4310，尚不能为并行 E2E 动态隔离。
- Web API 已支持 `VITE_API_BASE_URL`，可作为 E2E 直连临时 Server 的公开配置入口。
- `AppShell` 打开项目后会异步请求 `/api/ai-runtime/models`；`OpenCodeRuntimeService` 默认允许 auto-start，因此不隔离时测试会接触本机 OpenCode 状态。
- `OPENCODE_BASE_URL/OPENCODE_AUTO_START` 和图片 provider base URL/key 都可以由环境控制；临时 workspace 同时隔离 app settings。
- Server 原生支持 `PORT`，Web 可由 Vite CLI 覆盖端口并用 `VITE_API_BASE_URL` 直连 Server，因此 G0 不需要修改业务组件或增加 E2E 专用业务 API。
- Controller 使用统一 success envelope；首版 HTTP smoke 可直接使用 Playwright `request`，无需再引入 `@nestjs/testing`/`supertest`。
- 当前排版与素材包的成功行为已经确认是待删除语义，G0 只能测前置门禁和 workflow 投影。

## 官方资料结论

- Playwright `webServer` 可启动多个本地服务、分别设置 env/URL/关闭信号，适合 fake provider + Nest + Vite。
- Playwright fixtures 隔离 page/context/request；project dependencies 适合 API setup/teardown 并在报告中留痕。
- Playwright trace 可查看 DOM snapshot、网络和时间线；官方建议失败/首次重试时保留，而不是所有成功用例全量开启。
- Vitest Browser 适合浏览器内组件测试，且仍建议使用 Playwright provider；当前完整应用 E2E 直接用独立 Playwright 更简单。
- 来源：
  - https://playwright.dev/docs/test-webserver
  - https://playwright.dev/docs/test-fixtures
  - https://playwright.dev/docs/test-global-setup-teardown
  - https://playwright.dev/docs/best-practices
  - https://vitest.dev/guide/browser/

## 风险

- 若 E2E 启动默认 AppModule，会自动启动或连接 OpenCode，并可能读取本机图片 provider 设置。
- 若未强制临时 workspace，自动化会污染用户真实项目。
- 若把当前“一镜一页”“目录素材包”写成绿色契约，会阻碍 G5/G6 正确改造。
- 若一次写完全部未来失败测试，默认 CI 会长期红或被迫大量 skip，违背垂直切片 TDD。

## 技术结论

- 测试栈为 Vitest 纯函数/Service + Playwright API smoke/Chromium；不在 G0 搭 Vue 组件测试。
- fixture 通过公开 Service/API 建立；Service adapter 可 fake，浏览器 E2E 使用 loopback fake provider，不在生产业务逻辑增加测试分支。
- G0 用例分为 `green_now/migration_witness/record_only/red_on_slice`；未来失败用例到所属切片再写 red。
- 首版 Playwright workers=1、`reuseExistingServer=false`；每次运行使用独立 runId、端口和带 marker 的临时 workspace。
- G0 的可信业务 tracer 到 `images_done`；排版/素材包只锁前置门禁和七阶段显示，正式成功路径分别由 G5/G6 定义。

## Scrutiny Review

- **通过：** 方案与现有代码、ADR-0009/0010/0011/0012、七阶段完整验收基线一致。
- **通过：** 没有把缺失的 D1、freshness、D3、持久任务、渲染或 ZIP 写成当前已完成。
- **通过：** 没有断言当前一镜一页、复制源图、目录包或静默缺文件是正确行为。
- **待运行复核：** Playwright 安装、fake provider、临时 workspace 守卫、连续三次运行和 trace 演练须在整套文档完成并获得开发授权后的 G0 实现中执行。
