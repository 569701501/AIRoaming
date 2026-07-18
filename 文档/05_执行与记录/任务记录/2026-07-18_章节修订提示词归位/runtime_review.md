---
doc_id: AIR-TASK-CHAPTER-EDIT-PROMPT-006
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 离线运行复核
---

# Runtime / User Review

## 结论

`PASS_OFFLINE`

## 运行证据

- 真实 builder 能从 Skill 编译四种层级主修订 Prompt，并区分有/无前章正式来源。
- P4、P5 和格式失败分别编译三种修复合同，仍由同一 Service 只执行一次修复。
- Service 回归覆盖越层修复、二次失败停止、格式修复、明确改标题、P5 恢复、第一章跳过、缺前章阻断和版本变化拒绝写入。
- 定向 65/65；Server 全量 738/738；类型检查和构建通过。

## 不适用与未执行

- 本轮无 UI、字段或用户操作变化，不重复浏览器页面测试。
- 未调用真实文本模型或图片服务；付费调用为 0，不能据此宣称实际修订文案质量提升。
