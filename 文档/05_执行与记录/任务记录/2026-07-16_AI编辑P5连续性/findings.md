---
doc_id: AIR-TASK-20260716-EDIT-P5-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: AI 编辑 P5 代码与契约探索
---

# AI 编辑 P5 连续性发现

## 当前事实

- A4 的上一章来源由 `ScriptWorkflowSourceRepository` 从 `Chapter.currentScriptVersion` 读取，并在生成 pending 时用 `sourceSetDigest` 再校验。
- A5 编辑输入是页面当前编辑器最新正文，允许尚未保存的用户修改；不能要求它必须等于数据库 Working Copy 摘要。
- 通用 `createAiPendingSuggestion` 当前不写 `kind=ai` 来源投影，revision pending 仍按 legacy 兼容语义保存。
- `ChapterScriptRevision.targetWorkingDigest` 保存的是生成结果摘要，不是输入草稿摘要，不能拿来伪装 base draft 来源。

## 决策

- 新增只读编辑连续性上下文，不复用 A4 的空章/无 pending 门禁。
- 只把上一章当前正式版本作为 P5 事实源；当前编辑器正文继续由请求提供并作为 P4/P5 比较基线。
- DB 写入围栏使用上一章 ID、正式版本 ID 和 source digest 三项精确比较；不新增字段。
- P5 固定规则只拦“已有承接被改没”，避免低层润色被迫修复源稿本来就存在的问题。
- file-mode 无数据库正式版本契约，继续只执行 P4，不宣称 P5。

## 风险

- revision pending 仍缺少持久 base draft/previous script 来源投影；这是追溯能力缺口，不影响本轮运行时 P5 判断，但必须在文档中显式保留。
- 高置信锚点仍只使用已有语义 bigram 规则，不能覆盖人物知识、伤势、道具数量等完整世界状态。

## 运行时发现

- 页面会轮询对话线程状态；非流式 `sendMessage` 原先没有登记到活动消息集合，轮询会把生成中的消息结算为 `interrupted`，随后模型完成写回又触发数据库约束失败。
- 流式与非流式对话现在共用活动消息保护：创建 turn 后登记、完成或失败后在 `finally` 移除。精确数据库回归证明轮询不会再提前结算当前非流式消息。

## 最终结论

- DB-only AI 编辑链已具备上一章正式来源、Prompt 注入、P5 不退化校验和写入围栏。
- 这不是完整世界状态连续性，也不是持久 revision provenance；两项均不得在产品文案或验收中夸大。
