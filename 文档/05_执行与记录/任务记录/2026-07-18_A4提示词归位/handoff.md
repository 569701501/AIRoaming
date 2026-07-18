---
doc_id: AIR-TASK-A4-PROMPT-004
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 本次实现与验证结果
---

# Handoff

## 已完成

- A4 生产模板、P3/P5 质量重写和 strict format 修复已归入 `script-chapter-drafting/references/`。
- `buildScriptFromOutlinePrompt` 与 `generateScriptFromOutlineWithAI` 的一次修复路径真实读取 Skill 资产。
- 不可达的旧“选中灵感直接写第 1 章”私有 Prompt 与方法已删除，历史协议/DTO/迁移兼容值未删除。
- Skill 自述、OpenCodeAI 目录说明、ADR 和来源卫生测试已同步。

## 保持不变

- 页面字段和六区块章节 Markdown。
- 只有用户明确要求“生成当前章节”才触发；章节切换、裸“继续”和批量生成不触发。
- 第 N 章依赖第 N-1 章正式正文、`sourceSetDigest` 密封、一次总修复上限和 A5 采用/丢弃/完成流程。
- 数据库 Schema、API、任务协议和付费调用规则。

## 验证

- `quick_validate.py script-chapter-drafting`：通过。
- 定向回归：4 files / 58 tests 通过。
- Server typecheck：通过。
- Server build：通过。
- Server 全量：124 files / 737 tests 通过。

## 后续范围

- `script-chapter-editing` 和 `script-import-normalize` 的历史 Prompt 仍需按 ADR-0017 渐进迁移。
- 本轮没有调用真实文本模型，因此确认的是接线、边界、格式和固定质量门，不宣称实际文案质量产生新 A/B 结论。
