---
doc_id: AIR-G05-REMAIN-FILEMAP-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: luna, developer, reviewer
source: 2026-07-14 当前代码树与正式开发方案
---

# G0～G5 剩余连续施工文件与函数地图

## 1. 使用规则

- 本地图是起点，不是允许盲改的白名单。每阶段仍须重新搜索调用点、测试和注入关系。
- 标为“建议新增”的路径可以按当前模块结构调整，但职责边界不可丢失。
- 不得因一个文件出现在地图中就整文件重写；保留工作树现有用户改动。
- 新文件优先放入明确 domain 目录，避免继续扩大 `projects.service.ts`、`projects.controller.ts`、`workbench-store.ts`。

## 2. S0 当前未提交 R0-A 面

### SecretStore/settings

```text
apps/server/src/settings/secret-store.ts
apps/server/src/settings/macos-keychain-secret-store.spec.ts
apps/server/src/settings/settings.service.ts
apps/server/src/settings/cutover-settings.service.ts
apps/server/src/settings/cutover-settings.service.spec.ts
```

核对：生产 Keychain adapter、fake executor、两阶段 prestage/verify/redact、原子写、递归 redactor、SEC-10。

### Cutover/backup/maintenance

```text
apps/server/src/migration/cutover-plan.types.ts
apps/server/src/migration/cutover-plan.service.ts
apps/server/src/migration/cutover-plan.service.spec.ts
apps/server/src/migration/cutover-evidence.service.ts
apps/server/src/migration/cutover-evidence.service.spec.ts
apps/server/src/migration/cutover-shadow-gate.ts
apps/server/src/migration/cutover-shadow-gate.spec.ts
apps/server/src/migration/cutover-credential-verifier.ts
apps/server/src/migration/cutover-credential-verifier.spec.ts
apps/server/src/migration/cutover-runner.service.ts
apps/server/src/migration/cutover-runner.service.spec.ts
apps/server/src/migration/db-cutover.service.ts
apps/server/src/migration/db-cutover.service.spec.ts
apps/server/src/migration/db-cutover.cli.ts
apps/server/src/migration/cutover-cli-guards.spec.ts
apps/server/src/migration/db-activate.service.ts
apps/server/src/migration/db-activate.cli.ts
apps/server/src/migration/final-importer.ts
apps/server/src/migration/ready-coordinator.ts
apps/server/src/migration/runtime-bundle-file.service.ts
apps/server/src/migration/snapshot.service.spec.ts
apps/server/src/backup/app-backup.service.ts
apps/server/src/backup/backup.types.ts
apps/server/src/maintenance/maintenance-coordinator.service.ts
apps/server/package.json
```

相关 R0-A 文档位于：

```text
文档/05_执行与记录/任务记录/2026-07-13_R0-R2真实切换施工包/
文档/05_执行与记录/任务记录/2026-07-13_M6-A1真实切换验收补强/
```

### 默认测试入口

```text
package.json
apps/server/package.json
apps/server/vitest.config.ts
<实际超时 spec 与 fixture；先重现后确定>
```

不要预设一定修改全局 timeout；先用耗时/资源证据选择最窄改动。

## 3. W1 Web/API 面

### Shared contract

```text
packages/shared/src/dto.ts
packages/shared/src/versioning/api-contract.ts
packages/shared/src/versioning/document-contract.ts
packages/shared/src/versioning/production-state.ts
packages/shared/src/versioning/index.ts
packages/shared/src/index.ts
```

优先复用现有 Story/Storyboard/Preflight request/response；若前端缺少导出，补 index，不复制结构到 Web。

### Web API 与 Store

```text
apps/web/src/services/api.ts
apps/web/src/stores/workbench-store.ts
```

建议 seam：

```text
apps/web/src/services/versioning-adapter.ts             （建议新增）
apps/web/src/services/versioning-file-adapter.ts        （需要时新增）
apps/web/src/services/versioning-database-adapter.ts    （需要时新增）
apps/web/src/stores/versioning/*                        （若 store 继续膨胀则拆分）
```

职责：

- `api.ts` 只负责 HTTP/DTO。
- adapter 只负责按 capability 选择一套协议。
- store 负责页面状态、草稿保留和动作编排。
- 组件不直接拼 API、不直接推导 DB freshness。

### 三个页面

```text
apps/web/src/components/workbench/StoryStructureWorkspace.vue
apps/web/src/components/workbench/StoryboardWorkspace.vue
apps/web/src/components/workbench/ImagePreflightWorkspace.vue
apps/web/src/views/ProjectWorkbenchView.vue              （仅状态/路由需要时）
```

检查所有旧动作：confirm/update/pending/resolve/refresh/history。页面必须保留 file-mode 和 DB-mode 的用户语义，但不能双写。

