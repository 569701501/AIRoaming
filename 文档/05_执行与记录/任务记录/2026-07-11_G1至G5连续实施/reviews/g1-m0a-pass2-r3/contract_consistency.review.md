---
doc_id: AIR-REVIEW-20260712-G1-M0A-PASS2-R3-CONTRACT
status: rejected
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: orchestrator, scrutiny-reviewer, developer, qa
source: G1 M0-A Pass 2 r3 fixed manifest digest and current contract sources
---

# G1 M0-A Pass 2 r3 契约与跨文档一致性独立复核

## 1. 复核身份与结论

| 项目 | 值 |
| --- | --- |
| review round | `g1-m0a-pass2-r3` |
| fixed manifest digest | `sha256:210e5718052872aff4059f128525c56f3eafc7594dd488bc6275b3585e328963` |
| reviewerId | `codex-scrutiny-contract-20260712-r3` |
| reviewerRole | `contract_consistency` |
| independentFromWorker | `true` |
| verdict | `rejected` |
| current findings | `0×P0 / 2×P1 / 0×P2` |

本轮不得签收。r2 的幂等模板冻结绑定与 REV-01 计数问题已经真实闭环，最大 gate range 也已同步；但 r2 要求的“QA 每个 current gate 恰好归属一个总控切片”仍被 gate-ID grammar 静默绕过，`IMP-05A` 没有进入任何机械比较。另有一项新的审查协议冲突：权威 G1 契约规定所有 `1/2` 都是 `pending`，生产 evaluator 对首份 rejected/open P1 实际输出 `rejected`。两者都会让后续编排或验收得到不唯一结论，均为 open P1。

## 2. 独立性与范围

- 本 Reviewer 只执行 `contract_consistency` 角色，未修改 Worker source、manifest、计划、Handoff、权威契约或 QA。
- 本轮未读取、未引用 `sqlite_dsl_machine` r3 report/attestation 或其结论；只在运行本角色检查时确认过 peer raw pair 与 sealed bundle 是否存在的 metadata。
- 本 Reviewer 只写本角色的 raw report/attestation，不创建或修改 `review-bundle.v1.json`；sealed snapshot 的发布仍归父编排。
- 重新审查了 fixed artifact、18 个 `sourceDocuments`、两份摘要权威 Markdown、10 类 TaskPolicy、5 类 Outbox handler、44 项 PurgeOwnership、review attestation/bundle/check 协议、当前 task plan、G1 QA 与 Handoff，并定向复核 G1～G5 受 r2 修复影响的契约。
- 重点检查：gate exactly-one ownership、10 类幂等模板冻结绑定、story/shot routing/write target、G1～G5 overlay 一致性、raw/sealed ownership、rejected-first 后第二角色发布、`G1_REVIEW_` 保留命名空间，以及各 gate 最大范围。

## 3. 机械验证证据

| 命令 / 检查 | 结果 |
| --- | --- |
| `corepack pnpm --filter @airoaming/server g1:manifest:check` | 通过；current digest 精确等于 fixed digest；base gate 为 `0/2 pending false` |
| 9 个 non-tracer persistence specs | `9 files / 141 tests` 全部通过 |
| 其中 review protocol 四组 specs | manifest 4 + attestation 33 + bundle 39 + review-check 17 = `93 tests` 全部通过 |
| SQLite trigger semantics | `36/36` 通过 |
| gate ownership spec | `2/2` 通过，但第 5.1 节证明这两个 Green 没有枚举 `IMP-05A` |
| TaskPolicy constraint/source spec | `4/4` 通过，包含 10 类精确 binding 矩阵与缺失/重复/未知负例 |
| `corepack pnpm --filter @airoaming/server typecheck` | 通过 |
| `git diff --check` | 通过 |
| `schema-contract.spec.ts` | 精确 `1 passed / 1 failed`；唯一 expected Red 仍为 `PersistenceState` 当前只含 `id` |
| 无 r3 sealed bundle 时的 `g1:manifest:review-check` | exit 1；`receivedReviews=0,status=pending,migrationGenerationAllowed=false,bundleSnapshotDigest=null` |
| r1/r2 八份历史 report/attestation SHA-256 | 与 Handoff 冻结值逐一一致 |

定向测试命令：

