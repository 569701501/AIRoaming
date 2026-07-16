---
doc_id: AIR-TASK-20260716-SCRIPT-P6-FINAL-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A+ 双流程、五个剧本 Skill 与 P1～P6 首轮生产接线
---

# 双流程 P6 总验收任务计划

## 目标

对 AI 创作和已有剧本两条路线进行最后一轮跨层一致性验收，证明 5 个公开 Skill、7 个模型阶段、生产意图、动态 Prompt、严格输出 parser 和用户确认门没有断层。

## 非目标

- 不新增页面、输出字段、数据库模型或确认节点。
- 不建设 PromptVersion、EvalRun 或第三方评测平台。
- 不调用真实外部模型，不把关键词规则当作艺术质量总分。
- 不重新引入自动切章、批量生成、手动整理或 AI 重新整理导入章节。
- 不为已有分散测试复制第二套业务实现。

## 冻结矩阵

| 公开 Skill | 模型阶段 | 用户或系统触发 |
| --- | --- | --- |
| `script-inspiration-seeding` | `creative.ideation` | 用户明确找灵感；明确题材写大纲不进入灵感候选 |
| `script-outline-drafting` | `creative.outline` | 选中灵感或直接给明确题材；确认大纲不重新调用模型 |
| `script-chapter-drafting` | `creative.chapter-draft` | 当前章明确生成；切章、裸继续和批量请求不触发 |
| `script-chapter-editing` | `creative.chapter-edit` | 明确改写；评价、建议和无正文不触发 |
| `script-import-normalize` | `import.analyze` | 附件、长稿或明确导入；普通短创作请求不触发 |
| `script-import-normalize` | `import.materialize` | 拆章目录整体确认后由批次触发，不由普通对话直接触发 |
| `script-import-normalize` | `import.verify` | 每章 materialize 严格通过后由批次自动触发，不接受模型自报 ready |

## 阶段

| 阶段 | 角色 | 内容 | 状态 |
| --- | --- | --- | --- |
| F1 | Orchestrator | 核对事实源、五个 Skill、七阶段 Prompt/parser 和现有测试 | completed |
| F2 | Worker | 增加集中式 P6 触发与契约矩阵，修正文档不一致 | completed |
| F3 | Worker | 聚焦、类型、构建与两条 DB-only 用户路径验证 | completed |
| F4 | Scrutiny Review | 静态复核跨层映射、重复测试和夸大表述 | completed |
| F5 | Runtime/User Review | 复核 AI 创作与已有剧本页面真实路径 | completed |
| F6 | Orchestrator | 完成记录、记忆和提交 | completed |

## 验收标准

- 5 个公开 Skill 与 7 个模型阶段数量、名称和职责一致。
- 每个公开触发入口都有正例和反例；materialize/verify 明确为系统阶段，不伪造成用户对话 Skill。
- 七阶段 Shared fixture 继续由同一严格 parser 接受正例、拒绝反例。
- 动态 Prompt 包含对应 Skill 的核心边界，模型输出不要求数据库 ID。
- AI 创作和已有剧本 DB-only Chromium 路径均通过。
- 无页面、Schema、章节 Markdown 和用户流程变化。

## 退出标准

- F1～F6 完成。
- Handoff、Scrutiny Review、Runtime/User Review 有明确结论。
- 正式测试文档、会话记忆和长期记忆同步。
- 形成独立提交且工作区清洁。
