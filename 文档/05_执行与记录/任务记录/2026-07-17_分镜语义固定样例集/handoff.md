---
doc_id: AIR-TASK-20260717-STORYBOARD-SEMANTIC-CORPUS-HANDOFF
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md, evidence_review.md, 双 Review
---

# 分镜语义固定样例集 Handoff

## 已完成

- 新增 5 个固定样例、14 个 Beat、28 个人工预期维度。
- 新增严格加载、关系校验、逐维度预期比较和重复稳定汇总。
- 新增 QA-only 批量 CLI，支持 dry-run、重复、定向样例、串行模型执行、失败保留和原子落盘。
- 完成 `self/gpt-5.5` 全集两轮和动作样例定向两轮。
- 完成测试、类型、构建、Scrutiny Review、Runtime/User Review 和正式方案同步。

## 使用方式

```bash
pnpm --filter @airoaming/server storyboard:semantic:corpus -- \
  --corpus ../../tests/fixtures/storyboard-semantic/corpus.json \
  --output /absolute/path/to/report.json \
  --repeat 2 \
  --provider self \
  --model gpt-5.5
```

定向复跑增加：

```text
--fixture action-chase-reversal
```

不调用模型时增加：

```text
--dry-run
```

## 当前结论

固定 evaluator 在声音触发、屏幕身份、完整对白选择和动作结果上表现稳定；抽象关系状态仍有边缘判断波动。它适合重复诊断，不适合作为一次性生产硬门。

生产 Prompt 继续保持 V2.3。V2.4 保持拒绝和回滚状态。

## 下一步

若继续优化生成 Prompt，先设计“只针对稳定缺失类型的低权重提示”实验，并使用：

- V2.3 作为控制组；
- 新真实文本生成样本作为生产质量证据；
- 本固定 corpus 作为 evaluator 回归证据；
- 语义、Shot 数、总时长、对白负载和格式成功率共同判定。

固定 corpus 不能替代真实生成 A/B，也不能单独决定 Prompt 上线。
