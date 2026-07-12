---
doc_id: AIR-G3-M3-A14-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: A14 实现与 SQLite 集成证据
---

# Handoff

## 已完成

- `ProviderShadowImporter` 从 sealed snapshot 读取脱敏设置，恢复 ProviderConfig、CredentialMetadata 和 AppPreference。
- provider runtime kind 与默认文本/图片 provider 关系通过 DB FK/trigger 校验；旧 key 不进入 DB 或 SecretRef。
- CLI 已接入 `--slice providers`；A14 集成覆盖两类 provider、secret 不落库与 replay。
- M4 仍保持 `in_progress`，未将单次 shadow 结果宣称为正式验收。

## 明确未完成

- ConversationThread/Message/ToolResult/RuntimeSession/ PendingDialogueArtifact 仍未导入；M0 runtime bundle 的对话状态当前明确不可观察。
- 完整 read-model/orchestration、M4 双 fresh shadow、M5 backup/restore、M6 activate/cutover 未实现。

## 下一步

先补齐可验证的 Dialogue runtime bundle capture/codec，再导入对话只读历史；之后执行 M4 DTO/Asset 等价验收，保持 final、backup、activate fail-closed。
