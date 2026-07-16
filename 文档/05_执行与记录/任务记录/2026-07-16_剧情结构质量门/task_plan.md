---
doc_id: AIR-TASK-20260716-STORY-STRUCTURE-QUALITY
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A+ 双流程完成状态、现有 StoryStructure 运行时与用户继续指令
---

# 剧情结构质量门任务计划

## 目标

在 AI 创作和已有剧本导入汇合后的共同阶段，增强“正式章节正文 → 剧情结构预览”的 Prompt 与固定校验，使结构结果忠实覆盖正文、可供分镜使用，并保持现有页面字段和 StoryStructure payload 不变。

## 非目标

- 不修改 A1～A5、B1～B5 用户流程。
- 不新增 ChapterPlan、页面字段、数据库字段、DTO 或用户确认节点。
- 不增加新的公开剧本 Skill。
- 不修改分镜、候选图、排版或素材包流程。
- 不用关键词规则冒充完整艺术质量评价。

## 阶段

1. 审查现有 Prompt、解析器、服务编排、来源绑定和测试。
2. 用固定正反样例明确高置信错误边界。
3. 实施 Prompt、自检/校验和最多一次定向修复。
4. 运行定向、全量、类型、构建及必要运行路径验证。
5. 完成 Scrutiny Review、Runtime/User Review 和文档留痕。

## 验收标准

- AI 仍输出当前 `StoryStructureJson`，页面展示不变。
- 结构只能描述当前正式章节正文，不得从项目大纲补写正文未发生事实。
- 角色、场景和 beat 的引用关系有效；关键正文事件不能全部遗漏。
- 明显占位、空泛结构或无正文证据的关键事件会被拦截或定向修复。
- 失败不形成待确认结构；确认链和版本来源契约不变。
- 定向测试、Server 全量、类型检查和构建通过。

## 退出标准

- Worker 阶段全部完成并记录证据。
- Scrutiny Review 无 P0/P1 问题。
- Runtime/User Review 已执行，或明确记录为何本轮不需要改动页面路径。
- 完成记录、测试事实源、会话记忆和长期记忆已同步。

## 当前角色边界

- Orchestrator：本文件、范围和阶段门禁，不写功能代码。
- Worker：只修改剧情结构 Prompt、内部校验、服务编排和定向测试。
- Scrutiny Review：只读检查改动与证据。
- Runtime/User Review：验证现有页面路径没有行为回归；无新 UI。
