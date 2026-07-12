---
doc_id: AIR-REVIEW-20260712-G1-M0A-PASS2-R6-SQLITE-B
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: orchestrator, scrutiny-reviewer, developer
source: G1 M0-A Pass 2 r6 Prisma Schema、SQLite DSL、renderer 与 review gate 独立复核
---

# G1 M0-A Pass 2 r6 SQLite DSL 与 Prisma Schema 独立复核

## 1. 复核结论

| 项目 | 结论 |
| --- | --- |
| reviewRoundId | `g1-m0a-pass2-r6` |
| reviewerRole | `sqlite_dsl_machine` |
| manifestDigest | `sha256:356d2150ec848a1e4c583d170fee0b80b136bfe3c0990faefd49fe72aeadcfb6` |
| verdict | `rejected` |
| findings | `P0=0, P1=2` |
| independentFromWorker | `true` |
| migration generation | 禁止；base gate 仍为 `0/2 pending false` |

Prisma 6.19.3 的真实限制、`Candidate.asset` 的 r6 基数修订、当前 manifest/schema 与 SQLite 约束组合本身均验证通过。但本轮存在两个阻断 P1：renderer 没有 exact 校验 manifest FK 的物理 name；同时 renderer 与实际写 schema 的 CLI 没有被本轮固定 manifest digest 绑定。两者都破坏了本轮要求的“受摘要保护、逐 FK fail closed 的物理命名边界”，故结论为 `rejected`。

## 2. 已验证通过的 Prisma 与 Candidate/Asset 事实

### 2.1 Prisma 6.19.3 真实限制

使用当前完整 44-model schema 做三个真实 `prisma validate` 探针：

| 探针 | 结果 |
| --- | --- |
| current `schema.prisma` | exit 0，schema valid |
| 给任一本地 relation 添加 `map: "fk_probe"` | P1012：SQLite provider 不支持 named foreign keys |
| 把 `Asset.candidatesByAsset Candidate[]` 改回 singular `Candidate?` | P1012：1:1 defining side 必须对完整 `[assetId, projectId, chapterId]` 具有 exact unique |

singular 探针明确建议新增 `@@unique([assetId, projectId, chapterId])` 或改为 one-to-many，证明单列 `assetId` unique 虽是严格子集，不能在 Prisma SDL 中冒充完整三列 relation 的 1:1 defining unique。

### 2.2 当前 Candidate/Asset 组合正确

独立扫描 105 个本地 relation 得到：

```json
{
  "strictSubsetOnly": ["Candidate.asset"],
  "fkNameMismatches": [],
  "exactRelationMismatches": [],
  "relationMapCount": 0
}
```

当前 `Candidate.asset` 与反向 navigation 的事实为：

- 本地 relation：`fields=[assetId,projectId,chapterId]`，`references=[id,projectId,chapterId]`，`onDelete=Restrict`，`onUpdate=NoAction`。
- 物理 FK 名：`fk_candidates_asset_id_project_id_chapter_id__assets`。
- 物理 unique 仍只有既有单列 `uq_candidates_asset(asset_id)`；没有为迎合 Prisma 新增三列 composite unique。
- Prisma 反向 navigation 为 `Asset.candidatesByAsset Candidate[]`。SDL 的数组类型是 connector 可表达的保守上界；数据库单列 unique 继续把实际基数限制为 0..1。

独立内存 SQLite 探针按上述 FK/unique 创建真实表后得到：

```json
{
  "crossScope": "FOREIGN KEY constraint failed",
  "secondCandidate": "UNIQUE constraint failed: candidates.asset_id",
  "candidateCountForAsset": 1,
  "namedFkPresentInTableSql": true,
  "uniqueIndexName": "uq_candidates_asset"
}
```

该结果证明复合 FK 保留 Project/Chapter scope，单列 unique 保留 0..1，且 SQLite 物理 SQL 可以保存命名 FK 与命名 unique index；Prisma SDL 不支持 relation `map` 不等于物理约束可以丢名。

## 3. Findings

### P1 — `G1_SQLITE_R6_RENDERER_FK_NAME_NOT_EXACT`

