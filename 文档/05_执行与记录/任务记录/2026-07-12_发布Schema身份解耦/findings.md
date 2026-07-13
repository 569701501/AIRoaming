---
doc_id: AIR-TASK-20260712-RELEASE-SCHEMA-FINDINGS
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# 发现与决策

## 代码事实

- G1 manifest digest 覆盖所有 `sourceDocuments`，当前包含完整 `apps/server/package.json`。
- Prisma Schema/migration renderer 不把 supporting source digest 写进结构字节。
- `PrismaService` 在 DB 模式启动时已经通过 G3 ledger 精确验证 0001～0010。
- G1 runtime migration loader 只排除已知 0009/0010；未知 0011 仍 fail-closed。
- Luna M4 verifier 是未提交草稿，不存在对应 M4 任务目录；最后修改时间早于本任务开始约 26 分钟。

## 文档事实

- `核心数据模型` 仍写“8 段 migration”，与当前 0001～0010 不一致。
- `G3-M 可执行验收与 Luna 交接` 状态停在 A9，实际已提交到 A11C，A8/A9 commit 也与当前 Git 历史不一致。
- G3-M 施工包仍明确禁止在 D2/D3 未满足时执行真实 activate；本任务不改变该门禁。

## 实现不变量

- release Schema digest 不读取 package.json 或应用源码。
- 同一 Prisma Schema + 同一按序 migration bytes 必须得到同一 digest。
- Schema 或任一 migration byte 变化必须改变 digest。
- 新增有序 migration 不能被 identity loader 忽略；runtime 是否放行仍由显式 migration catalog 决定。
- M4 verifier 继续只读，不修改 terminal MigrationRun 或 PersistenceState。

## 风险

| 风险 | 处理 |
| --- | --- |
| 与 Luna 并发覆盖 | 编辑前检查 mtime/diff；保留其文件和测试 |
| closure 修正改变 manifest digest | 预期变化；必须证明 Schema/migration SQL 字节不变 |
| release identity 再次绑定工具源码 | identity payload 只放 Schema/migration artifact |
| 文档把 M4 草稿写成完成 | 只有全门禁通过并提交后才更新为 completed |

## Luna M4 兼容审计

- `ImportedEntitySource.sourceStorageKey` 是单个主追溯锚点；`sourceDigest` 是实体来源证据摘要，可以由多个文件摘要合成。Project/Chapter importer 已用 `chapter.json + script` 合成 Chapter digest，因此 verifier 不能普遍做单文件相等比较。
- 当前 M4 能安全验证主追溯锚点仍存在于 sealed source manifest。若要逐实体重算复合摘要，需要后续引入按 `entityType` 注册的来源证据集合与算法；本轮不伪造通用规则。
- import run 本身已有 `verification` 证据；只读 verifier 的不变性测试必须保存 before 值并比较 after，而不是断言 null。
- M4 实现门禁当时已覆盖双 fresh shadow、API DTO/Asset hash、DB-only 写隔离、pending Dialogue、来源注册表复算、replay 空/漂移来源 fail-closed、full 16-slice 逐片 verifier 和统一 8 CLI format 契约；该条记录时尚未正式验收，最终状态见 2026-07-13 进度结论。

## 后续 M4 重放证据审计

- `ImportedEntitySource.lastRunId` 在 unchanged replay 时按设计保持原值；Prisma migration 中的 `trg_imported_entity_sources_provenance_monotonic` 会拒绝只改变 `last_run_id` 的更新，因此不能通过更新该字段来制造“当前 run 已重新观察来源”的假证据。
- 原 verifier 仅按 `lastRunId = runId` 查询来源；若成功 run 的 `counts.entityCounts` 声称有实体产出但查询为空，会出现 vacuous pass 风险。
- 处理方式是不改 schema/trigger，而由 verifier 按 16 个 importer 的真实 entity count key 判断是否应有来源证据；缺失时新增 `MIGRATION_SOURCE_EVIDENCE_MISSING` 并 fail-closed。A4 等仅有上下文 Project 计数的 slice 不会误报。
- `IMP-M4-08` 固化该契约：重放仍可保持导入幂等和聚合摘要一致，但当前 run 的只读 verifier 不会把旧来源行误认成当前 run 证据。M4 仍需正式签字。
- 后续审计发现“有来源但数量漂移”仍可能绕过非空门禁；已改为 importer-specific countKey→entityType 精确比对，显式处理 A6 Shot 投影与 A9 AssetPhysicalEvidence，并以 `IMP-M4-09` 锁定超额来源 fail-closed；`IMP-M4-10` 再验证 full shadow 的 16 个 slice。当前迁移集成 37 项、server 全量 46 文件/279 项通过；统一 CLI format 边界回归也已通过。

## 2026-07-13 importer attestation 审计

- 发现 `buildExpectedSourceCounts` 对未知 importerVersion 会退化为运行时自带的任意 count key；若没有来源计数，未知 shadow run 可能绕过来源规则。现以 A2～A15 注册表作为唯一已知 shadow importerVersion 集合，未知版本返回 `MIGRATION_IMPORTER_VERSION_INVALID`。
- 发现 succeeded shadow run 可以没有 `reportDigest`，导致账本完成态缺少报告绑定。现要求 succeeded shadow 必须带非空 reportDigest，否则返回 `MIGRATION_REPORT_DIGEST_MISSING`。
- `IMP-M4-12/13` 已分别锁定未知 importerVersion 与缺失 reportDigest；两项均不改 schema/migration/trigger，该条记录时 M4 尚为 `in_progress`。
- 继续审计发现已知 importer 的 `counts.entityCounts` 缺失或带未注册键仍可形成空映射；现要求结构完整、值为非负整数，并允许已声明的 Project/A6 Shot 上下文键。`IMP-M4-14/15` 已锁定 `MIGRATION_SOURCE_ENTITY_COUNTS_MISSING/INVALID`，不改 schema/migration/trigger。
- 继续审计发现 succeeded shadow 的 verification attestation 可以缺失或声明 source/snapshot 未验证；现要求 schemaVersion=1 且两个 manifest verification 标志均为 true，`IMP-M4-16/17` 锁定 `MIGRATION_RUN_VERIFICATION_MISSING/INVALID`，不改 schema/migration/trigger。
