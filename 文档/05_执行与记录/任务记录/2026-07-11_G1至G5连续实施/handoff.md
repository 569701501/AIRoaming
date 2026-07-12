---
doc_id: AIR-TASK-20260711-G1-G5-HANDOFF
status: active
created: 2026-07-11
updated: 2026-07-12
owner: AI漫游项目
audience: orchestrator, scrutiny-reviewer, developer, qa
source: G1 M0-A Pass 2 r7 source freeze、dry migration generator 与最终机械证据
---

# G1 M0-A Pass 2 r7 Worker Handoff

## 1. 当前结论

Pass 2 r7 已完成“受摘要约束的 Schema/migration 生成实现 + marker-owned 临时 SQLite/Prisma E0”，但尚未完成 current digest 的两名独立 Scrutiny Review，也没有生成仓库正式 migration tree。当前必须停在重新双审门禁：

| 项目 | current r7 事实 |
| --- | --- |
| review round | `g1-m0a-pass2-r7` |
| manifest digest | `sha256:c32dd95ab61a2d8a89c25dbab45d0f3efb7323d504f6031dc2e51e38b5943d06` |
| sourceDocuments | `23 = 20 TypeScript + 2 authoritative Markdown + apps/server/package.json` |
| source closure | 全部受摘要 TypeScript 的相对 static import、dynamic import 与 relative require 必须解析到同一 allowlist；漏绑本地 helper 失败 |
| 模型 / scalar / FK / relation | `44 / 556 / 105 / 210` |
| CHECK / trigger | `195 / 194`，definition 与 physical binding exactly-once |
| unique / index | `70 / 60` |
| TaskPolicy / OutboxHandler / PurgeOwnership | `10 / 5 / 44` |
| completeness | `ready=true, issueCount=0` |
| base gate | 永久 `0/2 pending false` |
| current derived gate | `0/2 pending false`，`bundleSnapshotDigest=null`，真实命令预期 exit 1 |
| Prisma Schema | 44 模型、556 scalar、210 navigation；与 current manifest 逐字一致；Prisma 6.19.3 validate Green |
| migration renderer | 纯函数返回 `migration_lock.toml + 0001～0008` 九个 signed artifacts；不读取 DB、不写仓库 |
| dry E0 | marker-owned 临时 SQLite 双 replay、真实 Prisma 6.19.3 deploy/no-pending、P3018 rollback/P3009 均 Green |
| 正式 migration tree | 不存在；r7 2/2 前 write/check 都 fail closed |
| r7 review evidence | root 不存在；Worker 未创建 raw、attestation、sealed bundle、lock 或 temp |

因此：Schema 和 migration 的可执行生成器已经实现并通过隔离验证，但 `REV-04～06`、正式 `SCH-00～15`、M0-A、M0-B 与整个 G1 都未完成。临时 E0 不能冒充 current signed migration 已正式落盘。

## 2. r6 驳回与 r7 修复范围

r6 的 `contract_consistency` Reviewer 为 accepted，`sqlite_dsl_machine` Reviewer 因两项 P1 rejected；父 Orchestrator 已密封整体 rejected snapshot。r6 只作历史，不能授权 r7：

1. `G1-SQLITE-P1-FK-NAME-NOT-EXACT`
   - r6 renderer 只要求 FK name 非空，没有逐条证明物理名公式。
   - r7 固定公式为 `fk_<local_table>_<ordered_local_columns>__<target_table>`。
   - 105 条 FK 都必须精确匹配公式且全局唯一；每条 FK 还必须被唯一 defining relation 以 target/local/ref/actions 精确消费一次。
   - wrong name、wrong local/ref/actions、duplicate 和 unconsumed FK 均有 mutation 负例。
2. `G1-SQLITE-P1-RENDERER-UNBOUND`
   - r6 的 19 个 sources 未绑定 production Schema renderer/CLI。
   - r7 将 Schema renderer/CLI、migration renderer/CLI 四个生产文件加入摘要，source 总数变为 23。
   - transitive closure checker 扫描所有受摘要 TypeScript 的相对 import/require；新增未绑定 helper 会让 manifest check 失败。

父级增量审计同时要求 r7 收口以下生成/验证边界：

