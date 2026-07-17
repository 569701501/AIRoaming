---
doc_id: AIR-TASK-20260717-STORYBOARD-BEAT-SEMANTIC-EVAL-HANDOFF
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、实现与真实重复评测
---

# 分镜 Beat 语义评测 Handoff

## 已交付

- 纯函数 Prompt builder，把 Beat `summary/outcome` 与同 Beat 可观察镜头证据组合为收敛输入。
- 严格报告 parser，拒绝额外字段、漏/乱序 Beat、非法状态和跨 Beat 镜头证据。
- 本地 `pass / warning / fail` 派生，不接受模型自报总状态。
- QA CLI，支持 dry-run 和真实 deny-all OpenCode 文本模型运行，结果只写指定文件。
- AI 创作和导入样本各两次真实 `self/gpt-5.5` 报告。

## 使用边界

该 CLI 是 P6 测试工具，不是公开 Skill 或用户工作流。它不能保存/修改 Storyboard、触发一次修复、自动确认或阻断正式生产。用户看到的页面和已有确认流程没有变化。

## 运行方式

```text
pnpm --filter @airoaming/server storyboard:semantic:evaluate -- \
  --structure <story-structure.json> \
  --storyboard <storyboard.json> \
  --output <report.json> \
  --provider self \
  --model gpt-5.5
```

添加 `--dry-run` 时只写评测 Prompt，不启动模型运行时。

## 解释报告

- `covered`：观众能直接从画面或声音得到核心事实。
- `partial`：方向存在，但关键触发、对象、因果、决定性动作或结果被弱化。
- `missing`：镜头没有足够证据。
- `contradicted`：镜头明确表达相反事件或结果。

建议对重要 A/B 至少重复两次，先看稳定交集，再人工核对边缘项。

## 后续边界

如果继续做 V2.4，应另建任务，用多题材固定样例比较旧 Prompt 与候选 Prompt；不能用本轮单个样本的 warning 直接改生产硬门。
