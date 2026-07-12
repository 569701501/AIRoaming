---
doc_id: AIR-REVIEW-20260712-G1-M0A-PASS2-R6-CONTRACT
status: accepted
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: orchestrator, scrutiny-reviewer, developer, qa
source: G1 M0-A Pass 2 r6 fixed manifest digest and current contract sources
---

# G1 M0-A Pass 2 r6 契约与跨文档一致性独立复核

## 1. 复核身份与结论

| 项目 | 值 |
| --- | --- |
| review round | `g1-m0a-pass2-r6` |
| fixed manifest digest | `sha256:356d2150ec848a1e4c583d170fee0b80b136bfe3c0990faefd49fe72aeadcfb6` |
| reviewerId | `codex-scrutiny-contract-20260712-r6` |
| reviewerRole | `contract_consistency` |
| independentFromWorker | `true` |
| verdict | `accepted` |
| current findings | `0×P0 / 0×P1 / 0×P2` |

本 Reviewer 签收 fixed r6 契约摘要。独立扫描全部 105 条 defining FK 后，具有严格子集 unique、但完整 relation fields 不具备 exact unique 的关系精确只有 `Candidate.asset`；权威契约、model source、manifest 与生成 Schema 均把反向 navigation 固定为 `Asset.candidatesByAsset Candidate[]`，同时保留物理 `uq_candidates_asset(asset_id)`，未新增 composite unique，也未改变 44/556/105/210 与 44/70/60 inventory。

Prisma renderer 未包含 `Candidate`/`Asset` 特判，按 manifest 的 `list/optional` 渲染；每条 defining relation 在渲染前仍需精确匹配物理 FK 的非空名称、local/ref columns 与 actions。SQLite connector 不支持的只有 relation `map` 在 Prisma SDL 中省略，manifest 中 105 个物理 FK 名称没有丢失。当前 Schema 为 44 模型、556 scalar、210 navigation，`prisma validate` 与 exact Schema tests 均为 Green。

19-source、G1～G5 overlay/registry、双审协议、r1～r5 历史 SHA 与 r3/r4/r5 internal bundle digest 均未发现新的 P0/P1/P2。

## 2. 独立性与复核边界

- 本 Reviewer 只执行 `contract_consistency` 角色，未修改 Worker source、权威文档、manifest、Schema、task plan、progress、findings 或 Handoff。
- 本 Reviewer 未读取、探测或引用另一审查角色的本轮 raw 证据，也未与其通信。
- 本 Reviewer 只写自己的 raw report/attestation；未创建或修改 sealed snapshot、publisher lock、recovery marker 或 temp。
- 复核从 current bytes 重新检查固定 artifact、19 个 source、105 条 FK/relation、Prisma renderer/Schema、G1～G5 ownership、review protocol 与 r1～r5 历史证据；历史 Reviewer 结论不作为本轮判断依据。
- 为保持角色隔离，本 Reviewer 没有对真实 r6 review root 运行 derived `review-check`。0/1/2 review、真实 process exit、CAS publish/recovery、rejected/open-P1 first generation 与 second publish 均在隔离临时 workspace 的生产 API/CLI 集成测试中复验。

## 3. exact-unique 冲突与最小修订复验

### 3.1 全 105 FK 独立扫描

扫描算法逐一从 manifest 的本地 relation fields 映射到物理列，并分别计算：

1. 是否存在与完整 local column set 同长度、同集合的 named unique；
2. 是否存在列数更少且全部落在 local set 内的 strict-subset unique；
3. 是否恰好等于本地 primary key；
4. 是否与恰好一条 manifest FK 的 target table、local/ref column 顺序、`onDelete/onUpdate` 完全一致；
5. 是否恰好存在一条共享 relationName 的反向 navigation。

机械结果：

| 检查 | 结果 |
| --- | --- |
| defining relations | `105` |
| manifest foreign keys | `105` |
| exact named-unique relations | `8` |
| exact primary-key relations | `0` |
| strict-subset unique 且无 exact unique | `1`，仅 `Candidate.asset` |
| FK exact-match failure | `0` |
| reverse pair failure | `0` |

当前 105 条关系没有 defining fields 恰好等于 PK 的情形，所以 current singular inverse 的 8 个来源全部是完整 relation fields 的 exact named unique；不存在因 PK 判定遗漏而造成的 current cardinality drift。

### 3.2 `Candidate.asset` 四层事实一致

