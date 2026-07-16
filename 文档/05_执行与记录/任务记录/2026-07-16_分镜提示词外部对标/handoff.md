---
doc_id: AIR-TASK-20260716-STORYBOARD-PROMPT-BENCHMARK-HANDOFF
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md、findings.md、正式适配方案
---

# Handoff

## 已完成

- 复核当前 `storyboard-shot-generate`、严格输出契约、固定质量门、一次修复和 S3 真实模型证据。
- 对标开源漫画/分镜项目、商业分镜产品和 Prompt 评测方法。
- 完成正式方案：`文档/04_方案与决策/2026-07-16_分镜提示词外部对标与V2适配方案.md`。
- 明确 V2 不新增字段、页面、公开 Skill 或确认节点。

## 核心决策建议

保留当前事实源、引用、版本、comic/motion、pending/confirm 和质量门骨架；新增内部 beat 覆盖计划、复杂度镜头预算、镜头用途、连续性账本、comic→motion 投影和删除检查。

## 未执行

- 未修改生产 Prompt。
- 未修改后端质量门、Schema、页面或数据库。
- 未调用真实模型做 V1/V2 A/B；V2 尚未进入生产实现。

## 下一入口

用户确认后，从 `apps/server/src/dialogue/dialogue-prompt.util.ts` 的 `buildStoryboardPrompt` 开始，只做 Prompt/修复/测试垂直切片，并以现有 AI 创作和 import 两个真实样例作为回归基线。
