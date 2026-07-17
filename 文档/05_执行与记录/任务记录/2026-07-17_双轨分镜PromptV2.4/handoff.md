---
doc_id: AIR-TASK-20260717-DUAL-STORYBOARD-PROMPT-V24-HANDOFF
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、evidence/metrics.json、evidence/semantic-summary.json
---

# V2.4 Handoff

## 交付结果

- 完成 V2.4a、V2.4b 两轮 Prompt 实验和两条真实路线 A/B。
- 完成 V2.4b 两路各两次 Beat 语义评测。
- 按预设回滚门槛判定不采用，并将生产 Prompt 与契约测试恢复到 V2.3。
- 保留既有独立语义 evaluator，不接生产硬门、自动修复或数据库。

## 当前生产事实

- 生产版本：V2.3。
- 公开入口、页面字段、`Shot[]`、Schema、DTO、数据库和用户确认流程：不变。
- V2.4 生产代码差异：0。
- 真实测试项目：只存在隔离运行根的待确认 V2.4 样本，不影响用户主项目。

## 验证

- Server：116 files / 702 tests passed。
- `typecheck`：passed。
- `build`：passed。
- `git diff --check`：passed。
- V2.4b 运行态：两个 pending Storyboard、正式指针为空、11 个媒体任务全部 queued。

## 后续建议

下一轮不要直接复活“逐项事实账本”。先扩充不同题材、不同 Beat 密度的固定样例，再比较两种低风险方向：

1. 仅在独立 QA 报告中提示稳定缺失事实，由用户决定是否调整；
2. 只对稳定缺失类型增加低权重媒介提示，不要求逐事实映射和逐项反查。

任何新实验仍须以 V2.3 为对照，并同时限制镜头数、总时长和语义收益。
