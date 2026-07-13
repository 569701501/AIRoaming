---
doc_id: AIR-G3-M5-A4-2-HANDOFF-001
status: ready_for_development
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A4-1 完成记录、A4 实施契约、当前 restore 生产代码
---

# Handoff：交给 5.6 Luna 的 M5-A4-2

## 1. 领取范围

只领取 `M5-A4-2 restore release identity + 精确账本验证`。

A4-1 已由提交 `9d2fb2b` 完成并复核。本轮不修改 backup consistency fence，不实现 secret scan、路径补偿、final importer、pre-cutover、activate、D2 或 M6。完成 A4-2 后停止，等待 Codex 复核和 A4-3 任务书。

## 2. 必读顺序

1. 本文件。
2. `a4_2_implementation_contract.md`。
3. `a4_2_file_map.md`。
4. `a4_2_test_matrix.md`。
5. `a4_2_review_checklist.md`。
6. 本目录 `implementation_contract.md` 第 2、5、6、7 节。
7. `apps/server/src/backup/app-restore.service.ts`。
8. `apps/server/src/backup/app-restore.cli.ts`。
9. `apps/server/src/backup/app-backup-restore.integration.spec.ts`。
10. `apps/server/src/persistence/release-schema-identity.ts` 和 `apps/server/src/migration/full-shadow-importer.ts`。

## 3. 当前缺口

- restore CLI 没有 `--release-root`，无法证明 bundle 与当前发布包兼容。
- `verifyRunSummary()` 只检查长度、摘要和 runId 唯一，不检查固定 slice 顺序、slice 精确字段或 manifest.runIds 对齐。
- `verifyDatabase()` 只检查 integrity/FK 和两张表存在，不读取 16 条 MigrationRun、MigrationIssue 或 PersistenceState。
- 当前篡改测试只改 manifest，无法证明“外层摘要被重新计算后，内部账本语义不一致”仍会失败。

## 4. 必须实现

1. `RestoreInput` 和 CLI 增加必填绝对路径 `releaseRoot/--release-root`；缺失、重复、未知、额外 positional 仍在任何 DB/目标写入前失败。
2. 使用 `loadReleaseSchemaIdentityV1(releaseRoot)` 读取当前发布身份；manifest 的 `effectiveSchemaManifestDigest` 必须精确相等，否则返回 `RESTORE_RELEASE_IDENTITY_MISMATCH`。
3. run-summary 每个 slice 必须 exact keys，顺序与 `FULL_SHADOW_SLICE_ORDER`、manifest.runIds 完全一致。
4. 从 bundle DB 逐项读取 16 条 MigrationRun，核对 kind/status/importerVersion/source/snapshot/decisions/report/counts/verification。
5. 每个 run 的 open MigrationIssue 必须为 0。
6. DB `PersistenceState(id=primary)` 必须与 manifest 三字段精确相等，并保持 `shadow/null/null`。
7. `verify-only` 和所有失败路径保持零 target/staging 写入；materialize 只能在上述验证全部通过后开始。
8. 增加 raw-byte tamper 和“重算外层摘要后的语义 tamper”两类直接测试。

## 5. 允许修改

```text
apps/server/src/backup/app-restore.service.ts
apps/server/src/backup/app-restore.cli.ts
apps/server/src/backup/backup.types.ts                 # 仅确有共享类型需要时
apps/server/src/backup/app-backup-restore.integration.spec.ts
apps/server/src/backup/*restore*.spec.ts               # 可按职责拆分
文档/05_执行与记录/任务记录/2026-07-13_G3-M5A4验收收口/
```

允许只读复用：

```text
apps/server/src/persistence/release-schema-identity.ts
apps/server/src/migration/full-shadow-importer.ts
```

## 6. 禁止修改

```text
apps/server/prisma/schema.prisma
apps/server/prisma/migrations/**
apps/server/src/backup/app-backup.service.ts
apps/server/src/migration/*importer*
apps/server/src/settings/**
apps/server/src/projects/**
apps/server/src/dialogue/**
```

禁止新增生产环境测试开关、默认 release root、cwd 猜测、真实 SecretStore 访问或新的 reviewer/attestation 流水线。

## 7. 验证与提交

```text
corepack pnpm --filter @airoaming/server test -- --run src/backup/app-backup-restore.integration.spec.ts --pool=forks --poolOptions.forks.singleFork=true
corepack pnpm --filter @airoaming/server typecheck
corepack pnpm -w typecheck
corepack pnpm --filter @airoaming/server test -- --pool=forks --poolOptions.forks.singleFork=true --reporter=dot
corepack pnpm --filter @airoaming/server g1:manifest:check
corepack pnpm --filter @airoaming/server g1:schema:check
corepack pnpm --filter @airoaming/server g1:migration:check
corepack pnpm --filter @airoaming/server prisma:validate
git diff --check
```

- 单独 commit，建议：`fix(migration): bind restore to release and migration ledger`
- 在 `progress.md` 记录修改文件、命令和通过数。
- 只允许把 A4-RST-01、A4-RST-02 改为 `passed`；其余 A4 项保持原状态。

## 8. Stop

遇到以下任一情况立即停止并报告：

- 必须修改 Schema/migration/trigger 才能验证 bundle DB。
- 需要放宽 fixed slice order、run identity 或 current release identity 才能通过。
- 测试只能证明外层 digest 失败，无法证明 reseal 后的账本语义篡改失败。
- 需要访问真实 workspace、真实 DB 或真实 SecretStore。
- 工作范围开始涉及 A4-3、D2 或 M6。
