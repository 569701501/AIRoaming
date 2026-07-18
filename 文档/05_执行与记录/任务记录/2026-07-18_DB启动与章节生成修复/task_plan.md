---
doc_id: AIR-TASK-DB-BOOT-CHAPTER-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户真实 `script-chapter-drafting` 失败、G2 DB-only 契约
---

# DB 启动与章节生成修复计划

## 目标

修复标准开发启动没有连接既有 DB-only 实现、导致 A4 章节生成在来源密封阶段返回 `G2_DB_MODE_REQUIRED` 的问题，并在不丢失当前 workspace 项目的前提下恢复既有 SQLite DB-only 运行方式。

## 非目标

- 不移除或绕过 G2 数据库门禁。
- 不让 A4 回退为无版本、无来源密封的文件写入。
- 不删除当前 workspace 项目、设置或素材。
- 不调用图片生成。

## 已确认事实

- 当前 4310 服务的 `versioningCapability.mode=legacy_file`。
- 当前项目“测试”已有确认大纲 4040 字，第 1 章正文为空、无 pending、无正式版本；章节自身前置状态正常。
- 根目录 `pnpm dev` 未配置 DB mode；`PrismaService` 未配置时默认 file。
- Schema、0017 migrations、DB Repository、任务 Worker 和 DB-only 用户路径已经完成，不需要重新设计或再造一套 SQLite。
- 当前 shell 和 4310 服务都没有设置 `AIROAMING_PERSISTENCE_MODE` / `DATABASE_URL`，服务进程也没有打开任何 SQLite 文件，因此普通 `pnpm dev` 实际回退到了 legacy file mode。
- 之前 DB-only 切换与验收使用的是隔离 `target-data/app.db` 运行根；当前仓库没有将该运行根接入普通开发启动的配置。这是启动/交付接线缺口，不是数据库架构未完成。

## 阶段

1. [x] Orchestrator：冻结现状、备份范围和迁移/启动边界。
2. [x] Worker A：为标准开发启动模式建立失败回归。
3. [x] Worker B：把普通本地启动接回既有 DB-only 运行配置，并增加 fail-fast 检查。
4. [x] Worker C：使用既有 migrations/importer 恢复稳定 DB-only 运行实例并迁入两个项目。
5. [x] Worker D：切换运行服务，验证项目、大纲、章节和设置可读。
6. [x] Runtime/User Review：在“测试”项目触发且只触发一次当前章文本生成，验证形成 AI pending。
7. [x] Scrutiny Review：复核未绕过门禁、未丢数据、未调用图片服务、启动说明和回滚材料完整。

## 验收标准

- 标准本地启动不会静默落入 `legacy_file` 后继续开放 DB-only 功能。
- 当前两个 workspace 项目均在 DB-only 项目列表可见；“测试”项目确认大纲内容和章节入口保持一致。
- A4 不再返回 `G2_DB_MODE_REQUIRED`，能够进入模型生成并写入来源密封的 AI pending。
- 原 workspace 与迁移前备份保留，不覆盖、不删除。
- 不产生图片费用。

## 需要授权的真实写入

以下动作会切换当前运行时事实源，必须由用户明确确认后执行：

1. 停止当前 file-mode 开发服务。
2. 对 `workspace/` 和设置做迁移前备份。
3. 恢复或接入既有 DB-only 运行数据库；若原隔离文件已清理，则用现有 migration/importer 恢复运行实例。
4. 导入这次误在 file mode 下新建的 workspace 项目。
5. 以 DB-only 模式重新启动并进行一次真实章节文本生成。

## 退出标准

- [x] 回归测试、类型检查、构建通过。
- [x] 数据导入前后项目/章节/大纲计数及摘要一致。
- [x] 静态复核、运行复核、Handoff 和完成记录齐全。
