---
doc_id: AIR-TASK-20260716-SCRIPT-IMPORT-ENHANCEMENT-PROGRESS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 进度

- [x] Orchestrator 读取事实源并冻结方案
- [x] 长稿分层分析
- [x] 后台批次与重启恢复
- [x] 失败项查询、轮询与重试 UI
- [x] 自动测试和真实用户路径
- [x] 文档、双 Review、记忆与提交

# 阶段记录

1. 0017 已有批次/章节项状态、attempt、错误和 CAS，足以承载专用后台执行器，无需新 migration。
2. 通用 GenerationTask 有完整 lease 体系，但导入批次已是独立事实源；本任务不复制成第二套任务状态，只增加专用单进程 worker 和恢复规则。
3. 长稿叶子和合并必须使用隔离 session；同一 session 连续发送分片会重新累积历史，不能解决上下文上限。
4. 首轮 DB 矩阵发现空闲 300ms 数据库轮询会与 SQLite 外部读取争锁；改为启动恢复一次、主动唤醒和批次内排空后，G5-M6 回归通过。
5. Shared 153/153、Server 594/594、三端与 E2E typecheck、三个 DB-only 定向用户路径和 Skill validation 均通过。
