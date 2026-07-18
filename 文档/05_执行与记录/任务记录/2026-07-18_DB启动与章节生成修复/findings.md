---
doc_id: AIR-TASK-DB-BOOT-CHAPTER-FINDINGS-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: 运行中 API、workspace、启动脚本、G2 Repository
---

# DB 启动与章节生成修复发现

## 根因

`ScriptDialogueService.createGenerateScriptFromOutlineToolResult()` 在模型调用前调用 `ScriptWorkflowSourceRepository.getAiChapterGenerationContext()`。该 Repository 按已确认契约只支持 DB mode，用于冻结确认大纲、目标章节卡和必要前章正式版本；当前服务却由普通 `pnpm dev` 启动为 file mode，因此确定性返回 `G2_DB_MODE_REQUIRED`。

## 排除项

- 不是当前章已有正文：长度为 0。
- 不是已有待确认草稿：pending=false。
- 不是当前章已有正式版本：`currentScriptVersionId=null`。
- 不是缺大纲：大纲已确认，正文 4040 字。
- 第 1 章不依赖上一章正式版本。

## 架构结论

- 不能删除 `assertDatabaseMode()`；A4 的来源集合和写入时摘要复核依赖数据库事务。
- SQLite 架构和 DB-only 业务链已经完成；本故障不是缺数据库改造，而是标准 `pnpm dev` 没有接入已完成的 DB-only 运行配置。
- 不能只临时设置 `AIROAMING_PERSISTENCE_MODE=db`；还必须绑定正确的既有运行 DB 路径，否则会启动失败或看不到现有项目。
- 正确修复是收口启动/交付配置，并处理这次在错误 file mode 下新增的数据；不是创建第二套长期数据库。

## 对前一判断的纠正

前一轮使用“创建长期 SQLite”描述不准确，已撤回。代码库已有完整 schema 和 0001～0017 migrations；需要恢复的是运行实例与启动接线，而不是重新做数据库设计。

## 风险

- 直接新建空库会让当前项目从页面消失。
- 未备份就导入或切换会扩大数据丢失风险。
- file 与 db 同时接受业务写入会形成双事实源，必须停写后切换。

## 启动接线结论

- 标准 `pnpm dev` 现在只接受已存在且已激活的 DB-only 运行实例；不会执行 migration、创建空库或替用户做 activation。
- 默认稳定运行根为 `~/.airoaming/data`、`~/.airoaming/workspace`，可用绝对路径环境变量覆盖；SQLite 必须位于 dataRoot 内，dataRoot 与 workspaceRoot 不得重叠。
- migration ledger 继续由 `PrismaService.onModuleInit()` 精确核验，启动预检再额外核验 `PersistenceState=db_only + activatedAt`。
- 当前机器尚无该稳定运行实例，因此新的默认入口按预期 fail-closed。旧 4310 进程仍在 file mode，正式切换前不能宣称故障已完全恢复。

## 当前数据盘点

- `workspace/`：2 个项目、21 个文件、约 2.32 MiB。
- 项目目录：`2354ff2c-1b68-4f58-8f1e-af8e4e788048` 与 `eb97e7a0-7181-4122-acf8-21960ef866b8`。
- `~/.airoaming` 下当前没有 `airoaming.sqlite`；先前 v5 私有 cutover 运行根和目标 DB 已被清理，不能作为日常运行实例复用。
- `/var/folders` 内找到的 DB 均为测试 fixture，项目名为 `Runner chain` 或 `Backup fixture`，不可冒充用户运行数据。

## 最终迁移结论

- 没有创建第二套数据库架构；正式实例完全使用既有 17 个 migrations、shadow/final importer、C0～C7 activation 和证据链。
- 运行事实源已切换为 `/Users/liyadong/.airoaming/data/db/airoaming.sqlite`，`PersistenceState.activationState=db_only`。标准 `pnpm dev` 只会连接该已激活实例，缺库、ledger 不完整或非 DB-only 时均失败关闭。
- 旧 workspace、迁移前逐字节备份、release、shadow、cutover evidence、archive 和恢复材料均保留；没有删除或覆盖原始文件。
- `测试`、`Grok文本回归-0718` 两个项目及各自章节均可从 DB API 读取；“测试”项目确认大纲的字符数和摘要与迁移前一致。
- 章节生成故障已经在真实用户路径关闭：同一 `script-chapter-drafting` 请求不再返回 `G2_DB_MODE_REQUIRED`，而是通过 `xai/grok-4.5` 生成来源密封的待确认草稿。
- A5 边界保持正确：AI 文本只进入 pending，正式正文仍为空，用户未点击“采用草稿”前不会形成 Working Copy 或正式 ScriptVersion。
- 激活后的图片任务、候选图和 Asset 数量均为 0；本任务没有调用图片 Provider。

## 验证证据

- 迁移前备份清单：`/Users/liyadong/.airoaming-pre-db-backup-20260718-1720/BACKUP-MANIFEST.md`。
- 正式 cutover 计划：`/Users/liyadong/.airoaming-cutover-20260718-plan/plan.json`。
- C0～C7 最终证据：`/Users/liyadong/.airoaming-cutover-20260718-evidence/`。
- 真实文本生成响应：`/Users/liyadong/.airoaming-cutover-20260718-runtime-test/chapter-generation-response.json`。
- 页面截图：`evidence/2026-07-18_DB-only章节待确认草稿.png`。

## 残留风险

- 迁移后已经发生首个 DB 业务写入，旧 file workspace 只能作为备份/审计材料；不得把服务切回 file mode 继续写入，否则会重新形成双事实源。
- 默认 5 秒测试上限在高并发全量运行时仍可能让重 migration 用例产生资源型超时；统一 15 秒上限的全量门禁和隔离复跑均为绿色，不影响本次产品结论。
- Web 构建仍有既存的大 chunk 警告，和本次 DB-only 启动/迁移无关。
