---
doc_id: AIR-TASK-20260715-SCRIPT-SOURCE-STATE-RUNTIME
status: passed_db_isolated
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: fresh SQLite 集成测试、全量回归和发布门
---

# Runtime / Repository Review

## 结论

`passed_db_isolated`

## 已验证用户语义

1. 相同完整原稿重复保存会复用同一不可变版本；原稿版本不可更新。
2. 分析候选只有在来源块完整归属时才能确认成拆章目录。
3. 目录确认后先形成全部章节入口和批次项，默认第 1 章复用并更新标题。
4. 每章独立进入 materializing、verifying、pending_ready；忠实度有硬问题时不能产生 pending。
5. 导入 pending 完整绑定 6 类来源，采用/丢弃均被拒绝；“确认章节”直接发布正式版本。
6. AI 第 2 章 pending 绑定确认大纲、该章章节卡和第 1 章当前正式正文；已有正式章不能再次起草。
7. 含原稿、目录、批次、报告和正式版本的项目可经过 outbox 协调删除并完整 purge。

## 证据

| 验证 | 结果 |
| --- | --- |
| Shared 全量 | 26 files / 152 tests passed |
| Server single-fork 全量 | 96 files / 573 tests passed |
| 双流程 fresh SQLite 仓储 | 2/2 passed |
| 备份恢复隔离 | 40/40 passed |
| Workspace typecheck/build | passed |
| Prisma validate | passed |
| G1 manifest/schema/migration | passed |

## 不适用项

本包没有接 Web、动态 Prompt 或对话工具，因此不声称真实页面已经出现拆章目录、导入进度或“确认章节”动作。页面运行复核留到对应接线包。