- Schema writer 必须在 staging 前和 atomic replace 前各重新验证 current exact 2/2、current manifest/identity 与 expected bytes。
- migration 0008 必须在事务外执行 `PRAGMA foreign_keys=OFF` 后读回精确 0；外层事务使 PRAGMA 被忽略时，在任何持久 schema mutation 前失败。
- 43 张 rebuild 表必须在 DROP 旧表前同时通过 row count equality 与全列双向 `EXCEPT` difference-count=0；same-count 值改写不能通过。
- 0008 必须在 COMMIT 前执行可失败的 `pragma_foreign_key_check` guard；orphan 必须使整个 0008 回滚。
- fresh verifier 必须主动执行 `PRAGMA foreign_keys=ON` 并读回精确 1；外层事务导致 ON 无效时失败，不能在 FK 实际关闭的连接上给出成功。
- fresh ledger 只接受精确 0001～0008 八条成功记录；failed/缺失/额外/rolled-back/checksum drift 均失败，不在此 API 内伪装恢复策略。
- 正式 artifact tree checker 必须重新派生 current signed plan，并拒绝 missing/extra/tampered、file/directory symlink 和 hardlink；每个文件要求 regular、single-link、单 FD identity 与精确 bytes/SHA。

## 3. Current source freeze

current manifest 的输入边界固定为：

```text
20 TypeScript + 2 authoritative Markdown + apps/server/package.json = 23
```

四个相对 r6 新增的生产输入是：

```text
apps/server/src/persistence/g1-prisma-schema.ts
apps/server/src/persistence/g1-prisma-schema.cli.ts
apps/server/src/persistence/g1-migration-plan.ts
apps/server/src/persistence/g1-migration-plan.cli.ts
```

`schema.prisma`、`prisma/migrations/**`、spec、review report/attestation/bundle、SQLite 文件和运行输出仍是 derived evidence，不进入 sourceDocuments。任何 23-source bytes、allowlist、transitive closure、权威契约或 package scripts 变化都必须：

1. 重新 `g1:manifest:generate`；
2. 轮转 round/root；
3. 重新两名独立 Reviewer；
4. 由父 Orchestrator 重新 CAS sealing；
5. 最终只以 `g1:manifest:review-check` 的 current 2/2 accepted 作为写入授权。

不得在 r7 Reviewer 开始后“顺手”修改任何受摘要 source，也不得把旧 r5/r6 evidence 复制到 r7 root。

## 4. Schema renderer 与 writer

`g1-prisma-schema.ts` 的当前责任：

- 从 current manifest 确定性渲染 44 模型、556 scalar 与 210 relation navigation。
- relation list/optional/name 完全来自 manifest；不存在 renderer-only cardinality adapter。
- Prisma 6.19.3 SQLite connector 不支持 relation FK `map`，因此 SDL 不输出 `map`；但 renderer 在输出前仍逐条校验 FK 的 exact physical name/local/ref/actions 与 defining relation consumption。
- `assertG1PrismaSchemaMatchesManifestV1` 对任意给定 bytes 做精确比较。
- `g1:schema:check` 只读检查当前仓库 Schema 与 current manifest 精确一致，在 0/2 时仍可运行。
- `g1:schema:write` 必须先取得 exact current 2/2；同目录 `wx` 0600 staging、file fsync、最终 gate/identity/expected/stage identity 复核、atomic replace 与 directory sync 后才成功。
- current r7 0/2 下，API 与 CLI write 都固定失败且不得改变 Schema bytes或留下 `.g1-schema-stage-*`。

当前 `schema.prisma` 已与 renderer 输出逐字一致，`g1:schema:check` 和真实 `prisma validate` 都通过；这只是 current derived Schema 的静态证据，不替代 Reviewer 签收。

## 5. Migration pure plan、writer 与 checker

### 5.1 Pure plan

`buildG1MigrationPlanV1` 只从 qualified current manifest 返回：

- `migration_lock.toml`；
- `0001_persistence_and_migration` ～ `0008_sqlite_checks_triggers_indexes` 八个 `migration.sql`；
- 每个 artifact 的 exact path、bytes、SHA-256；
- 43 张 rebuild 表的一对一 column mapping；
- 固定 inventory 与 migration model group `4/6/10/5/9/4/6`。

0001～0007 按 manifest 的 `model.migration` 精确创建 44 张基础表与 named PK/FK/unique/index。0008：

1. 在事务外执行 FK OFF，并用 TEMP CHECK guard 读回唯一值 0；
2. `BEGIN IMMEDIATE`；
3. 只 rebuild 43 张含 CHECK 的表，`chapter_scenes` 保留；
4. 每张表在 DROP 前执行 row-count + 全列双向 EXCEPT hard guard；
5. 重建 exact indexes；
6. 安装 194 个 trigger；
7. COMMIT 前执行 executable FK check guard；
8. COMMIT 后恢复 FK ON。

### 5.2 正式 writer/checker

