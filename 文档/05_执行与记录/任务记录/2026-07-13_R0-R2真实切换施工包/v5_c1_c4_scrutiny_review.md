---
doc_id: AIR-RCUT-V5-C1C4-SCRUTINY-001
status: passed
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: release-owner, migration-reviewer, operator, luna, ai-agent
source: v5 production status、C1～C4 sealed evidence 与 Runbook
---

# v5 C1～C4 Scrutiny Review

## 结论

```text
Scrutiny Review = passed
scope = v5 C1～C4
completedThrough = C4
current evidence = sha256:69d08d7b8a28343907fa939d4f6040d7807247eb46f9a2c39512c806f6328642
next state = WAIT_AUTH_C5
```

该结论只证明 C1～C4；不授权 C5/C6/C7、activation、首笔业务写入或 R2。

## Identity

| 字段 | 值 |
| --- | --- |
| cutoverId | `cutover-20260714-immediate-sanitized-v5` |
| appCommit | `9227e8dfefde59a25f81b53a41074f3971c24d05` |
| planDigest | `sha256:2ba999ffee2061cdf57110fc10cf4720748431ba1aeaf603dab12c19863fc096` |
| runId | `cutover-final-20260714-immediate-sanitized-v5` |
| effectiveSchemaManifestDigest | `sha256:2e9992459906946415f8072ef4ad210ba00c52393d6c83fc4d0af23e415b3559` |

## Step evidence

| Step | summary | step digest | 关键 artifact |
| --- | --- | --- | --- |
| C1 | `CUTOVER_C1_OK` | `sha256:fad9d8a8...e83b94a` | runtime bundle |
| C2 | `CUTOVER_C2_OK` | `sha256:d72cceb4...7ce8143` | source/snapshot/runtime bundle |
| C3 | `CUTOVER_C3_OK` | `sha256:b05bfe53...158d68` | credential expectations；verify_existing |
| C4 | `CUTOVER_C4_OK` | `sha256:eb13feab...3ca365` | final report、backup、decisions、redacted settings |

production reader 只读返回 `completedThrough=C4`，manifest 含 C0～C4 五个连续 step，没有越级或缺步。

## 复核项

- [x] frozen release HEAD 精确匹配 appCommit，工作树 clean。
- [x] AUTH-C1 精确绑定 v5 C0 evidence；没有复用 v4/v3 授权。
- [x] C1 绑定 plan 指定旧 file runtime，同一 runtime identity 完成 drain/close/bundle。
- [x] C2 source/snapshot digest 已固定，source 未改写。
- [x] C3 使用 `already_sanitized/verify_existing`，只读 probe/fingerprint；无 Keychain put/delete、无 settings 写回。
- [x] C4 final/ready、pre-cutover backup、verify-only/materialize restore 通过。
- [x] manifest 和 step digest 可由 production reader 读取；私有 evidence 权限满足 0700/0600。
- [x] 未发现 C5/C6/C7 step、C6_READY、COMPLETED、activation 或首笔业务写入证据。
- [x] 当前停止点是独立 AUTH-C5，不得由 AUTH-C1 或日期自动推导。

## maintenanceWindow 解释

v5 plan 中的 maintenanceWindow 是 C1 已完成安全校验的一部分，随 planDigest 和 C1 evidence 冻结。它不是 C5～G5 的排期，也不要求 Luna 等到某个日期。剩余步骤只受前序 evidence、独立授权和 fail-closed 条件控制。

## Handoff

下一执行者读取总计划 `luna_current_handoff.md`，先只读复核本 evidence；收到精确 AUTH-C5 后立即连续执行 C5→C6，随后停在 AUTH-C7。
