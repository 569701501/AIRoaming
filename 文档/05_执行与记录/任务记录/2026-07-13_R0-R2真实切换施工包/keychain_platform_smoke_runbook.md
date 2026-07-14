---
doc_id: AIR-RCUT-KEYCHAIN-SMOKE-001
status: completed_isolated
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: release-owner, reviewer, ai-agent, qa
source: R0-A Luna 独立复核剩余平台证据
---

# macOS Keychain 隔离平台 Smoke（授权后执行）

## 目的

只验证生产 `MacOSKeychainSecretStore` 的真实子进程 stdin 行为，不验证真实用户凭据，不连接默认 login keychain，不执行真实 C0～C7。

## 前置授权

未同时满足以下条件不得执行：

1. release owner 明确授权本文件的 disposable-keychain smoke；本次授权已于 2026-07-14 获得；
2. 当前机器为 macOS，`/usr/bin/security` 与项目构建产物来自同一 release；
3. 记录唯一 `smokeId`、临时 keychain 路径和清理责任人；
4. 采用合成 sentinel，禁止使用任何真实 provider/API key、用户密码或项目 secret。

## 隔离约束

- 使用临时 `HOME`（仅含临时 `Library/Keychains` 与 `Library/Preferences`）和临时 keychain 文件；所有 `security` 子进程都继承该 `HOME`，不改变默认 keychain、搜索列表或用户登录状态。
- 生产 adapter 不接收 keychain 路径参数；`security add-generic-password` 保持 `-U -w`，`-w` 为最后选项。隔离通过临时 `HOME` 的默认 keychain 完成，避免把路径误当作密码。
- 只允许 `put → get → delete → probe`；不得执行 `dump-keychain`、`find-* -g` 或输出 secret。
- 结果只记录 exit code、adapter、fingerprint 是否匹配、删除后 missing 是否成立；日志、终端和 artifact 禁止出现 sentinel。
- 任一步失败立即停止并删除临时 keychain；不得生成 AUTH-C1/C5/C7。

## 执行顺序

1. 创建唯一临时目录作为 `HOME`，预创建 `Library/Keychains` 与 `Library/Preferences`，在该 `HOME` 内创建 disposable keychain 并设置为临时默认 keychain；记录真实 `HOME` 的默认 keychain 与搜索列表快照，完成后逐项比较。
2. 以生产构建的 `MacOSKeychainSecretStore` 运行 `put`，合成 secret 只从受控 stdin 进入 child；断言命令参数中没有 secret，且 child 退出码为 0。
3. 运行 `get`，只在内存中计算 `sha256:<hex>` fingerprint，与 put 返回值比较；不得打印返回的 secret。
4. 运行 `delete`，随后 `get` 必须返回 `SECRET_STORE_ENTRY_MISSING`；再运行 `probe`，只记录非敏感 health 结果。
5. 扫描 smoke 输出、临时日志和证据目录，确认不含 sentinel；安全删除临时 keychain 和目录。

## 通过标准

```text
put.exit=0
get.fingerprintMatches=true
delete.exit=0
getAfterDelete.code=SECRET_STORE_ENTRY_MISSING
probe.adapter=keychain
secretInArgv=false
secretInStdout=false
secretInStderr=false
sentinelFound=false
defaultKeychainTouched=false
```

## 本次执行结果（2026-07-14）

```text
putSucceeded=true
fingerprintMatches=true
deleteSucceeded=true
getAfterDelete=SECRET_STORE_ENTRY_MISSING
probe.available=true
probe.adapter=keychain
secretInArgv=false
secretInStdout=false
secretInStderr=false
realDefaultKeychainUnchanged=true
realSearchListUnchanged=true
temporaryHomeAndKeychainDeleted=true
AUTH generated=false
```

## 留痕与停止点

只保存脱敏 JSON：`smokeId`、macOS/build identity、命令 exit code、fingerprint digest、时间和清理结果。上述结果已保存为脱敏终端证据；未记录 synthetic secret。独立 Scrutiny/Runtime Review 已基于最新工作树更新，但该 smoke 与 Review 仍不代表真实 C0～C7 或真实 SH gate 通过。
