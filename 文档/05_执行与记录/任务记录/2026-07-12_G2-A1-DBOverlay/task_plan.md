---
doc_id: AIR-G2-A1-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2 五份施工资料与当前仓库事实
---

# G2-A1 DB overlay / Repository substrate

## 目标

在不改写 G1 八条迁移、G1 manifest 和既有运行时基线的前提下，落地 G2 的 `0009_g2_version_freshness_overlay`、直接可验证的 overlay contract，以及后续版本命令实现可复用的事务重试、错误映射和只读查询基座。

## 本阶段范围

1. 手写 `0009` SQLite migration：2 个 partial unique index、14 个正式触发器、临时 preflight guard 及其清理。
2. 新增 overlay contract 与独立测试；验证对象数量、SQL 形状、索引条件和临时对象清理。
3. 新增 G2 runtime ledger helper，但不把 G2 迁移接入 G1 `PrismaService` 启动门禁。
4. 新增版本事务 runner、数据库错误映射、Chapter 版本查询 repository 和命令 repository 的稳定接口。

## 明确不做

- 不实现 Script/Story/Storyboard/Preflight 的完整命令 API。
- 不改 G1 migration source/manifest/history/checksum。
- 不新增 CLI、reviewer、CAS、digest 绑定流程。
- 不改变产品 API、worker 或页面。

## 退出标准

- 新鲜 SQLite 按 0001–0009 部署成功；0009 只有约定的 2 index + 14 trigger，临时 guard 不残留。
- overlay contract 直接检查通过，G1 原有测试/类型检查不回归。
- A1 新增 TypeScript 单测通过；错误映射、重试边界、Chapter 查询契约有证据。
- 完成 scrutiny review 与 handoff，记录剩余的 B/C1/D1 依赖。

## 结果

- [x] A1 范围与记录
- [x] 0009 overlay SQL 与直接 contract
- [x] G2 ledger、事务重试、错误映射、查询与 repository 接口
- [x] fresh deploy、类型检查、全量回归
- [x] scrutiny review、handoff、完成记录
