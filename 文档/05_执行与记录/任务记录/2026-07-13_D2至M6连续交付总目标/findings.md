---
doc_id: AIR-D2-M6-MASTER-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: orchestrator, worker, reviewer, human
source: 当前代码、CLI、M5/D2 证据与 G1/M6 文档
---

# Findings

## P0 基线

- 当前总 capability 数为 8，operation 数为 36；`blockedIds` 为 6，没有提前减少。
- final importer 继续以 `MIGRATION_FINAL_IMPORT_NOT_READY` 拒绝，符合 fail-closed 停止线。
- D2-A2-1 已实现并提交 `1f22861`；D2-A2-2 已提交 `077762d`；D2-A3-1 已完成并待独立提交，下一步为 D2-A3-2A，不得跳到 M6。

## 1. 当前阶段

- M5 已完成；“当前是 M5 实施中”不符合最新验收事实。
- 当前位于 D2：A0、A1、A2-1、A2-2、A3-1 已完成，下一阶段为 A3-2A。
- A3-2A 正在收口 Character/Asset：identity、queue/source freeze、Character worker/Visual confirm、SceneVisual worker、公开 scene queue/source projection 已完成；delete、CandidateLock 仍未完成。
- CandidateLock 已完成 DB 线性 revision/current pointer/replay；Character delete 与 complete images 仍需独立切片，聚合 capability 继续 partial。
- `complete_chapter_images` 已完成 DB milestone CAS；Character delete 仍依赖尚未实现的 Outbox consumer，不能误报为完成。
- 三个同步/批量参考图 operation 已正式 retired，剩余 Character/Asset blocker 只剩 `delete_character_reference`；其物理清理必须等待 D2-A6 Outbox consumer。
- M6 仍为 prerequisite_blocked。

## 2. capability

- registry 有 8 个聚合 capability 和 36 个公开写 operation。
- 已绿：`task_create_claim_complete_cancel_recover`、`settings_credential_secret_store`。
- 阻塞 4 项：Character/Asset/Lock、Layout/Export、Dialogue、Delete/Outbox；Project/Script 与 Story/Storyboard/Preflight 已收口。
- 仅靠稳定拒绝不能把 operation 写成 implemented；危险 legacy 操作需要正式 `retired + replacement + evidence` 语义。

## 3. 代码能力

- G2 已有 Script/Story/Storyboard/Preflight 底层 version repositories，但公开旧 Service 路由仍被 capability guard 阻断。
- Character/Asset/Candidate 有部分 DB substrate 与持久任务，但公开写仍大量依赖 `LocalProject`/旧文件。
- Layout/Export 与 Asset package 仍明显扫描/写旧业务目录。
- Dialogue 的 thread 与 pending 仍以 Map 为运行事实。
- `OutboxEvent` 表、触发器和 5 类 handler 契约已存在，但 runtime consumer 未实现。
- 16-slice full shadow 已有；final runner 未实现。
- M5 backup/restore 已完成；activate CLI/服务未实现。

## 4. 执行偏好变化

- 用户明确要求把剩余工作作为一个目标交给 Luna，避免逐步骤查看。
- 技术阶段仍必须顺序执行并各自验收；用户人工确认只保留在真实环境切换前。
- 旧 active 文档中“不要一次交给 Luna”“每阶段等待授权”的表述需要由本总 Handoff 取代。

## 5. 安全边界

- 开发、测试、临时根 execute rehearsal 可连续执行。
- 真实 workspace/DB/Keychain/provider、真实停写、pre-cutover、archive 和 activate 必须最后单独授权。
