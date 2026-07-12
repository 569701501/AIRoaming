---
doc_id: AIR-TASK-DB-MODEL-REVIEW-003
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: 数据库建模审查证据
---

# 需求理解

用户质疑当前 44 表中文档拆分的合理性、194 个 trigger 将业务逻辑写入 SQL 的合理性，以及自建代码生成器的必要性。需要根据实际代码回答，不修改实现。

# 初步事实

- `文档/00_索引/AI上下文入口.md` 声明当前 G1 基线是 44 model、194 trigger、195 CHECK。
- 代码入口包括 `apps/server/prisma/schema.prisma`、`apps/server/prisma/migrations/0008_sqlite_checks_triggers_indexes/migration.sql` 和 `apps/server/src/persistence/g1-schema-*-source.ts`。

# 待核对

- 已核对：“9 表”是 Story + Storyboard 两个子域的近似计数；`0003` 还含 Preflight，共 10 表。完整文档仍在 Version.documentJson，其余是版本、稳定身份、投影、视觉与预检边界。
- 已核对：194 trigger 中精确 `_scope_insert/update` 命名 51 个；仅 3 个 AFTER materialize 会跨表写数据，其余为拒绝型 guard。
- 已核对：生成链同时生成/验证 manifest、Prisma Schema 和 migration SQL；Prisma 标准 client generator 是另一层。

# Scrutiny Review

- 结论：部分通过。表关系中稳定身份、版本史、下游引用和 current pointer 有明确用途；“单文档拆 9 表”不是对实际 Schema 的准确描述。
- 主要风险：权威 JSON + 关系投影 + SQL JSON formalize guard 构成三层同步成本；大量纯 owner/scope 校验未优先使用复合 FK 或应用短事务；Task materialize 将调度状态机写入 SQL；manifest source closure 将无关 package script 改动也视为 Schema drift。
- 运行复核：不适用，本轮不改代码与数据。仅运行只读契约检查，当前工作区 manifest stale。

# 优化顺序结论

1. 立即止血：不改 44 表、不删 194 trigger、不重写 0001–0010；先把无关 `package.json` script 从 G1 schema source closure 中隔离，并对 Prisma 版本做更精确的独立校验。
2. 冻结基座：G1 大生成器只维护历史基线，后续功能不再继续扩充其 DSL；新变化沿用 0009/0010 的小型 overlay migration + overlay contract。
3. 保住当前进度：DB-only/importer/verify/backup/activate 继续在现有模型上收口。若已有 sealed cutover snapshot，source digest 修复应等该次 run 结束后做，避免中途使 snapshot 失配。
4. 里程碑后小批减负：从可由复合 FK、CHECK 或单写入者事务完整覆盖的 owner/scope guard 开始，每批最多 5–10 个；每批都需新迁移、runtime ledger 更新、fresh DB 和 DB-mode 集成回归。
5. 高风险后置：Task 的 3 个 materialize trigger 在 Repository 显式接管 `TaskAttempt`、并发 slot、fencing、retry/terminal 状态前不得删除；投影表删除也需先证明无读取依赖与历史兼容收益。

# 退出条件

- 第一阶段完成：无关 package script 改动不再造成 manifest stale；重新生成后 `schema.prisma` 与 0001–0008 SQL 内容不变；manifest/schema/migration/Prisma 校验通过。
- 当前里程碑完成：DB verify、backup、activate 和 importer 既有验收不因优化工作被阻塞。
- 每批 trigger 优化完成：对应非法写入仍被 FK/CHECK/应用事务拒绝，既有合法路径、历史数据与任务并发回归通过。

# 用户盲点复核

## 1. importer 与生成器冻结

