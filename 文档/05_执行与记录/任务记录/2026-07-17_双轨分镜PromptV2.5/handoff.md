---
doc_id: AIR-TASK-20260717-DUAL-STORYBOARD-PROMPT-V25-HANDOFF
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、ab-review.md、双 Review
---

# V2.5 Handoff

## 交付结果

- 完成低权重定向风险扫描的显式实验变体。
- 新增 3 个真实章节文本样本和可重复 V2.3/V2.5 A/B CLI。
- 完成 6 次真实分镜生成、12 次重复语义评测和固定 corpus 5 次回归。
- 按预设门槛判定拒绝，不接入生产默认 Prompt。

## 当前生产事实

- 生产默认版本：V2.3。
- V2.5 只能由 QA 工具显式传入 `v2_5_experiment`，生产服务不传该参数。
- 页面、业务数据结构、数据库、确认流程和媒体链路：不变。

## QA 使用方式

```bash
pnpm --filter @airoaming/server storyboard:prompt:ab -- \
  --fixture ../../tests/fixtures/storyboard-prompt/v25-cases.json \
  --output /absolute/path/to/report.json \
  --evaluation-repeat 2 \
  --provider self \
  --model gpt-5.5
```

只检查夹具和 Prompt 时增加 `--dry-run`；定向样本使用 `--case <caseId>`。命令在结论为不采用时返回非零状态，这是 QA 决策信号，不代表生成失败。

## 后续建议

不要继续迭代 V2.5c 或把更多 evaluator 发现堆回生成 Prompt。下一阶段优先把现有独立语义报告变成可供人工复核的低风险 QA 说明；仍不建议自动补镜、自动修复或生产硬阻断。
