---
doc_id: AIR-RCUT-R0B-RUNTIME-001
status: passed_release_shadow_waiting_human_SH10
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: reviewer, migration-reviewer, ai-agent
source: real-source sealed snapshot、隔离 A/B shadow、SH-01～SH-09 execution
---

# R0-B remediation Runtime Review

## 运行结论

真实源单文件恢复、sealed snapshot、隔离 A/B full shadow、SH-01～SH-09 和 backup/restore rehearsal 已完成；停止在人工 SH-10。

## 隔离边界

- source、A/B target workspace、A/B SQLite/data root 分离。
- 最终 target asset materialization 位于隔离 target workspace；真实 source manifest shadow 前后保持 `sha256:c16ff088...4beebb`。
- 运行使用 detached release worktree `29f40bb`，未使用当前仓库目录冒充 releaseRoot。
- 没有访问默认 Keychain、真实凭据、真实维护 API；真实 source 只新增被授权的 `structure.json`。

## 结果

- A/B 使用同一 real-source sealed snapshot 与 decisions artifact，16/16 slices succeeded；aggregate reportDigest=`sha256:daca7e92...663e781`，table-count digest=`sha256:25f14b5a...117fc0a`。
- 两边均完成 project/chapter、script、story、characters、storyboard、assets、asset-visuals、preflight、tasks、candidates、locks、layout、exports、dialogue、providers；Storyboard 65 条 child relation 均写入。
- A/B `db:verify` 全部通过，integrity=`ok`、FK=0、open blocker=0；SH-08 sentinel=0。
- coordinated backup、verify-only restore、materialize restore 通过，67 assets，恢复 DB integrity/FK 全绿。

## 停止点

`passed_release_shadow_waiting_human_SH10`。未创建 SH-10 签名、AUTH-C1/C5/C7，未执行 C0～C7；下一步只能由人工 Migration reviewer 完成 SH-10。
