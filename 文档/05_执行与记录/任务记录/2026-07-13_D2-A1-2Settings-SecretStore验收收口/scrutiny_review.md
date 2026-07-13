---
doc_id: AIR-D2-A1-2-SCRUTINY-001
status: passed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa, reviewer
source: D2-A1-2 实施代码与定向/全量测试
---

# D2-A1-2 Scrutiny Review

## 复核范围

只读检查 `secret-store.ts`、`settings.service.ts`、credential redactor、backup/restore 调用点、capability registry、定向测试和 diff 边界；未在复核阶段修改实现。

## 结论：passed

- `MacOSKeychainSecretStore` 只由 macOS 生产分支选择；命令执行器可注入，测试使用 fake executor，没有真实 `security`/Keychain 调用。
- Keychain 错误只映射为稳定 code；stdout/stderr 不进入异常文本或 API 返回；secret metadata 只保存 opaque ref/fingerprint。
- Settings 写入链路为同目录随机 temp、0600、write、`FileHandle.sync()`、close、rename；write/fsync/rename 失败均清理 temp，旧文件字节保持不变，无 direct-target fallback。
- `containsSecretSentinel` 已成为公共递归实现，backup/restore 不再各自复制规则；支持字符串、Buffer、Uint8Array、数组和循环对象。
- SEC-10 fixture 覆盖 DB、settings、migration report、log、task、artifact、export；命中 fail-closed，clean fixture=0。
- capability 仅把 `settings_credential_secret_store` 改为 implemented/restartCovered=true 并绑定证据；其他 capability 状态与 blocker 未改，blockedIds=6。
- 未修改 Prisma schema/migrations、D2-A2、D2-A6 Outbox consumer、final importer 或 M6。

## 证据

- 定向：4 个 spec 文件、17 tests（补充 atomic write/fsync/rename 失败后仍为 8 个 SettingsService tests）通过。
- Server 全量：`pnpm --filter @airoaming/server test -- --testTimeout=20000` 通过。
- 类型与契约：workspace typecheck、Prisma validate、G1 manifest/schema/migration check 通过。
- `git diff --check` 通过。
