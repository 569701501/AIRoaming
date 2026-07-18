---
doc_id: AIR-TASK-P1P2-PROMPT-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent
source: ADR-0017 与 A2/A3 真实对话路径
---

# P1/P2 提示词归位任务计划

## 目标

将 P1 灵感和 P2 项目大纲的稳定生产 Prompt、示例与一次修复 Prompt 归入现有 OpenCodeAI Skill，并使真实对话路径读取这些资产。

## 非目标

- 不新增公开 Skill。
- 不改页面字段、数据库结构、任务协议或用户确认流程。
- 不改 P1 恰好 3 个候选与固定六字段。
- 不改 P2 固定 Markdown 格式、明确章数和轻量章节卡。
- 不引用付费模型或图片服务。

## 阶段

| 阶段 | 工作 | 退出标准 |
| --- | --- | --- |
| 1. 事实盘点 | 对齐 Skill、Prompt builder、Shared 契约、质量门、修复路径与测试 | 确定真实入口及不可改变项 |
| 2. Skill 资产 | 新增生产模板、模式模板、示例、修复模板和 `agents/openai.yaml` | 两个 Skill 可独立校验，且没有相互冲突的重复事实源 |
| 3. 真实接线 | Prompt builder 和一次修复路径改为读取 Skill | 真实 A2/A3 仍保持原流程和固定校验 |
| 4. 验证 | 执行定向测试、源卫生测试、完整测试与构建 | 没有新失败，保留所有产品不变项 |
| 5. 留痕与交付 | 更新 ADR、完成记录、Handoff、静态与运行复核、长期记忆 | 文档与实现一致 |

## 强制验收标准

1. A2 生产 Prompt 来自 `script-inspiration-seeding/references/`。
2. A3 的直接题材、选中灵感和修改待确认大纲均使用 `script-outline-drafting/references/`。
3. P1/P2 格式失败只修格式，质量失败完整定向重写，最多一次。
4. Shared 契约与代码 Validator 仍是最终放行依据，不相信模型自评。
5. 页面、字段、数据库、确认门和章节生成触发方式不变。
6. TypeScript 不再保存本轮已迁移的稳定 Prompt 正文。

## 风险与回滚

- 风险：模板占位符遗漏、模式组合后语义变化、修复 Prompt 无意改变用户创意。
- 控制：严格模板变量校验、现有回归测试、来源卫生测试和一次修复上限。
- 回滚：本轮不改数据或协议；如需回滚，仅恢复 Prompt builder 与 Skill 资产即可。
