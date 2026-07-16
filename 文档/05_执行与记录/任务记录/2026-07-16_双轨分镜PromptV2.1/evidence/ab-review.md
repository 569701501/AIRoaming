---
doc_id: AIR-TASK-20260716-DUAL-STORYBOARD-PROMPT-V21-AB
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 隔离 DB、真实 self/gpt-5.5 运行、工作台页面和逐镜人工复核
---

# V2 / V2.1 真实文本 A/B 复核

## 1. 隔离与同源性

- V2.1 运行目录：`/Users/liyadong/.codex/runtime/airoaming-storyboard-ab-20260716-2247/v21`
- API / Web：`4337 / 5197`
- base 与 V2.1 DB SHA-256：`a72da9041095f5bba04c9fe03c8972d75d0422097725a4d6ea31dfc98ac47c76`
- base 在生成前：`storyboard_versions=0`、`story_versions=2`、`chapter_script_versions=2`。
- 模型：`self/gpt-5.5`
- 统一触发文本：`请生成当前章节完整分镜，漫画和漫剧都要完整。`
- AI 项目：`dfb3aa62-6447-45bf-aee4-6aeea6476149`，StoryVersion `f00e48ce-e070-46d8-9ab7-7b20ac8f1515`。
- 导入项目：`76e071bd-7e97-4ed5-8de1-06ab590c9f51`，StoryVersion `34835ca7-ed9d-47ee-a087-53d09e5fb42c`。

## 2. 量化结果

| 指标 | AI V2 | AI V2.1 | 导入 V2 | 导入 V2.1 |
| --- | ---: | ---: | ---: | ---: |
| Shot | 17 | 19 | 10 | 11 |
| beat | 13 | 13 | 8 | 8 |
| Shot/beat | 1.31 | 1.46 | 1.25 | 1.38 |
| 总时长 | 127.0s | 161.5s | 62.9s | 64.6s |
| 平均时长 | 7.47s | 8.50s | 6.29s | 5.87s |
| 最大时长 | 10.0s | 12.5s | 9.2s | 9.0s |
| 单镜最大 voiceLines | 6 | 3 | 2 | 2 |
| `voiceLines > 3` 镜头 | 7 | 0 | 0 | 0 |
| 可见正式对白逐字命中 | 44/45 | 31/31 | 6/6 | 6/6 |
| 严格契约/固定门 | 最终通过 | 首次通过 | 首次通过 | 首次通过 |
| 定向修复 | 1 | 0 | 0 | 0 |

V2.1 pending：

- AI：`a30af8f1-2b20-4eb9-987a-49d95c56d6ea`
- 导入：`50c36ae3-03c9-4018-a85b-a06ff02675b3`

两个版本均保持 `pending_confirmation`，未被本次验收确认为正式 StoryboardVersion。

## 3. 确定性检查

- 两路 beat 全覆盖。
- beat / scene / character 引用全部存在于对应 StoryStructure / 项目角色中。
- `promptDraft` 没有禁止项、对白泄漏或完全重复。
- 两路 OpenCode session 均只有一次 assistant 响应，证明未触发一次修复。
- 两个浏览器页面 console error/warn 均为 0。
- 任务 worker 关闭；11 个既有 runtime task 仍全部 queued，无 running/succeeded，未调用付费图片、视频、TTS 或字幕服务。

## 4. 媒介质量复核

### 4.1 有效改善

- AI `beat_05` 的录音线索与 Y-07/人物反应被分为两镜；录音机启动特写与人物持机对峙是两个不同静态决定性瞬间。
- AI `beat_08` 把刷卡失败/动摇与破门/做出选择分开，漫画格也分别以红色拒绝灯和破拆杆为视觉中心。
- 导入 `beat_05` 把“藏许岚”和“持录音笔引走追兵”分开，第二镜有清楚追逐方向，不是重复画格。
- AI V2.1 没有任何单镜超过 3 条配音台词，且所使用台词 31/31 在正式 ScriptVersion 文本中逐字可命中。

### 4.2 未解决问题

- AI 第 14、15、16、18、19 镜虽然对白不超过 3 条，但仍串联冲击/处理伤口/递票卡/解释，或诱惑/选择/行动等多次状态转换。
- AI 平均镜头时长不降反升，总时长增加 34.5s；说明模型倾向于用“延长时长”消化负载，没有始终收窄单镜内容。
- V2.1 给了“超过 2 次状态变化”规则，但缺少更具体的状态边界表达，模型对它的遵循程度明显弱于可计数的 voice line 规则。

## 5. 最终判定

`MIXED / V21_DIALOGUE_LOAD_BETTER_STATE_LOAD_UNRESOLVED`

V2.1 的对白负载、逐字引用、首次稳定性和漫画拆镜保护均有真实改善，因此保留这些 Prompt 规则。但动作/状态负载仍未解决，不应宣称 V2.1 已完全验收。

## 6. 页面证据

- [AI创作 V2.1 工作台](./AI创作_V2.1_分镜工作台.png)
- [已有剧本 V2.1 工作台](./已有剧本_V2.1_分镜工作台.png)