```bash
corepack pnpm --filter @airoaming/server exec vitest run \
  src/persistence/g1-schema-model-source.spec.ts \
  src/persistence/g1-schema-constraint-source.spec.ts \
  src/persistence/g1-schema-domain-registry-source.spec.ts \
  src/persistence/g1-schema-gate-coverage.spec.ts \
  src/persistence/g1-schema-manifest.spec.ts \
  src/persistence/g1-schema-review-attestation.spec.ts \
  src/persistence/g1-schema-review-bundle.spec.ts \
  src/persistence/g1-schema-review-check.spec.ts \
  src/persistence/g1-schema-trigger-sqlite-semantics.spec.ts
```

## 4. r2 Reviewer A findings 闭环复验

| r2 finding | r3 当前证据 | 状态 |
| --- | --- | --- |
| `G1-CONTRACT-P1-GATE-RANGE-DRIFT` | `SEC-01～11`、`TSK-00～23`、`DEL-00～05`、`LAY-01～06`、`EXP-01～06`、`ACT-01～09` 及 REP/RB/OBS 已同步；但新 exactly-one spec 的 grammar 不接受 `IMP-05A`，所以 r2 要求的穷尽机械证明仍不成立 | open，详见 5.1 |
| `G1-CONTRACT-P1-IDEMPOTENCY-TEMPLATE-BINDING` | 10 类 policy 均有模板顺序一致的 `idempotencyKeyBindings`；story/shot 使用 `{expectedTargetId}→input.expectedTargetId@task_creation`，validator 与负例拒绝 unknown/missing/duplicate/multi-bound | resolved |
| `G1-CONTRACT-P2-REV01-TEST-COUNT` | QA 不再冻结易漂移的协议测试总数；Handoff 的 `93 tests` 明确只是本次 runner 证据 | resolved |

## 5. Current open findings

### 5.1 `G1-CONTRACT-P1-GATE-RANGE-DRIFT` — exactly-one checker 静默忽略 `IMP-05A`

严重度：`P1`，状态：`open`。

证据：

1. `G1数据库迁移执行与验收清单.md:317` 把 `IMP-05A` 定义为正式验收 gate：旧 task/error/meta 出现 fake key 时，snapshot/DB 只能保留脱敏结构与原摘要，必须产生 blocker，绝不能复制原文。
2. `g1-schema-gate-coverage.spec.ts:20-21,31` 只接受 `^[A-Z]{2,4}-\d{2}$`，计划 token 也只解析两位纯数字或纯数字范围。`IMP-05A` 因此在读取 QA 第一列时直接变成 `undefined`，既不会进入“必须恰好一个 owner”，也不会进入 ghost 检查。
3. 对 G1 QA 所有第一列 gate-like token 做独立枚举后，`IMP-05A` 是唯一不被当前 grammar 接受的正式 ID。当前 2/2 Green 因此不能证明 Handoff 所称“所有 current gate”已覆盖。
4. `task_plan.md:45` 只声明 `IMP-01～20`。当前机器语法不会把字母后缀解释为该范围成员，也没有任何显式 `IMP-05A` owner。

影响：这是 secret leakage/importer blocker 的验收项，不是装饰性标签。执行 Agent 可以按机械 Green 合法认为 G1-9 gate 完整，同时完全没有运行 `IMP-05A`。这正是 r2 finding 要求 exactly-one proof 所防止的跳门禁情形。

必须修复：优先把该 gate 重编号为未占用的纯数字 ID（例如 `IMP-21`），同步 G1-9 的最大范围；或扩展 QA/plan grammar 以原生支持后缀 ID，并显式声明 owner。无论选哪种，都要新增 fail-closed 断言：QA 第一列任何 gate-like token 若不符合受支持 grammar，测试必须失败，不能先过滤后再声称穷尽。

### 5.2 `G1-CONTRACT-P1-FIRST-REVIEW-STATUS` — 1/2 rejected/open P1 的权威状态与生产 evaluator 相反

严重度：`P1`，状态：`open`。

证据：