| 层 | 当前事实 |
| --- | --- |
| authority | defining fields=`[assetId, projectId, chapterId]`；strict subset=`uq_candidates_asset(asset_id)`；反向必须为 list |
| model source | `hasUniqueForeignKey` 要求 unique 与完整 local columns 等长且同集合；strict subset 不再返回 singular |
| manifest | `Candidate.asset` local columns=`asset_id/project_id/chapter_id`；`Asset.candidatesByAsset` 为 `list=true, optional=false` |
| Prisma Schema | `candidatesByAsset Candidate[]`；本地 `asset Asset` 保留三列 fields/references 与 `Restrict/NoAction` |

`Candidate` 的 current uniques 精确仍为：

- `uq_candidates_asset(asset_id)`；
- `uq_candidates_id_scope_shot(id, project_id, chapter_id, shot_id)`；
- `uq_candidates_task_shot_index(task_id, shot_id, index)`。

不存在 `(asset_id, project_id, chapter_id)` exact composite unique。物理 `asset_id` unique 因而继续保证一个 Asset 实际最多关联一条 Candidate；Prisma list 只是诚实表达 connector 可验证的 relation shape，不放宽数据库 0..1 约束。

### 3.3 最小性

- `g1-schema-model-source.spec.ts` 的独立 inventory 断言精确得到 `subsetOnlyRelations=["Candidate.asset"]`。
- current unique 总数仍为 70、index 仍为 60、FK 仍为 105、relation navigation 仍为 210。
- authority §13、task plan、findings、progress 与 Handoff 使用同一最小修订口径；没有把 Prisma 表达限制转化为新的物理约束。

## 4. Renderer、FK 命名与 Prisma Schema 复验

### 4.1 无硬编码 cardinality adapter

`g1-prisma-schema.ts` 中没有 `Candidate`、`candidatesByAsset`、`Candidate_asset_Asset` 或 `uq_candidates_asset` 字面量。`renderRelationField` 只读取 manifest 的 `relation.list` 与 `relation.optional`，因此 `Asset.candidatesByAsset` 是 manifest 原生输出，不是 renderer 特例。

### 4.2 relation `map` 省略没有丢失物理 FK 契约

对每条本地 relation，`matchingForeignKey` 先要求 manifest 中恰好一条 FK 同时满足：

- target table 相同；
- local columns 同顺序相同；
- target columns 同顺序相同；
- `onDelete/onUpdate` 相同；
- FK name 非空。

随后 Prisma SDL 只写 relationName、fields、references 与 actions，不写 SQLite connector 不接受的 relation `map`。独立 mutation probe 对 `Candidate.asset` 得到：

| mutation | fail-closed code |
| --- | --- |
| physical FK name 置空 | `G1_PRISMA_RELATION_FK_NAME_EMPTY:Candidate:asset` |
| `onDelete` 改为 Cascade | `G1_PRISMA_RELATION_FK_NOT_EXACT:Candidate:asset:0` |
| target column 顺序漂移 | `G1_PRISMA_RELATION_FK_NOT_EXACT:Candidate:asset:0` |

Schema 全文 relation `map` 数为 0；manifest 仍保存 `fk_candidates_asset_id_project_id_chapter_id__assets` 以及其三列 local/ref 与 `Restrict/NoAction`。后续 migration SQL 仍必须创建该物理名称，并由 fresh SQLite/schema-contract 对照验证；当前 Prisma SDL 通过不替代该后续退出条件。

### 4.3 确定性 Schema

| 检查 | 结果 |
| --- | --- |
| model blocks | `44` |
| scalar fields | `556` |
| relation navigation fields | `210` |
| `candidatesByAsset Candidate[]` | 恰好 1 次 |
| relation FK `map` | `0` |
| byte-exact manifest→Schema | Green |
| Prisma 6.19.3 validate | Green |

## 5. 19-source、G1～G5 与 review protocol 一致性

### 5.1 source 与摘要

- `g1:manifest:check` 重建 current artifact 后仍得到 fixed digest `sha256:356d2150ec848a1e4c583d170fee0b80b136bfe3c0990faefd49fe72aeadcfb6`。
- source 精确为 `19 = 16 TypeScript + 2 authoritative Markdown + apps/server/package.json`；19 个当前文件 byte SHA 全部等于 manifest source digest。
- `schema.prisma`、migration、review/spec、SQLite/DB source 数均为 0。
- package bytes/current manifest digest 同为 `sha256:0aa5cc313c640a3f7dacedb297c61a64e1697a4fcf41f0dd9583cab1b401434a`。
- r5 advisory `G1-CONTRACT-P2-MANIFEST-SOURCE-COMMENT` 已关闭：`g1-schema-manifest-source.ts` 的 JSDoc 现在明确写出 two Markdown authorities、explicit TypeScript allow-list 与 reviewed package runner source，并继续声明无 Prisma/migration/SQLite 输入。

