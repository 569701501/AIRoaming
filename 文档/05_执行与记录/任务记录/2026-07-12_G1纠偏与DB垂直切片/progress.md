---
doc_id: AIR-TASK-20260712-G1-CORRECTION-PROGRESS
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 纠偏与 DB 垂直切片执行时间线
---

# Progress

## 2026-07-12

- 用户确认开始执行纠偏；启用 `$deep-think`，先建立范围、非目标、阶段与退出标准。
- 机械复算 persistence：实现 11710 行、测试 6045 行、CLI 439 行；自签 review 子系统为 2696 行生产代码、2699 行测试、3051 行 review 证据。
- 决定保留直接数据库价值校验，移除自签 Reviewer/CAS 写入门禁；所有运行验证继续限制在临时根。
- C0 完成：新增 `ADR-0014`，将旧 G1～G5 总控标记为被纠偏任务替代，冻结复杂度预算、DB 垂直切片与真实数据禁区；进入 C1。
- C1 完成：删除 `g1-schema-review-attestation`、`g1-schema-review-bundle`、`g1-schema-review-check`、review CLI 及其 3 个 spec，移除 `g1:manifest:review-check/review-publish/review-recover`。生产入口不再引用自签 Reviewer、attestation、CAS bundle 或 `migrationGenerationAllowed`。
- C1 将 manifest 授权收敛为直接事实：先校验已存 artifact 的 `manifestDigest`，再从当前 19 份 source closure 重建，要求 JSON 字节逐字一致；Schema 和 migration 在写入前后均调用该校验，仍保留原子 staging 与 exact artifact 检查。
- C1/C2 生成结果：manifest 状态为 `ready_for_materialization`，digest=`sha256:ece90ac09e42740ce3a18509f04e9b8c623dfe073db659309cf18d7064ceced1`；`g1:manifest:check`、`g1:schema:check`、`g1:migration:check` 均通过。
- C2 完成：首次生成正式 `apps/server/prisma/migrations/`，包含 `migration_lock.toml` 与 `0001～0008/migration.sql`；8 段 SQL 共 3103 行，exact tree checker 校验路径、字节、checksum、文件类型、单链接与目录清单通过。
- 验证通过：persistence 定向 Vitest `9 files / 74 tests`；server 全量 Vitest `23 files / 154 tests`；server typecheck、build、Prisma 6.19.3 `validate` 均成功。
- 隔离运行证据：带 `.airoaming-test-root` marker 的临时根执行 fresh Prisma deploy，输出 `8 migrations found` 与 `All migrations have been successfully applied.`；对同一临时 SQLite 二次 deploy 输出 `No pending migrations to apply.`。数据库精确验证为 44 models、556 scalar fields、105 FK、70 unique、60 index、195 CHECK、194 trigger、`integrity_check=ok`、`foreign_key_check=0`，migration ledger checksum 全部匹配。
- 全部运行验证仅使用临时 SQLite/临时目录；仓库内未产生 `.db`/`.sqlite` 或残留 `.g1-*` staging，未连接、读取或迁移真实 workspace/settings/secret。
- C3 完成：新增 Nest `PersistenceModule`/`PrismaService`，只在 `AIROAMING_PERSISTENCE_MODE=db` 且存在 `DATABASE_URL` 时创建并连接 PrismaClient；未配置或 `file` 仍保持原 workspace 路径，未知模式和 DB 模式缺少 Prisma DI/连接串均显式失败。
- C3 沿现有 `ProjectsService -> ProjectStore -> ProjectRepository` 公开生产 seam 接入 DB，只放行 `create_project`、`save_chapter_draft`、`complete_chapter` 三类事务写入；Project/Chapter 循环指针按“Project 空指针 -> Chapter -> 回填 Project 指针”顺序落库，完章按新增 ScriptVersion 识别目标章节并在同一事务内写版本、更新当前指针。
- DB 模式章节 ID 改为 `${projectId}_chapter_NNN`，解决多项目共享 Chapter 主键空间的冲突；现有 API `page_horizontal` 在持久层双向映射为 Schema 物理值 `paged_comic`，Schema 尚不支持的漫画格式显式拒绝。
- 未实现的 DB 写入路径在 Service/Repository 门禁中返回 `DB_PERSISTENCE_OPERATION_UNSUPPORTED:<operation>`，不会回落 file 或产生双写；为保留既有公开 API 语义，空剧本请求仍先返回原 `CHAPTER_SCRIPT_REQUIRED`/`AI_CHAPTER_DRAFT_REQUIRED` 参数错误。
- C3 集成验证在带 `.airoaming-test-root` marker 的临时根中部署正式 8 段 migration，通过真实 Nest 公开 Service 创建两个项目、保存草稿、完成章节及自动建下一章；关闭并重建 Nest context 后从公开读 API 读回，再直查 Project/Chapter/ChapterScriptVersion 行与 digest，两次均断言 workspace 不存在项目树。
- C3 验证全绿：`prisma:generate`、G1 manifest/schema/migration exact check、Prisma validate、server typecheck/build；定向 `5 files / 26 tests`，修正旧参数校验顺序后回归 `2 files / 10 tests`，server 全量 `24 files / 156 tests`。根级 `pnpm typecheck`、`pnpm build`、`pnpm test` 均通过，其中 shared `15 tests`、server `156 tests`。
- C3 不自动执行 migration；运行时 DB 必须先由正式 migration tree 预置。Dialogue、Task、Asset、Outbox、Storyboard、Layout/Export、项目删除与全量切换仍不在 C3 范围，进入 C4 文档/聚合门禁前保持 fail-closed。
- C3 静态复核修正 freshness 细节：草稿 working digest 与当前正式 ScriptVersion digest 一致时保持 `clean`；无当前版本的非空草稿或内容不同时为 `dirty`，空内容为 `empty`，指针找不到版本则拒绝事务。集成用例已补“完章后保存相同正文仍为 clean”断言。
- C4 文档纠偏已落：README/AI 上下文、ADR-0014、G1 方案/Schema 契约/验收清单、G2 方案/验收清单和模块总览统一到当前事实；旧 REV r1～r7 只作 `historical`，不再是当前 writer 或 G2 开工前置。
- Schema 实施契约仅在标题后增加 ADR-0014 覆盖说明，随后重新生成 manifest：digest 从 `sha256:ece90ac09e42740ce3a18509f04e9b8c623dfe073db659309cf18d7064ceced1` 更新为 `sha256:da0d4733afd6291623396144ff51ae40bd00c4b3aa394916d75c2e798012ab6a`，状态仍为 `ready_for_materialization`，source closure 仍为 19 份。
- 变更前后 `schema.prisma` SHA-256 均为 `f80e464cf14b483e933a976aa2f34737696a7a9b932fd1dbdaff599ce58d49fb`；8 个 migration SQL 加 `migration_lock.toml` 的逐文件摘要均未变化，tree 聚合 SHA-256 均为 `044808ed53025a3eb6851e5b15ad35b4423521599609d74aac96f5644b2c567d`。
- G1 QA 只把已有直接证据的 `SCH-00～03`、`SCH-13～14` 与 `REP-01～03` 标为 `pass`；没有把 C3 的单进程三操作切片扩大成旧文件 mutation、完整 importer、任务/Secret/Asset/Outbox 或生产切换证据。
- C4 完成：`corepack pnpm test:all` 全绿，包含 shared `1 file / 15 tests`、server `24 files / 156 tests`、E2E environment `31 tests`、prepare contract `3 tests`、Playwright `4 tests`；所有运行仍由唯一 runId/marker 临时根托管并完成清理。
- C4 直接门禁全绿：`g1:manifest:check`、`g1:schema:check`、`g1:migration:check`、根级 typecheck/build、`git diff --check`。第一次裸跑 `prisma validate` 因未提供必需的 `DATABASE_URL` 返回 P1012；随后显式使用不会落库的 `/tmp/airoaming-c4-prisma-validate.db` URL 验证通过，并确认该文件未生成。
- 最终复核确认 manifest 为 `sha256:da0d4733afd6291623396144ff51ae40bd00c4b3aa394916d75c2e798012ab6a`，Schema/migration 哈希仍分别为 `f80e…49fb` / `0448…567d`；仓库无 `.db/.sqlite/.sqlite3` 或 `.g1-*` staging 残留。build 只有既有 Web chunk 大于 500 kB 的非阻塞 warning，测试只有 `node:sqlite` experimental warning。
- C4 收尾时 C5 Scrutiny/Runtime Review 尚未进入；任务当时继续保持 `in_progress`，未因 C4 通过而宣称完整 G1 完成。
- C5 首轮 Scrutiny 发现 P1：DB 模式过去只 `$connect()`，未在业务加载前核验 `_prisma_migrations`；实测仅部署 0001～0007 时仍可创建业务行。修复新增小型 `g1-runtime-migration-ledger.ts`，不依赖 manifest/Markdown/生成器，只从仓库正式 8 个 migration 目录只读计算 SQL checksum，并精确核验 ledger 名称全集、唯一性、checksum、finished/rollback/logs/applied steps。
- `PrismaService.onModuleInit` 现在连接后立即执行 ledger 校验；任一校验失败先断开再抛 `DB_PERSISTENCE_MIGRATION_*` 稳定错误。正式 tree 缺失、额外 entry、symlink、非普通文件或 hardlink 也 fail-closed；同一路径算法已在 source 和编译后的 dist 入口验证能读取 8 个 artifact。
- C5 真实负例通过：只部署 0001～0007 的 marker 临时库以 `DB_PERSISTENCE_MIGRATION_LEDGER_MISSING:0008_sqlite_checks_triggers_indexes` 拒绝 Nest 启动；制造真实 0008 P3018 的残库以 `DB_PERSISTENCE_MIGRATION_LEDGER_FAILED:0008_sqlite_checks_triggers_indexes` 拒绝。两例前后 Project/Chapter 均为 0，trigger 均为 0，没有业务加载或写入。
- C5 同步关闭 P2：active Project 的 `currentChapterId=null` 或找不到本项目 Chapter 时，DB readback 不再静默选择第一章，而是抛 `DB_PERSISTENCE_CURRENT_CHAPTER_INVALID:<projectId>:<pointer>`；null 指针真实负例在 Nest 项目加载阶段拒绝。
- 重启正例已扩展到第二项目：自动创建的 `${projectId}_chapter_002` 在重建 Nest context 后通过公开 `listChapters` 与 Prisma 直查都存在，current 仍按现有产品契约停在刚完成的 `${projectId}_chapter_001`。
- C5 修复验证：定向 `2 files / 8 tests`、server 全量 `25 files / 162 tests`、server typecheck/build、编译后 migration 路径、manifest/schema/migration direct checks、Prisma validate 全绿；根级 `test:all` 再次通过 shared `15`、server `162`、E2E env `31`、prepare `3`、Playwright `4`。
- C5 修复轮结束时只完成 Scrutiny findings 修复；最终静态复核与隔离 Runtime/User Review 当时仍待执行，因此该时点未宣布签收。
- C5 最终 Scrutiny 复核通过，无 P0/P1 或新增可操作 P2；确认 ledger 校验早于 Project 业务加载、source/dist artifact 路径一致、原 P1/P2 负例与重启正例均已覆盖，且没有重新引入 review/attestation/CAS。
- C5 最终隔离 Runtime/User Review 通过：正式 8 段迁移 fresh/no-pending 与公开 Service 重启路径正常；0001～0007、真实 P3018、无 ledger 三类启动负例按稳定错误拒绝；`PRAGMA foreign_keys=1`，无项目文件树、仓库数据库、staging 或临时根残留。
- 本纠偏任务 C0～C5 完成。完成范围是“移除自签门禁 + 正式 migration tree + Project/Chapter/Script 最小 DB 垂直切片 + 启动账本门禁”；完整 G1 数据接管、真实切换和 G2 版本并发事务仍未完成。
