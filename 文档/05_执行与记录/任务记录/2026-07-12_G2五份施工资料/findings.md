---
doc_id: AIR-TASK-20260712-G2-CONSTRUCTION-PACK-FINDINGS
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G2 五份施工资料探索
---

# Findings

## 已知基线

- G1 已物化 44 模型与 0001～0008 migration，但 runtime 只完成 Project/Chapter/Script 最小 DB 垂直切片。
- G2 不新增第二套数据库事实源；目标是补版本发布、pending、freshness、NewWorkGate 和任务适用性。
- 完整 G2-F 依赖持久 Task/Attempt/lease 和 importer；这些能力不能在 G2 文档中假装已存在。

## 已确认结论

- G1 已有 current/pending/source/digest/rowVersion 字段和基础 formal/projection/task trigger；G2 不需要新增模型或字段。
- G2 数据库 overlay 可只用 2 个 active pending partial unique index 和 14 个 trigger 收口；freshness 保持查询派生。
- 当前 `ProjectRepository` 只适合 Project/Chapter/Script C3 基座，继续塞入 Story/Board/Preflight 多表事务会扩大巨石；G2 使用分层 command repository。
- 当前 fake provider 只有 success/delay/429/500/late_success，需在原 harness 上扩展 run-scoped barrier，不能新建第二套 E2E 系统。
- `ChapterScriptPending` 必须作为独立 AI suggestion 纳入 gate、adopt/discard API；采用只写 Working Copy，不创建 ScriptVersion。
- Storyboard 新 Shot 采用 project/chapter/pending/requestId 的 SHA-256 确定性 ID，既解决丢响应又不新增 command log 表。
- G2 新 mutation 只在 `g2_db` capability 开启时可用；file mode 继续旧路径，DB mode 对缺 expected 字段的旧写路径 fail-closed。

## 残留边界

- 本任务未物化 0009 SQL、Repository 或测试文件；施工资料中的脚本是实施目标，不是已存在命令。
- 完整 worker/lease/restart/importer 验收仍依赖 G1 未接线能力，必须保持 `integration_blocked`。
- 0009 normalized SQL 在 G2-A1 实现时写入单一 `g2-overlay-contract`；本文已冻结对象名、timing/event/WHEN 和拒绝谓词，不允许实现时增删语义。
