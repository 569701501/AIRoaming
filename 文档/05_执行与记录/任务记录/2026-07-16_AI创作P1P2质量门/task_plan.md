---
doc_id: AIR-TASK-20260716-CREATIVE-P1-P2-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 外部创作 Skill 提示词调研 P1/P2 与 A+ 双流程契约
---

# AI 创作 P1/P2 质量门任务计划

## 目标

在不改变现有灵感 JSON、大纲 Markdown、页面字段和确认流程的前提下，把 P1 灵感质量门槛与 P2 因果大纲/结局方向从提示词建议升级为生产运行时可触发的内部质量门。

## 非目标

- 不新增灵感或大纲展示字段。
- 不增加用户确认节点。
- 不强制三幕式、英雄之旅或固定节拍表。
- 不用关键词规则冒充完整艺术质量判断。
- 不修改章节生成 A4/A5、导入 B1～B5、StoryStructure 或数据库 Schema。

## 实施边界

- P1 固定触发只识别可确定的伪差异：不同标题但 `logline/keyConflict/visualHook/firstChapterDirection` 重复。
- P2 固定触发只识别可确定的结构风险：缺少转折/因果连接、结局只是空泛标签、章节卡核心字段重复、终章仍继续桥接。
- 首次输出未通过格式门或质量门时，只允许一次定向修订；第二次仍失败则明确失败，不保存候选。
- 格式错误只能修格式；质量错误允许重写薄弱语义，但保持用户题材、选中方向和对外格式。

## 阶段

| 阶段 | 角色 | 内容 | 状态 |
| --- | --- | --- | --- |
| Q1 | Orchestrator | 探索生产 Prompt、严格 parser、Skill 与当前测试 | completed |
| Q2 | Worker | 先补 P1/P2 evaluator 与触发测试 | completed |
| Q3 | Worker | 接入一次定向修订并强化生产 Prompt | completed |
| Q4 | Worker | 同步两个 Skill 并运行 Skill 校验 | completed |
| Q5 | Worker | 聚焦、全量、类型、构建与必要用户路径回归 | completed |
| Q6 | Scrutiny Review | 只读复核误杀风险、字段边界与证据 | completed |
| Q7 | Runtime/User Review | 复核真实对话编排是否保持原页面流程 | completed |
| Q8 | Orchestrator | 文档、记忆、完成记录和提交 | completed |

## 强制验收标准

- 三个候选只换标题但复用同一语义内容时，P1 失败并触发一次质量重做。
- 格式合法但缺少因果推进或使用空泛结局的大纲，P2 失败并触发一次质量重做。
- 合格输出仍使用原有 6 字段灵感 JSON 和四区块大纲 Markdown。
- 第二次仍不合格时，不创建待选灵感或待确认大纲。
- 两个 Skill 与生产 Prompt 使用相同 P1/P2 术语并通过 quick validation。
- 全量测试、类型检查和构建通过；页面流程与字段无变化。

## 退出标准

- Q1～Q8 完成。
- 双 Review 有明确结论。
- 正式契约、测试体系、完成记录、会话记忆和长期记忆同步。
- 提交后工作区清洁。

## 完成结论

Q1～Q8 已完成。P1/P2 已进入生产运行时质量门，没有改变现有输出格式、数据库和页面流程；静态复核与真实 DB 用户路径复核均通过。
