---
doc_id: AIR-G3-M3-A14-FINDINGS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A14 代码探索与 SQLite 集成证据
---

# 发现与取舍

- Snapshot 只保留 `settings.redacted.json`，不保留旧 `app-settings.json`；因此 A14 只恢复 providerId/model/baseUrl/displayName/theme 等非秘密元数据。
- G1 CredentialMetadata 的 CHECK 要求未配置状态不能带 fingerprint/secretRef；即使旧脱敏文件有 fingerprint，也只能保留为来源 evidence，不能写入未配置行。
- ProviderConfig `enabled=false` 是故意的：没有重新授权的 SecretStore 凭据时，DB 不能把旧配置声明为可运行 provider。
- M0 runtime bundle 明确把 conversationState/pendingDialogueState 标为不可观察；A14 不创建伪造 Dialogue 业务记录，避免把骨架状态误当历史聊天。
