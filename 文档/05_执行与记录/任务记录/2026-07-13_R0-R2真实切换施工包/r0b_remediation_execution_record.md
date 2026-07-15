---
doc_id: AIR-RCUT-R0B-EXECUTION-001
status: passed_release_shadow_waiting_human_SH10
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: luna, migration-reviewer, release-owner, ai-agent
source: R0-B blocker remediation execution
---

# R0-B 阻塞修复执行记录

## 结论

```text
R0-B = remediation_executed_waiting_human_SH10
SH-01..SH-09 = passed_release_shadow
SH-10 = awaiting_human_migration_reviewer
AUTH-C1/C5/C7 = not_generated
C0..C7 = not_run
final importer = not_run
```

本记录是给 Luna 和人工 Migration reviewer 的脱敏交付摘要；私有绝对路径、真实 JSON、真实凭据和默认 Keychain 内容不写入仓库。

## 代码与发布身份

| 项目 | 结果 |
| --- | --- |
| remediation commits | `74a6d71`、`29f40bb` |
| release worktree appCommit | `29f40bb` |
| G1 baseline machine manifest digest | `sha256:ad3b0e1ba884e20718e6e81994cbb8beaedbb9e6777e471ac2a21e4c94c2b1ea` |
| release effective schema identity | `sha256:2e9992459906946415f8072ef4ad210ba00c52393d6c83fc4d0af23e415b3559` |
| integration targeted | 74 tests passed |
| server full regression | 71 spec / 483 tests passed |
| typecheck/build/Prisma/G1/capability/diff check | all passed; `blockedIds=[]` |

`29f40bb` 增加 legacy preflight v1→V2 sourceSnapshot 兼容：只从同一事务已导入的目标 DB 证据重建快照；未知、歧义、digest 不匹配或字段不完整仍 fail-closed。

## 真实源恢复边界

- recovery archive digest：`sha256:336c9f...4b6f23`。
- 授权新增成员：`structure.json`，digest=`sha256:4eac7b...b076a0dd3`，22819 bytes。
- pre/post source manifest：除该新增成员外 `removed=[]`、`changed=[]`。
- shadow 首次意外生成的 67 个 `legacy-import` 文件已清理；最终 source manifest digest 仍为 `sha256:c16ff088...4beebb`。

## Shadow 证据

| 检查 | A/B 结果 |
| --- | --- |
| sealed source/snapshot | `sha256:c16ff088...4beebb` / `sha256:effb0794...618161a` |
| full shadow | 16/16 slices succeeded；open blocker=0 |
| aggregate reportDigest | `sha256:daca7e92...663e781`（A/B 相同） |
| canonical pre-SH09 table-count | fresh C/D 45 表完全一致；digest=`sha256:beb518e2...cfabc5c`；checkpoint=`sha256:86863a95...eabd6f2d9` |
| integrity/FK/schema | `db:verify` 全通过；integrity=`ok`、FK=0 |
| source isolation | 最终 target asset materialization 只写隔离 target workspace |
| credential sentinel | A/B artifact 与 SQLite dump 均为 0 |

## SH-01～SH-09

| ID | 状态 | 证据摘要 |
| --- | --- | --- |
| SH-01 | passed_release_shadow | 同一 real-source sealed snapshot 的 A/B fresh import |
| SH-02 | passed_release_shadow | reportDigest 与 table-count digest 完全相同 |
| SH-03 | passed_release_shadow | 16/16 succeeded，open blocker=0 |
| SH-04 | passed_release_shadow | A/B 每个 slice `db:verify`、integrity/FK 全绿 |
| SH-05 | passed_release_shadow | `IMP-M4-API-01` DTO/legacy isolation witness |
| SH-06 | passed_release_shadow | `D2-WIT-01/02/03/04/05` restart witness |
| SH-07 | passed_release_shadow | source manifest 未变化；shadow 产物隔离 |
| SH-08 | passed_release_shadow | 全局 sentinel scan=0 |
| SH-09 | passed_release_shadow | coordinated backup、verify-only restore、materialize restore；67 assets；恢复 DB integrity/FK 全绿 |

SH-09 bundle digest=`sha256:ef17078c...6ae2dd`，manifest digest=`sha256:c0524a51...c59f7e1`。

## SH-10 技术证据整改

- fresh C/D 再次使用同一 release、snapshot、decisions 完成 16/16 shadow；aggregate reportDigest 与 A/B 一致。
- C/D 在任何 SH-09 控制状态写入前封存 45 表计数，`persistence_states=0`，32/32 `db:verify` 通过。
- 外置证据根已统一收紧为目录 0700、文件 0600；secret scan=0；canonical index 和 seal 可重复重算。
- canonical index=`sha256:7ec5e52f...f480636b`，review bundle seal=`sha256:d014fc85...b192008`。
- 剩余仅为真实 plan/责任人字段、warning disposition 与人工 SH-10 签名；未生成 gate/AUTH，未执行 C0～C7。

## 停止点与下一步

现在必须停止在人工 SH-10。Migration reviewer 需要独立审阅 sealed snapshot、full report、A/B digest、source pre/post 对照和 SH-09 restore 证据后，决定是否签署 SH-10。未获得新的明确授权前，不得生成 AUTH、停写、访问真实 Keychain、执行 final importer 或进入 C0～C7。
