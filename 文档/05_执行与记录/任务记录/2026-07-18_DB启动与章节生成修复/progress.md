---
doc_id: AIR-TASK-DB-BOOT-CHAPTER-PROGRESS-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# DB 启动与章节生成修复进度

## 2026-07-18 Orchestrator

- 已复现用户错误层：A4 在模型调用前读取密封来源时返回 `G2_DB_MODE_REQUIRED`。
- 已确认运行服务为 `legacy_file`，不是章节正文、pending 或上一章状态导致。
- 已确认当前“测试”项目存在确认大纲，第 1 章状态满足首次生成条件。
- 用户纠正“数据库已经改造完成”后重新区分：DB-only Schema/Repository/Worker/用户路径已经完成；当前缺的是普通启动未连接该运行方式。
- 当前 shell 的 DB mode 与 URL 均未设置，4310 进程没有 SQLite 文件句柄；普通启动确实回退为 legacy file。
- 之前的真实 DB-only 验收使用隔离 `target-data/app.db`，当前工作根没有该文件或启动配置。撤回“新建长期 SQLite”的表述，不重做数据库架构。
- 下一步只解决现有 DB-only 启动接线，并保护这次误写入 file workspace 的项目。
- Worker A 已先写回归：标准入口必须解析稳定 DB-only 运行根、拒绝 file 覆盖、拒绝 dataRoot 外数据库、只接受已激活状态；红灯确认后实现。
- Worker B 已将根目录 `pnpm dev` / `pnpm dev:server` 接入 DB-only 启动预检。默认运行根为 `~/.airoaming/`；缺少 SQLite 时实测返回 `LOCAL_DB_RUNTIME_DATABASE_MISSING` 并退出，当前 4310 file 服务未被影响，也没有创建空库。
- A4 的 `G2_DB_MODE_REQUIRED` 错误已改为明确报告服务启动配置问题，不再误导用户检查章节正文、pending 或上一章。
- 定向回归 27/27 与 Server typecheck 通过。当前等待在不改源数据的迁移预检完成后，申请停写、备份与正式切换授权。
- 全项目 build 通过；迁移计划、协调备份恢复、固定 Chromium 渲染三组受影响回归单独复跑 57/57 通过。
- 曾误并行启动两份 Server 全量套件，资源竞争造成临时目录 `ENOTEMPTY` 与 migration/Chromium timeout；该轮 729 passed、23 failed 不作为产品结论。停止重复进程后对应失败文件全部转绿，任务结束前仍需在单实例条件下补一次正式全量门禁。
- 当前 file workspace 只读盘点为 2 个项目、21 个文件、约 2.32 MiB；`~/.airoaming` 下没有可复用的 `airoaming.sqlite`。因此正式恢复必须用现有 migration/importer 把当前项目带入稳定运行实例，不能只补一个环境变量指向空路径。

## 2026-07-18 正式迁移与运行复核

- 用户明确授权停止当前服务、备份 workspace、使用现有 migration/importer 迁入 DB-only 运行实例，并只测试一次章节文本生成。
- 已停止旧 file-mode 服务，并将迁移前 workspace 完整备份到 `/Users/liyadong/.airoaming-pre-db-backup-20260718-1720/workspace`；源与备份均为 21 个文件、2372 KiB，聚合 SHA-256 均为 `948022e8f6c2ab179aafb2a3f28bc7ca700fc96b3eb450141e79eba780636441`。
- 已从当前提交创建隔离 release `/Users/liyadong/.airoaming-release-20260718`，使用既有 17 个 migrations 和 importer 先做真实 shadow rehearsal。16 个切片全部成功，shadow report digest 为 `sha256:0d0a8e8bb236abba403b1efc0ec38c7f6e95c94682354b479c9840ae5beb8693`。
- 正式 C0～C7 cutover 全部成功，最终 evidence digest 为 `sha256:0e6e281274afe6b8afb80a4b772f6ef7912f49fff69f8807236cda2cca8c9c41`；运行状态为 `db_only`，目标数据库为 `/Users/liyadong/.airoaming/data/db/airoaming.sqlite`。
- 两个项目均迁移成功：`测试` 与 `Grok文本回归-0718`，各保留 1 个章节；“测试”项目确认大纲保持 4040 字，摘要为 `sha256:4d40ca3dcfacbea789b8e2064a27e30ae1ba4f313780c11d4d233434c93ebd49`。
- 使用标准 `corepack pnpm dev` 在 DB-only 实例中只执行一次真实 A4 文本生成：`xai/grok-4.5` 成功返回第 1 章《杀令入棺》，写入来源密封的 `ai` pending，正式正文仍为空、`currentScriptVersionId=null`，没有越过 A5 的“采用草稿”确认门。
- 生成后只读复核显示 pending 全文约 4033 字，`operation=generate_script_from_outline`；候选图 0、Asset 0、图片生成任务 0。本任务没有调用任何图片接口。
- 浏览器真实页面验证显示“AI 草稿待确认”，可完整查看，并只提供“采用草稿 / 丢弃”；保存和完成仍禁用。浏览器 console 无 error/warn。截图位于 `evidence/2026-07-18_DB-only章节待确认草稿.png`。
- 最终 Server 全量在 15 秒统一测试上限下为 125 files / 752 tests 全绿；默认 5 秒上限的一次全量仅有 `g1-migration-plan` 首测在并发负载下 5014ms 超时，隔离重跑 12/12 通过。类型检查和全项目构建通过。
- 标准服务已重新启动并保留运行：Web `5173`、Server `4310`、OpenCode `4396`；只读健康检查成功，项目列表仍为 2 个，默认文本模型为 `xai/grok-4.5`。
- Scrutiny Review 与 Runtime/User Review 均为 `passed`；最终运行状态与恢复边界已写入 `handoff.md`。
