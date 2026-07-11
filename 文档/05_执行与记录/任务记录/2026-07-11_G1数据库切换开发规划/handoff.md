---
doc_id: AIR-TASK-20260711-G1-DB-CUTOVER-HANDOFF
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, dba, qa
source: G1 规划交接
---

# G1 DB-only 切换规划交接

## 已交付

- `文档/04_方案与决策/2026-07-11_G1数据库事实源与DB-only切换开发方案.md`
- `文档/04_方案与决策/2026-07-11_G1数据库Schema字典与旧数据映射.md`
- `文档/06_测试与验收/G1数据库迁移执行与验收清单.md`
- 本目录 task_plan/progress/findings/handoff。

## 当前状态

- 规划完成；三份正式文档已按用户继续进入 G2 的阶段语境更正为 `accepted`，功能仍未实现。
- 未修改 Prisma Schema、migration、业务代码、数据库、SecretStore 或真实 workspace。
- M0 的 Prisma/SQLite、Keychain、runtime bundle 与异常恢复 E0 是实施门禁，不是待补产品决策。

## 实施入口与停止线

G0 安全网通过后才进入 G1 M0。必须先用临时数据库和假秘密完成探针；不得以探针失败为由降级成明文、DB/file 双写或旧 JSON fallback。正式切换必须按 shadow、maintenance、final snapshot/runtime bundle、verify、activate 和 firstBusinessWriteAt 回滚边界执行。

## 复核

- Static/Scrutiny Review：规划范围通过。
- Runtime/User Review：不适用；实际迁移、故障演练和 DB-only 观察期完成后补证据。
