---
doc_id: AIR-TASK-20260715-SCRIPT-CONTRACTS-PROGRESS
status: active
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 进度

## 2026-07-15 Orchestrator

- 已读取项目入口、AI 上下文、留痕规则、长期记忆、双流程最终设计、核心数据模型、模块边界和 `$deep-think`。
- 已确认本阶段只实现 Shared 严格契约和 fixture，不修改生产 Prompt、数据库、页面或正式化流程。
- 已确认当前旧格式入口仍有 `includes()` 校验、保守包装和灵感截取行为；这些是后续接线差距，本阶段不静默改变运行时。

## 2026-07-15 Worker A：创作与统一章节契约

- 新增 `packages/shared/src/script-workflow-contract.ts`，实现 `creative.ideation`、`creative.outline`、`creative.chapter-draft`、`creative.chapter-edit` 和 `import.materialize` 的严格输出解析。
- 灵感候选固定恰好 3 个；大纲固定四区块和等量连续章节卡；章节 Markdown 固定单章、六区块、字段顺序、场景连续编号和 canonical serializer。
- Markdown 门禁拒绝代码围栏、前后说明、模板残留、系统状态字段和结构化下游产物；导入 materialize 额外固定“按本章确认原稿范围完整整理”。

## 2026-07-15 Worker B：导入 JSON 契约

- 实现 `import-analysis/1.0` 严格 parser：精确字段和枚举、观察性大纲、章节候选、SourceRange、边界证据、排除范围和 unresolved items。
- 支持调用方注入稳定 source block catalog，校验引用存在、range 顺序、候选连续、边界锚点在章内、无重叠和无未解释缺口。
- 实现 `import-fidelity/1.0` 严格 parser：SourceCoverage、输出行范围和六类 finding；拒绝 `verdict/readyForNextStage`，并防止把硬性遗漏藏进 `uncertainties`。
- 支持 source/output 引用上下文校验、完整覆盖、行范围顺序和 `importFidelityHasHardIssuesV1()` 后端判定辅助。

## 2026-07-15 Worker C：P6 fixture 与定向验证

- 新增 `packages/shared/src/script-workflow-test-fixtures.ts`，为七个模型 stage 各提供一组正例和反例，并通过独立 package subpath 暴露给后续 Server Prompt 回归测试。
- 新增 `script-workflow-contract.spec.ts`，当前 29 个定向测试全部通过。
- Shared 全量测试当前为 25 files / 143 tests 通过；新增最终边界用例后将重新执行最终全量结果。
- Shared typecheck、build 和 fixture subpath 运行导入通过。

## 2026-07-15 最终验证与复核

- `pnpm --filter @airoaming/shared test`：25 files / 144 tests 通过。
- `pnpm typecheck`：Shared、Server、Web 全部通过。
- `pnpm build`：Shared、Server、Web 全部通过；Web 仅保留既有的大 chunk warning。
- `node --input-type=module` 导入 `@airoaming/shared/script-workflow-test-fixtures` 并核对 7 个 stage：通过。
- `git diff --check`：通过。
- Scrutiny Review：`passed`。
- Runtime/User Review：`not_applicable_by_scope`；本包无生产 Prompt/Server/页面接线，真实用户路径留到后续实施包。
