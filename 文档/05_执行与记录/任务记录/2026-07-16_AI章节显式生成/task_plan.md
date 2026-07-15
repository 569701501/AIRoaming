---
doc_id: AIR-TASK-20260716-AI-CHAPTER-EXPLICIT-GENERATE
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: A+双流程用户决策、双流程共享输出契约、双流程来源与状态契约
---

# 任务目标

完成 AI 创作路线的当前章节显式生成闭环：用户必须在当前章节对话中明确提出生成要求，系统才能读取确认的项目大纲/章节卡、必要的前章正式正文和连续性上下文，生成可采用或丢弃的 AI pending。

# 强制边界

- 切换章节只改变当前查看和对话作用域，不触发生成。
- 页面现有展示字段不变。
- 不引入 ChapterPlan，使用项目大纲中已确认的轻量章节卡。
- 目标章已有正式版、非空 Working Copy 或 active pending 时不允许再生成。
- 第 N 章生成时，N>1 必须读取第 N-1 章当前正式正文；缺失时阻断。
- AI pending 仍走“查看 → 采用到 Working Copy 或丢弃 → 编辑 → 完成本章”，不直接变正式版。

# 阶段

1. 事实源与路径盘点。
2. Prompt Contract 与对话意图契约。
3. 运行时、工具与仓储接线。
4. 单元/集成/用户路径验证。
5. 静态复核、运行复核、留痕和提交。

# 退出标准

- 只有明确生成意图可以创建 AI pending。
- 章节卡、前章正文和项目大纲与 pending 的密封来源对得上。
- 切换章节不会生成 pending。
- 采用、丢弃、完成本章的既有语义保持。
- Shared、Server、typecheck/build 及针对性运行验证通过。
