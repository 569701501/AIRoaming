---
doc_id: AIR-TASK-DB-BOOT-CHAPTER-RUNTIME-001
status: passed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 运行中 API、真实模型文本结果、浏览器页面
---

# 运行与用户路径复核

## 结论

`passed`

标准 DB-only 实例、两个迁移项目和一次章节文本生成均已在真实运行路径验证；A5 的用户确认门未被越过，且没有调用图片服务。

## 运行检查

- `/api/health` 返回 `status=ok`。
- `/api/projects` 返回 2 个项目：`测试`、`Grok文本回归-0718`，各 1 章。
- `/api/ai-runtime/models` 默认模型为 `xai/grok-4.5`。
- 4310、5173、4396 均正常监听。

## 真实文本路径

- 项目：`测试`。
- 操作：用户明确的 `生成当前章节`。
- Skill：`script-chapter-drafting`。
- 模型：`xai/grok-4.5`。
- 结果：成功生成第 1 章《杀令入棺》，保存为来源密封的 `ai` pending。
- Pending：约 4033 字，`operation=generate_script_from_outline`。
- 正式边界：正式正文长度 0、`currentScriptVersionId=null`，未采用、未完成本章。

## 页面检查

- 页面显示完整待确认草稿和“AI 草稿待确认”。
- 页面提供“采用草稿”和“丢弃”。
- “保存草稿”和“完成本章”仍为禁用状态。
- 浏览器 console error/warn 均为 0。
- 截图：`evidence/2026-07-18_DB-only章节待确认草稿.png`。

## 零图片检查

- GenerationTask 图片任务：0。
- Candidate：0。
- Asset：0。
- 未调用任何图片生成接口或 Provider。
