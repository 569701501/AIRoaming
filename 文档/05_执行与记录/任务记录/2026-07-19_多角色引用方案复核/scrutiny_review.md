---
doc_id: AIR-TASK-MULTI-REF-REVIEW-SCRUTINY-001
status: complete
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, reviewer
source: task_plan.md、findings.md、正式调研报告与当前项目事实源
---

# Scrutiny Review

## 1. 复核范围

只读复核“自适应镜头引用编译”方案，不评价尚未生成的视觉结果，不修改代码或运行态。

检查项：

- 与当前 `Shot`、CharacterVisual、SceneVisual、CandidateGenerationSpec 和任务来源追溯是否冲突。
- 是否仍可能静默省略角色或场景。
- 是否把未来结构化站位、构图板、区域编辑误写为当前能力。
- 是否把“减少图片槽位”错误等同为“必然省 token/成本”。
- 是否尊重 2026-07-17 真实图片 A/B 的既有结论。

## 2. 证据

- 当前 `Shot` 只有 `coreAction + comic.composition` 自由文本，没有逐角色结构化站位；正式方案已把未解析构图标记为 `prompt_only/mappingConfidence=low`，没有伪造字段。
- 当前引用只有 `character_identity/scene_environment` 与优先级；正式方案把 `ShotVisualRequirementSet/ReferencePlan` 明确写为建议目标，不冒充已实现 DTO。
- 当前 Grok 代码最多选 3 张，超限保留两个角色和场景；已有真实 A/B 证明被省略角色没有图像级身份锁定。方案要求 `omittedRequired=[]` 才能创建任务，方向正确。
- 当前单场景参考会因本地比例策略被舍弃，已有真实 A/B 证明场景漂移。方案把修复单参考路径列为 P0，未用虚构的 Prompt 补偿。
- 当前区域修复未实现；方案明确放入 P2，并在正文标注“尚未在当前候选工作台实现”。
- 当前 Server 只有 `pngjs`，主要资产为 WebP；方案把完整图片解码/合成能力列为实施前置，没有声称可直接拼板。
- JSON 示例 2/2 可解析，相关事实源路径均存在，Markdown 变更无空白错误。

## 3. 复核发现

### 通过项

1. 否决“2 人以上统一合板”有充分理由：Grok 的双人+场景恰好占满 3 槽，合板只会主动降低单人有效像素。
2. “身份、场景、构图”三通道比单纯按图片张数设计更完整，也和 Runway/Seedream/Leonardo 的职责拆分方向一致。
3. “焦点角色单图 + 其余角色板 + 场景构图板”能在 Grok 3 槽内覆盖重点身份、其余角色、场景和构图，是比全员静态板更有弹性的多人方案。
4. 关键镜头最终依赖 `shot_master + mask` 局部修复，符合 Adobe/Ideogram/Scenario 的成熟产品路径，也能保护已正确区域。
5. 方案保留 Provider 差异，不为了表面统一强迫 OpenAI/Seedream 采用压缩板。

### 实施前必须继续收口

1. P0 不应顺带新增 `ShotStagingPlan`；当前可先用 `composition=prompt_only`。结构化站位、页面校对和场景构图板应作为独立 P1 决策。
2. 多人身份板与场景构图板是任务派生文件，但当前 Asset 角色、路径、staged→ready 和幂等缓存落点尚未决定；正式编码前必须补任务/素材契约和示例。
3. `final_reference` 四视图的单视图提取不能假设模型输出永远精确按四等分；如果要使用，必须有可验证的布局/检测规则，否则继续使用 `preview_front`。
4. “每个角色最小可读像素”“何时从直传切到身份板”“构图标记是否污染”都必须通过固定语料真实 A/B 得出，不能在代码里先写未经验证的魔法数字。
5. 场景构图板覆盖场景不等于原始场景锚点同等保真；如果标记破坏环境细节，应回退原始场景或使用分层流程。

## 4. 结论

静态方案复核结论：`pass_for_design`。

该结论只表示推荐架构与当前事实源、市场资料和既有运行证据一致，可以作为下一步实施设计输入；不表示任何新编译模式已实现，也不表示角色板或构图板在 Grok/OpenAI/豆包上的视觉质量已通过。
