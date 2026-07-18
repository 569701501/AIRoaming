---
doc_id: AIR-TASK-DB-IMAGE-CREDENTIAL-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: DB-only 切换后角色图任务 IMAGE_PROVIDER_NOT_CONFIGURED
---

# DB 图片凭据恢复计划

## 目标

修复正式 file → DB-only cutover 只验证 Keychain 图片凭据、却没有把已验证凭据元数据绑定到目标 `CredentialMetadata` 的缺口；恢复当前实例的 OpenAI、豆包、Grok 图片 Provider 配置，并保证后续 final import 自动完成同一绑定。

## 非目标

- 不生成任何图片，不调用图片 Provider。
- 不读取、打印或写入明文 API Key 到数据库、日志、文档或命令参数。
- 不绕过 SecretStore、fingerprint 校验或 DB trigger。
- 不删除现有 10 个失败任务及其 30 次 attempt 历史。
- 不修改角色、提示词、任务输入或项目正文。

## 根因

- `ProviderShadowImporter` 正确地只导入脱敏 Provider 元数据，并将凭据置为 unconfigured。
- C4 final import 已使用 `CutoverCredentialVerifier` 验证 Keychain 中的 3 个图片凭据，但 `FinalImportOrchestrator` 只落 credential evidence，没有把验证结果绑定回 ProviderConfig/CredentialMetadata。
- 运行时因此选择 Grok 但拿不到 `runtimeImageSecrets`，在网络请求前返回 `IMAGE_PROVIDER_NOT_CONFIGURED`。

## 阶段

1. [x] 建立覆盖真实 final import + credential verifier 的失败回归。
2. [x] 实现 verified image credential binder，支持首次 final import 和已成功 final run 的幂等 replay 修复。
3. [x] 用原 cutover snapshot、decisions、runId 和 credential expectations 重放 final importer，修复当前 DB。
4. [x] 重启标准 DB-only 服务，只读验证三个图片 Provider 已配置、无任务被自动重新执行。
5. [x] 完成定向/全量测试、类型检查、构建、静态复核、运行复核和 Handoff。

## 验收标准

- 只有通过 SecretStore adapter 和 fingerprint 精确校验的 image expectation 才能绑定。
- `ProviderConfig.enabled=true`；对应 `CredentialMetadata.status=configured`、`configured=true`、`secretRef` 合法、fingerprint 匹配。
- 重放同一 final run 不创建新 MigrationRun、不更换已绑定 secretRef、不重复写入。
- 当前设置 API 显示 OpenAI、豆包、Grok 三个图片 Provider 均 `configured=true`，active 仍为 Grok。
- 修复前后的 GenerationTask 数、失败历史、Candidate 和 Asset 不被改写。
- 全过程图片 Provider HTTP 调用为 0。

## 退出标准

- 原始失败反馈环从“Grok active 但 configured=false”变为“Grok active 且 configured=true”，不触发生成。
- 回归、类型检查、构建通过。
- 任务文档、完成记录、Scrutiny Review、Runtime Review 和 Handoff 齐全。
