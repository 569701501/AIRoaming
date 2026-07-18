---
doc_id: AIR-TASK-20260718-PROMPT-RESIDUE-FIX-REVIEW
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: Prompt 残留修复静态复核
---

# Scrutiny Review

## 结论

**通过。**

复核报告列出的 4 类生产残留已经关闭，ADR-0017 对三个 Skill 的单一事实源边界成立。

## 证据

| 检查项 | 结论 |
| --- | --- |
| 持久 `shot_generate` | 复用完整分镜 Skill、正式剧本对白来源、固定质量门、引用映射和一次修复 |
| provider 参考图职责 | 由 `provider-profiles.json` 编译，provider service 无创作正文副本 |
| 分镜 JSON 示例 | generate/revise 示例位于分镜 Skill references |
| 画风/版式词汇 | 位于参考图 Skill defaults；Shared 只保留展示定义 |
| 防回流 | 新增源代码检查，并断言两条生产路径调用 Skill 编译入口 |
| fail-closed | 新增 reference 缺失或 Profile 缺失时抛错，不回退代码模板 |

## 保留范围

- P6 分镜语义 evaluator 仍是离线 QA Prompt。
- 剧本、导入和剧情结构旧 Prompt 仍按 ADR-0017 计划渐进迁移。
- 这两项不是本次失败项，不影响三个已迁移生产 Skill 的通过结论。
