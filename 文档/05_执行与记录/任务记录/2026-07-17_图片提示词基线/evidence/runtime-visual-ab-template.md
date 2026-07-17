---
doc_id: AIR-EVIDENCE-IMAGE-PROMPT-RUNTIME-TEMPLATE-001
status: superseded
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, qa
source: image-prompt-s4-baseline-v1
---

# S4 真实图片 A/B 验收模板

> 2026-07-17 已按本模板完成真实运行。本文件保留原始验收设计；实际账本、20 张成功输出的脱敏追溯和人工结论见 `文档/05_执行与记录/任务记录/2026-07-17_真实图片AB/evidence/manual-visual-review.md`。

## 1. 运行前授权

- [ ] 用户明确授权真实图片 provider。
- [ ] 明确 OpenAI、Doubao、Grok 中本次实际启用的 provider 与模型。
- [ ] 明确费用/张数上限；默认固定规模为每个案例 2 张。
- [ ] 使用隔离新项目和独立证据目录，不修改既有正式项目。
- [ ] 不把 API Key 写入报告、日志或 Git。

## 2. 固定运行矩阵

| Provider | Case ID | 第 1 张 | 第 2 张 | 干净底图 | 身份/场景一致 | 构图兑现 | 任务/素材追溯 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OpenAI | `candidate-no-character-establishing` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| OpenAI | `candidate-single-character-closeup` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| OpenAI | `candidate-two-character-dialogue` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| OpenAI | `candidate-group-staging` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| OpenAI | `candidate-scene-effect` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| Doubao | `candidate-no-character-establishing` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| Doubao | `candidate-single-character-closeup` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| Doubao | `candidate-two-character-dialogue` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| Doubao | `candidate-group-staging` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| Doubao | `candidate-scene-effect` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| Grok | `candidate-no-character-establishing` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| Grok | `candidate-single-character-closeup` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| Grok | `candidate-two-character-dialogue` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| Grok | `candidate-group-staging` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |
| Grok | `candidate-scene-effect` | not_run | not_run | not_run | not_run | not_run | not_run | not_run |

## 3. Provider 单独放行标准

- 10/10 输出尺寸或比例符合该 provider 的冻结 profile。
- 10/10 不复制章节标题、对白、旁白或其他可读文字。
- 10/10 不出现其他 shot 的无关角色。
- 至少 9/10 没有文字、气泡、分格、边框、拼贴或设定表污染。
- 多人镜头实际使用/省略的参考与 task warnings 一致。
- 每张图均可从 Candidate、Asset、Task 追溯到固定 case、Prompt、profile 和参考资产。

某个 provider 未通过时只关闭或保留该 provider 的保守模式，不用其他 provider 的结果替它通过。