1. 权威 `G1数据库Schema实施契约.md:1757` 明确写道：`0/2 或 1/2 都输出 pending`，只有精确 2/2 accepted 才退出 0。
2. `evaluateG1SchemaReviewGateV1` 在 `g1-schema-review-attestation.ts:693-722` 先把 rejected verdict 或 open P0/P1 finding 加入 `blockingCodes`，随后只要 `blockingCodes.size > 0` 就把 status 设为 `rejected`，优先于 review 数量不足的 `pending` 分支。
3. 使用生产 evaluator 做单份 sealed attestation 定向探针，首份 `verdict=rejected` 得到 `receivedReviews=1,status=rejected,blockingCodes=[G1_REVIEW_VERDICT_REJECTED]`；首份 `verdict=accepted + open P1` 同样得到 `receivedReviews=1,status=rejected`。
4. `g1-schema-review-check.spec.ts:390-449` 已正确证明首份 rejected/open P1 后第二角色仍能 publish，最终 2/2 仍 rejected；CLI preflight 也只用 base/source qualification codes 阻止 publish。因此“是否允许第二份发布”已正确，但“第一代 derived gate 叫什么状态”仍存在两个互斥契约。

影响：父编排若遵循权威命令契约，会把 1/2 的 `rejected` 当成 verifier 异常或终局拒绝；若遵循实现，则不会得到文档承诺的 `pending`。这可能中断“即使第一名拒绝也必须收齐第二份独立事实”的正式流程，也使后续测试无法从唯一事实源判断正确状态。虽然两种分支都不会放行 migration，但审查协议本身仍不确定。

必须修复：冻结一种语义并让权威文档、evaluator 与测试逐字一致。推荐保留当前 fail-closed evaluator：`0/2` 与 accepted `1/2` 为 pending；rejected/open P0/P1 `1/2` 为 rejected，但 publisher 仍允许另一角色按 CAS 提交；只有 2/2 accepted 才 exit 0。新增两条显式的 first-generation derived gate 测试，分别断言 rejected verdict 与 accepted+open P1 的 1/2 状态。

## 6. 其余一致性结论

- fixed artifact 与 fresh sources 一致；current inventory 为 `44 models / 556 scalar / 105 FK / 210 relation / 44 PK / 70 unique / 60 index / 195 CHECK binding / 194 trigger binding / 10 TaskPolicy / 5 Outbox / 44 purge owner`，completeness issue 为 0。
- 10 类幂等模板均可从创建时冻结字段唯一解析。`story_parse/shot_generate` 的 routing target 保持 Chapter，write target 独立绑定 active pending Story/Storyboard，`expectedTargetRowVersion` 属 pending 行而非 Chapter。
- G2 strict DTO、NewWorkGate/TaskApplicabilityGuard、Preflight legacy unresolved 精确决议、retry/backoff 与迟到 historical 收敛未发现新的 P0/P1。
- G3 不可变入口/物理约束名，G4 LockSet `sourceApplicability` nullability/线性索引，G5 unsealed→bindings→seal→current→WC、base/overlay 所有权和真实 Prisma 路径仍保持一致。
- raw/sealed 所有权清晰：Reviewer 只写自己的 raw pair，父编排逐代 CAS 发布 exact bytes，derived reader 只读 sealed snapshot；没有 sealed 时 raw 0/1/2 都不计数。
- 第一份 rejected/open P1 不阻止第二角色 publish，最终 gate 仍 rejected；finding code 以 `G1_REVIEW_` 开头会在 sealing 前被 codec 拒绝，协议命名空间保护有效。
- base manifest 保持 immutable `0/2 pending false`；stale source、tampered report/bundle、role/reviewer 重复、round/manifest/path/CAS 不一致仍 fail closed。
- G2～G5 overlay 只声明后续阶段所有权；current manifest 仍是 `effectiveStage=G1,appliedOverlays=[]`，未将后续功能冒充为 G1 base 已完成。

## 7. 重审退出条件

Worker 必须先关闭 5.1 与 5.2 两项 open P1，并同步相应 source、权威文档和机械测试。修改 `G1数据库Schema实施契约.md` 或任何当前 18 个 digest source 后，必须重新 generate/check 得到新 manifest digest；当前 r3 raw pair 与任何当前 digest 的 sealed generation 都不得复用。修复后应在新 round/digest 上重新取得两个独立角色结论；在 sealed 2/2 accepted 前仍禁止生成 0001～0008 migration SQL。
