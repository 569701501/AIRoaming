---
doc_id: AIR-TASK-IMAGE-PROMPT-BASELINE-FINDINGS-001
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent
source: 代码库与文档探索
---

# 探索发现

## 已确认

- 角色与场景参考图 Prompt 的生产入口位于 `apps/server/src/projects/reference-prompt.util.ts`。
- 候选图领域 Prompt 的生产入口位于 `apps/server/src/projects/candidate-generation-spec.ts`。
- provider 投递适配位于 `apps/server/src/projects/image-prompt-profile.util.ts`，当前领域 `negativePrompt` 用于审计，实际禁令内嵌在正向 Prompt。
- DB 任务创建、worker 和普通候选图服务均引用同一候选图内容构造逻辑；仍需通过代码与测试逐项确认输出完全同源。

## 补充发现

- 现有测试覆盖了角色 preview/final、场景、候选图和 provider profile 的局部行为，但案例硬编码在多个测试文件中，不适合作为后续真实图片 A/B 的稳定输入清单。
- 页面展开区展示服务端 `CandidateGenerationSpec.positivePrompt`；普通任务、DB 任务和 worker 使用同一领域内容 builder，新 DB 任务还冻结实际 `providerPrompt/profileId`。
- 当前三个 provider profile 的实际 Prompt 文本都等于领域 `positivePrompt`，差异通过 profile ID、尺寸与 adapter 能力处理；不得伪造统一独立 `negative_prompt`。
- 多人群像案例在领域规格中解析出 4 张角色预览和 1 张场景参考；实际 provider 因参考图上限产生的省略与 warning 只能在真实运行时验证，离线基线不冒充通过。
- 角色 final Prompt 的输入预览图绑定发生在角色参考图服务，不属于 Prompt 文本 builder；本基线只验证实际 Prompt 文本，真实身份一致性仍需看图。

## 结论

- 离线固定基线全部通过，没有证据支持继续修改当前生产 Prompt。
- 真正未验证的是模型行为：人物相似度、多人混脸、场景稳定性、构图兑现、乱码/气泡污染和不同 provider 的参考图省略策略。
- 下一步应直接复用固定案例执行 30 张真实视觉验收，而不是再更换样例或继续给 Prompt 加规则。
