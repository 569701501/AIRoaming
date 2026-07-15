---
doc_id: AIR-TASK-20260715-SCRIPT-SOURCE-STATE-HANDOFF
status: ready
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: 实施包 2 完成结果
---

# Handoff：双流程实施包 2 → 后续接线

## 已完成

- Shared 严格输出契约之外，来源与状态基础已经可执行。
- 0017、Prisma、运行时 ledger、项目 purge、DTO 和下游 pending 门禁已闭环。
- AI pending 与 import pending 使用同一正文格式、不同来源策略，并在正式 `ChapterScriptVersion` 汇合。

## 下一步唯一建议

先做 AI 创作路线接线，再做已有剧本路线接线：

1. A2/A3/A4/A5 动态 Prompt 与现有五个 Skill 对齐。
2. 只有用户在当前章对话中明确要求生成时调用 `createAiChapterPending`；切章不得触发。
3. B1 保存原稿，B2 保存分析候选，B3 一次确认目录，B4 逐章 materialize/verify，B5 调用 `confirmImportPending`。
4. 页面只补现有正文区域内的完整只读查看、状态和动作差异，不新增章节内容字段。

## 禁止回退

- 不恢复 DB-only 已禁用的整稿覆盖入口。
- 不让 import pending 进入采用、丢弃、手动编辑或 AI 重新整理。
- 不让模型生成数据库 ID、决定目录正式确认或自行放行忠实度。
- 不把 `ScriptChapterMap` 当 `ChapterPlan`，不把观察性大纲填入 StoryStructure。

## 入口

- 正式架构契约：`文档/02_架构与契约/2026-07-16_双流程来源与状态契约.md`
- 设计与 Prompt 蓝图：`文档/05_执行与记录/任务记录/2026-07-15_创作与导入双流程/`
- Shared 状态契约：`packages/shared/src/script-workflow-state.ts`
- 服务端仓储：`apps/server/src/projects/script-workflow-source.repository.ts`