## 4. W1 Server 面

### Controller 与 legacy facade

```text
apps/server/src/projects/projects.controller.ts
apps/server/src/projects/projects.service.ts
apps/server/src/projects/projects.module.ts
```

当前已确认：`projects.controller.ts` 有两个相同的
`POST :projectId/chapters/:chapterId/image-preflight/confirm`。

推荐把模式选择放到窄 facade，而不是 Controller：

```text
apps/server/src/projects/versioning/preflight-command-facade.service.ts  （建议新增）
```

facade 输入应先根据已知 persistence mode 选择严格 parser/command；禁止“尝试 DB，失败再 file”。若现有 `ProjectsService` 已有可靠模式 seam，可复用而不新建类。

### G2 正式 services/repositories

```text
apps/server/src/projects/versioning/story-version.service.ts
apps/server/src/projects/versioning/story-version.repository.ts
apps/server/src/projects/versioning/storyboard-version.service.ts
apps/server/src/projects/versioning/storyboard-version.repository.ts
apps/server/src/projects/versioning/preflight-revision.service.ts
apps/server/src/projects/versioning/preflight-revision.repository.ts
apps/server/src/projects/versioning/chapter-production-query.service.ts
apps/server/src/projects/versioning/new-work-gate.service.ts
apps/server/src/projects/versioning/task-applicability-guard.service.ts
apps/server/src/projects/versioning/g2-database-error.mapper.ts
apps/server/src/projects/versioning/versioning-database.types.ts
```

W1 原则上只接入已有语义，不顺手重写 G2 repository。缺测试时在同目录补 integration/contract test。

## 5. W1 E2E 面

```text
playwright.config.ts
tests/e2e/setup/global.setup.ts
tests/e2e/setup/global.teardown.ts
tests/e2e/support/e2e-env.ts
tests/e2e/support/e2e-fixture.ts
tests/e2e/support/start-e2e-server.mjs
tests/e2e/support/fake-provider-server.mjs
tests/e2e/api/workflow-api.smoke.spec.ts
tests/e2e/web/project-library-and-stage-rail.spec.ts
```

按 G2 施工包建议新增：

```text
tests/e2e/api/g2-version-chain.api.spec.ts
tests/e2e/web/g2-working-copy-and-freshness.spec.ts
tests/e2e/web/g2-concurrency-and-history.spec.ts
```

需要的 fixture seam：

```text
persistenceMode: file | db
databaseUrl: fresh temp SQLite
workspaceRoot/dataRoot: marker temp root
restartServer(): same DB/root
readServerCapability(): must be g2_db in DB project
```

## 6. R0B/R1/R2 面

真实命令实现已集中在：

```text
apps/server/src/migration/db-cutover.cli.ts
apps/server/src/migration/db-cutover.service.ts
apps/server/src/migration/cutover-runner.service.ts
apps/server/src/migration/cutover-plan.service.ts
apps/server/src/migration/cutover-evidence.service.ts
apps/server/src/migration/cutover-shadow-gate.ts
apps/server/src/migration/full-shadow-importer.ts
apps/server/src/migration/final-importer.ts
apps/server/src/migration/db-ready.cli.ts
apps/server/src/migration/db-activate.cli.ts
apps/server/src/backup/*
apps/server/src/maintenance/*
```

R0B/R1/R2 默认不新增业务功能。若真实演练暴露缺陷，先在临时根新增回归测试，再以独立 fix 提交，不直接在真实 run 中临时改代码继续。

## 7. G4 推荐模块图

### Shared

```text
packages/shared/src/candidate-lock/contracts.ts          （建议新增）
packages/shared/src/candidate-lock/state-machine.ts      （建议新增）
packages/shared/src/candidate-lock/impact.ts             （建议新增）
packages/shared/src/candidate-lock/freshness.ts          （建议新增）
packages/shared/src/candidate-lock/index.ts              （建议新增）
```

若项目约定所有 DTO 仍集中在 `dto.ts`，可只把 DTO export 留在 dto，纯规则放 domain 目录；不要形成两份类型。

### Schema/migration

```text
apps/server/prisma/schema.prisma
apps/server/prisma/migrations/0011_candidate_lock_revision_overlay/migration.sql （建议名）
apps/server/src/persistence/g1-schema-*                  （只有生成体系要求时同步）
```

注意：G1 已有 CandidateLockRevision、Shot current pointer 和基础 immutable trigger。G4 overlay 不能重复加列或复制已有约束。

### Server application/domain

