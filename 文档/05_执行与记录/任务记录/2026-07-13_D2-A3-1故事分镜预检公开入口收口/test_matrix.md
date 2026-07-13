---
doc_id: AIR-D2-A3-1-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: A3-1 contract
---

# 测试矩阵

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| A3-LEGACY-01 | 7 个旧写入口 | DB 模式均 HTTP 409，含 operation/reason/replacement，前后无文件/DB 写 |
| A3-STORY-01 | Story modern replacement | fresh SQLite create/update/confirm/discard，projection/current/pending 同事务 |
| A3-BOARD-01 | Storyboard modern replacement | fresh SQLite pending/update/confirm，Shot projection 与 CAS/restart 一致 |
| A3-PRE-01 | Preflight modern replacement | preview/confirm 使用服务端 source snapshot；伪造 ready/source 被拒 |
| A3-FRESH-01 | freshness cascade | 新 Story/Storyboard 版本只使下游 stale，不删除历史 |
| A3-CAP-01 | capability | 8/36，aggregate implemented，blockedIds 精确为 4，其他 blocker 不变 |
| A3-GATE-01 | 全量门禁 | server、typecheck、web build、Prisma、G1、diff check 全绿 |
