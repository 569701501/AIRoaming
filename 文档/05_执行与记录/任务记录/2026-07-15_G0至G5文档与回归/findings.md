---
doc_id: AIR-TASK-20260715-G0-G5-DOC-REGRESSION-FINDINGS
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 仓库、文档与测试入口探索
---

# 探索发现

## F-01：正式终态与旧文档状态不完全一致

- 正式完成记录与总路线图已声明 `G0_G5_COMPLETE`。
- 部分产品/UI/自动化测试文档仍保留实施前的 `partial`、`needs_update`、旧测试数量或“待执行”描述。
- 处理原则：以代码、当前测试、完成记录和阶段验收证据交叉确认后修正；可选增强项不冒充 G0～G5 阻塞项。

## F-02：本轮边界

- G6 素材包、真实 ZIP、下载与 G7 总验收延期。
- 轻量视频整条链路延期。
- backup/archive 保留；migration 只向前，不执行 down migration；DB-only 不回退。

## F-03：工作区保护

- 工作区已有多份历史任务文档和截图修改，归属用户既有工作。
- 本轮仅修改任务记录和经证据确认需要同步的正式文档，不清理、不覆盖无关变更。

## F-04：G0～G5 新鲜回归结论

- G0～G5 定向门禁、file/DB-only Chromium、render、migration、typecheck、build 与 Prisma validate 均通过。
- Shared 全量 115/115；Server 单 worker 全量 568/568。
- 所有本轮启动的 Playwright run 均完成 teardown；没有删除 backup/archive，没有执行 down migration，也没有触碰真实 provider 或真实业务数据。

## 风险

- `R-01 测试时序`：默认并发 Server 全量有两条 backup/restore 用例在固定 5 秒边界超时；隔离复跑与单 worker 全量均通过。这是测试稳定性债，不是 G0～G5 功能失败。
- `R-02 流关闭日志`：G5 E2E 结束阶段出现一次 `ERR_STREAM_PREMATURE_CLOSE`，但下载/Artifact 断言和 teardown 通过。后续若频繁出现，应单独诊断流关闭路径。
- `R-03 前端包体`：生产 build 提示 `AppShell` chunk 约 985.28 kB，属于加载性能优化项，不阻断本轮验收。
- `R-04 延期范围`：G6 素材包 V2/ZIP、G7 和轻量视频没有实现或测试，不能从本轮通过结论外推为已完成。
