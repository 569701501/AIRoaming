---
doc_id: AIR-TASK-20260716-CREATIVE-P4-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: AI 创作 P4 代码与文档探索
---

# AI 创作 P4 分层修订发现

## 当前事实

- `shouldUpdateChapterDraft` 已能识别用户明确的当前章改写请求。
- `buildChapterEditingPrompt` 当前只要求尊重设定和返回完整 Markdown，没有把修订层、允许改动和保护字段说清楚。
- `rewriteChapterDraftWithAI` 使用宽松 `ensureChapterMarkdown`；不合格输出可能被包装而不是严格拒绝。
- DB 模式下 AI 改写通过 `ChapterScriptPending(operation=update_chapter_draft)` 展示，active pending 冲突会拒绝；用户仍需采用后进入 Working Copy。
- 页面会把当前编辑器最新文本放入 `context.sourceText`，包括尚未手动保存的修改。

## 决策

- 分层只在 Server 内部计算并进入 Prompt，不新增 AI 输出字段或页面选择器。
- 严格源稿可解析时执行字段级保护；legacy/手工非标准源稿只做 Prompt 保护和严格输出，不伪造可靠 Diff。
- 低层保护使用精确字段比较，语义事实保护仍依赖 Prompt 和用户采用确认，不引入不可靠相似度分数。
- 格式和 P4 质量共用一次模型修订预算。

## 风险

- 发展性和连续性修订允许的语义范围较宽，固定规则只能保护章序、项目基础字段和未请求角色名单。
- 用户用非常隐晦的表达要求改标题或换角色时，保守规则可能要求模型重写后仍失败；错误会保留原稿，不会静默落稿。
- 当前无完整前章正式来源，不能把 P4 完成表述为 P5 编辑连续性已完成。

## 最终结论

- P4 应是现有 A5 编辑链的内部执行约束，不是新的页面步骤或数据产物。
- 精确字段比较适合阻止章序、基础字段、角色名单、方向、结尾和场景结构的高置信越层；更细的语义质量仍由 Prompt 与用户采用门负责。
- 用户明确目标必须优先于保护默认值。标题可以按明确指令改变，但章序不能改变；该边界已由服务级测试锁定。
