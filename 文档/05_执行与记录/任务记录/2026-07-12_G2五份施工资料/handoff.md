---
doc_id: AIR-TASK-20260712-G2-CONSTRUCTION-PACK-HANDOFF
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G2 五份施工资料完成交接
---

# Handoff

## 交付结果

五份 G2 施工资料已完成并进入正式索引。开发模型可以从 `G2-A0` 开始，不能用“完成整个 G2”作为单个任务。

## 必读顺序

1. `2026-07-12_G2施工包_依赖边界与阶段门禁.md`
2. `2026-07-12_G2施工包_数据库Overlay清单.md`
3. `2026-07-12_G2施工包_文件Repository与事务地图.md`
4. `2026-07-12_G2施工包_API与幂等契约.md`
5. `G2施工包_可执行测试与证据计划.md`
6. 原 G2 契约字典和主方案。

## 推荐首个实施任务

只实施 `G2-A0`：Shared canonical JSON/JCS、四类 DocumentCodec、SourceSnapshot 类型、Freshness/ProductionState 纯函数和 stable Shot ID；不改数据库、Controller、worker 或 UI。退出条件只使用 Shared unit/golden/typecheck。

## 禁止

- 不得先做 reviewer/签名/bundle/CAS 审查流程。
- 不得在 G2-A0 顺手实现 0009 或业务 Repository。
- 不得把 G1 persistent worker/importer 的缺口标为 G2 已完成。
