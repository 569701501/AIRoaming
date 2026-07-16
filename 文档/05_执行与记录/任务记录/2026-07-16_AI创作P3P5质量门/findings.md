---
doc_id: AIR-TASK-20260716-CREATIVE-P3-P5-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: AI 创作 P3/P5 代码与文档探索
---

# AI 创作 P3/P5 质量门发现

## 当前事实

- `buildScriptFromOutlinePrompt` 已把目标章节卡、相邻章节卡、完整上一章正式正文和项目大纲注入 A4 Prompt。
- `readAiChapterGenerationContext` 对第 N 章强制读取第 N-1 章当前正式 `ChapterScriptVersion`，并把其 ID/digest 纳入 AI pending 来源集合。
- `createAiChapterPending` 使用生成前的 `sourceSetDigest` 再校验当前来源，上一章变化时拒绝落稿。
- `parseChapterScriptMarkdownV1` 已保证每个场景九个字段非空，但允许“无”、通用结束点或多场复制；也不判断顶部方向是否在正文实现。
- `script-chapter-editing` 目前只拿当前草稿，不拿完整前章事实；本轮不能宣称把 P5 编辑链也完成。

## 决策

- P5 分为来源完整性和内容承接两层：前者已有强门禁，本轮只为 A4 补后一层明显重置检查。
- 不在 Shared parser 中放创作启发式；继续放在 Server 内部 evaluator，保持格式协议稳定。
- 不调用额外评分模型；沿用首轮生成 + 最多一次定向重写，避免新增固定成本和用户步骤。

## 风险

- 中文可合理改写同一事实，短语交集必须保守；没有足够稳定锚点时应跳过 P5 检查。
- 角色姓名可能让完全无关内容假通过，因此 P5 只能作为明显重置保护，不代表完整连续性证明。
- 安静场景可能没有对白或旁白，P3 不能强制所有表达通道非空；重点检查剧情描写、动作和退出变化。

## 最终结论

- 高置信 evaluator 保留在 Server 创作编排层，Shared 严格 parser 继续只定义格式协议。
- 章节卡可观察性和前章承接采用保守中文语义短语交集，并排除主要角色姓名；命中代表最低锚点存在，不代表完整艺术评价。
- A4 首轮输出无论格式还是质量失败都只剩一次修订机会，避免隐性第三次调用。
- `script-chapter-editing` 未获得完整前章来源，本轮明确不把它计入 P5 完成范围。
