---
doc_id: AIR-G3-M4-READ-POINT-AUDIT-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: release Schema handoff、G3-M 施工包、当前 server 读写代码
---

# DB-only 投影读取点审计

## 审计范围

本审计用于 full shadow 两轮通过后的 final cutover 前检查，只检查运行时是否把旧 JSON/Markdown 当成 DB 事实源；不授权 final、backup 或 activate，也不扩展 M5 capability/SecretStore。

## 结论矩阵

| 读取/写入点 | 当前路径 | 结论 | 证据/边界 |
| --- | --- | --- | --- |
| Project/Chapter/Script/Outline/Story/Storyboard/Preflight/Character/Asset/Candidate/Lock/Layout | `ProjectRepository.loadProjectsFromDatabase()` → Prisma read model | 通过 | DB 模式分支不调用 workspace reader；`IMP-M4-API-01` 在移走旧 workspace 后重启仍可读 |
| Task 列表、详情、claim/finish/retry/cancel | `TasksService` → `PersistentTaskRepository` | 通过 | DB 模式走持久任务表；旧 task artifact 不是业务事实源 |
| 生成候选图的物理文件 | `PersistentTaskWorkerService` / `CandidateReferenceResolver` → 明确 `Asset.storageKey` | 允许 | 这是 Asset physical storage，不是旧 metadata；必须继续以 DB `sha256/bytes/status` 为事实 |
| Layout/Export/Asset package 等仍未完成的业务写入口 | `ProjectsService.assertDatabaseOperationSupported()` | 保持阻断 | 不得在 M4 通过 file fallback 绕过 DB capability；M5/M6 继续未实现 |
| Settings/Provider runtime read/write | `SettingsService` → `workspace/settings/app-settings.json` | M5 阻塞 | 当前仍是旧文件事实源；Provider/settings shadow 只导入脱敏元数据，不等于 SecretStore/runtime capability 已实现 |
| migration CLI 的 snapshot/decision/verify 文件 | `apps/server/src/migration/*` | 不属于 runtime fallback | 这些是显式临时输入/输出，路径由 CLI 参数提供；不参与业务 API 读模型 |

## 审计结论

1. M4 的 DB read-model/API 等价门禁覆盖了当前已交付的业务投影，不需要为了“看起来全 DB”把 Settings/M5 偷塞进 M4。
2. `SettingsService` 的旧文件事实源必须进入 `db-capability-registry` 的 required gate；在 DB-only activate 前，必须完成 DB settings + SecretStore/runtime provider 读写并有重启证据。
3. 在 M5 完成前，禁止把 DB mode 的 Settings 文件读写描述为 production-ready；M4 继续 `in_progress`，`db:import --kind final`、backup、activate 保持 fail-closed。

## 后续入口

- M5：实现 Settings/Credential capability、脱敏/SecretStore 运行时映射，并补 `CAP-01/02`、重启和旧 settings mutation 隔离测试。
- M6 前：重新执行本审计，确认除允许的 Asset physical storage 与显式 migration staging 外，runtime 不再以旧 metadata/secret 文件作为 DB 事实源。
