---
doc_id: AIR-TASK-20260712-G1-CORRECTION-HANDOFF
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 纠偏与 DB 垂直切片 C0～C5 最终执行与复核结果
---

# G1 纠偏与 DB 垂直切片 Handoff

## 1. 交付状态

- C0～C3 已完成：废止自签审查门禁、生成正式 migration tree，并打通 Project/Chapter/Script 最小 DB 垂直切片。
- C4 文档纠偏、manifest 更新和完整聚合门禁已完成。
- C5 首轮 Scrutiny 发现的 runtime migration ledger P1 与两个 P2 已修复；最终 Scrutiny 和隔离 Runtime/User Review 均通过。本纠偏任务完成，但完整 G1 与 G2 仍未完成。

## 2. 已交付范围

1. 生产入口、package scripts、Schema/migration writer 不再依赖 Reviewer、attestation、sealed bundle、CAS 或 `migrationGenerationAllowed`。
2. manifest 直接绑定当前 source closure；Schema 使用 exact renderer/check 与 Prisma validate；正式 migration tree 使用 exact tree check、fresh deploy、二次 no-pending、ledger、integrity/FK 与故障回放。
3. 仓库内已有 `migration_lock.toml` 与 `0001～0008/migration.sql`。
4. 显式 DB 模式经公开 `ProjectsService -> ProjectStore -> ProjectRepository` 路径支持：
   - 创建项目与默认章节；
   - 保存章节草稿；
   - 完成章节并创建不可变 `ChapterScriptVersion`、更新 current 指针；
   - 关闭并重建 Nest 应用上下文后，从同一 SQLite 读回。
5. 活跃文档已区分 G2 开工与完整 G1/生产切换：G2 可以基于当前 substrate 开发，但必须自行补齐版本事务与并发证据。

## 3. 当前运行边界

| 项目 | 当前契约 |
| --- | --- |
| 默认模式 | 未设置或 `AIROAMING_PERSISTENCE_MODE=file`，继续使用原 workspace runtime |
| DB 模式 | 仅在 `AIROAMING_PERSISTENCE_MODE=db` 且提供 `DATABASE_URL` 时启用 |
| migration | 运行时不自动执行；连接后、业务加载前精确核验仓库正式 8 段 SQL 与实际 Prisma ledger，缺失/额外/checksum/failed 均拒绝并断开 |
| DB 支持写入 | `create_project`、`save_chapter_draft`、`complete_chapter` |
| 未支持写入 | 明确返回 `DB_PERSISTENCE_OPERATION_UNSUPPORTED:<operation>`，不回落 file、不双写 |
| 文件副作用 | C3 新项目 DB 路径不生成 workspace 项目树 |
| 漫画格式 | API `page_horizontal` 与 Schema `paged_comic` 双向适配；`four_panel` 在 DB 子集 fail-closed |
| 真实数据 | 未读取、迁移或修改真实 workspace、settings、secret、用户数据库 |

## 4. 固定 artifact 与证据

- 当前 manifest：`sha256:da0d4733afd6291623396144ff51ae40bd00c4b3aa394916d75c2e798012ab6a`，19 个 sourceDocuments，`ready_for_materialization`。
- `schema.prisma` SHA-256：`f80e464cf14b483e933a976aa2f34737696a7a9b932fd1dbdaff599ce58d49fb`。
- migration tree 聚合 SHA-256：`044808ed53025a3eb6851e5b15ad35b4423521599609d74aac96f5644b2c567d`；C4 前后逐文件相同。
- C2 隔离证据：8 个 migration fresh deploy 成功；同库二次 no pending；44 models、556 scalar fields、105 FK、70 unique、60 index、195 CHECK、194 trigger；`integrity_check=ok`、`foreign_key_check=0`。
- C3 集成证据：真实 Nest 公开 Service 创建两个项目、保存草稿、完章和自动建下一章；重建应用上下文后公开读回与 Prisma 直查一致；临时 workspace 无项目树。
- C4 聚合证据：`test:all` 通过，shared `15`、server `156`、E2E env `31`、prepare `3`、Playwright `4`；manifest/schema/migration direct check、Prisma validate、根级 typecheck/build 与 diff check 均通过。
- C5 Scrutiny 修复证据：真实 0001～0007 库与真实 P3018 0008 残库都在 Nest 启动阶段拒绝且业务计数不变；active Project 空 current 指针拒绝加载；第二项目 chapter_002 在重启后由公开 API/DB 双重读回，current 保持 chapter_001。
- C5 修复门禁：定向 `2 files / 8 tests`，server `25 files / 162 tests`；根级 `test:all` 为 shared `15`、server `162`、E2E env `31`、prepare `3`、Playwright `4`，direct checks、Prisma validate、typecheck/build 与 dist migration path 均通过。

## 5. 明确未完成

- Dialogue、Story/Storyboard/Preflight、SecretStore、持久 Task/Attempt/lease、Asset/Outbox、Layout/Export 的 DB Repository 与运行时接管。
- 正式 snapshot/import、旧文件 mutation 隔离、`WIT-01` 七阶段语义等价、协调 backup/restore。
- production maintenance、停写、真实 Secret 迁移、`PersistenceState=db_only` 激活、`firstBusinessWriteAt` 与真实用户路径复核。
- G2 的正式 current/version 发布事务、expected rowVersion/CAS、并发冲突、失败回滚和迟到 worker fencing。

## 6. 残留风险

1. C3 是单进程最小切片，没有跨进程 rowVersion/CAS 并发保护；不能作为 G2 并发发布正确性的证据。
2. 只有三类业务写入使用 DB；其他路径虽然 fail-closed，但完整 DB-only 产品链尚不可运行。
3. Prisma 6.19.3 正式 migration tree 必须由部署步骤预置；当前应用不会自动补迁移，只会在不完整、漂移或 failed ledger 时拒绝启动。
4. 测试里的 Node `node:sqlite` 仍会输出 experimental warning；当前断言不受影响，但后续运行时选型需持续观察。
5. file 模式仍是默认事实源；删除 file runtime 或触碰真实数据必须另行授权。

## 7. C5 完成清单

- [x] C4 `corepack pnpm test:all` 全绿并记录准确数量。
- [x] `g1:manifest:check`、`g1:schema:check`、`g1:migration:check` 直接通过。
- [x] 根级 typecheck、build、`git diff --check` 通过。
- [x] 再次确认 Schema/migration 哈希与本 Handoff 一致、无仓库 DB/staging 残留。
- [x] Scrutiny 只读复核当前 diff、边界与 QA 状态，无 P0/P1 或新增可操作 P2，未复活自签门禁。
- [x] Runtime/User Review 只使用 marker 临时 SQLite，重走正例与三类启动负例；未触碰真实项目。

最终复核已实际通过；原 migration ledger P1、current pointer P2 和第二章重启证据 P2 均关闭。

## 8. 下一阶段建议

C5 通过后即可按 G2-A/G2-B 进入版本链切片。第一步应围绕 Script Working Copy 与正式发布事务建立 expected rowVersion/CAS 和并发负例，不再新增证明性 review 基础设施。
