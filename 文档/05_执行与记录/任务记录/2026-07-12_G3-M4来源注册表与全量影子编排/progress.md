---
doc_id: AIR-G3-M4-REGISTRY-PROGRESS-001
status: active
created: 2026-07-12
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent
source: task execution
---

# 进展

- [x] 读取 G3 handoff、G3-M 四份施工资料、README/索引/写作规范。
- [x] 新增 `migration-source-evidence.registry.ts`：single-item、Chapter composite、runtime bundle 三类来源规则。
- [x] `MigrationVerifyService` 合并 source manifest 与 snapshot manifest，并检查 sourceDigest 与注册算法。
- [x] 新增 `FullShadowImporter` 和 `db:import --slice full`，固定 16 slice 顺序，聚合摘要不绑定 runId。
- [x] 修复 full replay 时 Asset physical evidence 对原始 metadata 的合法后置增强兼容。
- [x] 新增 M4 transformed source、full replay 集成测试。
- [x] 新增双 fresh DB 全量影子导入一致性测试：16 个 slice 均逐片通过 verifier，聚合 reportDigest、规范化 slice summary、业务 inventory digest 一致；同时覆盖 ProjectScriptOutline 复合来源摘要重算。
- [x] DB full shadow → `WorkbenchSnapshot` 公共读模型、API DTO 语义等价、Asset 物理 hash 对照和 DB-only 写隔离门禁。
- [x] DB-only 重启读隔离：移走旧 workspace 后重新启动 DB 模式仍可读取同一 `WorkbenchSnapshot`；归档旧文件字节保持不变。
- [x] 新增未知 `entityType` 来源证据回归：`db:verify` 返回 `MIGRATION_SOURCE_EVIDENCE_UNREGISTERED` 并 fail-closed。
- [x] 新增已注册来源摘要不匹配与 runtime 错误锚点回归：`db:verify` 返回 `MIGRATION_SOURCE_DIGEST_MISMATCH` 并 fail-closed。
- [x] 为全部单文件 entityType 固化 storage-key pattern，并新增错误实体路径回归：正确摘要挂到其他实体路径仍 fail-closed。
- [x] full shadow 捕获 failed slice 的终态摘要并 fail-fast；新增 `IMP-M3-FULL-03`，不丢失失败 run、不创建下游 run。
- [x] Chapter 缺少 `script.md` 时，verifier 按 importer 同样使用 `chapter.json.sourceText` 备用正文重算复合摘要；新增 `IMP-M4-07`。
- [x] `db-verify` 补齐 `--format json` 参数校验，非法格式返回 `MIGRATION_VERIFY_ARGS_INVALID`，不启动数据库。
- [x] 统一 8 个 G3 CLI 的 `--format json` 解析：缺值、非法值和重复 flag 均在副作用前以各自稳定错误码 fail-fast；新增 `cli-format.spec.ts` 5 项回归，并用 `db:verify`、`db:snapshot`、`maintenance` fixture 复核入口行为。
- [x] 新增来源注册表契约回归：single/composite/runtime 三类策略互斥，并动态核对所有 shadow importer 写入的 `entityType` 均已注册；3 项测试通过。
- [x] verifier 按 importer/entityType 对齐 `counts.entityCounts` 与当前 run 来源行；显式覆盖 A6 Shot 投影、A9 AssetReady→AssetPhysicalEvidence，并新增来源行超额 fail-closed 回归 `IMP-M4-09`。
- [x] `IMP-M4-10` 对成功 full shadow 的 16 个独立 slice 逐个运行 verifier，确认每个 slice 的来源计数、摘要锚点和注册类型均通过。
- [x] `IMP-M4-12/13` 固化未知 importerVersion、缺失 succeeded reportDigest 的 fail-closed 门禁。
- [x] `IMP-M4-14/15` 固化已知 importer 缺失 `counts.entityCounts`、以及未注册 entity count key 的 fail-closed 门禁；Project/A6 Shot 上下文计数显式允许。
- [x] `IMP-M4-16/17` 固化 succeeded shadow 缺失或无效 verification attestation 的 fail-closed 门禁。
- [x] `IMP-M4-18/19` 固化 succeeded shadow 的决议摘要与报告摘要形状门禁：缺少 `decisionsDigest` 返回 `MIGRATION_DECISIONS_DIGEST_MISSING`；非 `sha256:<64位小写十六进制>` 的 report digest 返回 `MIGRATION_REPORT_DIGEST_INVALID`。
- [x] 修正 full shadow 尾部依赖顺序为 `dialogue → providers`；前置 slice blocked/failed 时 fail-fast，不运行下游 slice。
- [x] 完成 final cutover 前投影读取点静态审计；确认 Settings 旧文件事实源属于 M5 capability blocker，不在 M4 偷补。
- [x] pending Dialogue artifact：显式 `dialogue_pending_state_v1` capture、稳定导入、scope/FK、payloadDigest、runtime source evidence 和 replay。
- [x] M4 任务目录同步 DB read-model/API/Asset 门禁证据；M4 仍等待正式验收签字。
- [ ] M5 backup/restore、M6 activate/cutover。

