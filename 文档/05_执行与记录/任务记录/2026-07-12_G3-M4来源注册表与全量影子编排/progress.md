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
- [ ] pending Dialogue artifact/read-model 及后续 M5/M6。

# 验证证据

- `pnpm --filter @airoaming/server typecheck`：通过。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M4' --testTimeout=15000`：2 项通过。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M3-FULL' --testTimeout=60000`：1 项通过。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M4-FRESH' --testTimeout=120000`：1 项通过；两套 fresh SQLite DB 的 16 个 slice、逐片 verifier、reportDigest 与业务 inventory digest 均一致。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M4-API-01' --testTimeout=120000`：1 项通过；file/DB `WorkbenchSnapshot` 语义 DTO 一致、ready Asset sha256/bytes 与旧物理文件一致，DB 草稿写入不改变旧工作区文件。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts --testTimeout=120000`：26 项通过；`pnpm --filter @airoaming/server typecheck`：通过。
- 全量 `pnpm --filter @airoaming/server test -- --run --testTimeout=120000`：45 个测试文件、263 个测试通过；包含 M4 API/Asset/DB-only 门禁，G1 manifest/schema/migration check 与 `git diff --check` 通过。

# 工作区约束

- 12 个 `文档/06_测试与验收/截图/` 删除属于既有工作区状态，未修改。