**状态：** `open`

**问题：** `matchingForeignKey()` 会 exact 比对 target table、local columns、target columns、`onDelete` 和 `onUpdate`，但对物理 FK name 只检查 `name.length > 0`。这与实施契约要求的逐 FK `name/local/ref/actions` exact 校验不一致。

独立 mutation probe 只修改 current manifest 中 `Candidate.asset` FK 的 name，不改任何列或 action：

```json
{
  "name": "accepted",
  "local": "G1_PRISMA_RELATION_FK_NOT_EXACT:Candidate:asset:0",
  "references": "G1_PRISMA_RELATION_FK_NOT_EXACT:Candidate:asset:0",
  "onDelete": "G1_PRISMA_RELATION_FK_NOT_EXACT:Candidate:asset:0",
  "onUpdate": "G1_PRISMA_RELATION_FK_NOT_EXACT:Candidate:asset:0"
}
```

把 name 改成 `fk_wrong_but_nonempty` 后，`buildG1PrismaSchema()` 不仅没有拒绝，还产出与 current schema 字节完全相同的 SDL。由于 SQLite connector 要求 SDL 省略 relation `map`，错误物理名不会出现在 schema diff 中；若 renderer 不在省略前验证 exact name，未来 migration 的命名责任便没有被该边界机械保护。

**修复要求：**

1. 对每个本地 relation 计算并校验 exact physical name：`fk_<local_table>_<ordered_local_columns>__<target_table>`；不得只检查非空。
2. 跟踪 105 个 manifest FK 的消费关系，要求每个本地 relation 匹配 exactly one FK，且每个 FK 被 exactly one relation 消费，不能复用一个 FK 后遗留另一个未验证项。
3. 新增 mutation tests：错误 name、空 name、重复消费与未消费 FK 必须 Red；local/ref/actions 的既有 fail-closed 行为继续保留。
4. 修复后重新生成 manifest digest、轮转 review round，并重新双审。

**证据文件：**

- `apps/server/src/persistence/g1-prisma-schema.ts`
- `apps/server/src/persistence/g1-prisma-schema.spec.ts`
- `文档/04_方案与决策/2026-07-11_G1数据库Schema实施契约.md`

### P1 — `G1_SQLITE_R6_RENDERER_SOURCE_UNBOUND`

**状态：** `open`

**问题：** 本轮被要求复核且实际负责从 manifest 写出 schema 的两个 production source 不在固定 digest 的 `sourceDocuments` 中：

```json
{
  "sourceCount": 19,
  "rendererBound": false,
  "rendererCliBound": false,
  "schemaExcluded": true
}
```

缺失文件是：

- `apps/server/src/persistence/g1-prisma-schema.ts`
- `apps/server/src/persistence/g1-prisma-schema.cli.ts`

`schema.prisma` 作为 manifest 的 derived output 保持排除是正确的；但生产 renderer/CLI 不是 derived bytes，而是决定这些 bytes 如何生成的可执行 source。它们未进入 `G1_SCHEMA_MANIFEST_SUPPORTING_PATHS`，所以 review 完成后修改 renderer 或 CLI 不会改变固定 digest `sha256:356d...cfb6`，`g1:manifest:check` 也无法因该变化失败。本 attestation 因而不能稳定绑定自己实际审查的 renderer 边界。

复核时文件摘要为：

```text
g1-prisma-schema.ts      sha256:1384ecc0f358d2525c94a301912ac18b28d5a7845d7728cc7a89192082109fab
g1-prisma-schema.cli.ts  sha256:49902e3fdc31548f5f5e8d9b4a0a7e8f80012bba585e306dcc0c40ec7cdf7cbb
schema.prisma            sha256:f80e464cf14b483e933a976aa2f34737696a7a9b932fd1dbdaff599ce58d49fb
```

报告记录这些摘要只能提供人工证据，不能替代 review gate 的机器绑定。

**修复要求：**

1. 将 production renderer 与 schema-writer CLI 加入明确 source allowlist/manifest digest；测试与 derived `schema.prisma` 可继续排除。
2. 同步权威 source count/组成，重新 generate/check manifest，并轮转 review round。
3. 增加 source-boundary test，要求 renderer 与 writer CLI 的 path/digest 均存在，任一字节变化必须导致 manifest drift。

