---
doc_id: AIR-G05-REMAIN-LUNA-PLAN-001
status: active
created: 2026-07-14
updated: 2026-07-15
owner: AI漫游项目
audience: luna, developer, qa, human
source: 当前代码、v5 C0～C7 production evidence、R2 通过结论、G4/G5 正式方案与验收清单
---

# 给 Luna 的连续执行计划

## 1. 当前执行入口

完整、可直接执行的唯一当前计划是：

```text
文档/05_执行与记录/任务记录/2026-07-14_G0至G5剩余连续施工/luna_current_handoff.md
```

本文件保留为稳定旧链接的兼容入口，不再维护一套重复状态机。Luna 必须读取上述文件后执行。

## 2. 当前状态

```text
S0 / W1 / R0B / SH-10 / C0～C7激活 = completed
completedThrough = C7
evidence = sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452
current = G4_B_IN_PROGRESS
```

已完成顺序：

```text
AUTH-C5 -> C5 -> C6 -> AUTH-C7 -> C7激活
```

剩余顺序：

```text
首笔受控 DB-only 业务写（已完成） -> R2 OBS-01～10（已通过） -> G4-A（已完成） -> G4-B～F -> G5-M0～M8 -> 用户签收
```

## 3. 执行节奏

- 不安排工期、预计天数、开始日期、结束日期或等待日期。
- 授权满足即立即执行；同一授权区间内连续推进。
- 除人工门、fail-closed blocker、G5 E0 决策和最终用户签收外，不暂停询问下一步。
- 任何文档/证据日期只用于追溯，不用于延迟执行。
- v5 历史 maintenanceWindow 已随 C1 完成，只是不可变证据字段，不约束 C5～G5。

## 4. 不得回退

- 不重做 R0B、SH-10、C0～C4。
- 不采用旧 `WAIT_R0B_AUTH`、v3 AUTH-C5 `not_ready` 或 v4 等待窗口作为当前状态。
- 不复用 AUTH-C1 或旧 identity 的授权文件。
- 不进入 G6 素材包或视频链路。
