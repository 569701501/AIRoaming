---
doc_id: AIR-TASK-20260716-STORYBOARD-PROMPT-BENCHMARK-SCRUTINY
status: passed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: 正式适配方案与外部原始来源
---

# Scrutiny Review

## 结论

`passed`

## 复核项

- 来源类型已区分：公开完整 Prompt/Skill、实际代码工作流、商业产品说明、模型官方指南和评测方法没有混为一谈。
- GitHub 星标只作为热度快照，没有作为质量证明。
- 没有复制外部完整 Prompt，也没有引入许可证不明的长段文本。
- V2 保留现有页面字段、Schema、公开 Skill 和 pending/confirm 版本边界。
- 漫画分镜和漫剧分镜已定义为并列媒介表达；Prompt 规则分别设计，只共享正式剧情事实，不再将 motion 定义为 comic 的动态投影。
- 文档已明确 M1 的实际限制：内容字段双轨，但镜头数量、景别和机位仍共用；没有把兼容结构误称为长期领域规则。
- 黄金三秒、固定时长、9:16、CTA、九宫格、8K/镜头焦段和 provider 负面词已明确排除。
- `comicFormat` 和 `artStyle` 是现有项目事实，注入 Prompt 不构成页面或数据模型扩张。
- 硬门、软评测和用户审美判断已分层；没有把 LLM 自评分当作正式事实源。
- 生产修改、真实模型 A/B 和默认切换仍需用户确认，当前文档没有越权声称已经上线。

## 残留风险

- Star 数量会变化，正式文档已注明快照日期。
- 外部热门项目多数面向短视频，不足以直接证明漫画分镜质量；方案只提炼方法，并要求后续同模型 A/B。
- “镜头冗余”“视觉强调”“连续性自然”仍包含主观成分，第一版只能进入软评测和用户确认。
- 第一版在共用 `Shot[]` 中仍无法表达漫画与漫剧不同的镜头数量或镜头语言；只有真实漫剧生产 A/B 证明必要后才应升级 Schema。
