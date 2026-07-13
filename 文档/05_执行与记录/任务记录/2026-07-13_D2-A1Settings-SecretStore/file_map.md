---
doc_id: AIR-D2-A1-FILEMAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer
source: D2-A1 当前代码探索
---

# D2-A1 文件与函数地图

| 文件 | 入口/符号 | 责任 |
| --- | --- | --- |
| `apps/server/src/settings/secret-store.ts` | `SecretString`、`SecretStore`、`FakeSecretStore`、`UnavailableSecretStore` | 凭据契约、fake adapter、默认 fail-closed |
| `apps/server/src/settings/settings.service.ts` | `SettingsService` | settings metadata、旧明文迁移、运行时 secret 读取、公共 DTO |
| `apps/server/src/settings/settings.module.ts` | `SettingsModule` | 注入 SecretStore 与 PrismaService |
| `apps/server/src/projects/image-provider.service.ts` | `resolveProviderConfig` | provider 读取 SecretStore-backed runtime，不读取 settings plaintext |
| `apps/server/src/ai-runtime/opencode-runtime.service.ts` | `syncConfiguredAuth` | 文本 key 只向本机 OpenCode auth 发送，不写 AI漫游 settings |
| `apps/server/src/migration/credential-redactor.ts` | `redactCredentials` | 迁移/日志递归脱敏，不能替代 SecretStore |
| `apps/server/src/settings/secret-store.spec.ts` | SEC-01～06、10～11 | fake store 与安全边界 |
| `apps/server/src/settings/settings.service.spec.ts` | SEC-05～09 | settings file/DB metadata/DTO/重启 |
| `apps/server/prisma/schema.prisma` | AppPreference/ProviderConfig/CredentialMetadata | 已存在目标 metadata 模型，本切片不新增 migration |

## 依赖边界

```text
SettingsController -> SettingsService -> SecretStore
                                      -> PrismaService (DB mode)
ImageProviderService -> SettingsService -> SecretStore-backed runtime
OpenCodeRuntimeService -> SettingsService (text metadata + current-session key)
```

SecretStore 不依赖 SettingsService，避免循环依赖；fake store 不依赖 Prisma。
