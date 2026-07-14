---
doc_id: AIR-RCUT-LUNA-RUNTIME-001
status: passed_isolated
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: reviewer, release-owner, ai-agent, qa
source: Luna 独立隔离 Runtime Review 与 R0-A 测试门禁
---

# R0-A Luna 独立 Runtime Review（隔离）

## 结论

`passed_isolated`。隔离 domain/runtime 回归和一次获授权的临时 `HOME`/disposable Keychain 平台 smoke 均通过；真实用户 Keychain、真实凭据、provider、workspace/dataRoot、维护 API、真实数据库操作仍为 0。该结论不等于真实 C0～C7、SH gate 或 AUTH 授权通过。

## 测试证据

### R0-A 定向

- 14 个 spec、106 个测试通过。
- 覆盖 C0 shadow gate、C1～C4 失败矩阵、C3 target cleanup（RCUT-C3-ROLLBACK）、C5 smoke failure、C7 crash/reopen、首笔写入后的 file-guard、RCUT-RB-01、RCUT-SEC-08、RCUT-PATH-01/02/03、RCUT-EVD-08/09。
- Keychain/runner 定向：2 个 spec、18 个测试通过；包含 RCUT-SEC-10/11，断言 secret 不在 argv、`-w` 为最后参数；RCUT-SEC-13 的真实 disposable smoke 证明双 stdin prompt 与 put/get fingerprint 链。

### 服务端全量

- 69 个 spec、472 个测试通过（最新全量回归，exit 0）。
- 命令使用 single fork、显式 60 秒测试超时；最新总时长 183.16 秒，退出码 0。

### 静态门禁

- workspace `pnpm typecheck`：通过。
- server build：通过。
- web build：通过（仅有既有 Vite chunk size warning）。
- Prisma validate：通过。
- G1 manifest/schema/migration checks：通过；manifest digest `sha256:ad3b0e1ba884e20718e6e81994cbb8beaedbb9e6777e471ac2a21e4c94c2b1ea`，8 migrations、195 checks、194 triggers。
- capability check：通过；`blockedIds=[]`，`settings_credential_secret_store.restartCovered=true` 且绑定测试 evidence。
- `git diff --check`：通过。

## 隔离边界确认

- 已在临时 `HOME` 与 disposable Keychain 上执行一次受控真实 `/usr/bin/security` 子进程 smoke；未连接默认用户 Keychain、provider、维护 API、workspace/dataRoot、真实数据库或用户凭据。
- smoke 脱敏结果：put 成功、get fingerprint 匹配、delete 成功、删除后 missing、probe 为 keychain；secret 不在 argv/stdout/stderr；真实默认 keychain 与搜索列表不变；临时 HOME/keychain 已删除；未生成 AUTH。
- 未生成 AUTH 文件；未执行真实 C0～C7 或首笔真实业务写入。
- 两个 fresh 临时根的 domain C0～C7 链、identity-bound shadow gate、evidence replay/tamper、C3 失败清理、C7 crash/reopen 和首写 file-guard 均通过；这些证据只证明隔离实现，不证明真实系统环境。

## 运行残留风险

Runtime 自动化和 disposable Keychain smoke 均通过。真实 SH-01～SH-10、SH-10 人工审阅和真实 report 仍是发布前 gate；隔离结果不替代真实 SH gate。

## 复核者与停止点

复核者：Luna（独立隔离运行复核；未代签 AUTH 门）。

停止点：保持真实系统操作为 0，不进入 R0-B/R1/R2。
