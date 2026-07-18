---
doc_id: AIR-TASK-DB-IMAGE-CREDENTIAL-FINDINGS-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: GenerationTask、Settings API、SQLite、Keychain fingerprint、cutover evidence
---

# DB 图片凭据恢复发现

## 真实错误

- 角色图任务数：10。
- TaskAttempt 数：30。
- 唯一错误：`IMAGE_PROVIDER_NOT_CONFIGURED`。
- 单次 attempt 在约 20ms 内失败，代码路径在图片 HTTP adapter 之前。

## 配置对比

| 层 | Grok 图片凭据状态 |
| --- | --- |
| 迁移前 settings 备份 | 有 secretRef 与 fingerprint |
| C4 credential evidence | Keychain 可用且 actualFingerprint 精确匹配 |
| 修复前 DB CredentialMetadata | unconfigured、secretRef/fingerprint 为 null |
| 修复前 Settings API | active=grok，但 configured=false |
| 修复后 DB CredentialMetadata | 三家均 configured、opaque secretRef、fingerprint 匹配 |
| 修复后 Settings API | active=grok，三家均 configured=true |

## 设计边界

- Shadow import 的 `secretsImported=false` 是正确安全边界，不能改为从脱敏 snapshot 恢复明文 Secret。
- Final import 已持有 `credentialVerifier + credentialExpectations`，是唯一同时具备“目标 DB、已验证 SecretStore、Provider 元数据”的合法绑定点。
- `secretRef` 只是 DB 中的不可逆元数据引用；真实 Keychain 查找继续按稳定 `credentialId=image_{type}_{providerId}`，不得将明文写入 DB。
- 已成功 final run 的 replay 必须能够幂等补齐旧版本遗漏，才能安全修复当前已激活实例；冲突 fingerprint 或错误 owner 必须 fail-closed。

## 实现结论

- `ProviderShadowImporter` 保持原安全行为，不导入 Secret。
- 新增 verified image credential binder，只在 `CutoverCredentialVerifier` 成功后运行。
- 新 final import 自动绑定；既有成功 final run 只有显式传入 `--rebind-verified-image-credentials true` 才修复，不在普通 replay 中隐式写入。
- 绑定事务严格校验 credentialId 前缀、Provider 类型、owner、fingerprint 与既有状态；目标缺失、重复 expectation、半配置状态或指纹冲突全部失败关闭。
- 绑定只写随机 opaque `secretRef`、fingerprint 和 configured/enabled 元数据，不读取或写入明文 API Key。
- 当前 DB 二次 replay 不增加 MigrationRun、不轮换 opaque secretRef，业务任务/attempt/candidate/asset 计数不变。
