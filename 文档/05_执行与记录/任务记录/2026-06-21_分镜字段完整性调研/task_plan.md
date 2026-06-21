# 分镜字段完整性调研 · task_plan

---
doc_id: AIR-TASK-2026-06-21-STORYBOARD-FIELDS
status: active
created: 2026-06-21
updated: 2026-06-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: 2026-06-21 分镜 comic/motion 字段是否够支撑后续流程的疑问
---

## 1. 任务类型

调研判断类（非写代码类）。目标是产出"字段是否够用"的结论 + 缺口清单，**不直接改字段**。是否改字段、改哪些，由用户看完结论后决定，再单独立项。

## 2. 背景与目标

用户对分镜阶段 `StoryboardShot` 的 `comic`（漫画画格）和 `motion`（漫剧镜头）两套字段是否足够支撑后续流程消费存疑，且自己不清楚业界漫剧/漫画的分镜字段标准。

目标：
1. 用项目自身下游链路（出图准备→候选图→排版→配音→视频）反查每个字段有没有被真实读到（内部验证）。
2. 用业界漫画/webtoon 和动态漫画/影视 shot list 的字段标准做对照（外部校验）。
3. 给出"够 / 不够 + 缺什么"的明确结论，附缺口清单和建议优先级。

## 3. 非目标

- 不在本任务里直接修改 StoryboardShot/comic/motion 字段结构。
- 不推翻 M1 "一个 Shot = 一个漫画画格 = 一个漫剧镜头"的设计。
- 不实现 tts/video 功能（P0.5）。

## 4. 阶段划分

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P1 调研 | 业界漫画/webtoon + 动态漫画/影视分镜字段证据收集 | 进行中 |
| P2 内部验证 | 用下游消费链反查每个字段被读情况 | 待办 |
| P3 结论 | 够不够 + 缺口清单 + 优先级建议，写入 findings.md | 待办 |

## 5. 退出标准

1. findings.md 写明：业界对照证据（带来源链接）、内部消费链验证、每个字段的判定（够/存疑/缺）、缺口清单。
2. 给用户一个明确结论：当前字段是否足以支撑后续流程；如果不能，缺哪些、建议何时补。
3. 结论区分"MVP 已消费的字段"和"P0.5 漫剧链路规划的字段"，避免对未落地的功能过度设计。

## 6. 关键问题

1. comic 的 5 个字段（panelDescription/composition/dialogue/caption/panelRhythm）下游（shot_prompt_generate/image_generate/layout_export）是否都读到？
2. motion 的 7 个字段（visualDescription/compositionDesign/cameraMovement/voiceRole/line/durationHint/frameType）下游（tts_generate/video_export）是否都读到？注意这些下游是 P0.5 未落地。
3. 业界标准里，漫画分镜和漫剧/影视 shot list 各有哪些我们没覆盖的字段？这些字段对 AI 漫画生产是否有必要？

## 7. 当前深思熟虑角色边界

- Orchestrator：规划、收集证据、产出结论。
- 本任务无 Worker 阶段（不改代码）。
- Scrutiny Review：复核 findings.md 的证据链和结论一致性。
- Runtime/User Review：用户阅读结论后决定是否改字段，以及改哪些。
