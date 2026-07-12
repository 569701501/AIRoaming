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
- [ ] API DTO 等价与 Asset hash 对照门禁。
- [ ] pending Dialogue artifact/read-model 及后续 M5/M6。

# 验证证据

- `pnpm --filter @airoaming/server typecheck`：通过。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M4' --testTimeout=15000`：2 项通过。
- `pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'IMP-M3-FULL' --testTimeout=60000`：1 项通过。

# 工作区约束

- 12 个 `文档/06_测试与验收/截图/` 删除属于既有工作区状态，未修改。
