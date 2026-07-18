---
doc_id: AIR-TASK-P1P2-PROMPT-HANDOFF
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: P1/P2 Prompt 归位实施结果
---

# Handoff

## 已完成

- P1 灵感生产模板、结构示例、质量重写和格式修复已归入 `script-inspiration-seeding`。
- P2 大纲公共模板、直接题材/选中灵感模式、质量重写和格式修复已归入 `script-outline-drafting`。
- A2/A3 真实对话路径和一次修复路径均读取上述 Skill references。
- Shared 严格契约、P1/P2 固定质量门、只修复一次与第二次失败停止仍由程序执行。

## 主要文件

- `apps/server/opencodeAI/skills/script-inspiration-seeding/`
- `apps/server/opencodeAI/skills/script-outline-drafting/`
- `apps/server/src/dialogue/dialogue-prompt.util.ts`
- `apps/server/src/dialogue/script-dialogue.service.ts`
- `apps/server/src/dialogue/dialogue-creative-prompt.spec.ts`
- `apps/server/src/ai-runtime/opencode-prompt-source-hygiene.spec.ts`

## 明确未改

- 灵感候选数量与六字段。
- 项目大纲四区块、章数和轻量章节卡字段。
- 页面展示、用户确认节点、数据库 Schema 和外部 API。
- 大纲确认后的显式单章生成触发规则。

## 后续边界

- 下一批可以按同样方式审查 `script-chapter-drafting`、`script-chapter-editing` 和 `script-import-normalize`，但必须逐条保持用户已确认的 A4/A5/B1～B5 流程。
- 不要为 Prompt 拆分新增公开 Skill，不要把 Shared 格式契约复制成第二份可编辑真相。
