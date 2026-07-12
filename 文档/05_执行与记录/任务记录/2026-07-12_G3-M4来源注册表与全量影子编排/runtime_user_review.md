---
doc_id: AIR-G3-M4-REGISTRY-RUNTIME-001
status: active
created: 2026-07-12
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 临时 fresh SQLite 与 Nest DB read-model 集成测试
---

# M4 临时环境运行复核

## 运行边界

- 使用临时 fresh SQLite、临时 snapshot/staging/workspace 根和隔离 runId。
- 未连接真实用户 workspace，未写入生产 DB，未执行 backup/restore 或 activate。
- 运行复核只验证 shadow 导入、只读 verifier、DB read-model/API 和旧文件不回写。

## 已验证路径

1. `IMP-M4-FRESH-01`：两套 fresh DB 执行完整 16-slice shadow，逐 slice verifier 通过；ledger、实体/指针 inventory、聚合 reportDigest 一致。
2. `IMP-M3-FULL-01`：同一 snapshot replay 不新增业务实体，聚合摘要保持一致。
3. `IMP-M3-FULL-02`：四格未决议导致首个 Project/Chapter slice blocked，编排立即停止，不创建下游空 run。
4. `IMP-M4-API-01`：移走旧 workspace 后重启 DB 模式仍能读取；DB read-model 语义 DTO 与 file-mode `WorkbenchSnapshot` 一致；ready Asset 物理 hash/bytes 一致；DB 写入不重建旧 workspace，归档旧文件字节不变。
5. `IMP-M3-FULL-03`：重复章节约束导致首个 slice failed 时，full 结果保留 failed run 摘要并停止，不创建下游 run。
6. `IMP-M4-03`：向已成功 run 注入未注册 `entityType` 后，verifier 返回 `MIGRATION_SOURCE_EVIDENCE_UNREGISTERED` 并保持 fail-closed。
7. `IMP-M4-04`、`IMP-M4-05`：已注册实体的摘要被篡改，或 runtime 实体偏离 `runtime-bundle.json`，verifier 均返回 `MIGRATION_SOURCE_DIGEST_MISMATCH` 并保持 fail-closed。
8. `IMP-M4-06`：Project 使用 chapter.json 的正确摘要但 storage key 路径错误，verifier 仍返回 `MIGRATION_SOURCE_DIGEST_MISMATCH`。
9. `IMP-A15-02`：captured pending Dialogue artifact 可恢复，且重放保持单行。
10. `IMP-M4-07`：Chapter 缺少 `script.md` 时，DB shadow 与 verifier 都使用 `chapter.json.sourceText` 备用正文，验证通过且不产生来源摘要误报。
11. `db-verify --format text`：在数据库初始化前返回 `MIGRATION_VERIFY_ARGS_INVALID`，不会创建或连接目标数据库。
12. `IMP-M4-08/09`：成功 run 的当前来源证据缺失或超出 importer 报告计数时，verifier 分别返回 `MIGRATION_SOURCE_EVIDENCE_MISSING` / `MIGRATION_SOURCE_EVIDENCE_COUNT_MISMATCH`，保持 fail-closed。
13. `IMP-M4-10`：成功 full shadow 的 16 个独立 slice 均由 verifier 逐个复核，来源计数、摘要锚点和注册类型全部通过。
14. CLI format fixture：`db:verify`、`db:snapshot`、`maintenance` 的缺值/非法值入口均在 DB、snapshot 或网络副作用前返回稳定错误码；共享 parser 的 5 项边界测试通过。
15. 来源注册表契约：动态扫描 16 个 shadow slice 的来源写入点，3 项测试确认每个 entityType 已登记且策略分类互斥。
16. `IMP-M4-11`：成功 audit run 被 verifier 拒绝并返回 `MIGRATION_RUN_KIND_INVALID`，避免非 shadow 账本 vacuous pass。
17. `IMP-M4-12/13`：未知 shadow importerVersion、缺失 succeeded reportDigest 均被拒绝。
18. `IMP-M4-14/15`：已知 importer 缺失 `counts.entityCounts`、出现未注册 entity count key 均被拒绝；合法上下文计数不误报。
19. `IMP-M4-16/17`：succeeded shadow 缺失或无效 verification attestation 均被拒绝。
20. `IMP-M4-18/19`：succeeded shadow 缺少 `decisionsDigest` 或 report digest 格式非法均被拒绝。
21. `IMP-M4-20/21/22`：`db:verify` 缺少 decisions artifact，或 artifact source/digest 与 run 不一致，均被拒绝。
22. `IMP-M4-23/24/25`：`db:verify` 缺少 `--import-report`、报告 artifact 非法或其 canonical digest 与 run 不一致，均被拒绝；full shadow 逐片验证使用每个 slice 保留的报告对象。
23. `IMP-M4-26/27`：真实 `db:verify` CLI 在临时 SQLite 上成功输出并写入验证报告；缺少 `--import-report` 时在 Prisma 初始化前稳定失败。
24. `IMP-M4-28`：真实 `db:import --kind shadow --slice full` CLI 在临时 SQLite 上返回 `MIGRATION_IMPORT_OK`，聚合报告含 16 个有序成功 slice，并创建 16 条独立 MigrationRun。

## 读取点审计边界

- 代码静态审计已确认 SettingsService 仍使用旧 `app-settings.json`；这是 M5 capability/SecretStore 的已登记阻塞，不把它伪装为 M4 DB-only 运行证据。
- 本轮没有连接真实 workspace/生产 settings，也没有执行 M5/M6；因此不能据此批准 production-ready。

## 结论

临时环境运行证据支持 M4 实现门禁通过；由于没有真实切换授权，不能把该结论升级为 production-ready。M4 继续保持 `in_progress`，等待正式验收签字。
