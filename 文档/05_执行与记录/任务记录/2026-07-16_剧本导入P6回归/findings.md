---
doc_id: AIR-TASK-20260716-SCRIPT-IMPORT-P6-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 剧本导入 P6 回归代码探索
---

# 剧本导入 P6 回归发现

## 当前事实

- `ScriptImportAnalysisService` 已按稳定 block 做叶子分析和相邻递归合并，最终仍调用严格 parser 做全原稿覆盖校验。
- `ImportAnalysisOutputV1.chapterCandidates[].sourceRanges` 可包含多个范围，因此一个生产章节可以跨多个 `sourceRef`。
- 最终合并第一次格式错误只允许一次格式修复；第二次仍无效时 parser 会抛错。
- `ScriptImportWorkerService.initializeRecovery` 会把 `materializing/verifying` 记录为明确中断失败，并在尝试上限内重新领取。
- 现有 Worker 单测使用 mock；Repository 集成测试已具备真实 migration、临时 SQLite 和 Nest 应用上下文，可用于重启恢复集成证据。

## 风险与约束

- “关闭并重建 Nest 应用上下文”能证明进程内应用重启与数据库恢复语义，不能证明操作系统强杀期间的所有驱动行为。
- 本轮不应为了测试方便增加生产后门或测试专用 API。
- 多文件跨边界测试必须覆盖真实不同 `sourceRef`，只把一个文件切成多个 block 不算完成。

## 最终结论

- 严格分析契约原生支持一个章节使用多个相邻 `sourceRef` 范围，无需修改生产 parser 或 Prompt。
- 长稿最终合并已经是 fail-closed：唯一一次格式修复仍失败时异常直接上抛，没有不完整 fallback。
- 启动恢复只重新领取中断项，未领取项的状态与尝试次数不变。
- 本轮三个新增测试均先验证既有生产能力，因此没有为了让测试通过而改生产代码。

## Scrutiny Review

- 结论：passed。
- 变更范围只有两份测试、测试事实源和执行留痕。
- 契约一致性：未新增页面动作、数据库字段、状态或 Prompt 输出字段。
- 残留风险：当前恢复证据不是操作系统强杀，也不证明多实例 lease 安全；最终 JSON 的真实模型输出上限仍取决于所选模型。

## Runtime/User Review

- 结论：passed_non_ui_integration。
- 真实临时 SQLite、正式 migration、两个先后 Nest 应用上下文的恢复路径通过。
- 本轮无页面和 API 行为变化，浏览器重复验收不提供新增证据，因此不执行。
