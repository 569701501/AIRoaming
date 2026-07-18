---
doc_id: AIR-TASK-20260718-STRUCTURE-PROMPT-FINDINGS
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent
source: 代码与项目文档探索
---

# 现状证据

- `buildStoryStructurePrompt` 与 `buildStoryStructureRepairPrompt` 保存了完整业务规则，但规则仍位于 TypeScript。
- `StoryStructureDialogueService` 已使用精确章节剧本版本、固定质量检查和一次修复，确认前只形成预览。
- `PersistentTaskWorkerService.runStoryProvider` 仍直接要求模型输出 `StoryDocumentV2`，包含后端应负责的 ID 字段，并缺少同等质量门。
- `normalizeStoryStructureJson` 已能为 AI 语义输出生成稳定的本地角色、场景和节拍 ID。
- `StoryVersionRepository` 可解析 `unresolved-story-character:` 占位关联，适合作为后台模型输出到正式项目角色之间的后端边界。

# 风险

- 若只迁移对话 Prompt，后台任务仍可能生成质量较低且字段职责错误的结构。
- 若直接把 v1 语义结构写为 v2，Beat 中的角色名称不符合 v2 的本地角色 ID 约束。
- 若迁移时修改页面字段或确认状态，将扩大范围并破坏用户已认可的流程。

# 结论

新增 Skill、共享 Prompt 装配函数，并在后台增加一个纯后端的 v1→v2 转换边界，是不改变产品展示的最小完整方案。

# 实施后事实

- 稳定剧情结构创作规则只存在于 `apps/server/opencodeAI/skills/structure-story-parse/references/`；TypeScript 只读取、填充和校验。
- 对话路径与持久任务的动态上下文不同，但共享同一稳定方法：对话可读取当前工作台大纲；持久任务只读取 `sourceProjection` 已冻结的 ScriptVersion，未冻结的大纲不在运行时补读。
- 模型输出保持现有页面语义字段，不承担 `chapterId`、版本 ID、角色/场景/Beat ID、`projectCharacterId` 或时间戳。
- `toStoryDocumentV2` 负责本地 ID 和 Beat 角色引用转换；`StoryVersionRepository` 仍是项目角色正式关联的唯一事务边界。
- 没有修改前端文件、Prisma Schema、任务枚举、页面字段或确认动作。
