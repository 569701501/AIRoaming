---
doc_id: AIR-G3-M4-REGISTRY-PLAN-001
status: active
created: 2026-07-12
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent
source: G3-M施工包与当前实现
---

# 目标

在不触碰 release Schema identity 的前提下，继续推进 G3-M3/M4：

1. 为 `ImportedEntitySource` 建立按 `entityType` 分层的来源证据注册表。
2. 修正 settings/runtime transformed source 的 manifest 锚点校验。
3. 提供 16 个 shadow slice 的依赖顺序编排入口，并验证同一 fresh DB replay 的稳定性。

# 非目标

- 不实现 `db:import --kind final`、backup/restore 或 activate/cutover。
- 不把 full shadow orchestration 宣称为 production cutover。
- 不修改已完成的 release Schema identity 或历史截图删除。

# 验收标准

- `Chapter` 的 `chapter.json + script.md` 复合 sourceDigest 可重算；缺少 `script.md` 时必须按 importer 契约使用 `chapter.json.sourceText` fallback 重算。
- Dialogue runtime 使用 sealed runtime bundle canonical digest；settings/runtime 转换文件可追溯到 snapshot manifest。
- 未注册 entityType 或来源 digest 不匹配时 `db:verify` fail-closed。
- 已注册 runtime entity 若未锚定 `runtime-bundle.json` 时 `db:verify` 也必须 fail-closed。
- 单文件 entityType 必须同时绑定允许的 storage-key pattern；正确摘要挂到其他实体路径时也必须 fail-closed。
- `--slice full` 按固定 16 slice 顺序运行；两轮 fresh shadow/replay 的稳定聚合 reportDigest 相同，实体不重复。
- 16 slice 的尾部顺序固定为 `... layout → exports → dialogue → providers`；任一前置 slice blocked/failed 时立即停止，不创建下游空 run。
- full 编排必须保留 failed slice 的终态摘要；底层 slice 抛错时不得丢失失败 run 或继续创建下游 run。
- `db-verify` 必须只接受稳定的 `--format json` 输出契约，非法格式在连接目标 DB 前 fail-fast。
- 成功 run 的 `counts.entityCounts` 必须按 importer 绑定到 `ImportedEntitySource.entityType`；来源行缺失、超额或出现未绑定类型时 `db:verify` fail-closed，且 A6 的 Shot 投影、A9 的 AssetPhysicalEvidence 等映射必须显式记录。
- 已知 shadow importer 的 `counts.entityCounts` 本身必须存在、绑定键完整且只包含已登记来源键或明确上下文键（Project、A6 Shot）；缺失或未注册计数键时 `db:verify` fail-closed。
- succeeded shadow 必须保留 schemaVersion=1 且同时声明 source/snapshot manifest 已验证的 run verification attestation；缺失或无效时 `db:verify` fail-closed。
- typecheck、定向集成测试和全量回归通过。