- 当前 `db:import` 只允许 `kind=shadow`，支持 project/chapter、script/outline/pending、Story、Storyboard、Character、Asset/Visual、Preflight、legacy Task、Candidate/Lock 共 12 个独立 slice；`final` 直接返回 `MIGRATION_FINAL_IMPORT_NOT_READY`。
- importer 通过 Prisma/SQLite 结构和 trigger 工作，不直接导入 G1 manifest builder，所以“冻结 G1 不扩展”不会冻结 importer 实现。
- 但 `MigrationVerifyService` 当前直接加载 G1 manifest，并把其 digest 写成 `effectiveSchemaManifestDigest`；backup/activate 尚不存在。因而 verify/activate 身份必须在正式切换前纠正。

## 2. source closure 工期

- 所有 extension/supporting source digest 都写入 manifest `sourceDocuments`，整个 unsigned manifest 再计算摘要；当前没有“结构源/工具源/版本锁”角色分层。
- package removal 需要同步 `G1_SCHEMA_MANIFEST_SUPPORTING_PATHS`、`ALLOWED_EXPLICIT_SOURCE_PATHS`、manifest artifact 和测试，不是单行修改。
- `schema.prisma` 与 migration SQL 的 renderer 只读取 manifest 的模型、关系与约束，不嵌入 supporting source digest；因此 closure 修正应改变 manifest digest，但结构产物应逐字不变，必须用 byte comparison 证明。
- 不建议为即将退役的 G1 generator 再设计通用多层 hash DSL。Prisma 6.19.3 版本锁改成独立测试即可。

## 3. effective Schema identity

- 当前 G1 manifest 明确是 `effectiveStage=G1, appliedOverlays=[]`，而正式数据库已要求精确 0001～0010。它的 source-provenance digest 不能代表当前发布的物理 Schema。
- 新 release identity 应至少绑定：数据库引擎、按序 migration name/checksum、当前 `schema.prisma` 摘要、overlay contract 版本。`db:verify`、PersistenceState 和 activate 使用这个 identity；G1 manifest digest 只保留为历史生成 provenance。
- 这项修正应先于 final verify/activate；当前 final/backup/activate 尚未实现，因此仍处于合适修正窗口。

## 4. DELETE 等价性

- 现有 real SQLite semantics 主要覆盖 purge DELETE，没有证明 scope trigger 被复合 FK 替代后的删除语义。
- 每个候选必须验证父删除的 CASCADE/RESTRICT/SET NULL、nullable composite key 的 partial-null 绕过、owner 列不可空冲突、事务整体回滚，以及最终 `PRAGMA foreign_key_check` 为零。
- current pointer 等“owner 必须保留、target 可置空”的关系通常不适合直接使用包含 owner 的 composite FK + SET NULL。

## 5. 投影审计触发条件

- 强制触发点：全量 importer 在 fresh DB 完成两轮稳定 shadow 且 verifier 通过后、final import/cutover 前，生成一次投影读取点清单和写放大评估。
- `StorySceneProjection` 当前普通应用只写不读，但 Story formalize trigger 会读取它；importer 还写 provenance。因此评估单元必须是“投影表 + formalize guard + importer 映射”，不能只按 TypeScript read count 删除。
- 实际删表应后置到 DB-only 已激活、backup/restore 已演练且一个稳定周期结束；届时由审计结论自动建立 overlay 任务，不能依赖人工记得。

# 生成器终局建议

选择“渐进 B”，不选择永久 A：

1. ADR 先冻结：0001～0010 与当前 manifest 为历史 artifact；G1 generator 不再接收新业务。
2. 0011+：直接维护 `schema.prisma`、手写向前 migration、每项配轻量 overlay contract，并由单一 release migration catalog 计算身份。
3. 过渡期：保留 G1 generator 仅用于复现/证明旧基线，不让 verifier/activate/runtime 依赖它。
4. 退役门槛：full shadow 两轮、final import、DB-only activate、协调 backup/restore、一个稳定发布周期全部通过。
5. 退役后保留：历史 manifest、0001～0010、checksums、Prisma schema、必要 SQLite 特征测试；移除大 DSL、source closure rebuild 和 `g1:*:write` 活跃脚本。
