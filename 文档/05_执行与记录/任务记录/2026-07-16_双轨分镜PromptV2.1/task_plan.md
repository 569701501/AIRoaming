---
doc_id: AIR-TASK-20260716-DUAL-STORYBOARD-PROMPT-V21-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: V1/V2 真实 A/B 的 MIXED 结论与用户继续指令
---

# 漫画 / 漫剧双轨分镜 Prompt V2.1 任务计划

## 目标

针对真实 V2 样例暴露的“单个漫剧镜头承载过多动作变化和对白”问题，增强分镜首次生成与一次定向修复 Prompt；保持页面、Schema、`Shot[]`、固定质量门和用户确认流程不变。完成后复用上一轮相同正式 ScriptVersion / StoryVersion，以真实 `self/gpt-5.5` 运行 V2.1，并与已冻结的 V2 输出比较。

## 非目标

- 不增加漫画 / 漫剧独立镜头序列。
- 不新增字段、页面、确认点或公开 Skill。
- 不把对白条数、秒数或镜头数量做成确定性硬门。
- 不调用图片、视频、TTS、字幕或其他付费 provider。
- 不重新创作剧本、结构或改动上一轮基线项目。
- 不用新故事替换上一轮 V2 样本，避免输入变化污染对比。

## V2.1 冻结规则

1. 一个 motion 默认只承载一个主要动作或一次明确的信息/情绪变化；必要反应可以保留，但不能再串入第二条独立动作链。
2. 当一个 beat 包含超过 2 次显著状态变化，或同一 Shot 计划承载超过 3 条有内容的 voice line 时，必须优先评估第二个共享 Shot。
3. 需要第二镜时，把进入/选择与结果/反应分别分配，不能只增加重复景别；每个新增 comic 仍必须是不同、可读的静态决定性瞬间。
4. 当前 M1 每个 beat 最多两镜；达到两镜后仍过载时，缩小每镜动作范围、保留正式关键台词并给足时长，不能继续把所有动作塞回一镜。
5. `voiceLines[].line` 对可见于正式正文摘录的对白逐字引用，只允许去掉说话人标记和外层引号，不同义改写或改标点；正文摘录未提供的台词不得补写。
6. 上述规则属于 Prompt 内部规划和软评测，不新增输出诊断字段，也不作为本轮后端硬阻断。

## 阶段

| 阶段 | 角色 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| V21-0 事实与边界 | Orchestrator | completed | 真实失败镜头、规则、变量和回滚范围冻结 |
| V21-1 测试先行 | Worker | completed | Prompt 契约先表达负载、拆镜、漫画保护和逐字对白规则 |
| V21-2 Prompt 实施 | Worker | completed | generate / revise / repair 全部使用 V2.1 规则 |
| V21-3 静态验证 | Worker | completed | 定向测试、typecheck、build、diff 检查通过 |
| V21-4 真实模型复核 | Runtime/User Review | completed | 相同两项目生成 V2.1，页面可查看且付费调用为 0 |
| V21-5 收口复核 | Scrutiny Review | completed | Handoff、双 Review、方案、完成记录与记忆同步 |

## 最终判定

`MIXED / V21_DIALOGUE_LOAD_BETTER_STATE_LOAD_UNRESOLVED`

- 两路 V2.1 都首次通过严格契约与固定质量门，没有进入一次修复。
- AI 路线超过 3 条 `voiceLines` 的镜头从 V2 的 7 个降为 0，可见正式对白逐字命中从 44/45 提升为 31/31。
- 新增的同 beat 第二镜具有独立静态叙事价值，没有出现换景别或重复反应的漫画填充格。
- AI 路线总时长由 127.0s 上升到 161.5s，仍有多个 10～12.5s 镜头承载多次状态变化；因此对白负载已改善，动作/状态负载尚未解决。

## 真实对照指标

- 最终硬门、首次通过与修复次数。
- beat/scene/character 引用和 `promptDraft` 禁止项。
- Shot 数与 Shot/beat。
- motion 平均/最大时长、voice line 数。
- 明显过载 Shot：超过 3 条 voice line，或人工判断超过 2 次显著状态变化。
- 漫画静态可画性、V2.1 是否为了动态拆镜制造重复漫画画格。
- 导入原稿对白逐字命中和无来源事实。

## 判定口径

- `V21_ACCEPTED`：两路线最终硬门通过；V2 的过载镜头明显减少；漫画没有出现重复填充或 beat 丢失；来源忠实性不退化。
- `MIXED`：过载只在一路改善，或拆镜导致漫画冗余、首次稳定性和质量收益互相抵消。
- `V21_REJECTED`：出现无来源事实、beat/引用失败、漫画明显退化，或过载问题没有改善且修复率上升。

## 回滚

本轮只改 Prompt 文案与契约测试。若真实结果不通过，单独回退 V2.1 提交即可；没有数据迁移或历史产物改写。

## 退出标准

- 代码、测试、真实文本结果和用户可查看页面齐全。
- Handoff、Scrutiny Review、Runtime/User Review、完成记录和长期记忆完成。
- 结论明确使用 `V21_ACCEPTED / MIXED / V21_REJECTED`，不夸大两样例。
