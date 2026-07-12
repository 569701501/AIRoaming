---
doc_id: AIR-G3-M4-REGISTRY-SCRUTINY-001
status: active
created: 2026-07-12
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 当前 M4 代码、测试与 G3-M 交接文档
---

# M4 静态复核

## 复核范围

本复核只检查 M4 shadow/verifier/read-model 证据，不修改 release Schema identity、G1 package closure、历史 migration 或既有截图删除，也不授权 final/backup/activate。

## 结论矩阵

| 项目 | 结论 | 证据 |
| --- | --- | --- |
| 来源证据 | 通过 | `migration-source-evidence.registry.ts` 覆盖 single entityType + storage-key pattern、composite、runtime；契约测试动态核对所有 shadow importer 写入点且三类策略互斥；Chapter 缺少 `script.md` 时镜像 importer 的 `chapter.json.sourceText` fallback；未知类型 fail-closed |
| 已注册来源篡改 | 通过 | `IMP-M4-04` 验证摘要不匹配；`IMP-M4-05` 验证 runtime 必须锚定 `runtime-bundle.json` |
| 单文件来源路径 | 通过 | registry 为全部单文件 entityType 固化 storage-key pattern；`IMP-M4-06` 验证跨实体路径复用摘要被拒绝 |
| full shadow | 通过 | `FullShadowImporter` 固定 16 slice 顺序，聚合摘要排除 runId |
| full shadow 失败传播 | 通过 | `IMP-M3-FULL-02` 前置 blocked 后停止，`IMP-M3-FULL-03` 保留 failed run 后停止；不创建下游空 run，尾部顺序为 dialogue→providers |
| replay/fresh | 通过 | `IMP-M3-FULL-01`、`IMP-M4-FRESH-01` |
| DB read-model/API | 通过 | `IMP-M4-API-01` 对照 file/DB `WorkbenchSnapshot` 语义字段；移走旧 workspace 后 DB 模式重启仍可读 |
| Asset 物理证据 | 通过 | ready Asset sha256/bytes 与旧物理文件对照 |
| DB-only 写隔离 | 通过 | DB `saveChapterDraft` 后旧 workspace 不被重建/写入，归档的 `project.json`/`script.md` 字节不变 |
| 投影读取点审计 | 通过（M5 残留阻塞已登记） | `projection_read_point_audit.md`；业务 read-model/Task 走 DB，Settings 旧文件事实源明确不属于 M4 完成范围 |
| pending Dialogue | 通过 | `IMP-A15-02` 检查 stable ID、scope/FK、payloadDigest、source evidence、replay |
| verifier/迁移 CLI 参数 | 通过 | 8 个 G3 CLI 共用 `readJsonFormat`；缺值、非法值、重复 flag 均在副作用前 fail-fast，`json` 是唯一输出格式；`db-verify --format text` 返回 `MIGRATION_VERIFY_ARGS_INVALID` |
| verifier 目标 run 类型 | 通过 | verifier 要求 `MigrationRun.kind=shadow`；`IMP-M4-11` 证明成功 audit run 返回 `MIGRATION_RUN_KIND_INVALID` |
| 来源计数完整性 | 通过 | verifier 按 importer/entityType 精确比较 `counts.entityCounts` 与当前 run 来源行；A6/A9 特殊映射、replay 空来源和超额来源由 `IMP-M4-08/09` 覆盖，`IMP-M4-10` 逐个验证 full shadow 的 16 个 slice |
| counts.entityCounts 结构 | 通过 | `IMP-M4-14/15`：已知 importer 缺失计数结构或出现未注册键均 fail-closed；Project/A6 Shot 上下文键有明确白名单 |
| final/cutover | 保持阻断 | `db:import --kind final`、backup、activate 仍不在本轮实现范围 |

## 审查结论

M4 实现门禁没有发现新的 P0/P1 缺口，但正式验收签字尚未执行，因此状态必须继续为 `in_progress`。本文件不构成 production release 或 DB-only activate 授权。
