---
doc_id: AIR-D2-A7-FINDINGS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: D2-A7 代码复核、FIN 测试与全量回归
---

# D2-A7 发现与决策

## 关键决策

1. Final 不复制 16 套 importer；`FullShadowImporter` 继续产生 shadow child evidence，final aggregate run 是唯一权威终态。
2. fresh deploy 后没有 `PersistenceState` 行时，由 final importer 创建默认 shadow substrate；这不是业务数据，也不允许绕过非空目标检查。
3. final report 的 `entityCounts` 只能位于 `summary.entityCounts`，codec 使用 exact keys，保证 Prisma JSON round-trip 可验证。
4. ready coordinator 不能仅相信 final run status；必须重新解码 aggregate report、核对 verification slice、capability、secret、backup、maintenance 和 state shape。

## 已修复问题

- fresh target 的 PersistenceState 缺失导致 final import 无法开始。
- final report 创建函数把 `entityCounts` 错写到顶层，导致 replay/verifier 解码失败。
- final verifier 原先只验证 report digest，未逐项绑定 16 个 child run；现已补齐 child kind/status/digest/identity 检查。
- final decisions artifact 原先在 verifier 中只对 shadow 强制检查；现已对 final 同样强制检查。
- final CLI 原先会把相对路径 `resolve` 成绝对路径；现已在 Prisma 初始化前拒绝相对、未知、重复和额外参数。
- ready coordinator 原先未重新解码 aggregate report；现已绑定 report、verification 和 release identity。

## 保留边界

- D2-A7 只证明隔离 fixture 的 final/ready 语义，不证明真实生产数据可切换。
- M6 的 `db:activate`、metadata archive、first business write 和 rollback 仍未实现。
- 真实 Keychain、真实 provider、真实 workspace/DB 和真实停写仍禁止。
