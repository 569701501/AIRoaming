---
doc_id: AIR-TASK-20260721-FILE-MODE-CLEANUP-PLAN
status: completed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户要求继续移除已完成且无用代码
---

# file-mode 写入口收缩计划

## 目标

在 DB-only 已完成切换且首次业务写已经发生的前提下，审计残留 file-mode 写入口和 cutover 编排，删除不再承担生产、迁移、恢复或历史读取责任的最小安全集合。

## 非目标

- 不删除旧 metadata archive、协调 backup、Asset 物理文件或历史只读解码。
- 不改写 0001～0017 migration、Prisma Schema 或标准数据库。
- 不把仍可用于新机器恢复、损坏数据库恢复或证据核验的工具仅按“切换已完成”判死。
- 不覆盖工作树中与本任务无关的用户修改。

## 当前阶段

已完成。

## 阶段

1. 完整读取 DB-only、迁移、备份恢复和模块边界事实源。
2. 盘点 file-mode 分支、显式模式开关、CLI、cutover/importer 和 Nest 注入关系。
3. 将候选分为生产保留、恢复保留、历史只读保留、测试专用、可删除。
4. Worker 只删除最小安全集合并同步当前事实源。
5. 执行聚焦/全量测试、类型、构建、Prisma 和适用运行路径。
6. 完成 Scrutiny Review、Runtime/User Review、完成记录与长期记忆。

## 验收标准

- 每个删除项均有无生产调用、无迁移恢复责任、无历史读取责任证据。
- 标准 DB-only 启动与当前业务路径不变。
- importer/backup/restore 中仍必要的只读或恢复边界不被误删。
- 类型、构建、Prisma、相关集成与适用用户路径通过。

## 退出标准

- 候选矩阵和删除理由落盘。
- 代码差异与目标一致，无无关覆盖。
- Scrutiny Review 与 Runtime/User Review 有明确结论。
- 完成记录、会话记录和长期记忆同步。

## 深思熟虑角色边界

- Orchestrator：读事实源、维护阶段与退出标准，不实施功能改动。
- Worker：只执行证据充分的最小删除。
- Scrutiny Review：只读检查调用、恢复契约、差异和测试证据。
- Runtime/User Review：验证标准 DB-only 启动或等价隔离运行路径，不触碰真实业务数据。
