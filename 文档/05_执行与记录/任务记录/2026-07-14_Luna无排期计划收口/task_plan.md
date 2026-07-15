---
doc_id: AIR-LUNA-NOSCHEDULE-PLAN-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: human, luna, ai-agent, reviewer
source: 用户对 Luna 执行速度与无排期要求、v5 C4 真实证据
---

# Luna 无排期执行计划收口

## 目标

交付一份 Luna 可直接执行的唯一当前入口，消除旧状态冲突和日历等待误读。

## 强制验收标准

1. Luna 当前计划不包含工期、预计天数、开始日期、结束日期或“到某日再执行”。
2. 文档日期只作为创建/更新/证据时间，不控制任务启动。
3. 当前状态统一为 v5 C4 passed、等待 AUTH-C5。
4. AUTH-C5 后 C5→C6 连续；AUTH-C7 后 C7 连续；R2 授权后 OBS-01～10→G4→G5 连续。
5. 只在人工授权门、fail-closed blocker、E0 无候选通过或最终用户签收处停止。
6. 旧 maintenanceWindow 明确为 C1 历史证据，不得扩展成剩余工作排期。

## 阶段

- S1：核验当前证据和文档冲突。
- S2：新增当前唯一入口并同步总计划。
- S3：同步 R0-R2 矩阵、复核清单和项目索引。
- S4：删除时间估算，完成 Scrutiny 与 Runtime/User Review。
