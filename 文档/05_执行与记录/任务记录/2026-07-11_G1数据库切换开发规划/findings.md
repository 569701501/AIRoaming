---
doc_id: AIR-TASK-20260711-G1-DB-CUTOVER-FINDINGS
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, dba, qa
source: task_plan.md、项目文档、代码、真实workspace只读审计与必要官方资料
---

# G1 D7 数据库事实源与切换发现

## 已确认事实

- ADR-0012 已确认影子导入、短暂停写、一次 DB-only 切换；首版 SQLite；关系核心 + 版本化 Json + 可重建投影。
- 文本模型 key 归 OpenCode 本地 auth；图片模型 key 归 NestJS SecretStore，明文不能进入前端、SQLite、普通 JSON、日志、任务或 artifact。
- GenerationTask/TaskAttempt 使用 SQLite + 单进程持久 worker/lease，at-least-once、幂等、协作取消、图片并发 1；BullMQ/Redis 后置。
- 旧 taskId 全保留；完整证据为 `legacy_imported`，缺失证据为不可执行 `legacy_stub`，不得根据文件存在伪造成功。

## 实施期 E0 待验证

- 正式实现时 E0 仍需实测当前 Prisma query engine 对 Json、DateTime、复合外键、定制 trigger、SQLite runtime 和离线备份的行为。
- macOS Keychain adapter 的具体实现库/调用方式需在 M0 探针后冻结；不允许失败后回退明文文件。

## 风险

- schema 过度设计会把 G1 扩成 G2–G6 的大爆炸改造。
- schema 过少又会让 G2/D3/D4-D5 立即二次破坏表结构。
- 切换后保留旧 JSON fallback 会形成不可审计双主源。
- 在 DB transaction 内执行图片生成、文件复制、压缩或 SecretStore 系统调用会造成长事务和不可恢复半状态。
- 未明确导入 provenance 与异常报告时，缺失旧任务、旧路径或旧引用容易被错误伪造成成功历史。

## 技术结论

- G1 目标 schema 按 44 个明确模型分成持久化/迁移、设置、项目/剧本、剧情/分镜、角色/素材/候选、成稿/导出、对话和任务八组；不使用通用多态 Document 表压缩关键关系。
- `ProjectWorkflow` 和项目制作进度由 current 指针、章节里程碑与后续 freshness 派生，旧 `workflow.json` 只用于迁移对照，不再形成一张独立可写事实表。
- Json 摘要使用 RFC 8785 JCS + SHA-256；文档、投影和 current 指针必须由唯一 DocumentCodec 在同一短事务提交。
- 当前 Prisma 6.19.3 的 SQLite enum 不是数据库级约束；关键枚举、跨字段状态与不可变行需要定制 migration SQL 的 CHECK/trigger，并以 sqlite_master 合同测试防漂移。
- 当前 Prisma 6.19.3 不依赖后来版本的 partial index schema 能力；“唯一活动项”使用 current 指针、非空 scopeKey 或 `TaskConcurrencySlot` 表表达，G1 不同时升级 Prisma major。
- SQLite 首版保持默认 rollback journal，不默认启用 WAL；业务只允许单 NestJS 进程和短事务，备份首版采用维护期关闭连接后的离线一致性复制与恢复验证。
- 最终 importer 只读取 maintenance/停机生成且 pre/post manifest 一致的不可变 snapshot；不直接扫描活动 workspace 后宣称一致。
- 对话、pending 和 TasksService Map 需要在最终停写、旧进程退出前生成一次无秘密 runtime bundle；旧 queued/running/retrying 必须完成或取消，不能直接转换成新 runtime lease。
- G1 数据库存规范 `vertical_scroll/paged_comic`；`page_horizontal` 导入映射，`four_panel/缺失/非法` 必须先有迁移决议。G3 仍负责用户入口与不可变交互。
- Asset 写入采用 temp -> staged+Outbox -> 同文件系统 rename -> ready；所有阶段都有重启恢复。项目删除采用 deleting + Outbox，文件成功后再按引用顺序清 DB。
- 旧 metadata 与 Asset 字节混在同一项目树，不能 chmod 整个项目目录；正式切换必须把业务 JSON/Markdown/task artifact 移入独立只读 metadata 档案，保留 Asset 路径继续可写。
- `PersistenceState.firstBusinessWriteAt` 是完整 file-only 回滚终点：为空可在维护态恢复最终 snapshot；非空后只能回滚兼容 DB 应用或恢复 DB backup。
- 已形成三份 proposed 文档：G1 主开发方案、Schema/旧数据映射、迁移执行与验收清单；均为文档，不是开发授权。

## web_search

- Prisma 官方确认 SQLite Json/Enum 从 6.2 起可用，但 enum 仅在 Prisma ORM 层强制；当前仓库 6.19.3 因此仍需数据库 CHECK。
- Prisma 官方确认 migration SQL 可定制、migration history 应提交，`migrate deploy` 不检测 drift；G1 增加独立 schema/check/trigger 合同校验。
- Prisma 官方确认 SQLite 只支持 Serializable 且事务应保持短小；provider/文件/SecretStore 均放事务外。
- SQLite 官方确认 `integrity_check` 不检查 foreign key，必须另跑 `foreign_key_check`；foreign key 开关不能依赖默认值。
- SQLite 官方说明 WAL 仍只有一个 writer且需处理 checkpoint/backup；首版因此不默认启用 WAL。
- RFC 8785 提供可重复哈希的 JSON 规范化规则，用于文档、source/impact 和 manifest digest。
- 主要来源：
  - https://www.prisma.io/docs/orm/v6/overview/databases/sqlite
  - https://www.prisma.io/docs/orm/prisma-migrate
  - https://www.prisma.io/docs/cli/migrate/deploy
  - https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions
  - https://www.sqlite.org/pragma.html
  - https://www.sqlite.org/foreignkeys.html
  - https://www.sqlite.org/wal.html
  - https://www.sqlite.org/backup.html
  - https://www.rfc-editor.org/rfc/rfc8785.html

## Scrutiny Review

- 最终静态复核通过：事实源、秘密边界、任务 fencing、runtime bundle、Asset/Outbox、metadata 封存和回滚终点均有闭环。
- Runtime/User Review 不适用：本轮没有修改 schema、代码、数据库、SecretStore 或真实 workspace；未来实施必须按 G1 验收清单执行。
