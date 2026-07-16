---
doc_id: AIR-TASK-20260716-CREATIVE-P3-P5-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 外部创作 Skill 提示词调研 P3/P5 与 A+ 双流程契约
---

# AI 创作 P3/P5 质量门任务计划

## 目标

保持现有 A4 用户流程和章节 Markdown 不变，把 P3 场景契约与 P5 连续性从 Prompt 约束补强为“真实来源门禁 + 高置信结果检查 + 一次定向重写”。

## 非目标

- 不增加页面字段、质量分数或确认节点。
- 不新增 ScenePlan、ContinuityLedger 或数据库 Schema。
- 不要求每场戏套固定三幕或强制悬崖钩子。
- 不宣称检查了运行时没有提供的所有前后章节。
- 不改 A5、导入 B 路线、StoryStructure 或章节编辑 P4。

## 实施边界

- P3 固定触发只覆盖：剧情描写/人物动作缺失、场景结束点空泛、多个场景复制同一有效内容、章节卡目标/冲突/转折/钩子在正文完全不可观察。
- P5 继续以“上一章当前正式版本 + 完整正文注入 + 精确版本摘要密封”为事实基础；第 2 章以后若生成稿与上一章结尾没有任何可识别连续性锚点，视为明显重置。
- 语义可观察性只使用保守的规范化短语交集；证据不足时跳过而不是猜测失败。
- 首轮格式或质量失败后最多再调用模型一次；格式失败只修格式，质量失败可重写薄弱场景，但保持章节卡、正式前章事实和固定格式。

## 阶段

| 阶段 | 角色 | 内容 | 状态 |
| --- | --- | --- | --- |
| C1 | Orchestrator | 探索 P3/P5 Prompt、parser、正式前章来源和现有测试 | completed |
| C2 | Worker | 先补 P3/P5 evaluator 与固定反例测试 | completed |
| C3 | Worker | A4 接入一次定向重写并强化 Prompt | completed |
| C4 | Worker | 同步 `script-chapter-drafting` Skill 并校验 | completed |
| C5 | Worker | 聚焦、全量、类型、构建和 DB 用户路径回归 | completed |
| C6 | Scrutiny Review | 静态复核误杀、来源边界和一次修订上限 | completed |
| C7 | Runtime/User Review | 复核 A3～A5 页面路径保持不变 | completed |
| C8 | Orchestrator | 正式文档、记忆、完成记录与提交 | completed |

## 强制验收标准

- 格式合法但场景内容为“无”、结束点空泛或多场复制时，P3 触发一次质量重写。
- 章节卡的目标、冲突、关键转折和结尾钩子不能只出现在顶部字段，正文至少要出现可识别承诺锚点。
- 第 N 章继续绑定第 N-1 章完整正式正文；明显换人物、换事件且不承接任何结尾锚点时，P5 触发。
- 第 1 章不执行前章连续性检查；缺乏稳定语义证据时不误判。
- 第二次仍失败时不创建 AI pending。
- 页面、章节 Markdown、数据库和用户步骤不变。

## 退出标准

- C1～C8 完成。
- 双 Review 有明确结论。
- 正式契约、测试体系、完成记录、会话记忆与长期记忆同步。
- 提交后工作区清洁。
