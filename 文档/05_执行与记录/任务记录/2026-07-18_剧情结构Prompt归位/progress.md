---
doc_id: AIR-TASK-20260718-STRUCTURE-PROMPT-PROGRESS
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent
source: 当前任务执行记录
---

# 进度

- 2026-07-18：完成现有剧情结构两条运行路径、字段契约、质量检查与角色解析边界的探索。
- 2026-07-18：冻结本轮非目标，确认不改页面、数据库协议和用户确认流程。
- 2026-07-18：创建 `structure-story-parse` Skill，加入主模板、语义 JSON 示例、质量失败修复和格式失败修复 reference，并通过官方校验器。
- 2026-07-18：`buildStoryStructurePrompt` 改为动态事实装配器，对话路径继续使用原确认流程；持久 `story_parse` 改为读取任务冻结的精确 ScriptVersion，并复用相同 Skill、质量门和一次修复。
- 2026-07-18：新增 `story-document-adapter.util.ts`，把模型角色名/场景名引用转换为现有 `StoryDocumentV2`，正式项目角色仍由 Repository 事务解析。
- 2026-07-18：补充来源防回流、后台 Prompt 接线和 v1→v2 转换回归；同步 ADR、核心数据模型、生成任务协议和模块清单。

# 验证

- `quick_validate.py`：`structure-story-parse`、`storyboard-shot-generate`、`image-reference-generate`、`image-candidate-generate` 全部有效。
- 针对性 Vitest：5 个文件、26 项全部通过。
- 服务端 TypeScript 类型检查通过。
- 服务端构建通过，构建产物可读取 `structure-story-parse`。
- 服务端全量：124 个文件中 122 个通过，731/733 项通过；两个与本轮无关的固定 5 秒慢测在并发负载下超时。
- 两个超时项分别隔离重跑：迁移用例 1/1、备份用例 1/1 通过，耗时分别约 1.55 秒和 1.10 秒。
- `git diff --check` 通过。
- 未调用真实文本 Provider、图片 Provider 或其他付费媒体服务。
