---
doc_id: AIR-TASK-20260718-PROMPT-SKILL-FINDINGS
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: Prompt 技能归位探索证据
---

# Prompt 技能归位发现

## 现状证据

- `apps/server/opencodeAI/README.md` 将 `skills/**/SKILL.md` 定义为可复用阶段能力事实源，但同时注明完整运行时模板服务尚未接入。
- `OpenCodeRuntimeService.startServer()` 继承服务端工作目录启动 `opencode serve`，没有把 `apps/server/opencodeAI` 设为配置或 Skill 根目录。
- 文本生成消息关闭全部 OpenCode tools，因此不能假设模型会自行发现本地 Skill。
- 分镜稳定规则位于 `dialogue-prompt.util.ts`；参考图规则位于 `reference-prompt.util.ts`；候选图语义规则位于 `candidate-generation-spec.ts`；provider 编译位于 `image-prompt-profile.util.ts`。
- 旧方案明确把服务端动态 Prompt 当成“Skill 尚未接入期间”的临时生产入口。该临时边界现被用户否决。

## 风险

- 只移动文件不接运行时会导致生产功能失效。
- Skill 与代码各保留一份提示词会继续漂移。
- 当前工作区已有未提交图片 Prompt V2 改动，迁移必须基于现状增量修改，不得回退。
- 图片 Prompt 包含领域语义与 provider 传输两层；只迁移领域创作规则，不能把接口参数误当创作 Skill。

## 当前结论

采用“Skill 资产唯一事实源 + 后端只读加载/动态装配 + 固定代码校验”的过渡生产架构。未来 OpenCode 原生 Skill 运行时接入时可以复用同一目录，不再迁移提示词正文。

## 最终实现事实

- `storyboard-shot-generate` 保存漫画/漫剧双轨分镜生成、调整、风险提示和一次定向修复模板。
- `image-reference-generate` 保存角色预览、角色定稿、场景参考的 V1/V2 提示词和公共画风合同。
- `image-candidate-generate` 保存单镜头候选图合同、固定负面约束、候选配置和 OpenAI/豆包/Grok 交付 profile。
- `opencode-skill-asset.util.ts` 是生产只读接线层；它不复制创作方法，只加载、校验和渲染 Skill 资产。
- `dialogue-prompt.util.ts`、`reference-prompt.util.ts`、`candidate-generation-spec.ts` 和 `image-prompt-profile.util.ts` 已不再维护可独立修改的同义稳定 Prompt。
- 页面字段、数据库 Schema、用户确认动作和现有七阶段状态机未改变。

## 复核结论

- 静态复核：通过。生产创作正文位于 Skill；代码搜索未发现新的同义稳定 Prompt 回流。
- 运行复核：通过。Skill 规范校验、编译后加载、类型检查、构建和服务端 726 项回归全部通过。
- 视觉复核：本轮未执行。用户明确禁止继续产生图片费用，未调用任何真实图片 provider。

## 后续纠偏

2026-07-18 再次复核发现，上述“生产创作正文均位于 Skill”的判断不完整。四类生产残留仍在后端或 Shared：持久 `shot_generate` 简化 Prompt、provider 参考图职责、分镜输出示例语义、参考图画风/版式 Prompt 词汇。以 `文档/05_执行与记录/任务记录/2026-07-18_后端Prompt残留复核/` 的结论为准。
