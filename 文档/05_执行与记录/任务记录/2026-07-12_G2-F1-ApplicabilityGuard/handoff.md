---
doc_id: AIR-G2-F1-HANDOFF-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-F1 交接记录
---

# G2-F1 Handoff

未来 persistent worker 在 apply 前调用：

```text
TaskApplicabilityGuardService.evaluate(scope, operation, source/target snapshot)
  -> current: 允许调用领域 repository
  -> historical: 不得改 current，只记录迟到结果证据
```

F1 没有实现 worker、claimToken fencing、TaskAttempt、history 或 capability switch；这些仍是后续任务 runtime。
