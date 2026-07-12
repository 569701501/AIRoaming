---
doc_id: AIR-TASK-20260712-RELEASE-SCHEMA-PROGRESS
status: completed
created: 2026-07-12
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# 进度日志

## 2026-07-12 阶段 1

- 状态：completed。
- 用户授权执行止损方案，并要求检查 Luna 代码/执行文档对后续的影响。
- 当前基线 commit：`ba132c3`。
- Luna 已提交 M0～M3-A11C；未提交 M4 草稿包含 `db-verify.cli.ts`、`migration-verify.service.ts`、package script 和一项集成测试。
- M4 草稿错误地调用 G1 source manifest 并将其 digest 作为 effective Schema identity；本任务保留其实现并修正接线。
- 既有截图删除为用户改动，不在本任务范围。
- 已新增 ADR-0015 和本任务三件套。

## 2026-07-12 阶段 2～4

- 状态：completed。
- TDD 先证明旧实现不能在独立临时发布树工作，再实现 `release-schema-identity.ts`：只读取 `schema.prisma` 与全部有序 migration SQL；当前树精确得到 0001～0010。
- 特征测试证明修改无关 `package.json` 后 identity 完全相同，新增 `0002_overlay` 后自动进入 identity 且 digest 改变。
- Luna M4 verifier 已改用 release identity，不再读取 G1 manifest。
- 修正 Luna M4 两个独立问题：复合实体 sourceDigest 不能与单个主锚点文件摘要直接比较；只读测试应比较 verification 前后不变，不能假定初值为 null。
- G1 closure 已移除完整 package.json；manifest sourceDocuments 从 19 变为 18，artifact digest 更新为 `sha256:ad3b0e1ba884e20718e6e81994cbb8beaedbb9e6777e471ac2a21e4c94c2b1ea`。
- 修改前后 `schema.prisma` 与 0001～0010 migration SQL 的 SHA-256 全部一致；现有 194 trigger 位于 migration SQL 内，字节随之保持不变。
- 已修复 G3-M handoff 的 A8/A9 错误 commit，补齐 A10/A11A/B/C 与 M4 `in_progress` 事实；更新核心模型、README、AI 上下文入口和 ADR。

## 当前验证

- release identity：2 tests passed。
- G1 manifest：5 tests passed。
- M4 单次 succeeded shadow：1 test passed。
- server typecheck：passed。

## 下一步

- 已执行 server 45 files/255 tests、G1 三项、Prisma validate、workspace typecheck、byte comparison 与 diff check，全部通过。
- Scrutiny Review：passed；Runtime/User Review：not_applicable。
- scoped commit 已创建，message 为 `refactor(db): decouple release schema identity`；既有截图删除未纳入。

## 2026-07-12 后续 M4 证据门禁加固

- 发现 SQLite `trg_imported_entity_sources_provenance_monotonic` 禁止 unchanged replay 仅更新 `lastRunId`；因此没有修改表、migration、trigger，也没有把重放伪装成当前 run 的新来源证据。
- `MigrationVerifyService` 新增按 importer/entityCounts 判断的来源证据期望值；成功 run 有实体产出但当前 run 查询不到 `ImportedEntitySource` 时返回 `MIGRATION_SOURCE_EVIDENCE_MISSING`，防止空查询 vacuous pass。
- 新增 `IMP-M4-08/09`：同库幂等重放空来源、以及摘要正确但来源行超额均被 verifier fail-closed；importer-specific 计数显式覆盖 A6 Shot 投影和 A9 AssetReady→AssetPhysicalEvidence。`IMP-M4-10` 再验证成功 full shadow 的 16 个 slice 均能通过逐片来源计数校验。
- 回归结果：迁移集成 37/37、server 全量 46 文件/279 tests、统一 CLI format 5 项边界回归、typecheck、G1 manifest/schema/migration 三项检查、Prisma validate、`git diff --check` 全部通过。
- M4 仍保持 `in_progress`，正式验收签字、M5 backup/restore、M6 activate 未开始；既有 12 张截图删除继续未触碰。

## 2026-07-13 继续 M4 verifier 证据门禁

- verifier 现在只接受已注册的 shadow importerVersion；未知版本返回 `MIGRATION_IMPORTER_VERSION_INVALID`，避免未知计数规则通过空证据路径。
- succeeded shadow 必须带非空 `reportDigest`；缺失时返回 `MIGRATION_REPORT_DIGEST_MISSING`。新增 `IMP-M4-12/13` 固化两项 fail-closed 语义。
- 定向 M4（含 FRESH/API）17 项通过；typecheck 通过。
- 最终回归：server 47 个测试文件/287 个测试、G1 manifest/schema/migration、Prisma validate、`git diff --check` 全部通过；M4 继续保持 `in_progress`，本轮代码与证据待提交。
- 本轮继续补齐 verification attestation 门禁；定向 M4（含 FRESH/API）19 项、server 全量 47 文件/289 tests、typecheck、G1 三项、Prisma validate、`git diff --check` 均通过，M4 继续保持 `in_progress`，本轮代码与证据待提交。
- 本轮继续补齐 decisions/report digest 形状门禁；IMP-M4-18/19 与 46 项迁移集成测试通过，server 全量 47 文件/291 tests、typecheck、G1 三项、Prisma validate、`git diff --check` 均通过，M4 继续保持 `in_progress`。
- 本轮补齐 decisions artifact 三方绑定；IMP-M4-20/21 与 48 项迁移集成测试通过，server 全量 47 文件/293 tests、typecheck、G1 三项、Prisma validate、`git diff --check` 均通过，M4 继续保持 `in_progress`。
- 本轮补齐 decisions artifact sourceManifestDigest 绑定；IMP-M4-22 与 49 项迁移集成测试通过，server 全量 47 文件/294 tests、typecheck、G1 三项、Prisma validate、`git diff --check` 均通过，M4 继续保持 `in_progress`。
- 本轮继续补齐 report artifact：`db:verify` 要求显式 `--import-report`，报告 codec 重算 canonical reportDigest 并与 run 绑定；新增 IMP-M4-23/24/25，定向迁移集成 52 项通过。M4 仍保持 `in_progress`，待全量回归与提交。
- 本轮补做 `IMP-M4-26/27`：真实 `db:verify` CLI 成功路径与缺少 `--import-report` 的入口 fail-fast 均通过；定向迁移集成增至 54 项，M4 仍保持 `in_progress`。
