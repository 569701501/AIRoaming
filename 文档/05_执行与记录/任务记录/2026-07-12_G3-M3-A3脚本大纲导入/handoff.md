---
doc_id: AIR-G3-M3-A3-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: M3-A3 实现与 SQLite 集成证据
---

# Handoff

## 当前切片

- 入口：`db:import --kind shadow --slice script-outline --snapshot <sealed-dir> --decisions <normalized-decisions.json> --database-url <file:...> --report <output>`。
- 前置：同一目标数据库已经完成 Project/Chapter shadow；A3 不读取活动 workspace，也不重建缺失的 Project/Chapter。
- 产物：ProjectScriptOutline version 1、ChapterScriptVersion history、ImportedEntitySource 和 current 指针。

## 明确未完成

- `script-pending.json`、`script.revisions/latest.json`、Story/Storyboard/Preflight、Task/Asset/Candidate/Lock、Layout/Export、Dialogue/provider metadata 尚未导入。
- A3 不是 full importer、db-verify 或 final/activate 入口；两轮 shadow 等价和 production cutover 仍未完成。

## 下一步

补齐 pending/revision 的历史证据导入后，进入 Story/Outline-to-Story importer；新切片必须继续复用同一 Project subtree 事务和来源账本。
