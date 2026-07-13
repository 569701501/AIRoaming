---
doc_id: AIR-M6-A1-FILEMAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 当前 M6/backup/restore/final/persistence 代码探索
---

# M6-A1 文件与函数地图

## 1. 必改核心文件

| 文件 | 当前责任 | M6-A1 修改 |
| --- | --- | --- |
| `apps/server/src/backup/backup.types.ts` | shadow-only manifest/input | 改为 coordinated/pre-cutover 判别联合；typed verified result |
| `apps/server/src/backup/app-backup.cli.ts` | 两 kind 解析但 pre-cutover 直接 blocked | 精确 kind 参数矩阵，传入 runId/final 输入 |
| `apps/server/src/backup/app-backup.service.ts` | coordinated/shadow backup | 增加 final/ready pre-cutover 分支，共享复制/secret/seal 原语 |
| `apps/server/src/backup/app-restore.service.ts` | coordinated/shadow verifier/materializer | 按 kind 验证 final run/report/state；向 activate 返回 typed manifest |
| `apps/server/src/migration/ready-coordinator.ts` | final→ready，接受两个 boolean | 移除 boolean 假证据，验证 closed runtime bundle |
| `apps/server/src/migration/db-activate.cli.ts` | activate 参数 | 增加 maintenance bundle/evidence root；精确早失败 |
| `apps/server/src/migration/db-activate.service.ts` | ready→db_only | 绑定 typed pre-cutover manifest、final/state/evidence/maintenance |
| `apps/server/src/migration/cutover-coordinator.service.ts` | 内存 step 数组 | 接入持久 evidence store、resume/idempotency/crash reconcile |
| `apps/server/src/persistence/prisma.service.ts` | business transaction/first write | 完整业务写/系统写边界、状态语义和并发首写 |

