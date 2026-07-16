---
doc_id: AIR-TASK-20260716-STORYBOARD-PROMPT-BENCHMARK-PROGRESS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 分镜提示词外部对标进度

## 2026-07-16：R0 完成，R1 开始

- 已读取 `$deep-think`、文档入口、写作规则、ADR-0007、分镜 S1～S3 方案与当前生产 `buildStoryboardPrompt`。
- 当前 Prompt 的强项是事实源、引用、严格输出、双表达、pending/确认和一次修复；外部调研重点不再是换字段，而是加强“镜头选择理由、场面覆盖、视觉连续性、漫画转场和对话负载”。
- 本轮只做调研、比较和 V2 方案，不直接改生产代码。

## 2026-07-16：R1 外部来源完成

- 阅读并核对 7 个 GitHub 仓库的真实 Prompt、Skill、代码或工作流，记录热度快照和具体 commit。
- 阅读 Boords 官方故事板流程、Runway 官方 Prompt 指南和 Promptfoo 评测文档。
- 明确区分公开 Prompt、代码工作流、商业产品说明和本项目推断。

## 2026-07-16：R2 差距与方案完成

- 完成保留/增强/拒绝矩阵。
- 形成不改字段的 V2 九模块方案：事实源、视觉上下文、beat 覆盖、复杂度预算、漫画模式、连续性账本、comic/motion 分工、promptDraft 编译、删除检查。
- 明确黄金钩子只可视觉化正式结构已有事实；固定秒数、9:16、CTA、九宫格、画质词和 provider 参数不进入分镜 Prompt。

## 2026-07-16：R3 复核与留痕完成

- 正式方案：`文档/04_方案与决策/2026-07-16_分镜提示词外部对标与V2适配方案.md`。
- 静态复核通过；本轮没有修改生产代码，Runtime/User Review 标记为不适用。
- 下一步等待用户确认后，再修改生产 Prompt 并做同模型 A/B。

## 2026-07-16：用户纠正后完成双轨语义复核

- 用户明确漫画分镜和漫剧分镜都要生成，提示词必须分开，为后续两条生产链铺垫。
- 重新核对 Schema、生产 Prompt 和 ADR-0007，确认当前是 `comic / motion` 内容字段已分开，但镜头数量、顺序、景别和机位仍共用。
- 纠正原方案中“comic 先定、motion 再投影”的错误主从关系；V2 改为共享剧情事实、漫画分镜 Prompt、漫剧分镜 Prompt 三套契约。
- 本次只修正文档与领域边界，生产 Prompt、页面和 Schema 仍未修改。
