---
doc_id: AIR-D2-A1-2-FILEMAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A1 当前代码与收口目标
---

# D2-A1-2 文件与函数地图

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/settings/secret-store.ts` | SecretStore、fake/unavailable、macOS Keychain adapter、CommandExecutor |
| `apps/server/src/settings/settings.service.ts` | settings metadata、SecretStore runtime、原子脱敏写入接线 |
| `apps/server/src/migration/credential-redactor.ts` | 递归敏感字段处理和 sentinel 扫描公共实现 |
| `apps/server/src/backup/app-backup.service.ts` | 使用公共 sentinel scanner，保持 DB/settings/report/Asset 检查语义 |
| `apps/server/src/backup/app-restore.service.ts` | 使用公共 sentinel scanner，保持恢复后 fail-closed |
| `apps/server/src/migration/db-capability-registry.ts` | 仅更新 settings capability 证据和状态 |
| `apps/server/src/settings/*.spec.ts` | Keychain、atomic settings、restart、redaction 定向测试 |
| `apps/server/src/migration/credential-redactor.spec.ts` | RED-01、SEC-10 fixture scan |
| `apps/server/src/migration/db-capability-registry.spec.ts` | CAP-01/CAP-02 7→6 gate 断言 |

## 不得修改

`apps/server/prisma/schema.prisma`、migration SQL、D2-A2 repository、D2-A6 Outbox consumer、final importer、M6 activate。
