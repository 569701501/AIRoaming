---
doc_id: AIR-G3-M3-A14-PLAN-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 ProviderConfig/CredentialMetadata/AppPreference 契约与脱敏设置映射
---

# G3-M3-A14 Provider/settings 元数据导入计划

## 目标

从 sealed snapshot 的 `settings.redacted.json` 恢复非秘密 provider、凭据状态和外观/默认 provider 选择，建立 DB 侧的设置元数据。

## 边界

- 只恢复 ProviderConfig、CredentialMetadata、AppPreference 的非秘密字段。
- 旧 apiKey 永不写入 DB；CredentialMetadata 保持 `unconfigured/configured=false/secretRef=null/fingerprint=null`，后续需要重新授权或 SecretStore 导入。
- 不从 runtime bundle 捏造 ConversationThread/Message；Dialogue runtime bundle 当前仍是 M0 不可观察骨架。

## 退出标准

- `--slice providers` 可执行，稳定 sourceKey/target ID，重复运行不新增配置。
- 集成测试覆盖脱敏设置、Provider runtime kind、默认/图片 provider 关联和 secret 不落库。
- typecheck、定向测试、server 全量回归、G1 三项门禁和 diff check 通过；M4 仍保持 `in_progress`。