## 2. 建议新增文件

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/migration/cutover-evidence.service.ts` | canonical step/manifest、原子写、摘要链、C6_READY/COMPLETED、resume |
| `apps/server/src/migration/cutover-evidence.types.ts` | CutoverEvidence 判别类型与关闭枚举 |
| `apps/server/src/persistence/business-write-boundary.registry.ts` | 业务 mutation owner、文件/函数/证据 ID、system allowlist |
| `apps/server/src/persistence/business-write-boundary.spec.ts` | 源码结构门禁和 registry completeness |
| `apps/server/src/migration/cutover-evidence.service.spec.ts` | evidence 原子性、tamper、resume、crash reconcile |
| `apps/server/src/migration/test-fixtures/cutover-fixture.ts` | 可选：抽取现有 final/backup 临时 fixture；只供测试，禁止生产导入 |

命名可按现有目录风格微调，但职责不能重新塞回一个巨型 service。

## 3. 测试文件

| 文件 | 必须增加/改变的证据 |
| --- | --- |
| `apps/server/src/backup/app-backup-restore.integration.spec.ts` | pre-cutover 成功、kind 分支、materialize、reseal semantic tamper、CLI |
| `apps/server/src/migration/project-chapter-shadow-importer.integration.spec.ts` | ReadyCoordinator 新输入；final fixture 可抽取复用 |
| `apps/server/src/migration/db-activate.service.spec.ts` | 不再 fake restore 作为唯一成功证据；identity/maintenance/evidence 负例 |
| `apps/server/src/migration/cutover-coordinator.service.spec.ts` | 持久化、跨实例 resume、幂等、冲突、crash reconcile |
| `apps/server/src/migration/m6-c0-c7.rehearsal.spec.ts` | 删除 fake Prisma/restore/marker 链，改真实临时 SQLite 全链路 |
| `apps/server/src/persistence/prisma.service.spec.ts` | ready/recovery、rollback、并发首写、只写一次 |
| `apps/server/src/persistence/file-mode-guard.spec.ts` | 首写后拒绝继续保留 |

## 4. 业务 mutation 迁移清单

以下是当前已发现的 `$transaction` 入口；Worker 还必须扫描直接 mutation，不能把本表当作完整清单。

| 文件 | 初始分类 | 处理要求 |
| --- | --- | --- |
| `apps/server/src/tasks/persistent-task.repository.ts` | 业务 | claim/create/complete/cancel/recover 进入 business boundary |
| `apps/server/src/settings/settings.service.ts` | 业务 | metadata/credential state mutation 进入 business boundary |
| `apps/server/src/projects/layout-export.service.ts` | 业务 | layout/export seal 与 current 更新进入 business boundary |
| `apps/server/src/projects/character-reference.service.ts` | 业务 | queue/confirm/delete/visual 更新进入 business boundary |
| `apps/server/src/projects/image-candidate.service.ts` | 业务 | candidate/lock mutation 进入 business boundary |
| `apps/server/src/projects/persistent-task-worker.service.ts` | 业务 | worker completion/asset/visual mutation 进入 business boundary |
| `apps/server/src/projects/asset-package.service.ts` | 业务 | package export revision/artifact mutation 进入 business boundary |
| `apps/server/src/projects/versioning/version-transaction-runner.service.ts` | 业务封装 | 改为委托 `runBusinessTransaction`，不得再自建旁路 |
| `apps/server/src/projects/project-delete-outbox.service.ts` | 业务 | delete intent/outbox claim/complete/purge 进入 business boundary |
| `apps/server/src/dialogue/dialogue.service.ts` | 业务 | thread/message/tool/session mutation 进入 business boundary |
| `apps/server/src/migration/final-importer.ts` | system | 显式 system allowlist，不标 first write |
| `apps/server/src/migration/ready-coordinator.ts` | system | 显式 system allowlist，不走业务 active gate |
| `apps/server/src/migration/db-activate.service.ts` | system | 只允许 ACT-08 条件事务 |
| `apps/server/src/migration/prisma-migration-ledger.repository.ts` | system | 仅 migration caller；registry 证明 |

还需审查直接 `database().model.create/update/delete/upsert/*Many` 的文件，尤其：

```text
apps/server/src/projects/character-reference.service.ts
apps/server/src/dialogue/dialogue.service.ts
apps/server/src/projects/project-delete-outbox.service.ts
apps/server/src/tasks/persistent-task.repository.ts
apps/server/src/projects/persistent-task-worker.service.ts
```

## 5. Runtime bundle 相关

| 文件 | 修改范围 |
| --- | --- |
| `apps/server/src/maintenance/maintenance.types.ts` | 为新 closed evidence 增加明确状态/计数结构 |
| `apps/server/src/maintenance/maintenance-coordinator.service.ts` | createRuntimeBundle 写真实 closed status；不改变正常 open/drain API |
| `apps/server/src/migration/runtime-bundle-file.service.ts` | 验证新 closed 语义、权限、digest、sentinel |
| `apps/server/src/migration/snapshot.types.ts` | 仅同步 RuntimeBundle 类型，保持 snapshot 合法读取 |
| `apps/server/src/migration/snapshot.service.spec.ts` | 新字段和旧缺失字段的兼容/拒绝边界 |

## 6. 必须同步的文档

```text
文档/04_方案与决策/2026-07-12_G3-M施工包_备份恢复与DB-only激活.md
文档/05_执行与记录/任务记录/2026-07-13_M6Activate与C0-C7演练/*
文档/05_执行与记录/任务记录/2026-07-13_D2至M6连续交付总目标/execution_status.md
文档/05_执行与记录/任务记录/2026-07-13_D2至M6连续交付总目标/real_cutover_handoff.md
文档/06_测试与验收/G1数据库迁移执行与验收清单.md
文档/05_执行与记录/功能完成记录/YYYY-MM-DD_M6真实切换验收补强.md
本目录 task_plan/progress/findings/五份施工资料与双 Review
文档/记忆/MEMORY.md
```

## 7. 禁止修改

```text
apps/server/prisma/schema.prisma
apps/server/prisma/migrations/**
workspace/**                         # 真实/默认用户 workspace
任何真实 dataRoot/Keychain/provider 配置
G4/G5 业务代码与验收文档状态
```

如果实现确实要求 Schema/migration/trigger 变化，按 Handoff Stop 条件停止，不得自行扩大范围。

## 8. 代码组织约束

- 不复制 backup/restore digest、canonical JSON、secret scan 算法；提取小型共享原语。
- 不把 final importer、backup、restore、activate 重新合并成一个 orchestrator 巨类。
- Cutover evidence 只负责顺序、摘要和 artifact binding，不重复实现领域验证。
- 不建立 Reviewer 身份、签名、attestation、CAS bundle 或自动审批机制。
- 测试 fixture helper 不能被生产代码导入。

