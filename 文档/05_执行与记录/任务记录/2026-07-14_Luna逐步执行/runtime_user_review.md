---
doc_id: AIR-LUNA-STEP-RUNTIME-001
status: passed
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: reviewer, human, ai-agent
source: 真实 target DB/workspace、fresh restore 与当前构建产物
---

# R2 运行与用户路径复核

结论：`passed`

- 当前应用在目标库和 fresh restore 上均以 `g2_db` 启动并读出 1 个项目、2 个章节。
- 正式章节的 Script/Story/Storyboard/Preflight/Workbench 均可读；空章节以空态正常返回。
- 章节切换是纯读取：目标 DB 前后摘要均为 `sha256:cab0b96d88dc24a7e87925aea6bc04441d0f8db0e76fac5537ce4ab64c49d739`。
- 目标与恢复副本的 67/67 ready Asset 均通过官方文件读取服务，字节数、MIME 与 sha256 全匹配。
- OBS-06 临时项目已从 Project/Chapter/Script/Story/Storyboard/Preflight/Asset/Task 删除，processed Outbox 审计行保留。
- 目标与恢复 DB integrity=`ok`、foreignKeyViolations=0；0011 migration ledger 完成。
- archive 副本修改不影响原 archive、目标 DB 或运行态；backup/archive 均保留。

运行态没有残留 blocker；允许按总 Handoff 进入 G4-A。
