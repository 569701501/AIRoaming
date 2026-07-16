---
doc_id: AIR-TASK-20260716-STORYBOARD-S3-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 代码、真实页面、真实模型输出与隔离数据库
---

# 分镜真实模型验收发现

## 已知基线

- 两条上游路线都在已确认 ChapterScriptVersion 后进入 StoryStructure，分镜不读取上游路线类型来选择 Prompt。
- S2 自动证据为聚焦 25/25、Server 677/677、DB Chromium 13/13；该证据只保护确定性错误，不代表真实模型质量。
- 分镜生成必须经历用户明确触发、pending 预览和用户确认；不允许剧情结构确认后自动生成或自动发布分镜。

## 待证明项

- `self/gpt-5.5` 能否在两种正式来源上稳定返回严格字段与合法本地引用。
- S2 是否会对真实合格输出产生误杀，或对明显缺 beat/引用错误产生漏拦。
- 真实分镜是否保持单镜头可画、双表达一致、对白与 `promptDraft` 边界，且不越权成为正式版。

## S3-1 AI 创作来源

- 实际链：ScriptVersion `0996d782-a5f5-42c2-a679-c463acc5d486` → StoryVersion `ee2bdc0f-1377-4772-91d9-a1e05049f9d4` → StoryboardVersion `76a1d0fd-ccdf-4808-a896-d719aec852df`，两级来源 ID 完全一致。
- 结构输入：3 characters / 6 scenes / 12 beats；分镜输出：24 shots，12/12 beats 覆盖，0 未知或倒序引用，0 `promptDraft` 禁止内容。
- pending 边界：确认前 current storyboard 为空、章节 `structured`、出图准备按钮禁用；确认后 current storyboard 为 `confirmed`、章节 `storyboard_done`、出图准备按钮可进入。
- 真实缺陷根因：`createAiChapterPending` 只检查 thread/message 存在，没有检查它们是否属于目标章节；项目级线程因此撞上 G1 章节作用域触发器。修复不放宽数据库触发器，也不改变用户流程。
- 审计展示补充：项目级线程被安全剥离后，空 thread/message/tool 不应显示为三个空值，统一展示“系统密封来源”。

## S3-2 已有剧本导入来源

- 拆章结果：2 个候选、0 blocking issue；整体确认目录后两章均为 `pending_ready`，但仅第 1 章形成正式版本，第 2 章继续保留 import pending。
- 实际链：import ScriptVersion `1e1bb4a9-e445-4206-9c6b-3112b07b4020` → StoryVersion `c889b0f4-60ba-4b03-a20b-4ab687f49484` → StoryboardVersion `6c229ede-200a-4c70-bacf-809c1b7ea371`，两级来源 ID 完全一致。
- 结构输入：3 characters / 3 scenes / 7 beats；最终分镜：12 shots、7/7 beats 覆盖、0 `promptDraft` 禁止内容。
- 首次输出被 S2 拦截，唯一问题是 `STORYBOARD_DIALOGUE_FRAME_EMPTY:shots[8]`；一次定向 repair 后通过，OpenCode session 恰为 2 个 user + 2 个 assistant 消息。
- pending/正式边界与 AI 来源一致：确认前 current 为空且下游禁用，确认后 `storyboard_done` 且出图准备入口启用。

## 双路线一致性结论

- 上游差异只存在于 ScriptVersion 形成方式；进入正式 StoryVersion 后，两路共用同一 `storyboard-shot-generate` Prompt、解析器、固定质量门、引用映射和 G2 Storyboard Working Copy。
- AI 来源 12 beats → 24 shots，导入来源 7 beats → 12 shots；镜头数由正式结构内容决定，不由 `origin` 决定。
- S2 真实表现符合设计：一个样例首次通过，一个样例被准确拦截并一次修复；没有为了真实输出放宽任何硬规则。

## 运行时安全发现与修复

- 真实模型运行曾在仓库内创建一份不属于本任务的会话文档。根因不是分镜 Prompt，而是 `OpenCodeRuntimeService` 创建会话时只提交标题，外部 OpenCode 进程会继承本机配置中的文件和命令工具。
- 新建会话已固定 `permission=[{permission:"*",pattern:"*",action:"deny"}]`；每次消息再提交 `tools={"*":false}`。OpenCode 1.17.x 会把该消息级规则写回会话，因此历史复用会话也会在下一次发送前被收紧。
- 该收紧不影响 AI漫游的 `generate_storyboard` 等应用内受控动作：应用先解析意图和读取正式事实，再把纯文本生成请求交给 OpenCode；模型无需直接读写仓库或调用系统工具。
- 越权生成的临时文档已删除。未发现其他由本轮模型创建的仓库文件，也未把任何凭据、模型认证信息或真实图片请求写入文档。

## 最终结论

- S3=`passed_real_model`：两个隔离新项目均通过同一分镜 Prompt、S2 质量门、pending 预览、用户确认和正式版本链。
- 真实导入样例证明一次定向修复有效；真实 AI 样例证明合格输出不会被固定门误杀。两个样例都没有证明多题材商业质量或图片审美质量。
- 本轮额外关闭了项目级对话来源跨章节绑定和 OpenCode 文本会话工具越权两个真实缺陷；未放宽数据库触发器、分镜门禁或用户确认边界。
