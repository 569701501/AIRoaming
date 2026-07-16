---
doc_id: AIR-TASK-20260716-SCRIPT-IMPORT-PRODUCTION-HANDOFF
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md、progress.md、测试与复核证据
---

# Handoff

## 交付结论

已有完整剧本 B1～B5 已接入真实 DB-only 生产链。用户上传或粘贴完整原稿后，系统保存不可变副本，生成观察性大纲和拆章候选；用户整本确认目录一次，系统建立全部章节并完成逐章整理/忠实度验证尝试；随后用户可自由切章、全文只读查看并逐章点击“确认章节”。确认后的正式 `ChapterScriptVersion(origin=import)` 直接进入现有 StoryStructure。

## 固定产品边界

- 不新增 ChapterPlan，不改变现有剧本或 StoryStructure 内容字段。
- 不提供导入草稿的手动修改、AI 重新整理、采用、丢弃或批量确认。
- 目录确认一次；章节仍逐章、任意顺序确认。
- 单章失败不回滚其他章；其他章节状态不阻断当前正式章进入剧情结构。
- AI 创作和已有剧本只在正式 `ChapterScriptVersion` 汇合。

## 关键实现入口

- 严格契约：`packages/shared/src/script-workflow-contract.ts`
- 来源与状态事实源：`apps/server/src/projects/script-workflow-source.repository.ts`
- B1～B3 对话编排：`apps/server/src/dialogue/script-dialogue.service.ts`
- B4 批次编排：`apps/server/src/dialogue/script-import-batch.service.ts`
- B5 专用确认：`apps/server/src/projects/projects.controller.ts`
- 页面结果卡与只读确认：`ProjectDialoguePanel.vue`、`ScriptDocumentEditor.vue`、`workbench-store.ts`
- 公开 Skill：`apps/server/opencodeAI/skills/script-import-normalize/SKILL.md`

## 验证摘要

- Shared：26 files / 152 tests passed。
- Server：100 files / 590 tests passed（single fork）。
- E2E env：34/34；prepare：3/3。
- DB-only Chromium：AI 显式单章 1/1；已有剧本 B1～B5 1/1。
- 三包 typecheck、E2E typecheck、三包 build、Skill 校验和 `git diff --check` 通过。

## 已知增强项

- 当前批次在目录确认请求内同步执行；后续可升级为后台断点续跑 worker。
- 失败项已独立持久化，但尚未提供用户可见的重试/继续入口。
- 超出单次模型上下文的超长稿尚需分层分析；当前实现不主动截断，并在失败时保留真实失败状态。