### 5.2 固定 inventory 与阶段所有权

| inventory | current |
| --- | --- |
| model/scalar/FK/relation | `44/556/105/210` |
| PK/unique/index | `44/70/60` |
| CHECK definition/binding | `195/195` |
| trigger definition/binding | `194/194` |
| TaskPolicy/OutboxHandler/PurgeOwnership | `10/5/44` |
| formal/layout-binding projections | `3/2` |
| completeness | `ready=true, issueCount=0` |
| base review gate | `0/2 pending, migrationGenerationAllowed=false` |

effective stage 仍为 G1、`appliedOverlays=[]`。overlay inventory 精确包含 G1～G5：G1 只声明 base ownership；G2/G4/G5 各声明 1 check + 1 index + 1 trigger overlay；G3 只声明 comicFormat immutable trigger。10 类 TaskPolicy 的 codec/target/source/idempotency binding 与 5 类 Outbox handler 的 payload/claim/replay/terminal policy 继续由 registry tests fail closed，未因 relation 修订发生漂移。

### 5.3 review protocol

- base manifest 永久保持 0/2；外部 raw submission 不回写 base artifact。
- 0 review 与 1 accepted/no-blocking 为 pending；首份 rejected 或 accepted+open P0/P1 为 rejected，但仍允许另一角色按 CAS 提交；只有 2/2 accepted 且无 blocking 才 allowed。
- sealed snapshot、raw report/attestation digest、round/role/manifest、reviewer 独立性、role order、canonical JSON、CAS、publisher/recovery 与 process exit 均由 103 个隔离集成测试覆盖。
- current review round 常量、权威 §13.2、task plan 与 Handoff 均为 `g1-m0a-pass2-r6`；旧 r5 accepted bundle 只属于旧 digest，不能授权 r6 migration。

## 6. 机械验证证据

| 命令 / 检查 | 结果 |
| --- | --- |
| `corepack pnpm --filter @airoaming/server g1:manifest:check` | Green；fixed digest exact |
| model source + Prisma renderer specs | `2 files / 7 tests` Green |
| non-tracer persistence matrix | `9 files / 153 tests` Green |
| review protocol matrix | manifest 4 + attestation 33 + bundle 47 + check 19 = `103 tests` Green |
| constraint/domain/gate/SQLite semantics | `4+2+3+36 = 45 tests` Green |
| `schema-contract.spec.ts` | `2/2` Green |
| `g1-prisma-schema.spec.ts` | `2/2` Green；Schema byte-exact + no relation map |
| `corepack pnpm --filter @airoaming/server prisma:validate` | Green |
| `corepack pnpm --filter @airoaming/server typecheck` | exit 0 |
| scoped `git diff --check` | exit 0 |
| 19 source byte SHA | `19/19` current；mismatch 0 |
| r1～r5 frozen file SHA | `23/23` 与 authority/Handoff 一致 |
| r3/r4/r5 internal bundle digest | 三个均由 canonical payload 独立复算匹配 |

历史内部摘要复算结果：

- r3 final：`sha256:45414800250472f44b4389f4aee6d11c564970f3ece7c175f71441fa360b7b40`；
- r4 final：`sha256:af02b5ab0d6a476fd1be61fd4b71ccd40811c97bfae0b17a3035f17b393c2a27`；
- r5 first pointer：`sha256:f267e32886af1f91f22e0e7cda1f5803709a2088d0fedd2d08e31cd60d2eb422`；
- r5 final：`sha256:970c80b9511730aee257fb0eb9f18084947f991fee154cf19eb8b4720e5bb0e6`；
- r5 sealed file SHA：`e5cc71f73a1ad418e9f8730cee9aa4a4e2108024931d2b05604de6a8aaef2953`。

## 7. Findings

无 open P0/P1/P2 finding。

## 8. 签收边界与残留退出条件

本结论只签收 fixed r6 source-only contract、manifest→Schema 展开规则与当前静态证据，不冒充 0001～0008 migration、fresh SQLite 物理 FK 命名对照、M0-A/M0-B 或整个 G1 完成。

父 Orchestrator 仍须以 expected-previous CAS 密封两名独立 Reviewer 的 current raw pair，并以最终 derived `review-check` 证明精确 2/2 accepted。只有该 gate 为 `accepted` 且 `migrationGenerationAllowed=true` 后，Worker 才可恢复 migration TDD；relation `map` 未进入 Prisma SDL 的 105 个物理 FK 名称仍须在未来 migration SQL 与 fresh SQLite 中逐项验证。
