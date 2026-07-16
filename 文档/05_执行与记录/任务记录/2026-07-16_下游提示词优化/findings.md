---
doc_id: AIR-TASK-20260716-DOWNSTREAM-PROMPT-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md 与代码探索
---

# 发现与证据

## D0 当前事实

- `reference-prompt.util.ts` 是角色/场景参考图 Prompt 的生产入口；角色较完整，场景只有 name/location/time/atmosphere/purpose 拼接。
- `candidate-generation-spec.ts` 是普通路径和页面预览的权威 builder，已有 clean plate、防文字/气泡/多格和镜头级角色/场景引用规则。
- `PersistentG2TaskCreateGuardService.buildPromptSpec` 为 DB-only `shot_prompt_generate/image_generate` 单独拼装薄 Prompt，没有角色、场景和完整风格上下文；这是当前最大漂移。
- `ImageCandidatesWorkspace.vue` 直接展示服务端返回的 `CandidateGenerationSpec`，前端已不再自行解释镜头字段，但显示方式仍假设所有 provider 都使用统一 `Avoid:`。
- file `ImageCandidateService` 会把 `positivePrompt + Avoid + negativePrompt` 发送 provider；DB `PersistentTaskWorkerService` 只发送 `positivePrompt`。两条真实执行语义也不一致。
- OpenAI、Doubao、Grok 的当前统一网关均只接收一个 Prompt 字符串；参考图数量和编辑模式已由网关按 provider 分流。

## 初步决策

- 先建立 provider-neutral 领域 Prompt Spec，再由显式 profile 编译出实际 Prompt。
- 保留 `positivePrompt/negativePrompt` 兼容字段和现有页面结构，但页面展示的完整文本必须来自服务端实际编译结果，不能继续自行固定追加 `Avoid:`。
- DB builder 必须删除或改为委托统一 builder；不接受“同步复制两份相同文案”的伪统一。

## 最终结论

- 候选图的领域事实源收口到 `buildCandidatePromptContent`；普通生成规格和 DB-only 任务都调用它，页面只展示服务端返回的实际正向 Prompt。
- `negativePrompt` 继续保留为可审计的领域排除项；当前 OpenAI、Doubao、Grok 网关不支持统一独立负向参数，因此由 Provider Profile 把必要禁令自然写入正向提示，不再拼接伪通用 `Avoid:`。
- DB 任务冻结 `providerType/profileId/providerPrompt/negativePromptDelivery/sections/systemConstraints`。执行前若当前 provider 与任务创建时不同，则失败关闭，避免旧任务被新配置静默改写。
- 角色和场景参考图继续使用现有页面与数据字段，只增强生成契约；没有新增配置页、Prompt 管理后台或数据库字段。
- 分镜只负责提供单帧可画的结构事实，最终供应商 Prompt 仍在候选图阶段编译，避免 P06 与 P25/P26 再次产生两套完整生图文案。

## 残留风险

- 固定规则能防止文字、拼贴、角色表和场景污染，但不能替代真实图片的审美、身份相似度和商业质量判断。
- 本轮只使用可重复的 fake provider 验证请求闭环；真实 OpenAI、Doubao、Grok 的出图对比涉及凭据和费用，需要用户另行明确授权。
- 现有历史任务没有冻结新 Profile；worker 为其保留兼容编译路径，新创建任务使用完整冻结规格。
