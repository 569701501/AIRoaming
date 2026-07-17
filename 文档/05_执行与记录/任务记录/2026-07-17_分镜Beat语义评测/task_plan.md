---
doc_id: AIR-TASK-20260717-STORYBOARD-BEAT-SEMANTIC-EVAL-PLAN
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: V2.3 真实 A/B 的非阻断语义弱化
---

# 分镜 Beat 语义评测任务计划

## 目标

提供一个独立、可重复运行的 P6 文本评测工具，对比已确认 `StoryStructure.beats[].summary/outcome` 与待评测 Storyboard，指出每个 Beat 在漫画/漫剧镜头中是完整覆盖、部分覆盖、缺失还是矛盾，并给出对应镜头序号证据。

## 非目标

- 不接入分镜生产生成、一次修复或用户确认链路。
- 不新增页面、Schema、DTO、数据库表、公开 Skill 或正式业务字段。
- 不让评测模型重写分镜、补剧情或替用户做确认。
- 不把模型报告当作高确定性硬门。
- 不调用图片、视频、TTS、字幕或其他付费媒体服务。

## 冻结契约

1. 输入只包含指定 StoryStructure 和 Storyboard，不读取项目大纲或聊天。
2. 每个 Beat 分别判断 `summaryStatus` 与 `outcomeStatus`：`covered | partial | missing | contradicted`。
3. `evidenceShotOrders` 只能引用该 beatId 下真实存在的 Shot order。
4. 输出必须恰好覆盖全部 Beat，顺序和 ID 与结构一致；不能新增诊断字段。
5. `overallStatus` 由本地计算：存在矛盾为 `fail`，存在缺失或部分覆盖为 `warning`，全部完整为 `pass`。
6. 报告只写用户指定的 QA 文件，不进入业务数据库或页面。
7. CLI 使用现有 `OpenCodeRuntimeService`，继承 deny-all 工具权限，不复制新的模型网关。

## 阶段

| 阶段 | 角色 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| E0 契约与边界 | Orchestrator | completed | 任务三件套、输入输出和非目标冻结 |
| E1 测试先行 | Worker | completed | Prompt、严格解析、状态计算的红灯证据成立 |
| E2 实施 | Worker | completed | 纯评测 util 和 QA CLI 完成 |
| E3 真实运行 | Runtime/User Review | completed | AI/import 两个 V2.3 结果各完成两次真实文本评测 |
| E4 收口 | Scrutiny Review | completed | 双 Review、Handoff、完成记录、记忆和提交完成 |

## 验收标准

- 单元测试覆盖完整、部分、缺失、矛盾、重复/漏 Beat、非法镜头证据和模型额外字段。
- CLI dry-run 不调用模型，真实运行输出严格报告。
- AI 样本应至少识别开场刹车声的部分/缺失；导入样本不应制造大面积误报。
- 生产对话、待确认保存、数据库、页面和付费媒体任务均无变化。

## 回滚

全部新增内容是 QA-only util、CLI、测试和文档；删除对应文件与 package script 即可回滚，不涉及数据迁移或历史产物。

## 最终判定

`completed_with_model_variance_observation`

工具、严格契约和真实证据均已完成。AI 样本两次结果完全一致；导入样本有两项稳定问题和两项单次附加问题，证明该能力适合作为重复运行的诊断评测，不适合作为单次生产硬门。
