---
doc_id: AIR-TASK-20260721-0017-CLEANUP-PROGRESS
status: completed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: 0017 模型与兼容代码收缩执行记录
---

# 进展

## 2026-07-21

- 阶段状态：completed。
- 已读取双流程来源与状态契约、核心用户流程、相关完成记录和当前工作树。
- 确认 0017 是当前 A4/B1～B5 生产路线的数据底座，空表本身不构成删除证据；9 张表和 20 个 trigger 全部保留。
- 删除旧 `script-import.util.ts`、专用测试、`ChapterScriptService/ProjectsService` 两层旧编排和 capability 占位，净减 677 行。
- 同步双流程契约、模块总览、AI 上下文、测试体系、完成记录、会话与长期记忆。

## 验证

- 0017 contract/source repository/capability：9/9。
- Project DB-only 主集成：42/42。
- Shared 双流程：38/38。
- Server 128 files / 766 tests：758 项直接通过；备份文件并行超时后独立 40/40 通过。
- Workspace typecheck、E2E typecheck、三包 build、Prisma validate：通过。
- E2E 环境 35/35、prepare 3/3；DB-only B1～B5 Chromium 1/1。
- 标准数据库：`db_only`、17 migrations、53 张业务表、242 triggers、`integrity_check=ok`、无 FK 问题。

## Handoff

任务完成。后续可继续审计标准启动后仍保留的 file-mode 写入口和 cutover 编排，但必须逐项证明不承担恢复与历史读取责任。
