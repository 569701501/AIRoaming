---
doc_id: AIR-TASK-A4-PROMPT-002
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent
source: 代码库探索
---

# 探索发现

## 真实生产入口

- `tryHandlePendingScriptOutline` 只在明确章节生成命令下进入 `createGenerateScriptFromOutlineToolResult`。
- Repository 在模型前构造 `AiChapterGenerationContext`，包含已确认大纲、目标/相邻章节卡、必要的上一章正式全文和 `sourceSetDigest`。
- 模型返回后执行 Shared strict parser 和 P3/P5 Validator，通过后才使用生成前的 `sourceSetDigest` 创建 AI pending。

## 严格输出与质量门

- `creative.chapter-draft/1.0` 与 `getChapterScriptFormatPrompt()` 定义六区块 Markdown、精确章序标题和场景字段。
- P3 只阻断高置信问题：无效剧情/动作、通用结束点、多场复制、章节卡四项承诺完全不可观察。
- P5 只在有完整前章正式全文时检查明显重置；第 1 章跳过。
- 格式修复不得改剧情；P3/P5 质量修复可完整重写薄弱场景，但必须保护章节卡、前章正式事实和精确标题。

## 历史死路径

- `createGenerateScriptFromSeedToolResult` 、`generateScriptFromSeedWithAI` 和 `buildScriptFromSeedPrompt` 之间仅相互调用，没有从当前编排入口进入的调用者。
- 该路径跳过项目大纲确认并直接写第 1 章，与 A+ 已确认流程冲突。
- Shared / Web / 迁移中的 `generate_script_from_seed` 还承载历史数据兼容，不能随私有死方法一起删除。

## 最终实现结论

- 主生成读取 `references/chapter-draft-prompt.md`，运行层只注入精确标题、Shared 格式、大纲、章节卡、前章正式全文和用户有效补充。
- P3/P5 质量失败读取 `repair-quality-failure.md`，格式失败读取 `repair-validation-failure.md`，两者仍共用原有一次总修复上限。
- 旧私有直出方法已删除，但 Shared / Web / 迁移的历史 `generate_script_from_seed` 兼容值保持不变。
- 来源卫生测试禁止 A4 稳定创作正文和修复正文回流 TypeScript，并验证真实 builder/service 明确接入 Skill。
