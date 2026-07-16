---
doc_id: AIR-TASK-20260716-SCRIPT-IMPORT-PRODUCTION-PROGRESS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 进度

- [x] 事实源与代码现状盘点
- [x] B1/B2 严格分析
- [x] B3 目录确认
- [x] B4 整批整理与验证
- [x] B5 逐章确认
- [x] 测试、复核与文档
- [x] 提交并确认工作树干净

# 阶段记录

1. 已确认 0017 数据层完整但未接生产；旧对话仍走 file-mode 正则分析和直接写入，DB-only 写入已退役。
2. 已将 B1/B2 接到不可变原稿与 Shared 严格分析契约；用户反馈生成完整新候选，阻断项未解决时禁止确认目录。
3. 已实现 B3 一次确认最新目录，创建全部章节入口、ChapterMap、ImportBatch 和逐章 BatchItem。
4. 已新增 `ScriptImportBatchService`：逐章 materialize/verify、一次仅格式修复、单章失败隔离、整批结果投影；当前在确认请求内同步执行。
5. 已实现 import pending 全文只读和专用“确认章节”，不显示采用、丢弃、保存或完成本章；单章确认直接形成 `origin=import` 正式版本并允许进入剧情结构。
6. 已修正项目级导入对话作用域：分析候选、目录确认和刷新恢复保持在同一项目剧本线程，不会因当前章节切换而丢失决策卡。
7. 已完成自动验证：Shared 26 files / 152 tests；Server 100 files / 590 tests；E2E 环境 34/34、prepare 3/3；AI 显式单章和已有剧本 B1～B5 的 DB-only Chromium 各 1/1；typecheck、build、E2E typecheck、矩阵登记和 Skill 校验均通过。
8. 已完成产品、架构、模块、测试、会话记忆、长期记忆、Handoff、Scrutiny 和 Runtime/User Review 文档同步。
