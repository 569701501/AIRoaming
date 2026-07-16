---
doc_id: AIR-TASK-20260716-DUAL-STORYBOARD-PROMPT-V2-HANDOFF
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md、生产代码、测试与双 Review
---

# Handoff

## 已完成

- `buildStoryboardPrompt` 已按共享剧情事实、漫画分镜、漫剧分镜和双轨一致性边界分段编排。
- 漫画轨道独立处理静态决定性瞬间、构图、阅读动线、气泡留白、画格节奏和格间连续。
- 漫剧轨道独立处理开始/变化/结束状态、人物调度、运镜用途、内容时长、正式配音来源和尾首帧连续。
- `buildStoryboardRepairPrompt` 已同步双轨语义，不再把 motion 修回漫画附属说明。
- 现有 `comicFormat` 与 `artStyle` 已注入；页面、Schema、数据库、API、正式枚举和确认流程未变。
- 自动化固定了模块顺序、旧主从文案禁用、修复边界和两轨不同文案仍可通过质量门。

## 当前正式边界

- 两条轨道共享正式 beat、scene、characters、核心事件、因果结果、道具状态和对白来源。
- 两条轨道不要求共享决定性瞬间、画面文案、构图、阅读/时间节奏、人物表演或镜头运动。
- 当前 M1 仍共用 `Shot[]`、镜头数量、`shotType` 和 `cameraAngle`；本轮没有实现两套独立镜头序列。
- `promptDraft` 只供静态候选图使用，不是漫剧动态 Prompt。

## 验证

- 定向测试：3 files / 26 tests 通过。
- Server typecheck：通过。
- Server build：通过。
- Server 全量：114 files，683/684 在固定 5 秒内通过；既有备份恢复测试隔离使用 60 秒上限重跑 1/1 通过。
- `git diff --check`：通过。

## 下一入口

使用 AI 创作和已有剧本导入各一个隔离新项目，运行旧版/V2 同模型文本 A/B。重点比较双轨独立性、正式事实冲突、镜头冗余、动作/画格连续和修复触发；不调用真实图片 provider。
