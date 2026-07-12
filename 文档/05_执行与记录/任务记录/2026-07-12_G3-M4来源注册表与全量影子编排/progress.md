---
doc_id: AIR-G3-M4-REGISTRY-PROGRESS-001
status: active
created: 2026-07-12
updated: 2026-07-12
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
- [x] 修正 full shadow 尾部依赖顺序为 `dialogue → providers`；前置 slice blocked/failed 时 fail-fast，不运行下游 slice。
- [x] 完成 final cutover 前投影读取点静态审计；确认 Settings 旧文件事实源属于 M5 capability blocker，不在 M4 偷补。
- [x] pending Dialogue artifact：显式 `dialogue_pending_state_v1` capture、稳定导入、scope/FK、payloadDigest、runtime source evidence 和 replay。
- [x] M4 任务目录同步 DB read-model/API/Asset 门禁证据；M4 仍等待正式验收签字。
- [ ] M5 backup/restore、M6 activate/cutover。

# 验证证据

- `pnpm --filter @airoaming/server typecheck`：通过。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M4' --testTimeout=120000`：3 项通过。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M3-FULL' --testTimeout=60000`：1 项通过。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M4-FRESH' --testTimeout=120000`：1 项通过；两套 fresh SQLite DB 的 16 个 slice、逐片 verifier、reportDigest 与业务 inventory digest 均一致。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M4-API-01' --testTimeout=120000`：1 项通过；移走旧 workspace 后 DB 重启仍能读取，file/DB `WorkbenchSnapshot` 语义 DTO 一致、ready Asset sha256/bytes 与旧物理文件一致，DB 草稿写入不重建旧工作区。
- `pnpm --filter @airoaming/server test -- src/migration/project-chapter-shadow-importer.integration.spec.ts --run --testTimeout=120000`：28 个迁移集成测试通过；包含 DB-only 断根重启和未知 entityType fail-closed。
- 同一命令当前：31 个迁移集成测试通过；新增 `IMP-M3-FULL-02` 验证四格未决议时只保留首个 blocked run，不创建下游 slice，并新增 `IMP-M4-04/05` 来源证据 fail-closed 回归。
- `IMP-M4-04`、`IMP-M4-05` 定向测试：2 项通过；覆盖注册类型摘要篡改和 runtime 非 `runtime-bundle.json` 锚点。
- `pnpm --filter @airoaming/server test -- --run --testTimeout=120000`：45 个测试文件、268 个测试通过；包含 M4 API/Asset/DB-only/pending Dialogue、full fail-fast 与来源证据篡改门禁。
- `pnpm --filter @airoaming/server typecheck`、G1 manifest/schema/migration check 与 `git diff --check`：通过。
- `projection_read_point_audit.md`：静态审计确认业务 DB read-model 与物理 Asset storage 边界；Settings/SecretStore 明确保留为 M5 阻塞项。

# 工作区约束

- 12 个 `文档/06_测试与验收/截图/` 删除属于既有工作区状态，未修改。
