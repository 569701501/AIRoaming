---
doc_id: AIR-TASK-20260712-RELEASE-SCHEMA-HANDOFF
status: completed
created: 2026-07-12
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、progress.md、scrutiny_review.md
---

# Handoff：发布 Schema 身份解耦

## 已完成

- 新增独立 release Schema identity：只绑定 SQLite、`schema.prisma` checksum 与全部有序 migration SQL checksum；当前精确包含 0001～0010。
- identity 不读取 package.json、importer、CLI 或 G1 generator 源码；新增有序 migration 会自动改变 identity。
- Luna M4 verifier/CLI 已保留并改用 release identity；单次 succeeded shadow 的只读验证通过。
- G1 source closure 移除完整 package.json，从 19 份收窄为 18 份；Prisma 6.19.3 继续由独立 schema contract 测试锁定。
- `schema.prisma`、0001～0010 migration SQL 与其中 trigger 字节未改变。
- G3-M 交接文档已按 Git 历史修正到 A11C，并把 M4 标为 `in_progress`。
- verifier 已增加来源证据缺失的 fail-closed 门禁：unchanged replay 受既有 trigger 约束不会更新 `lastRunId`；成功 run 若按 importer-specific entity count 应有来源但当前 run 查询为空，则返回 `MIGRATION_SOURCE_EVIDENCE_MISSING`。这不改变重放幂等语义，也不改 schema/migration/trigger。
- verifier 进一步按 importer/entityType 精确对齐来源计数：A6 的 Shot 计数由 `StoryboardShotProjection` 留证，A9 的 AssetReady 计数由 `AssetPhysicalEvidence` 留证；来源缺失或超额分别返回 `MIGRATION_SOURCE_EVIDENCE_MISSING` / `MIGRATION_SOURCE_EVIDENCE_COUNT_MISMATCH`。新增 `IMP-M4-10` 覆盖成功 full shadow 的 16 个 slice 逐片验证。
- 继续审计 G3 CLI 契约后，8 个 CLI 已统一严格解析 `--format json`；缺值、非法值和重复 flag 均在副作用前以入口稳定错误码 fail-fast，M4 仍不改变 release identity 或 schema/migration/trigger。
- M4 来源注册表新增契约回归，自动核对所有 shadow importer 的 entityType 均注册且 single/composite/runtime 分类互斥；不改变 release identity 或 schema/migration/trigger。
- verifier 新增 shadow-only run kind 门禁，成功 audit run 不再可能被当作 shadow 通过；`IMP-M4-11` 已验证 `MIGRATION_RUN_KIND_INVALID`，不改变 release identity 或 schema/migration/trigger。
- verifier 现在要求 shadow run 的 importerVersion 必须属于 A2～A15 注册表，未知版本返回 `MIGRATION_IMPORTER_VERSION_INVALID`；成功 shadow run 还必须带非空 reportDigest，否则返回 `MIGRATION_REPORT_DIGEST_MISSING`。`IMP-M4-12/13` 已覆盖两项门禁，不改变 release identity 或 schema/migration/trigger。
- 已知 shadow importer 的 `counts.entityCounts` 现在必须结构完整且只含已登记来源键/明确上下文键；缺失或未注册计数键分别返回 `MIGRATION_SOURCE_ENTITY_COUNTS_MISSING/INVALID`，`IMP-M4-14/15` 已覆盖。
- succeeded shadow 的 run verification 现在必须是 schemaVersion=1 且 source/snapshot manifest 均已验证；缺失或无效分别返回 `MIGRATION_RUN_VERIFICATION_MISSING/INVALID`，`IMP-M4-16/17` 已覆盖。

## 明确未完成

- M4 的双 fresh shadow、API DTO/Asset hash 等价、DB-only 写隔离、pending Dialogue artifact、按 entityType 重算复合来源摘要和 replay 空证据 fail-closed 回归已完成；M4 仍待正式验收签字。
- `--kind final` 继续 fail-closed；backup/restore、capability gate、真实 DB-only activate 尚未实现。
- backup/restore、capability gate、真实 DB-only activate 未实现也未获本任务授权。
- 本轮不合表、不删 trigger、不新增 migration；Task 三个 materialize trigger 保持不动。

## 后续接续点

1. 完成 full importer 缺口，不扩展 G1 大生成器。
2. M4 建立来源证据注册表：每个 entityType 明确 contributing storage keys 与 digest 算法，再完成双 fresh shadow 验收。
3. 0011+ 使用小 migration + 小 contract；同步显式 runtime migration catalog。release identity 会自动纳入新目录，但这不等于 runtime 自动放行。
4. full shadow 两轮通过、final cutover 前执行投影读取点审计；DB-only 稳定后再小批评估低风险 scope trigger。

## 工作树边界

- 本任务整合 Luna 原有未提交的 `db:verify` script、CLI、Service 和特征测试。
- 既有 12 张截图删除不是本任务改动，未触碰、不得随本任务提交。
