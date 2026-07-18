---
doc_id: AIR-TASK-A4-PROMPT-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent
source: ADR-0017 与 A4 真实章节生成路径
---

# A4 提示词归位任务计划

## 目标

将 A4 章节起草的生产 Prompt、P3/P5 质量重写与 strict format 修复归入已有 `script-chapter-drafting` Skill，并让真实对话路径读取这些资产。

## 非目标

- 不改页面字段、章节 Markdown 格式、数据库 Schema、API 或任务协议。
- 不改“用户明确生成当前章节”的触发规则。
- 不改前章正式版门禁、来源密封、AI pending 或 A5 采用/丢弃/完成流程。
- 不删除 Shared 和迁移中的历史 `generate_script_from_seed` 枚举。
- 不调用真实文本模型或付费媒体服务。

## 阶段

| 阶段 | 工作 | 退出标准 |
| --- | --- | --- |
| 1. 事实盘点 | 对齐 A4 生产入口、strict parser、P3/P5 Validator、修复路径和历史死代码 | 已完成 |
| 2. Skill 资产 | 新增生产模板、P3/P5 重写、格式修复与 `agents/openai.yaml` | 已完成，Skill 校验通过 |
| 3. 真实接线 | A4 builder 与一次修复路径读取 Skill；移除不可达的旧直出章节 Prompt | 已完成，用户路径与数据流不变 |
| 4. 验证 | Skill 校验、定向回归、来源卫生、类型、构建和全量测试 | 已完成，无新失败 |
| 5. 留痕 | 更新 ADR、完成记录、Handoff、Scrutiny 和 Runtime Review、长期记忆 | 已完成 |

## 强制验收标准

1. A4 生产 Prompt 来自 `script-chapter-drafting/references/`。
2. P3/P5 质量失败和 strict format 失败使用两份语义不同的 Skill 修复合同，但共用一次总上限。
3. 目标章节卡、相邻卡、上一章正式全文、已确认大纲和用户有效补充完整注入。
4. Shared strict parser 和 `assertP3P5ChapterDraftQuality` 仍是最终放行依据。
5. 不可达旧“选灵感直接写第 1 章”Prompt 不再留在 TypeScript，历史数据枚举仍保留。
6. 页面、六区块字段、确认门、A5 和付费调用规则不变。

## 风险与回滚

- 风险：模板漏注入密封来源、过度强调场景契约导致模型输出诊断字段、格式修复改写剧情。
- 控制：现有 strict parser、P3/P5 Validator、一次修复上限、定向测试和来源卫生测试。
- 回滚：本轮不改数据或协议；如需回滚，恢复 A4 builder 和对应 Skill 资产即可。