- `g1:migration:write` 在 staging 前要求 current Schema exact、current identity 与 exact 2/2；写入同父目录 staging，逐文件 fsync，最终重验 gate/identity/schema，再对 staging 执行 exact tree check，之后 atomic rename + directory sync + post-rename tree check。
- `g1:migration:check` 从 current accepted gate、current manifest 和 exact Schema 重新派生 plan，前后两次读取正式 tree；九个路径/目录 entry/bytes/SHA 与 regular single-link identity必须完全一致。
- current 0/2 时 write/check 都在创建正式目录前失败。仓库当前没有 `apps/server/prisma/migrations`，也没有 schema/migration stage residue。

## 6. 隔离 E0 与负例证据

所有数据库回放只发生在带匹配 marker 的临时根；没有读取或写入真实 workspace、settings、SecretStore、dataRoot 或数据库。

| 证据 | 结果 |
| --- | --- |
| pure plan inventory | 9 artifacts；8 migrations；44/556/105/70/60/195/194；43 rebuild |
| artifact tree | exact tree Green；tampered/missing/extra/file symlink/directory symlink/hardlink 全部失败 |
| direct SQLite replay | 两个 fresh DB 完整 0001～0008，exact inventories 相同；0008 前插入行逐列保持 |
| FK OFF outer transaction | PRAGMA OFF 被忽略时 pre-mode guard 在持久 schema mutation 前失败 |
| same-count rewrite | row count 不变但值变化时 bidirectional EXCEPT guard 失败并回滚 |
| orphan | COMMIT 前 FK guard 失败，0008 schema/trigger 变更回滚 |
| verifier FK enable | 新连接从 FK OFF 出发可主动启用到 1；外层事务使 ON 无效时 verifier 失败 |
| real Prisma E0 | pinned Prisma 6.19.3 首次 `migrate deploy` 成功应用 8 个 migration；第二次报告 no pending |
| real failure ledger | 0001～0007 后注入 orphan，0008 得到 P3018 且回滚；下一次 deploy 得到 P3009 |
| production write/check at 0/2 | Schema write、migration write、migration check 均 exit 1；无正式目录或 stage residue |

这些是生成器与迁移 SQL 的 dry implementation evidence。由于 current r7 尚未 2/2 且正式 tree 不存在，QA 中 `SCH-00～15` 仍保持 `not_run`，不能将上表直接改写为正式 pass。

## 7. 最终机械验证

| 命令 / 检查 | 结果 |
| --- | --- |
| `corepack pnpm --filter @airoaming/server test` | `26 files / 253 tests` 全绿 |
| `g1-migration-plan.spec.ts` | `12/12`，含 hardlink、真实 Prisma E0、P3018/P3009 |
| `corepack pnpm --filter @airoaming/server typecheck` | exit 0 |
| `corepack pnpm --filter @airoaming/server g1:manifest:check` | current digest 精确为 `sha256:c32dd95ab61a2d8a89c25dbab45d0f3efb7323d504f6031dc2e51e38b5943d06` |
| `corepack pnpm --filter @airoaming/server g1:schema:check` | current manifest 与 Schema 逐字一致 |
| Prisma 6.19.3 `validate` | exit 0 |
| real r7 `g1:manifest:review-check` | `received=0, accepted=0, status=pending, allowed=false, bundleSnapshotDigest=null`；预期 exit 1 |
| `g1:schema:write` | 预期 exit 1：`G1_PRISMA_SCHEMA_REVIEW_GATE_NOT_ACCEPTED` |
| `g1:migration:write/check` | 预期 exit 1：`G1_MIGRATION_REVIEW_GATE_NOT_ACCEPTED` |
| r1～r6 frozen evidence | 28 个文件 SHA 全部逐项复算一致；r3～r6 internal bundle digest 一致 |
| absence | migration tree、r7 review root、schema/migration stage residue均不存在 |
| `git diff --check` | exit 0 |

## 8. 历史证据冻结

r1～r6 共 28 份历史文件的逐文件 SHA 权威表位于 Schema 实施契约 §13.2；本轮复算无漂移。轮次摘要：

