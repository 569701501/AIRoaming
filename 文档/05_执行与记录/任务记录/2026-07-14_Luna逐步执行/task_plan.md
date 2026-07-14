---
doc_id: AIR-LUNA-STEP-EXEC-PLAN-001
status: completed_r2
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: human, luna, ai-agent, reviewer
source: luna_current_handoff.md、authorization_gates.md、real_cutover_runbook.md
---

# Luna 逐步执行任务计划

## 目标

从 v5 C4 继续按安全边界完成真实切换和 R2 DB-only 观察；不重复已完成步骤，不越过人工授权门，不按日期等待。

## 最终状态

```text
completedThrough = C7
currentEvidence = sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452
r2 = DB_ONLY_OBSERVATION_PASSED
next = G4-A
```

## 已完成阶段

1. identity/status/evidence 只读核验。
2. AUTH-C5、C5/C6 与 C6_READY。
3. AUTH-C7、C7 activation 与 COMPLETED。
4. 首笔受控 DB-only 写入与 file guard 复核。
5. R2 OBS-01～10。
6. R2 Scrutiny Review 与 Runtime/User Review。

## R2 中关闭的实现缺口

- OBS-06：新增 `0011_g2_project_purge_pointer_teardown`，只允许“Project deleting + processed project.delete_files + 无 active runtime task”的协调指针拆除；原阻塞项目已完成 purge，Outbox 审计行保留。
- OBS-07：新增 `db-only-coordinated` 备份/恢复类型，分别保存当前 release schema identity 和历史 cutover lineage identity；verify-only、fresh materialize、当前应用读回均通过。
- OBS-08 Asset：DB 模式按 Asset `storageKey` 读取物理文件，兼容 `legacy-import/{projectId}/...`，不再误用 legacy 展示路径。
- OBS-08 章节：DB Workbench 章节选择改为纯读取投影，不改写 `currentChapterId`、rowVersion 或 updatedAt。

## 固定边界

- 不重做 C0～C7，不重复索取已经消费的 AUTH。
- 不删除 backup/archive，不执行 down migration。
- 首次 DB 写后禁止 file-only 回退。
- 按总 Handoff 继续 G4/G5；不进入 G6/视频链路。
