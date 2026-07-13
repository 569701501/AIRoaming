---
doc_id: AIR-D2-A1-SCRUTINY-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: D2-A1 静态复核
---

# D2-A1 静态复核

## 结论

`passed_for_d2_a1_slice`。本次只交付 fake/unavailable SecretStore、settings 脱敏和 DB metadata 接线；真实平台凭据库与 Outbox clear consumer 明确未实现。

## 证据

- `SecretString` 的字符串化、JSON、inspect 均返回 `[REDACTED]`，SecretStore 没有 list 明文接口。
- fake root 仅显式配置时启用，root/file symlink、非法 credential id、缺失 secret 均 fail-closed；文件为 0600，root 为 0700。
- settings 写入统一经过 `toPersistedSettings`；图片 key 只写 fake/adapter，公共 DTO 的 `keyPreview` 固定为 `null`。
- DB 只 upsert `ProviderConfig`、`CredentialMetadata`、`AppPreference`；fake `secretRef` 使用 `airoaming:image:v1:<uuid>`，满足既有 schema digest/格式约束。
- DB 模式 clear 在 A1 直接拒绝 `SETTINGS_SECRET_CLEAR_REQUIRES_OUTBOX`，避免绕过 G1 `clearing -> Outbox -> unconfigured` 生命周期。
- ImageProviderService 的现有同步 runtime getter 保持接口稳定，但来源已改为 SettingsService 的 SecretStore-backed cache。

## 残留

- 真实 macOS Keychain/Windows Credential Locker/Linux Secret Service adapter 留待后续平台切片。
- DB 图片凭据 clear/replace 的正式 Outbox consumer 留待 D2-A6。
- SEC-10 task/artifact/log 全链路 sentinel 扫描需要在 provider/task 写入路径接入后复核；A1 本身没有创建这些产物。
