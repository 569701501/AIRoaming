---
doc_id: AIR-TASK-20260721-FILE-MODE-CLEANUP-FINDINGS
status: completed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: DB-only 契约、迁移恢复代码与调用证据
---

# 发现

## 需求理解

用户要求继续清理迁移完成后仍遗留的后端代码。本轮聚焦标准 DB-only 启用后仍存在的 file-mode 写分支与一次性 cutover 编排。

## 初始约束

- `PersistenceState.firstBusinessWriteAt` 已存在，file-only 回退永久禁止。
- 旧 workspace metadata、archive 和 backup 仍可能承担恢复输入或证据责任，不能连同日常写入口一起删除。
- Asset 字节继续位于文件系统，不属于可删除的 file-mode metadata 写入。

## 候选矩阵

| 候选 | 生产/恢复责任 | 结论 | 证据 |
| --- | --- | --- | --- |
| 项目级 `script/reset` 与 `impact-preview` | 无 | 删除 | 前端 API 包装无调用；DB service 只返回 `LEGACY_WRITE_ROUTE_DISABLED`；preview 无消费方 |
| `clearProjectChaptersDir` / `clearLegacyStoryDir` | 仅服务旧 reset/整本导入 | 删除 | 整本导入已在上一轮删除；剩余唯一调用为 reset |
| callback 版 `CutoverCoordinator` | 无生产入口 | 删除 | 只被自身 spec 与旧综合演练引用；正式 `db:cutover` 使用 `DbCutoverService`、`CutoverEvidenceStore`、`cutover-runner` |
| `m6-c0-c7.rehearsal.spec.ts` | 真实全链路回归 | 保留并迁移 | 覆盖 final import、backup/restore、API read、activate、首笔写与回滚；改用正式 evidence 格式 |
| snapshot/final importer/ready/activate | 新安装、旧数据恢复、证据核验 | 保留 | 仍有 CLI/production runner 调用，且 activation 与 migration identity 依赖 |
| backup/restore/metadata archive | 数据库损坏恢复和切换审计 | 保留 | 当前 DB-only 回滚契约明确要求协调应用 backup，不允许 file-only 回退 |
| `file-mode-guard` | 首笔 DB 写后防回退 | 保留 | `PrismaService` 启动边界仍调用 |
| Asset 文件写入 | 当前运行职责 | 保留 | SQLite 保存业务事实，Asset 字节仍落受控 workspace |
| Story/Storyboard/Preflight 的 file fallback | 测试与 file dialogue 仍有调用 | 本轮不删 | 删除需同步退役整套 file E2E/显式 file runtime，不属于可证明无调用的最小集合 |

## 风险

- 把历史只读 adapter 当成写入口删除，会破坏 importer 或旧记录展示。
- 把协调 backup/restore 当成一次性脚手架删除，会失去数据库损坏或应用回滚后的恢复能力。
- 当前工作树有其他未提交改动，必须做文件级和差异级隔离。

## 关键决定

- 不按“已经切到 SQLite”直接删除 importer/backup/restore；它们是恢复入口，不是日常重复实现。
- 不把 0017 或历史 migration trigger 当生成器产物删除；迁移账本与 DB invariant 仍依赖这些历史 SQL。
- 本轮只删除零生产调用或已被正式实现完整替代的链路。

## 体量与 trigger 复核

| 指标 | 当前值 | 解释 |
| --- | ---: | --- |
| 后端生产 TypeScript | 52,360 行 | 其中 projects 26,378、migration 9,791、backup 1,192 |
| 后端测试 TypeScript | 24,981 行 | 约占后端 TS 的三分之一 |
| migration SQL | 4,865 行 | 17 段 forward-only 历史 |
| 前端 src | 23,140 行 | TypeScript + Vue |
| Prisma 业务模型/新鲜业务表 | 53 | 与 fresh deploy 一致 |
| 0008 `CREATE TRIGGER` | 194 | 用户记忆中的数字，是基线约束集 |
| fresh DB 当前有效 trigger | 242 | 后续 overlay 净增 48；不是 194 个运行时生成器实例 |

194 个基线 trigger 主要把 SQLite 无法在既有表上追加或无法只靠 FK 表达的规则固化为数据库约束：不可变历史、current pointer 同域、状态机、任务 claim/lease fencing、Outbox、purge 与激活防回退。生成器源代码可以退役，已发布 migration SQL 与现行 trigger 不能按同一理由删除。
