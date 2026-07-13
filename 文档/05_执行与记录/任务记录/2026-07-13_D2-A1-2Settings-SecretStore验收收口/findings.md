---
doc_id: AIR-D2-A1-2-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A1-2 执行探索
---

# D2-A1-2 发现与决策

## 已确认事实

1. G1 要求 macOS Keychain 为当前平台必须通过项；当前代码只有 fake/unavailable。
2. A1 实施契约要求 sanitized temp→rename，但 SettingsService 仍直接 `writeFile(target)`。
3. backup/restore 各自复制 `containsSecretSentinel`，需要公共化，避免规则漂移。
4. capability registry 当前 settings 条目仍是 unsupported/restart=false/evidence=[]，D2-A1 代码没有更新它。

## 决策

- 使用可注入 `CommandExecutor` 封装 macOS `security` 命令；测试不调用真实命令。
- 使用同目录临时文件、FileHandle.sync、rename 的原子写工具；失败清理 temp。
- 复用并扩展现有 credential-redactor，公共化 sentinel 递归扫描；不在错误中回显 sentinel。
- 本切片只把 settings capability 变绿；其他 6 个 blocker 保持原状态。

## 已完成证据

- 定向测试 5 个文件、20 tests 已通过；包括 Keychain fake executor、write/rename failure、restart、SEC-10 和 capability 7→6。
- `pnpm --filter @airoaming/server typecheck` 已通过。

## 风险

- D2-A6 仍负责正式 clear/replace Outbox consumer；本切片不得实现 purge。
- macOS Keychain 命令参数和系统错误需在 adapter 内统一映射，不能把 stderr 传播到日志或 API。