```text
apps/server/src/projects/candidate-lock/candidate-lock-resolver.ts       （建议新增）
apps/server/src/projects/candidate-lock/candidate-impact-resolver.ts     （建议新增）
apps/server/src/projects/candidate-lock/candidate-lock.repository.ts     （建议新增）
apps/server/src/projects/candidate-lock/candidate-lock.service.ts        （建议新增）
apps/server/src/projects/candidate-lock/candidate-lock.controller.ts     （或现 Controller 窄路由）
apps/server/src/projects/image-candidate.service.ts
apps/server/src/projects/layout-export.service.ts
apps/server/src/projects/project-repository.service.ts
apps/server/src/projects/persistent-task-worker.service.ts
apps/server/src/migration/candidate-lock-shadow-importer.ts
apps/server/src/migration/project-chapter-shadow-importer.integration.spec.ts
```

优先把新状态机/事务从 `image-candidate.service.ts` 抽到深模块；旧 `lockChapterCandidate` 只能在同切片退役，不能继续成为旁路。

### Web

先搜索当前候选 workspace 实际文件名，再按现有 feature 结构落位。推荐：

```text
apps/web/src/features/candidate-lock/*
apps/web/src/components/workbench/<CandidateWorkspace>.vue
apps/web/src/components/workbench/LayoutExportWorkspace.vue
apps/web/src/services/api.ts
apps/web/src/stores/workbench-store.ts
```

候选卡和大图必须共用一个 action permission/state resolver，避免两套状态机。

## 8. G5 推荐模块图

### Shared Layout Domain Kernel

```text
packages/shared/src/layout/document.ts
packages/shared/src/layout/codec.ts
packages/shared/src/layout/normalize.ts
packages/shared/src/layout/digest.ts
packages/shared/src/layout/commands.ts
packages/shared/src/layout/reducer.ts
packages/shared/src/layout/geometry.ts
packages/shared/src/layout/text.ts
packages/shared/src/layout/preflight.ts
packages/shared/src/layout/publication.ts
packages/shared/src/layout/index.ts
```

### Schema/migration

```text
apps/server/prisma/schema.prisma
apps/server/prisma/migrations/0012_layout_document_v1_overlay/migration.sql （建议名）
apps/server/src/migration/layout-shadow-importer.ts
apps/server/src/migration/export-shadow-importer.ts
```

迁移序号必须以执行时真实 migration tree 为准，不能覆盖已有目录。

### Server Layout application

```text
apps/server/src/projects/layout/layout-working-copy.repository.ts
apps/server/src/projects/layout/layout-working-copy.service.ts
apps/server/src/projects/layout/layout-revision.repository.ts
apps/server/src/projects/layout/layout-revision.service.ts
apps/server/src/projects/layout/layout-source-replacement.service.ts
apps/server/src/projects/layout/layout-preflight.service.ts
apps/server/src/projects/layout/layout-publication.service.ts
apps/server/src/projects/layout/layout.controller.ts
```

### Renderer/Task

```text
apps/server/src/rendering/layout/render-plan.ts
apps/server/src/rendering/layout/render-scene.ts
apps/server/src/rendering/layout/asset-resolver.ts
apps/server/src/rendering/layout/renderer-adapter.ts
apps/server/src/rendering/layout/output-verifier.ts
apps/server/src/tasks/handlers/layout-publication.handler.ts
apps/server/src/projects/layout-export.service.ts             （逐步拆分旧逻辑）
```

### Web editor

```text
apps/web/src/features/layout-editor/domain-adapter.ts
apps/web/src/features/layout-editor/editor-store.ts
apps/web/src/features/layout-editor/canvas-adapter.ts
apps/web/src/features/layout-editor/components/*
apps/web/src/features/layout-editor/text/*
apps/web/src/features/layout-editor/source-repair/*
apps/web/src/components/workbench/LayoutExportWorkspace.vue
apps/web/src/router.ts
```

### G5 tests/fixtures

```text
packages/shared/src/layout/*.spec.ts
apps/server/src/projects/layout/*.spec.ts
apps/server/src/rendering/layout/*.spec.ts
tests/fixtures/layout/*
tests/e2e/web/g5-page-editor.spec.ts
tests/e2e/web/g5-strip-editor.spec.ts
tests/e2e/web/g5-repair-and-recovery.spec.ts
tests/e2e/web/g5-mobile-and-ai.spec.ts
```

E0 原型必须放在可整体删除的专用目录，正式 M2 开始前只迁移经 ADR 选定的 adapter seam，不复制实验垃圾。

## 9. 每阶段改动后必须搜索的退役路径

```text
story-structure/confirm
storyboard/confirm
storyboard/pending
lockedCandidateId
status === "locked"
status === "selected"
candidates/:candidateId/lock
legacy layout.json write
copy source image / export by copying original
```

搜索命中不一定全部删除：migration reader、历史 fixture、明确 file-mode adapter 可以存在；每个 runtime 写命中必须有归属解释。
