---
doc_id: AIR-TASK-20260717-DUAL-STORYBOARD-PROMPT-V22-HANDOFF
status: complete
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、真实 A/B 与双复核
---

# 漫画 / 漫剧双轨分镜 Prompt V2.2 Handoff

## 已完成

- 冻结进入状态、唯一聚焦变化、退出状态、停镜点、五类新转换和 10 秒软复核规则。
- 使用测试先行验证 V2.1 缺失新契约，再完成生成/调整/修复 Prompt 实验实现。
- 定向测试 15/15、相关回归 28/28、server typecheck 和 build 均通过。
- 使用相同两项目、相同版本、相同模型和相同触发文本完成 V2.1/V2.2 真实 A/B。
- 保存页面截图、机器指标、静态复核和运行路径复核。
- 根据真实退化回滚实验 Prompt，当前代码仍为 V2.1。

## 正式结论

`MIXED / V22_STATE_BOUNDARY_BETTER_DIALOGUE_LOAD_REGRESSED`

V2.2 将 AI 样本 `>10s` 镜头从 5 个降为 1 个，后半段状态边界明显清楚；但最大单镜对白从 3 条升到 9 条，11 个镜头超过 3 条，并出现 2 条完整原文不命中的台词。该版本不采用。

## 当前运行环境

- API：`http://127.0.0.1:4338`
- Web：`http://127.0.0.1:5198`
- Runtime：`/Users/liyadong/.codex/runtime/airoaming-storyboard-ab-20260716-2247/v22`
- 页面保留在两个待确认分镜工作台，供用户查看；不要点击确认。

## 后续唯一建议

下一次先设计 V2.3 的内部编排顺序：

1. 从可见正式正文中列出允许使用的逐字对白候选。
2. 按 beat 选择必要对白，并先分配到最多两个对白段。
3. 再以每个对白段的进入/变化/退出状态定义 motion。
4. 最后验证新增共享 Shot 的 comic 是否有独立静态价值。

仍不需要改页面、Schema 或确认流程；若完整正文逐字忠实要成为硬门，则必须另行改进正文上下文组装，不能只靠 Prompt 宣称。
