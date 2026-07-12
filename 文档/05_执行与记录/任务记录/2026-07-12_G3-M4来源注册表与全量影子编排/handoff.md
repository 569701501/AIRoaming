---
doc_id: AIR-G3-M4-REGISTRY-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent
source: G3-M4 continuation
---

# 已交付

- 来源证据注册表和 M4 verifier 校验已落地。
- `db:import --kind shadow --slice full --workspace-root <workspace-root>` 已提供 16 slice 编排；可选 `--run-id-prefix` 生成可读的独立 run IDs。
- full replay 已覆盖 Asset ready/physical evidence 后置增强场景。
- full shadow 编排尾部顺序已对齐施工契约：`... layout → exports → dialogue → providers`；任一前置 slice blocked/failed 时 fail-fast，不运行下游空 slice。
- verifier 还覆盖已注册来源摘要篡改和 runtime 非 `runtime-bundle.json` 锚点，均保持 fail-closed（`IMP-M4-04`、`IMP-M4-05`）。
- 单文件 entityType 也已绑定允许的 storage-key pattern；`IMP-M4-06` 覆盖正确摘要挂到其他实体路径的 fail-closed。
- full 编排也已覆盖 failed slice：`IMP-M3-FULL-03` 保留失败 run 摘要并停止，不产生下游空 run。
- Chapter 复合来源对缺失 `script.md` 的合法 `chapter.json.sourceText` fallback 已与 verifier 对齐，`IMP-M4-07` 通过。
- `db-verify` 已补齐 `--format json` 稳定参数校验；非法格式不启动 Prisma，返回 `MIGRATION_VERIFY_ARGS_INVALID`。
- 统一 CLI 参数门禁已接入 8 个 G3 CLI；`--format` 缺值、非法值和重复 flag 均在副作用前 fail-fast，保留各入口稳定错误码，新增 `cli-format.spec.ts` 5 项回归。
- 来源注册表新增 3 项契约回归：三类来源策略互斥，并动态核对所有 shadow importer 写入的 entityType 均已登记；后续新增 importer 若未注册会在测试阶段失败。
- `MigrationVerifyService` 现明确只接受 `MigrationRun.kind=shadow`；成功 audit run 会返回 `MIGRATION_RUN_KIND_INVALID`，`IMP-M4-11` 已通过。
- verifier 已按 importer-specific entity count 绑定并精确比较 `ImportedEntitySource` 行；A6 的 Shot 计数映射到 `StoryboardShotProjection`，A9 的 AssetReady 计数映射到 `AssetPhysicalEvidence`；缺失/超额证据分别以 `MIGRATION_SOURCE_EVIDENCE_MISSING` / `MIGRATION_SOURCE_EVIDENCE_COUNT_MISMATCH` fail-closed，新增 `IMP-M4-08/09`。`IMP-M4-10` 进一步逐个验证成功 full shadow 的 16 个 slice。
- 已知 importer 的 `counts.entityCounts` 现在也必须结构完整：缺失返回 `MIGRATION_SOURCE_ENTITY_COUNTS_MISSING`，未注册键或非法值返回 `MIGRATION_SOURCE_ENTITY_COUNTS_INVALID`；`Project` 与 A6 `Shot` 作为已声明上下文计数保留。`IMP-M4-14/15` 已通过。
- succeeded shadow 的 run verification 现在也必须是 schemaVersion=1，并明确 source/snapshot manifest 已验证；缺失/无效分别返回 `MIGRATION_RUN_VERIFICATION_MISSING` / `MIGRATION_RUN_VERIFICATION_INVALID`，`IMP-M4-16/17` 已通过。
- final cutover 前投影读取点静态审计已完成：业务 read-model/Task 走 DB，Asset physical storage 保持允许边界；Settings/SecretStore 旧文件事实源明确交给 M5，不得借 M4 绕过 capability gate。
- DB full shadow 已能重建公共 `WorkbenchSnapshot`；file/DB 语义 DTO、ready Asset sha256/bytes 和 DB-only 写隔离均有集成证据。
- Dialogue runtime 的显式 pending codec/import 已完成：ScriptDialogueService 的三类 pending Map 进入 `PendingDialogueArtifact`，保留稳定 sourceKey、scope、payloadDigest 和 runtime-bundle 来源证据。

# 交给下一阶段

1. 完成 M4 正式验收签字前的最终审查，并把本目录的证据命令保持可复现。
2. 继续保持 `db:import --kind final`、M5 backup/restore 和 M6 activate fail-closed。
3. M4 签字后才进入 M5；M6 仍需 capability、SecretStore、backup 和用户授权前置。

# 当前结论

M3 full shadow orchestration 已完成，M4 仍 `in_progress`，不能作为 Luna 的 final cutover 实现依据。
