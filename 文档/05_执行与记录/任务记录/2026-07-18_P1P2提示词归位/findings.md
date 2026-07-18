---
doc_id: AIR-TASK-P1P2-PROMPT-002
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent
source: 代码库探索
---

# 探索发现

## 真实生产入口

- A2 由 `ScriptDialogueService.generateInspirationSeedsWithAI` 调用 `buildInspirationSeedsPrompt`，后续经过 Shared 严格 JSON 解析与 `assertP1InspirationQuality`。
- A3 的直接题材和选中灵感分别调用 `buildScriptOutlineFromTopicPrompt` 与 `buildScriptOutlineFromSeedPrompt`，后续共用 `normalizeScriptOutlineWithOneRepair`。
- A2/A3 都使用同一 OpenCode 会话进行一次修复；第二次仍失败时不向用户交付不合格产物。

## 正式契约

- `creative.ideation/1.0`：顶层只有 `seeds`，恰好 3 项，每项只有 `title`/`genreTags`/`logline`/`keyConflict`/`visualHook`/`firstChapterDirection`。
- `creative.outline/1.0`：固定四段 Markdown，明确正整数章数，章节卡数量和章序必须完整匹配。
- 固定格式文本由 Shared 生成，它属于数据契约，不迁入 Skill 作为另一份独立事实源。

## 产品不变项

- P1 只给出 3 张灵感卡，不写入章节。
- P2 产出待确认的项目大纲，不直接生成章节。
- 大纲确认后，用户仍需在当前章节对话中明确输入“生成当前章节”才会进入 A4。
- 本轮不改页面展示或现有字段。

## 实施结论

- `script-inspiration-seeding/references/` 已成为 P1 生产方法、固定输出语义和一次修复指令的事实源。
- `script-outline-drafting/references/` 已成为 P2 公共方法、直接题材/选中灵感模式和一次修复指令的事实源。
- TypeScript 仅保留项目事实组装、当前用户输入、Shared 契约注入、Validator 和修复次数控制。
- 源码卫生测试阻止本轮已迁移的 P1/P2 稳定正文回流到 Prompt builder 或 Service。
