---
doc_id: AIR-EVIDENCE-IMAGE-PROMPT-BASELINE-001
status: active
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, qa
source: image-prompt-s4-baseline-v1 离线编译报告
---

# 图片 Prompt 离线基线复核

## 1. 结果

| 范围 | 数量 | 结果 |
| --- | ---: | --- |
| 角色/场景参考 Prompt | 3 | 3/3 passed |
| 候选镜头 | 5 | 5/5 passed |
| Provider Profile | 15 | 15/15 passed |
| 失败案例 | 0 | passed |
| 授权后真实图片规模 | 30 | not_run |

## 2. 固定候选镜头

| Case ID | 类型 | 角色参考 | 场景参考 | 目标画幅 |
| --- | --- | --- | --- | --- |
| `candidate-no-character-establishing` | 无角色远景 | 0 | 旧港 | 1536×1024 |
| `candidate-single-character-closeup` | 单人近景 | 林舟 | 档案室 | 1024×1536 |
| `candidate-two-character-dialogue` | 双人对话 | 林舟、许澄 | 旧港 | 1024×1536 |
| `candidate-group-staging` | 多人群像 | 林舟、许澄、赵妍、高远 | 旧港 | 1024×1536 |
| `candidate-scene-effect` | 场景特效 | 赵妍 | 档案室 | 1024×1536 |

## 3. 自动检查内容

- 章节标题、对白、旁白、motion 过程、旧 `promptDraft` 和 `vertical_scroll/paged_comic` 不得进入候选图实际 Prompt。
- 候选图保持单场景、单静态瞬间、单主要构图、无文字、无气泡、无分格/拼贴的干净底图。
- 角色和场景参考只来自当前 shot；四视图 final sheet 不会被候选图当作身份参考。
- 尺寸、sections、CandidateGenerationSpec v2、`shot_clean_plate` purpose 和 `embedded_constraints` 投递方式保持一致。
- OpenAI、Doubao、Grok provider prompt 均由同一领域 `positivePrompt` 编译，没有额外拼接 `Avoid:`。

## 4. 明确没有证明的内容

- 人物脸型、服装和多人身份是否真的稳定。
- 场景空间、地标和光线是否真的保持一致。
- 构图、焦点、动作和情绪是否被模型正确兑现。
- 是否仍出现乱码、数字、气泡、边框或拼贴。
- 多人群像超过 provider 参考图上限时，实际省略和 warning 是否符合预期。

以上只能通过获准后的真实图片与任务证据验证。