**证据文件：**

- `apps/server/src/persistence/g1-schema-manifest-source.ts`
- `apps/server/prisma/contracts/g1-schema-manifest.json`
- `apps/server/src/persistence/g1-prisma-schema.ts`
- `apps/server/src/persistence/g1-prisma-schema.cli.ts`

## 4. 未回退的 Schema、SQLite 与 review bundle 证据

| 项目 | 实测结果 |
| --- | --- |
| manifest check | digest 精确为 `sha256:356d2150ec848a1e4c583d170fee0b80b136bfe3c0990faefd49fe72aeadcfb6` |
| schema counts | `44 models / 556 scalar / 210 relation navigation / 105 FK` |
| physical catalogs | `195 CHECK / 194 trigger / 70 unique / 60 index` |
| registries | `10 TaskPolicy / 5 OutboxHandler / 44 PurgeOwnership` |
| completeness | `ready=true / issueCount=0` |
| deterministic schema | current `schema.prisma === buildG1PrismaSchema(manifest)` |
| Prisma validate | 6.19.3 exit 0 |
| automated tests | 10 files / 155 tests 全绿 |
| real SQLite DSL | 36/36；实际解析 44 loose authority tables + 194 triggers |
| review bundle | 47/47；publisher/recovery、CAS、marker、fault outcome 与 durable boundary 未回退 |
| typecheck | exit 0 |
| migrations | `apps/server/prisma/migrations` 不存在 |
| base gate | `required=2 / accepted=0 / pending / migrationGenerationAllowed=false` |

这些通过项证明 r6 relation 修订方向正确，也证明两个 P1 是 renderer/review binding 边界缺口，而不是 Candidate/Asset 数据语义本身失败。

## 5. 验证命令与结果

```bash
corepack pnpm --filter @airoaming/server g1:manifest:check
```

结果：exit 0，digest 为本轮固定值。

```bash
DATABASE_URL=file:./dev.db \
  corepack pnpm --filter @airoaming/server exec prisma validate \
  --schema prisma/schema.prisma
```

结果：exit 0，Prisma CLI 6.19.3 报告 schema valid。

另以系统临时目录中的 current-schema 两个单点变体执行同一 validate：relation `map` 变体与反向 singular 变体分别得到第 2.1 节两个 P1012，随后已删除临时目录。

```bash
corepack pnpm --filter @airoaming/server exec vitest run \
  src/persistence/g1-schema-model-source.spec.ts \
  src/persistence/g1-schema-constraint-source.spec.ts \
  src/persistence/g1-schema-domain-registry-source.spec.ts \
  src/persistence/g1-schema-manifest.spec.ts \
  src/persistence/g1-schema-review-attestation.spec.ts \
  src/persistence/g1-schema-review-bundle.spec.ts \
  src/persistence/g1-schema-review-check.spec.ts \
  src/persistence/g1-schema-gate-coverage.spec.ts \
  src/persistence/g1-schema-trigger-sqlite-semantics.spec.ts \
  src/persistence/g1-prisma-schema.spec.ts
```

结果：10 files / 155 tests 全部通过；真实 SQLite 为 36/36，bundle 为 47/47，Schema 为 2/2。

```bash
corepack pnpm --filter @airoaming/server typecheck
```

结果：exit 0。

```bash
test ! -e apps/server/prisma/migrations
```

结果：exit 0；migration 目录仍不存在。

另执行只读 manifest/renderer mutation probe 与内存 `node:sqlite` probe，输出分别见第 2、3 节；未在项目真实 r6 review root 创建 sealed bundle、publisher marker 或 temp。

## 6. 最终判定

本轮 `sqlite_dsl_machine` 独立复核为 `rejected`。在两个 P1 修复、摘要重新固定并完成新一轮双审前，r5 evidence、r6 raw 文件、publish/recovery 返回值或当前 validate Green 均不得授权 migration generation；base gate 必须继续保持 `0/2 pending false`。
