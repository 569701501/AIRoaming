---
doc_id: AIR-D2-M6-MASTER-FILEMAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent
source: 当前仓库源码与剩余阶段
---

# D2 至 M6 文件与责任地图

## 1. 控制与事实源

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/migration/db-capability-registry.ts` | 8 个聚合 capability、36 operation、blocked 计算 |
| `apps/server/src/migration/db-capabilities.cli.ts` | JSON report/check；不初始化 Prisma |
| `apps/server/src/migration/db-capability-registry.spec.ts` | 源码调用点穷尽、状态/evidence/CLI |
| `apps/server/prisma/schema.prisma` | 当前 44-model DB substrate |
| `apps/server/prisma/migrations/` | 0001～0010 冻结；必要时新增 0011+ |
| `apps/server/src/persistence/prisma.service.ts` | file/db mode、数据库生命周期 |
| `apps/server/src/persistence/` 下 `g1-schema-*` 系列 | 现有约束/trigger；只做最小必要更新 |

## 2. Project/Script

| 文件 | 当前事实 / 后续责任 |
| --- | --- |
| `apps/server/src/projects/projects.service.ts` | 公开门面，34 个 capability 调用点主要来源 |
| `apps/server/src/projects/project-repository.service.ts` | DB read model/identity map；两个 file clear 门禁 |
| `apps/server/src/projects/chapter-script.service.ts` | 旧 file-mode script/import/reset；DB 路由需转 command repository |
| `apps/server/src/projects/versioning/script-version.repository.ts` | G2 Working Copy/Publish/Pending CAS 已实现 |
| `apps/server/src/projects/versioning/script-version.service.ts` | G2 Script API service |
| `apps/server/src/projects/projects.controller.ts` | 旧/新 API、稳定 replacement/error |
| `apps/server/src/projects/project-db-persistence.integration.spec.ts` | fresh SQLite、restart、公开 Service 主证据 |
| `apps/web/src/` | Workbench capability 分支、G2 Script store/API；实施时先用 `rg` 定位实际组件 |

建议新增：

- `apps/server/src/projects/versioning/project-script-command.repository.ts`。
- A2-2 的 impact preview/retirement codec，可放 `projects/versioning/`。

## 3. Story/Storyboard/Preflight

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/projects/story-structure.service.ts` | 旧 file 编排；DB mode 接 Story repository |
| `apps/server/src/projects/storyboard.service.ts` | 旧 file 编排；DB mode 接 Storyboard repository |
| `apps/server/src/projects/image-preflight.service.ts` | Preflight 计算与确认 |
| `apps/server/src/projects/versioning/story-version.repository.ts` | Story document/projection/current/pending |
| `apps/server/src/projects/versioning/storyboard-version.repository.ts` | Storyboard document/Shot projection/current/pending |
| `apps/server/src/projects/versioning/preflight-revision.repository.ts` | Preflight revision |
| `apps/server/src/projects/versioning/source-snapshot-builder.service.ts` | source digest/freshness |
| `apps/server/src/projects/versioning/new-work-gate.service.ts` | 新工作门禁 |
| `apps/server/src/projects/versioning/task-applicability-guard.service.ts` | 迟到/历史 applicability |

## 4. Character/Asset/Candidate

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/projects/character-reference.service.ts` | Character/Scene reference 公开流程 |
| `apps/server/src/projects/image-candidate.service.ts` | Candidate、lock、complete images |
| `apps/server/src/projects/image-provider.service.ts` | provider 边界；测试 fake |
| `apps/server/src/projects/persistent-g2-task-create-guard.service.ts` | Task 创建与 source freeze |
| `apps/server/src/projects/persistent-task-worker.service.ts` | claim/worker/fencing |
| `apps/server/src/projects/candidate-reference-resolver.ts` | 参考图 provenance |
| `apps/server/src/projects/candidate-generation-spec.ts` | prompt/spec digest |
| `apps/server/src/workspace/` | 受控 storage path；实施前定位实际服务 |

建议按窄职责新增 Character/Asset/Lock command repository，不把逻辑堆回 `ProjectsService`。

## 5. Layout/Export

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/projects/layout-export.service.ts` | 当前 file-mode build/export |
| `apps/server/src/projects/asset-package.service.ts` | 当前扫描旧文件生成 package，需改为 DB + Asset storage |
| `apps/server/src/migration/layout-shadow-importer.ts` | legacy Layout envelope/import 规则参考 |
| `apps/server/src/migration/export-shadow-importer.ts` | legacy Export evidence 规则参考 |
| `apps/server/src/projects/versioning/chapter-production-query.service.ts` | lock/layout/export read/freshness |

建议新增：

- `apps/server/src/projects/layout-command.repository.ts`。
- `apps/server/src/projects/export-command.repository.ts`。
- 物理 renderer/publisher 与 DB repository 分离。

