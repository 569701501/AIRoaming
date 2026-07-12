---
doc_id: AIR-G3-M3-A15-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: A15 实现与 SQLite 集成证据
---

# Handoff

## 已完成

- `MaintenanceCoordinator` 可接收 dialogue runtime provider；`DialogueService` 封存线程、消息和 tool result 快照。
- `DialogueShadowImporter` 校验 runtime bundle，导入 ConversationThread/Message/DialogueToolResult/closed DialogueRuntimeSession，并记录 ImportedEntitySource。
- CLI 已接入 `--slice dialogue`；A15 集成覆盖 captured 对话、closed session、replay，server 全量 45 文件/259 tests 通过。

## 明确未完成

- ScriptDialogueService/StoryStructure/Storyboard 的 pending Map 尚未封存为 PendingDialogueArtifact。
- 完整 read-model/orchestration、M4 双 fresh shadow、M5 backup/restore、M6 activate/cutover 未实现。

## 下一步

补 pending Dialogue artifact 的显式 codec/capture，再做 read-model 重建和 M4 DTO/Asset 等价验收；继续保持 final、backup、activate fail-closed。
