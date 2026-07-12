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
- `ScriptDialogueService` 的三个 pending Map 已通过显式 capture codec 封存为 `dialogue_pending_state_v1`；导入器写入 PendingDialogueArtifact，校验 kind/scope/FK/payloadDigest，并记录 runtime-bundle 来源证据。
- CLI 已接入 `--slice dialogue`；A15 集成覆盖 captured 对话、closed session、deferred 零实体、pending artifact、replay。

## 明确未完成

- StoryStructure/Storyboard 的 pending 不进入本表：StoryStructure 使用领域 pending 表，Storyboard 使用既有 `storyboard.pending.json`；两者不重复塞入 PendingDialogueArtifact。
- 完整 read-model/orchestration 的正式验收、M5 backup/restore、M6 activate/cutover 未完成。

## 下一步

继续做 M4 正式验收与交接审查；M5 backup/restore、M6 activate/cutover 仍保持 fail-closed。