# 验证证据

- `pnpm --filter @airoaming/server typecheck`：通过。
- `pnpm --filter @airoaming/server test -- src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M4-(1[89]|1[67])' --pool=forks --poolOptions.forks.singleFork=true --reporter=dot`：4 项新增/相邻 M4 门禁通过（IMP-M4-16～19）。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts --pool=forks --poolOptions.forks.singleFork=true --reporter=dot`：46 项迁移集成测试通过，包含 IMP-M4-18/19 的摘要形状门禁。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M3-FULL' --testTimeout=120000`：3 项通过，覆盖 replay、blocked 和 failed slice。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M4-FRESH' --testTimeout=120000`：1 项通过；两套 fresh SQLite DB 的 16 个 slice、逐片 verifier、reportDigest 与业务 inventory digest 均一致。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M4-API-01' --testTimeout=120000`：1 项通过；移走旧 workspace 后 DB 重启仍能读取，file/DB `WorkbenchSnapshot` 语义 DTO 一致、ready Asset sha256/bytes 与旧物理文件一致，DB 草稿写入不重建旧工作区。
- `pnpm --filter @airoaming/server test -- src/migration/project-chapter-shadow-importer.integration.spec.ts --run --testTimeout=120000`：37 个迁移集成测试通过；包含 DB-only 断根重启、未知 entityType、摘要篡改、runtime 锚点、storage-key pattern、Chapter sourceText fallback、replay 空来源、来源计数超额和 full 16-slice 逐片计数校验 fail-fast。
- `IMP-M4-04`～`IMP-M4-06` 定向测试：3 项通过；覆盖注册类型摘要篡改、runtime 非 `runtime-bundle.json` 锚点和单文件实体错误 storage key。
- `pnpm --filter @airoaming/server test -- --pool=forks --poolOptions.forks.singleFork=true --reporter=dot`：47 个测试文件、291 个测试通过；包含 M4 API/Asset/DB-only/pending Dialogue、full blocked/failed fail-fast、摘要篡改、runtime 锚点、storage-key pattern、Chapter sourceText fallback、replay 空来源、来源计数结构/行级门禁、full 16-slice 逐片计数校验、shadow-only run kind、importerVersion/decisionsDigest/reportDigest/verification attestation 门禁、统一 CLI format 门禁和 importer entityType 注册表契约。
- `pnpm --filter @airoaming/server typecheck`、G1 manifest/schema/migration check 与 `git diff --check`：通过。
- `pnpm --filter @airoaming/server exec tsx src/migration/db-verify.cli.ts ... --format text`：按契约 fail-fast，输出 `MIGRATION_VERIFY_ARGS_INVALID`；typecheck 与 server 全量回归仍通过。
- `projection_read_point_audit.md`：静态审计确认业务 DB read-model 与物理 Asset storage 边界；Settings/SecretStore 明确保留为 M5 阻塞项。

# 工作区约束

- 12 个 `文档/06_测试与验收/截图/` 删除属于既有工作区状态，未修改。
