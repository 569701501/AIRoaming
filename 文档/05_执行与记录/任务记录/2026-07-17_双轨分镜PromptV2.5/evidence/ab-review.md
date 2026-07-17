---
doc_id: AIR-TASK-20260717-DUAL-STORYBOARD-PROMPT-V25-AB
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: model-ab.json、evaluator-regression.json
---

# V2.5 真实文本 A/B 复核

## 控制条件

- 新建 3 份固定章节剧本与剧情结构，不复用 V2.3/V2.4 历史项目。
- 模型：`self/gpt-5.5`。
- 用户输入：`请生成当前章节完整分镜，漫画和漫剧都要完整。`
- V2.3 与 V2.5 使用同一正文、结构、对白候选、严格解析、固定质量门和一次修复上限。
- 每份生成结果独立执行两次语义 evaluator；全流程串行，不写项目数据库，不启动媒体 Worker。

## 量化结果

| 样本 | V2.3 镜头 / 时长 | V2.5 镜头 / 时长 | 目标维度 V2.3 | 目标维度 V2.5 | 门槛 |
| --- | --- | --- | --- | --- | --- |
| 声音触发 | 6 / 27.5s | 6 / 33.0s | 4/4 covered | 4/4 covered | 通过镜头/时长；无改善 |
| 屏幕身份 | 4 / 22.0s | 6 / 27.4s | 4/4 covered | 4/4 covered | 镜头上限 5，失败 |
| 行动结果 | 5 / 25.6s | 5 / 25.0s | 4/4 covered | 4/4 covered | 通过镜头/时长；无改善 |

三个样本的配音总数均不变，单镜最大配音、超过 3 条配音镜头和超过 10 秒镜头也均未恶化。非目标观察中，声音样本的抽象兄妹关系从两次 `covered` 退为两次 `partial`；行动样本的抽象搭档关系两边均为两次 `partial`。

## 稳定性

- 6/6 分镜生成首次通过，修复次数为 0。
- 12/12 evaluator 首次通过，契约失败为 0。
- 固定 corpus 另跑一轮：5/5 成功，27/28 维度符合人工预期。
- corpus 唯一差异是屏幕身份 outcome 的预期 `missing` 与本轮 `partial`，属于既有边缘差异，不改变三个新样本目标维度的 2/2 稳定结果。

## 判定

`do_not_adopt / rejected_not_wired_to_production`。

改善样本 0 个，低于至少 2 个的采用门槛；屏幕身份样本超过镜头上限，声音样本出现非目标语义退化。生产继续使用 V2.3，V2.5 只作为显式 QA 变体保留。
