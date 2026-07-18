---
doc_id: AIR-TASK-20260718-STRUCTURE-PROMPT-HANDOFF
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 剧情结构 Prompt 归位实施结果
---

# Handoff

## 已完成

- 新增生产 Skill `structure-story-parse`。
- 对话剧情结构和持久 `story_parse` 使用同一个主模板与修复模板。
- 后台任务使用任务来源投影中的精确 ScriptVersion，不在运行时改读当前剧本或未冻结大纲。
- 模型只输出页面语义字段，后端转换为现有 `StoryDocumentV2`。
- 保留既有待确认预览、用户确认、正式 StoryVersion 和分镜解锁流程。

## 主要文件

- `apps/server/opencodeAI/skills/structure-story-parse/`
- `apps/server/src/dialogue/dialogue-prompt.util.ts`
- `apps/server/src/projects/persistent-task-worker.service.ts`
- `apps/server/src/projects/versioning/story-document-adapter.util.ts`
- `apps/server/src/projects/versioning/story-version.repository.ts`
- `apps/server/src/projects/persistent-task-worker.prompt.spec.ts`
- `apps/server/src/ai-runtime/opencode-prompt-source-hygiene.spec.ts`

## 明确未改

- 剧情结构页面与字段。
- 用户确认节点。
- Prisma Schema、任务类型和外部 API。
- StoryStructure / StoryDocument 下游消费协议。

## 后续边界

- 剧本创作与导入阶段的历史 Prompt 仍可按 ADR-0017 渐进迁移，但不得借此改页面或创建孤立 Skill。
- P6 语义 evaluator 仍保持独立 QA，不应自动回灌成结构生成硬门。
- 若未来希望持久任务使用项目大纲，必须先把精确 OutlineVersion 纳入 `sourceProjection`；不能直接读取运行时 current outline。
