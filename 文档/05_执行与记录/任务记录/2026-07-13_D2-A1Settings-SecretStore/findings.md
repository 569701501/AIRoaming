---
doc_id: AIR-D2-A1-FINDINGS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A1 代码探索
---

# D2-A1 发现与结论

## 当前事实

1. `SettingsService` 的 `StoredAIKeySettings` 同时承载文本和图片 key，默认值还会从环境变量读取图片 key；没有 SecretStore seam。
2. `getRuntimeImageProviderSettings()` 是同步 getter，`ImageProviderService`、`CharacterReferenceService` 多处直接调用；接入 SecretStore 时优先保留同步 runtime getter，由 SettingsService 在模块初始化阶段预加载 SecretString。
3. Prisma schema 已有 `ProviderConfig`、`CredentialMetadata`、`AppPreference`，且 G1 trigger 已约束 owner/status/secretRef 生命周期；A1 不需要新 migration，但 DB 写入必须遵守现有 transition。
4. `credential-redactor.ts` 只负责迁移数据递归脱敏，不是秘密存储；不能用 `[REDACTED]` 代替 SecretStore。
5. 现有 fake fixture 已有 `AIROAMING_FAKE_SECRET_STORE_ROOT` 和 sentinel 隔离约定，可复用但不能把 sentinel 当成生产存储实现。

## 关键取舍

- 先交付 fake/unavailable 两种 adapter，真实平台 adapter 留在后续平台探针；任何未配置 adapter 都拒绝图片 key 写入。
- 继续兼容读取旧 settings，但只在临时根迁移后删除 plaintext；没有可用 SecretStore 时不覆盖旧文件。
- 公共 DTO 保留 shared 类型的 `keyPreview` 字段以减少前端破坏，但值固定 `null`，后续可在 shared 契约波次移除字段。
- fake store 的 `secretRef` 使用 `airoaming:image:v1:<uuid>`，与 G1 `CredentialMetadata` 格式约束一致；文件系统路径仍按 credentialId 解析。

## 残留风险

- 正式替换/清除的 `secret.delete_old_ref` Outbox consumer 未在 A1 实现，不能宣称清除生命周期全绿。
- OpenCode auth 的真实 localhost 写入仍由 OpenCodeRuntimeService 负责；A1 不读取或导入用户全局 auth.json。
- DB 模式清除已有图片凭据会稳定拒绝 `SETTINGS_SECRET_CLEAR_REQUIRES_OUTBOX`，避免在 A1 绕过 G1 transition trigger。
