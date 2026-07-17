---
doc_id: AIR-TASK-20260717-DUAL-STORYBOARD-PROMPT-V25-PROGRESS
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# 漫画 / 漫剧双轨分镜 Prompt V2.5 进度

## 2026-07-17：V25-0

- 已读取 `$deep-think`、文档入口与留痕规则、V2.4 Handoff/真实 A/B、固定语义样例集和当前生产 Prompt/服务接线。
- 工作树初始干净，生产基线为 V2.3，最新提交为 `bbfa053`。
- 冻结 V2.5 只做默认关闭的实验变体：不改页面、Schema、数据库、确认流程，不调用媒体服务。
- 冻结三类定向风险与镜头/时长/对白负载采用门槛。

## 2026-07-17：V25-1～V25-3

- 先增加 V2.5 Prompt 契约测试；V2.3 基线按预期 1 项失败，实施显式 `v2_5_experiment` 变体后 16/16 通过。
- 新增 3 个结构化新文本样本，分别覆盖声音触发、屏幕身份和行动结果；正式 Markdown 可解析，对白候选数为 1/1/2。
- 新增 QA-only `storyboard:prompt:ab`：同样本串行生成 V2.3/V2.5、共用严格解析与质量门、每份结果重复语义评测、自动计算镜头/时长/对白负载和采用门槛。
- dry-run、类型检查和 Prompt 隔离检查通过；生产 `StoryboardDialogueService` 未传实验变体，默认仍为 V2.3。

## 2026-07-17：V25-4

- 使用 `self/gpt-5.5` 完成 3 个样本 × 2 个变体，共 6 次分镜生成；全部首次通过，无修复。
- 完成 12 次语义 evaluator；全部首次通过。
- 三个样本的目标维度在 V2.3 已全部为 2/2 `covered`，V2.5 改善样本为 0。
- 屏幕身份样本 V2.5 从 4 镜增到 6 镜，超过 5 镜上限；声音样本抽象兄妹关系 outcome 从 `covered` 退为 `partial`。
- 固定 corpus 复测 5/5 成功，人工预期一致 27/28；唯一差异仍为已知屏幕身份边缘判断。

## 2026-07-17：V25-5～V25-6

- 按冻结门槛判定 `rejected_not_wired_to_production`；生产继续使用 V2.3。
- 保留显式实验变体、3 个新文本样本和 A/B 工具，作为可复现拒绝证据与未来 QA 基础；不接页面、数据库、确认流程或媒体服务。
- 完成方案同步、双 Review、Handoff、功能完成记录、会话与长期记忆。
