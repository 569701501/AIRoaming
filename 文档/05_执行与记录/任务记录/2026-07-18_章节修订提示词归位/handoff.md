---
doc_id: AIR-TASK-CHAPTER-EDIT-PROMPT-004
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 本次实现与验证结果
---

# Handoff

## 已完成

- 章节修订主模板、四层 P4 合同、有/无前章规则和 P4/P5/格式三类修复已归入 `script-chapter-editing/references/`。
- `buildChapterEditingPrompt` 和 `rewriteChapterDraftWithAI` 的一次修复路径真实读取 Skill 资产。
- TypeScript 中给模型看的层级合同与修复正文已移除，分类、标签和固定 Validator 保留。
- Skill 自述、发现元数据、OpenCodeAI 说明、ADR 和来源卫生测试已同步。

## 保持不变

- 显式章节修订触发、当前编辑器草稿保护基线和最高层分类顺序。
- 六区块章节 Markdown、P4/P5 Validator、一次总修复上限和 AI pending。
- 前章正式版本来源、写入事务围栏、A5 采用/丢弃/完成流程。
- 页面、数据库 Schema、API、任务协议和付费调用规则。

## 验证

- Skill 校验：通过。
- 定向：5 files / 65 tests 通过。
- Server typecheck、build：通过。
- Server 全量：124 files / 738 tests 通过。

## 后续范围

- ADR-0017 当前只剩 `script-import-normalize` 的历史生产 Prompt 需要迁移。
- 本轮没有真实模型调用，不形成新的修订文案质量 A/B 结论。
