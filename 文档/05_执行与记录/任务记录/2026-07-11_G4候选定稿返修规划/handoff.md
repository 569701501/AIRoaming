---
doc_id: AIR-TASK-G4-HANDOFF-001
status: complete
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G4 规划交接
---

# G4 规划交接

## 已完成

- 主方案：`2026-07-11_G4候选定稿修订与返修开发方案.md`。
- 契约字典：`2026-07-11_G4候选定稿与影响预览契约字典.md`。
- 验收清单：`G4候选定稿返修验收清单.md`。
- 上位数据模型、任务/素材契约、模块边界、UI 现状、索引和记忆已同步。

## 当前状态

- 三份 G4 正式规划文档已于 2026-07-11 获用户确认，均为 `accepted`。
- ADR-0010 仍是 active 上位决策；G4 只是开发级细化，未改写产品选择。
- 本轮无代码、Schema、DB、workspace 或 UI 改动，不存在已实现功能。

## 后续路径

1. 按总顺序继续编写 G5 高自由成稿编辑器的开发级文档，直接消费 G4 的 element source revision/freshness 契约。
2. 只有全部规划完成且用户明确授权开发后，才从 G0 测试底座开始实施，不直接跳到 G4。

## 实施前不可遗忘

- 旧 `POST .../candidates/{candidateId}/lock` 不能作为绕过 preview/digest 的兼容后门。
- 不得为兼容旧 UI 双写 Storyboard.lockedCandidateId 和 DB revision。
- 不得在 replace/clear 事务中改写旧 Layout/Export/Asset 或回退 milestone。
- 不得让取消任务成为迟到结果的唯一防线。
- 不得在 G4 提前实现 G5 的裁切保护、逐格/批量换图和 LayoutDocument 编辑命令。
