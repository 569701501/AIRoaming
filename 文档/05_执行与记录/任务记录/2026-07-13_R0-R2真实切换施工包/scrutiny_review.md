---
doc_id: AIR-RCUT-SCRUTINY-001
status: changes_requested
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: reviewer, release-owner, ai-agent
source: R0-A 实施代码、定向测试、全量回归
---

# R0-A Scrutiny Review

## 结论

`changes_requested`。R0-A 的 SecretStore、settings 两阶段迁移、严格 runtime/evidence/activate、plan 校验和 production `db:cutover` 骨架已经落地并通过隔离门禁；尚不能宣称 production entry 完成。

## 已确认

- Keychain 生产 adapter 只把 secret 送入受控 stdin，参数数组、stdout/stderr 和 evidence 不携带明文；测试 fake executor 未调用真实 `security`。
- legacy settings 采用 prestage→verify→temp/fsync/rename，partial put、rename 失败和 CAS 冲突均保持旧文件字节不变。
- credential evidence 只包含 fingerprint、digest 和匹配事实；SEC-10 fixture 覆盖 DB、settings、migration report、日志、task、artifact、export 以及 snapshot/backup/restore/archive 根。
- runtime cutover profile 要求 closed、active/queued=0、blockedReason=null；证据链验证 identity、digest、顺序、C6_READY、COMPLETED，C7 必须带 activation completion seal。
- CLI 参数、step 顺序、root overlap、fake secret root 和 activation required flags 在副作用前拒绝。
- 完整 R0-A 定向门禁 13 个 spec/103 个测试通过；两个 fresh runner chain、C7 crash/reopen、首写 file-guard、RCUT-RB-01、RCUT-SEC-08、RCUT-PATH-01/02/03、RCUT-EVD-09 及路径/环境修复后的服务端全量回归为 68 个 spec/468 个测试。

## 阻塞项 / 修改要求

1. 新 runner 已在两个 fresh 临时根跑通真实 domain C0～C7；C2 snapshot 输出、DB placement、C4 decisions digest 和 backup/restore 目录接线均已在链上验证，旧 M6 coordinator 不再替代 runner 主证据。
2. runner 层已补 C1/C3/C4/C5/C7 的最小故障注入；fresh domain 链已覆盖 C7 crash/reopen 和成功后 first-write/file-guard；RCUT-RB-01 统一失败矩阵也已通过。
3. 已重新执行 SecretStore binding 与 path safety 修复后的 server 全量回归，68 个 spec/468 个测试通过；R0-A 定向 13 个 spec/103 个测试，workspace/server/web typecheck/build、Prisma/G1/capability、git diff --check 通过，最终摘要已写入 progress 与矩阵。
4. 自动化与静态证据已无本轮新增阻塞；当前仍不允许生成 AUTH-C1/C5/C7，不允许真实停写、真实 Keychain、真实 workspace/dataRoot、真实 DB 或真实 provider 操作，直到独立 Review 完成。

## 复核者

Scrutiny：Codex（静态只读复核；未代签真实授权）。
