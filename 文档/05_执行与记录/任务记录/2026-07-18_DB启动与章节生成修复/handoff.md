---
doc_id: AIR-TASK-DB-BOOT-CHAPTER-HANDOFF-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, operator
source: task_plan.md、progress.md、findings.md
---

# DB-only 启动与章节生成恢复 Handoff

## 当前状态

- 标准服务已通过根目录 `corepack pnpm dev` 启动并保持运行。
- Web：`http://localhost:5173`。
- Server：`http://localhost:4310/api`。
- OpenCode：`http://127.0.0.1:4396`。
- 运行数据库：`/Users/liyadong/.airoaming/data/db/airoaming.sqlite`。
- 持久化状态：`db_only`，17 个 migration ledger 完整。

## 已完成

- 旧 file-mode workspace 已备份，源与备份摘要一致。
- 两个项目已通过既有 shadow/final importer 和 C0～C7 正式迁移。
- 标准启动已改为 DB-only fail-closed，不会创建空库或回退 file mode。
- `测试` 项目第 1 章已只生成一次文本 pending，未采用、未发布正式版本。
- 浏览器页面、API、项目数量、模型、pending 边界和零图片调用均已复核。
- Server 125 files / 752 tests、类型检查和全项目构建通过。

## 用户下一步

用户可以在“测试”项目查看第 1 章《杀令入棺》的完整待确认草稿，并自行选择“采用草稿”或“丢弃”。本任务没有代替用户执行该确认。

## 运维边界

- 不要重新以 file mode 写入旧 workspace。
- 不要手工复制或编辑 SQLite；恢复应使用已封存备份、cutover evidence 和现有 restore 工具。
- 不要删除 `/Users/liyadong/.airoaming-pre-db-backup-20260718-1720`、release、shadow、cutover evidence 或 archive，除非另有明确的清理授权。
- 本任务没有授权任何图片生成；后续图片验证仍需单独授权。

## 关键证据

- 备份清单：`/Users/liyadong/.airoaming-pre-db-backup-20260718-1720/BACKUP-MANIFEST.md`。
- Cutover 最终证据：`/Users/liyadong/.airoaming-cutover-20260718-evidence/`。
- 真实文本响应：`/Users/liyadong/.airoaming-cutover-20260718-runtime-test/chapter-generation-response.json`。
- 页面截图：`evidence/2026-07-18_DB-only章节待确认草稿.png`。
