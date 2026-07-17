---
doc_id: AIR-TASK-20260717-DUAL-STORYBOARD-PROMPT-V25-SCRUTINY
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、代码差异、model-ab.json
---

# V2.5 Scrutiny Review

## 结论

`passed_with_rejection`。实验实现、证据和拒绝判定符合预先冻结门槛；V2.5 不应进入生产默认 Prompt。

## 静态复核

- `StoryboardDialogueService` 仍以默认参数调用 `buildStoryboardPrompt`，默认变体是 `v2_3`。
- 契约测试明确验证默认 Prompt 不含 V2.5 标记，只有显式 `v2_5_experiment` 才注入定向扫描。
- V2.5 没有修改页面、`Shot[]`、Schema、DTO、数据库、确认流程、质量门或修复次数。
- A/B 工具只读取固定 fixture、调用文本模型并将报告原子写到调用方指定路径；没有项目持久化或媒体调用。

## 证据复核

- 3 个样本、2 个变体均成功；12 次 evaluator 成功，无失败样本被静默忽略。
- 改善样本为 0，屏幕身份镜头数超过上限，声音样本有非目标语义退化。
- `do_not_adopt` 与任务开始前门槛一致，不存在先看结果后改变标准。

## 残留风险

- 每个变体只生成一次，不能量化生成模型自身重复波动；但当前结果已经缺少任何收益且存在明确退化，不需要增加调用证明拒绝。
- 显式实验变体仍存在代码中，后续不得误接到生产服务；默认隔离测试必须保留。