| round | 历史结论 | frozen evidence |
| --- | --- | --- |
| r1 | rejected | 4 raw files |
| r2 | rejected | 4 raw files |
| r3 | rejected | 4 raw + sealed；internal final=`sha256:45414800250472f44b4389f4aee6d11c564970f3ece7c175f71441fa360b7b40` |
| r4 | rejected | 4 raw + sealed；internal final=`sha256:af02b5ab0d6a476fd1be61fd4b71ccd40811c97bfae0b17a3035f17b393c2a27` |
| r5 | accepted（旧摘要） | sealed file SHA=`e5cc71f73a1ad418e9f8730cee9aa4a4e2108024931d2b05604de6a8aaef2953`；internal final=`sha256:970c80b9511730aee257fb0eb9f18084947f991fee154cf19eb8b4720e5bb0e6` |
| r6 | overall rejected（Reviewer A accepted / B rejected） | sealed file SHA=`298378e9f9fe891d86627c6e0df6e4b36fcb71de62a95e3a46ea604f12b42333`；internal previous/final=`sha256:3da52be62e7a0458afe2646fee43614f56c1141403970f8769d464f620d8050c` / `sha256:1ec86bc4a83a54c4f91c408d190c82c513cb29ba157b8c7282585890b0bfc534` |

任何旧轮次 accepted、publish/recovery outcome 或 sealed bytes 都不参与 current r7 计数。

## 9. Reviewer A 必审

1. current 23-source allowlist、每个 digest 与 transitive local-import closure 是否完整；Schema/migration renderer/CLI 是否全部受摘要绑定。
2. 105 个 FK name 是否逐项精确满足公式并全局唯一；每个 FK 是否恰由一个 exact defining relation 消费。
3. manifest qualification 是否严格要求 `ready_for_scrutiny`、G1 base、无 overlay、completeness 0、44/556/105/210 与 `4/6/10/5/9/4/6`。
4. Schema/migration writer 是否在 staging 前与 commit 前重验同一 current 2/2、manifest identity、Schema 和 expected bytes；不存在 skip/force 参数。
5. r1～r6 的 28 个文件 SHA、r3～r6 internal digest 是否不变；r7 root 是否确实 absent。

## 10. Reviewer B 必审

1. 0001～0007 是否按 exact model groups 建表；0008 是否只 rebuild 43 张 CHECK 表并完整保留一对一 columns。
2. FK OFF readback guard 是否在 BEGIN/持久 mutation 前；row count + bidirectional all-column EXCEPT 是否在 DROP 前；FK guard 是否在 COMMIT 前。
3. fresh verifier 是否主动启用 FK 并读回 1，且精确验证 44 tables、556 scalars、44 PK、105 FK、70 unique、60 index、195 CHECK、194 trigger、integrity/FK/ledger/digest。
4. artifact tree 是否拒绝 extra/missing/tamper、file/directory symlink 与 hardlink，并在 write 的 pre/post rename 与 check 的双读中执行。
5. 真实 Prisma 6.19.3 E0 与 P3018/P3009 是否发生在 marker-owned 临时根；生产 DB/workspace/settings/SecretStore/dataRoot 是否完全未触碰。

## 11. 父编排与放行顺序

Reviewer 只写各自 raw report/attestation。父 Orchestrator 按 current r7 digest逐代 CAS sealing：

```bash
corepack pnpm --filter @airoaming/server g1:manifest:review-publish -- \
  --role contract_consistency \
  --expected-previous none

corepack pnpm --filter @airoaming/server g1:manifest:review-publish -- \
  --role sqlite_dsl_machine \
  --expected-previous sha256:<first-bundleSnapshotDigest>

corepack pnpm --filter @airoaming/server g1:manifest:review-check
```

只有最后一条输出 exact current digest、2/2 accepted、blocking=0、`migrationGenerationAllowed=true` 且 exit 0 后，才允许：

```bash
corepack pnpm --filter @airoaming/server g1:schema:write
corepack pnpm --filter @airoaming/server g1:schema:check
corepack pnpm --filter @airoaming/server g1:migration:write
corepack pnpm --filter @airoaming/server g1:migration:check
```

随后仍要在新的 marker-owned 临时根执行正式 tree 的 Prisma deploy、第二次 no-pending、独立新连接 verifier、checksum/ledger/negative fixtures，并由父审/Runtime Review 判定正式 `SCH-00～15`。通过前不得进入 M0-B。

## 12. 保留风险与边界

- r7 尚无任何 Reviewer evidence，current gate 为 0/2；这是当前唯一立即放行阻塞。
- dry generator/E0 已完成，但正式 migration tree 未 materialize，正式 SCH gate 仍未跑。
- M0-B 的 Prisma Client、UoW/JCS/backup/restore 及后续 Repository/DB-only runtime 尚未实现。
- 未运行真实数据库、真实 workspace、settings、SecretStore、维护停写、snapshot/import 或 DB-only 激活。
- M4 正式切换仍必须在动作发生前取得用户明确授权；本 Handoff 不提供该授权。
