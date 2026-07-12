---
doc_id: AIR-G3-M3-A2-FIND-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: A2 代码与临时 SQLite 集成测试
---

# 发现

- Project/Chapter 的目标 ID 不复用旧 workspace ID，而是使用 `entityType + sourceKey` 的稳定摘要；关系通过目标 ID 建立。
- Project/Chapter 的 `ImportedEntitySource` 使用 `partial`，因为下游 Script/Story/Storyboard 等证据尚未导入。
- 决议缺失时只跳过对应 Project，run 为 blocked；同一批中其他无 blocker 项目仍可 shadow。
- 所有可导入项目在同一个 Prisma transaction 中写入；章节 unique 约束失败会回滚 Project、Chapter 和 source rows。

# 风险

- A2 尚未写入 ScriptVersion/Outline，因此导入章节的 script 仅保留为 working copy。
- `db:import --kind final` 明确 fail-closed，不能用 A2 结果执行激活。
