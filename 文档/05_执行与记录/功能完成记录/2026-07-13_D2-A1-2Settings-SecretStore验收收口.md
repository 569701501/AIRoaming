---
doc_id: AIR-D2-A1-2-DONE-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A1-2 施工与复核记录
---

# D2-A1-2 Settings + SecretStore 验收收口

## 功能摘要

完成 D2-A1 SecretStore 安全边界的正式收口：macOS Keychain production adapter、settings 原子脱敏迁移、递归 credential redactor/SEC-10 sentinel 扫描，以及 capability registry 证据闭合。

## 影响范围

- macOS 生产路径使用 `security` 命令；executor 可注入，测试不触碰真实 Keychain。
- Settings legacy secret 迁移改为同目录 temp→write→fsync→rename；故障时旧文件字节保持不变且清理临时文件。
- backup/restore 共用递归 sentinel scanner，覆盖 DB 与工作区/报告/日志/任务/资产/导出文件检查。
- 仅 `settings_credential_secret_store` 变为 implemented、restartCovered=true；blockedIds 由 7 变为 6，其他 capability 不变。

## 修改文件

- `apps/server/src/settings/secret-store.ts`
- `apps/server/src/settings/settings.service.ts`
- `apps/server/src/settings/settings.service.spec.ts`
- `apps/server/src/settings/macos-keychain-secret-store.spec.ts`
- `apps/server/src/migration/credential-redactor.ts`
- `apps/server/src/migration/credential-redactor.spec.ts`
- `apps/server/src/backup/app-backup.service.ts`
- `apps/server/src/backup/app-restore.service.ts`
- `apps/server/src/migration/db-capability-registry.ts`
- `apps/server/src/migration/db-capability-registry.spec.ts`

## 数据/协议变化

新增 `SecretCommandExecutor`、`MacOSKeychainSecretStore`、`AtomicSettingsFileOps` 和公共 `containsSecretSentinel`；不改 Prisma schema/migration，不增加明文 secret 字段或 fallback。

## 验证命令与结果

- 定向 4 spec / 17 tests：通过。
- `pnpm --filter @airoaming/server test -- --testTimeout=20000`：通过。
- `pnpm -w typecheck`：通过。
- `pnpm --filter @airoaming/server prisma:validate`：通过。
- `g1:manifest:check`、`g1:schema:check`、`g1:migration:check`：通过。
- capability report：settings implemented/restartCovered=true；`--check` payload 的 blockedIds=6。
- `git diff --check`：通过。

## 已知风险

- Runtime Review 只做 fixture/fake executor 验证，未执行真实 Keychain；这是本任务的安全边界，不是遗漏。
- `security` CLI 的系统可用性由 `probe()` 与稳定错误码表达；真实用户钥匙串授权仍需后续发布环境单独验收。

## 后续建议

停止在 D2-A1-2；由用户另行授权后再建立 D2-A2 施工资料。D2-A6 Outbox consumer、final importer、M6 继续保持禁止。
