---
doc_id: AIR-TASK-20260718-PROMPT-RESIDUE-FINDINGS
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: 后端 Prompt 残留复核证据
---

# 后端 Prompt 残留复核发现

## 判定标准

- 应迁移残留：可独立改变创作结果的稳定角色设定、方法、风格、构图、禁用项、质量策略或 provider 创作措辞。
- 合法后端内容：项目动态事实、ID/版本/来源、Schema/格式校验、错误信息、状态枚举、provider API 参数和模板资产名称。
- 测试可保留：用于证明 Skill 内容被加载的短断言；测试不应成为生产 fallback。

## 扫描结果

### R1 高：持久 `shot_generate` 仍是独立硬编码分镜 Prompt

- 证据：`apps/server/src/projects/persistent-task-worker.service.ts:723` 的 `runShotProvider()`，在 730～731 行直接写入两条简化分镜指令。
- 可达性：公开 `POST /tasks` → `TasksService.create()` → DB create guard 允许 `shot_generate` → `PersistentTaskWorkerService` 注册并执行该 handler。
- 影响：这条路径绕过 `storyboard-shot-generate` 的漫画/漫剧双轨、对白来源、状态边界、质量门和修复契约；同一业务动作存在两套创作方法。
- 判定：明确生产残留，不是格式校验或动态上下文。

### R2 高：图片 provider 仍追加硬编码“参考图职责”

- 证据：`apps/server/src/projects/image-provider.service.ts:623` 的 `withReferenceGuidance()`，630～649 行保存中英文角色身份锁、场景身份锁和不得覆盖人物数量/动作关系等稳定创作规则。
- 调用：Grok 多参考、OpenAI 有参考、豆包有参考时，在 Skill provider profile 之后继续追加这段文字。
- 影响：最终发给 provider 的 Prompt 不完全由 `image-candidate-generate` Skill 决定；修改 Skill 仍无法单独控制真实出图 Prompt。
- 测试证据：`image-provider.service.spec.ts` 直接断言这些硬编码句子存在，说明它是当前正式行为，不是死代码。
- 判定：明确生产残留。

### R3 中：分镜 JSON 示例的创作语义仍由代码构造

- 证据：`apps/server/src/dialogue/dialogue-prompt.util.ts:525` 的 `shotExample`；535～557 行包含“静态决定性瞬间”“动态构图”“开始状态到结束状态”“promptDraft 不是最终 Prompt”等稳定示例措辞。
- 影响：这些文字直接注入 `storyboard-prompt.md` 的 `SHOT_EXAMPLE_JSON`，会影响模型输出；Skill 只保存占位符，示例内容仍有第二编辑点。
- 判定：生产残留，但风险低于完整旁路。

### R4 中：参考图画风与漫画格式 Prompt 词汇仍在 Skill 外

- 证据一：`apps/server/src/projects/project-domain.util.ts:107` 的 `getArtStyleLabel()` 保存六组中英双语生图风格描述。
- 证据二：`packages/shared/src/comic-format.ts:8` 的 `referencePromptHint` 及 16、22 行两组英文提示词片段。
- 调用：`reference-prompt.util.ts` 将它们注入 `image-reference-generate` 模板。
- 影响：参考图 Skill 的最终创作措辞仍依赖后端/Shared 两处稳定词汇表。
- 判定：生产残留。UI 展示标签可以留在代码，英文创作描述和 `referencePromptHint` 应归 Skill。

### R5 低：P6 分镜语义 evaluator Prompt 仍在后端

- 证据：`apps/server/src/dialogue/storyboard-semantic-evaluation.util.ts:157`，完整评测角色、四态定义、边界和输出示例均为硬编码。
- 影响：它只用于离线 P6 QA CLI，不参与正常分镜生成和用户确认，因此不改变当前生产分镜；但若目标是“所有 AI Prompt 都进入 Skill”，仍未完成。
- 判定：非生产生成残留，建议后续独立为 `storyboard-semantic-evaluate` Skill。

### R6 邻接范围：剧本、导入和剧情结构 Prompt 仍大量保留在后端

- `dialogue-prompt.util.ts` 的灵感、大纲、章节、导入、剧情结构，以及 `script-dialogue.service.ts` 的修复 Prompt 仍是代码正文。
- `persistent-task-worker.service.ts:678` 的 `story_parse` 同样存在简化硬编码旁路。
- 这不是本次“三个分镜/图片 Skill”迁移新增的回归，但说明全项目尚未做到“所有 Prompt 统一归 Skill”。

## 已通过边界

- 三个主构造器读取 Skill 失败时都会抛错，没有静默硬编码 fallback。
- 候选图公共合同、negative tokens 和 provider profile 主体已经来自 `image-candidate-generate/references/`。
- 角色/场景主模板已经来自 `image-reference-generate/references/`。
- 分镜主模板与修复模板已经来自 `storyboard-shot-generate/references/`。
- 动态项目事实、ID、版本、SourceProjection、Schema 校验、错误码和 provider HTTP 参数留在代码是合理边界。

## 总结

上一轮完成了主模板迁移和运行时加载，但“Skill 是唯一可编辑事实源”的验收结论过早。当前应判定为：主路径大部分已归位，但仍存在 4 类生产残留、1 类离线 evaluator Prompt 和一组邻接旧 Prompt；静态复核不通过，需要修复。
