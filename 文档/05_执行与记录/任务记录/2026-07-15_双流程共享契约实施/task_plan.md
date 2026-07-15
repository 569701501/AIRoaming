---
doc_id: AIR-TASK-20260715-SCRIPT-CONTRACTS-PLAN
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer
source: 2026-07-15 创作与导入双流程设计 Handoff 的实施包 1
---

# 任务计划：双流程共享契约实施

## 目标

在 `packages/shared` 落地 AI 创作与已有剧本导入共用的严格输出契约、解析器、校验器和固定样例，使七个模型阶段的产物拥有确定性格式门，为后续动态 Prompt、来源状态和 pending 编排接线提供单一事实源。

## 非目标

- 本任务不修改生产动态 Prompt 或五个公开 Skill。
- 不修改数据库、DTO 持久化来源、pending 状态和正式化流程。
- 不修改页面内容字段或按钮。
- 不把旧兼容入口直接切换为严格拒绝，避免在后续 Prompt 尚未接线时破坏当前运行路径。

## 阶段

1. Orchestrator：读取事实源、现有格式与测试，冻结契约边界。
2. Worker A：实现灵感、大纲和章节 Markdown 严格契约。
3. Worker B：实现导入 analyze 与 fidelity JSON 严格契约。
4. Worker C：补七阶段正反 fixture、定向测试与共享全量测试。
5. Scrutiny Review：只读核对范围、兼容边界、测试和文档。
6. Runtime/User Review：本任务无页面接线；以共享包运行测试代替，真实用户路径留到实施包 5。

## 验收标准

1. 灵感输出必须恰好 3 个候选、字段完整、标签 2～5 个、标题不重复。
2. A3 大纲必须含四个固定区块、明确正整数章数、连续且等量的轻量章节卡。
3. 章节 Markdown 必须六区块唯一且顺序固定，必需字段完整、场景编号连续、禁止模板残留和下游产物。
4. B2 `import-analysis/1.0` 严格校验枚举、稳定来源引用、候选章范围与诊断结构。
5. B4 `import-fidelity/1.0` 严格校验枚举、引用结构和禁止的模型放行字段。
6. 七个模型 stage 均至少有一个正例和一个反例 fixture。
7. `packages/shared` 定向测试、全量测试与 typecheck 通过，`git diff --check` 通过。

## 退出标准

- 代码、测试、技术事实源和完成记录同步。
- Scrutiny Review 给出通过/不通过和残留风险。
- 说明为何本包不执行真实页面 Runtime Review，以及后续接线入口。

以上退出标准均已满足。Scrutiny Review=`passed`；Runtime/User Review=`not_applicable_by_scope`，原因是本包没有生产 Prompt 或页面接线，已用 Shared 全量测试、工作区 typecheck/build 和 fixture subpath 运行导入验证替代运行态证据。