## 6. Dialogue

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/dialogue/dialogue.service.ts` | thread/message/stream 门面；当前 Map 事实需下沉 DB |
| `apps/server/src/dialogue/script-dialogue.service.ts` | 3 类 pending Map 需迁移为 PendingDialogueArtifact |
| `apps/server/src/dialogue/story-structure-dialogue.service.ts` | Story tool/pending 接线 |
| `apps/server/src/dialogue/storyboard-dialogue.service.ts` | Storyboard tool 接线 |
| `apps/server/src/dialogue/dialogue-types.ts` | 运行态/DTO 类型 |
| `apps/server/src/migration/dialogue-shadow-importer.ts` | legacy runtime 入库与 stable ID 参考 |
| `apps/server/src/maintenance/` | draining/closed、runtime bundle |

建议新增 `apps/server/src/dialogue/dialogue.repository.ts`，保留 Map 仅用于不可持久化的活动 stream handle。

## 7. Outbox/Delete

| 文件 | 责任 |
| --- | --- |
| `apps/server/prisma/schema.prisma` 的 `OutboxEvent` | 已有状态、lease、idempotency substrate |
| `apps/server/src/persistence/g1-schema-constraint-source.ts` 的 `OUTBOX_HANDLERS` | 5 类权威 payload/前后置 |
| `文档/04_方案与决策/2026-07-11_G1任务与Outbox实施注册表.md` | handler 详细契约 |
| `apps/server/src/projects/projects.service.ts` 的 `deleteProject` | 当前直接 rm + 内存删除，需改 DB intent |
| `apps/server/src/dialogue/dialogue.service.ts` 的 delete listener | 旧进程态清理；DB runtime 后只作活动 handle 清理 |
| `apps/server/src/settings/` | secret old ref clear 接 Outbox |

建议新增目录：

```text
apps/server/src/outbox/
  outbox.repository.ts
  outbox-worker.service.ts
  outbox-handler.registry.ts
  handlers/
```

## 8. Migration/Backup/Activate

| 文件 | 责任 |
| --- | --- |
| `apps/server/src/migration/full-shadow-importer.ts` | 16-slice 固定顺序与 aggregate 摘要 |
| `apps/server/src/migration/db-import.cli.ts` | 当前 final fail-closed；后续接 final runner |
| `apps/server/src/migration/migration-verify.service.ts` | shadow verifier；扩展/抽取 final verifier |
| `apps/server/src/migration/db-verify.cli.ts` | verifier CLI |
| `apps/server/src/migration/prisma-migration-ledger.repository.ts` | MigrationRun/Issue/Source ledger |
| `apps/server/src/persistence/release-schema-identity.ts` | release effective identity |
| `apps/server/src/backup/app-backup.service.ts` | coordinated/pre-cutover backup |
| `apps/server/src/backup/app-restore.service.ts` | sealed restore/materialize |
| `apps/server/src/maintenance/maintenance-coordinator.service.ts` | C1 同进程停写 |
| `apps/server/src/migration/runtime-bundle-file.service.ts` | runtime bundle strict read/verify |
| `apps/server/package.json` | 新增 `db:activate` 和必要 rehearsal script |

建议新增：

```text
apps/server/src/migration/final-importer.ts
apps/server/src/migration/final-migration-verifier.ts
apps/server/src/migration/cutover-coordinator.service.ts
apps/server/src/migration/db-activate.service.ts
apps/server/src/migration/db-activate.cli.ts
apps/server/src/migration/cutover-rehearsal.integration.spec.ts
```

文件名可按现有模块习惯微调，职责不可混成一个巨型 CLI。

## 9. Shared/Web

实施时优先通过 `rg` 定位实际引用，主要责任：

- `packages/shared/src/`：capability DTO、CAS request/response、稳定 error details、Dialogue/Layout/Export DTO。
- `apps/web/src/stores/`：DB-mode Working Copy/pending/version DTO。
- `apps/web/src/services/` 或实际 API client：新路由。
- `apps/web/src/components/workbench/`、`components/projects/`：冲突提示、replacement 和 restart 后状态。

不得在前端伪造 ready/fresh/current；后端仍是权威。

## 10. 文档

| 路径 | 用途 |
| --- | --- |
| 本目录 `execution_status.md` | 连续阶段状态、commit、证据索引 |
| 本目录 `luna_execution_brief.md` | Luna 直接执行的阶段顺序、退出条件、固定门禁和停止边界 |
| 本目录 `stage-notes/` | Luna 按需创建每阶段简短实现/复核记录 |
| `文档/04_方案与决策/` | 新 ADR 或路线更新 |
| `文档/05_执行与记录/功能完成记录/` | D2、M6 tooling 完成记录 |
| `文档/06_测试与验收/` | 最终聚合验收状态与证据 |

只提交脱敏小摘要；大型临时证据留在测试临时根并在命令记录中说明。
