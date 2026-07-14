---
doc_id: AIR-RCUT-LUNA-SCRUTINY-001
status: passed
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: reviewer, release-owner, ai-agent, qa
source: Luna 独立静态复核、R0-A 实施契约与当前工作树
---

# R0-A Luna 独立 Scrutiny Review

## 结论

`passed`（R0-A）。本次独立复核基于最新工作树，确认生产 adapter 的 `-U -w` 参数顺序、双 stdin prompt、secret 边界、临时 `HOME`/disposable Keychain 平台证据和回归门均满足 R0-A 契约。该结论只关闭 R0-A 的 P1-A 平台证据，不代表真实 C0～C7、SH gate、AUTH 或真实用户凭据已获准执行。

## 复核范围与边界

- 只读检查 R0-A 生产入口、测试和任务资料；未修改 schema、migration、trigger、G4/G5 或 R0-B/R1/R2。
- 未访问真实 workspace、dataRoot、数据库、provider、维护 API、用户凭据或默认用户 Keychain；本次 smoke 仅使用临时 HOME 下的 disposable Keychain。
- 未生成 AUTH-C1/AUTH-C5/AUTH-C7，未执行真实 C0～C7、停写、snapshot、import、backup、restore、archive、activate 或首笔真实写入。

## 已确认的不变量

1. `cutover-runner`、`cutover-evidence`、`runtime-bundle`、`final-importer` 与 final `db-import` 输出已使用 ancestor/symlink/regular-file 检查，并采用 temp→write→fsync→rename；临时文件在写入、关闭或 rename 失败时清理。
2. C3 在 expectations 输出失败时回滚本轮 prestage；migration、settings 或 expectations 任一失败时，只清理本轮新建 DB、`-wal`、`-shm` 和 data root，保留既有目标；`RCUT-C3-ROLLBACK` 已直接断言目标清理，代码在 C3 阶段不写旧 settings。C7 校验 backup pointer 的 `bundleDigest` 与 C4 evidence 的 digest 一致。
3. Secret 不进入 Keychain command argv；credential evidence 只保存 fingerprint/digest/匹配事实。生产 adapter 不接收 keychain 路径参数，disposable smoke 通过临时 HOME 的默认 keychain 隔离；fake executor、fake SecretStore 和临时根隔离均保持在测试边界内。
4. runtime cutover profile 要求 closed、active/queued=0、`blockedReason=null`；evidence identity、链式 digest、C6_READY、COMPLETED 和 C7 completion seal 有校验。
5. CLI 的参数、step 顺序、root overlap、fake secret root 和 activation required flags 在 Prisma 初始化或副作用前拒绝。

## 平台证据残留

### P1-A（已关闭）

本机 `security add-generic-password -h` 与代码复核确认 adapter 参数为 `... -a <account> -s <service> -U -w`，`-w` 是最后选项；secret 通过 child 的私有 stdin pipe 写入两行相同值（密码与确认），绝不进入 argv/stdout/stderr。RCUT-SEC-10/11/13、Keychain spec 当前 4 个测试和 2-spec/18-test 定向回归均通过。授权 smoke 已在临时 HOME/disposable Keychain 验证无 TTY 子进程的 put/get/delete/probe、fingerprint 匹配和默认 keychain/search list 不变。

已补齐的最小证据是一次获授权的 macOS 隔离 runtime smoke：使用临时 `HOME` 下的 disposable keychain（不使用用户默认 keychain）、合成 sentinel，验证 put→get→delete/probe 的进程退出码和 fingerprint，只保留脱敏结果，不记录 secret。默认 keychain 与搜索列表前后比较不变，临时 HOME/keychain 已删除。

该 smoke 只证明 macOS 子进程与 disposable Keychain 的平台行为，不证明真实用户凭据、真实 C0～C7 或 SH gate。

### R0-B 前置：真实 C0 的 SH gate 仍需真实 evidence

`createCutoverAction("C0")` 现在要求 `shadowGatePath`，并通过 `readVerifiedCutoverShadowGate` 校验 SH-01～SH-10 全部 `passed`、每项 evidence digest、MigrationReport digest、reviewer、plan identity 与 gate digest。R0-A 只验证隔离 gate 文件；真实 shadow/import、SH-10 人工审阅和真实 report 仍属于 R0-B，必须在真实 C0 前由 release owner 生成并绑定同一 plan identity。该项不再是 R0-A 代码阻塞，但也不能把隔离 gate 当成真实 SH 通过。

## 回归证据

- 定向：14 个 spec、106 个测试通过。
- Keychain/runner 定向：2 个 spec、18 个测试通过；Keychain spec 当前 4 个测试。
- 服务端全量：69 个 spec、472 个测试通过。
- 新增/复核：`RCUT-C0-01/02`、`RCUT-C3-ROLLBACK`、`RCUT-SEC-10/11/13`、RCUT-PATH-01/02/03、RCUT-EVD-08/09；`RCUT-SEC-13` 的真实 disposable smoke 已通过。

## 非阻塞范围说明

`db-verify.cli.ts`、`db-audit.cli.ts`、`migration-decision.cli.ts` 仍有旧的 JSON writer，但它们不在当前 runner 的 C4 final import 输出路径；R0-A 已覆盖 runner、final importer 和 final `db-import` 的输出安全。建议后续统一 writer，不作为本轮 R0-A 阻塞。

## 复核者与停止点

复核者：Luna（独立静态复核记录；未代签任何真实授权）。

停止点：R0-A 复核已通过；不生成授权文件，不进入 R0-B/R1/R2。平台 smoke 和本 Review 不授予真实切换权限；真实 SH-01～SH-10、人工 SH-10、AUTH 与真实数据仍需 release owner 另行授权。
