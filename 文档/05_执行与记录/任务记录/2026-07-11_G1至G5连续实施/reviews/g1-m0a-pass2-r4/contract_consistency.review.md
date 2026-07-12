---
doc_id: AIR-REVIEW-20260712-G1-M0A-PASS2-R4-CONTRACT
status: rejected
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: orchestrator, scrutiny-reviewer, developer, qa
source: G1 M0-A Pass 2 r4 fixed manifest digest and current contract sources
---

# G1 M0-A Pass 2 r4 契约与跨文档一致性独立复核

## 1. 复核身份与结论

| 项目 | 值 |
| --- | --- |
| review round | `g1-m0a-pass2-r4` |
| fixed manifest digest | `sha256:0acc15df259d1744bb26c6b853e994dadc6c4be48fcb1d8e2c798254bc01a237` |
| reviewerId | `codex-scrutiny-contract-20260712-r4` |
| reviewerRole | `contract_consistency` |
| independentFromWorker | `true` |
| verdict | `rejected` |
| current findings | `0×P0 / 2×P1 / 0×P2` |

本轮不得签收。r3 的两个具体触发案例已经被修正：`IMP-05A` 当前确实属于 G1-9 且 exactly-one，首份 rejected/open-P1 的 derived status、API、进程退出与后续 peer publish 也已一致。但 gate parser 的 fail-closed detector 仍不是受支持 grammar 的补集，一字母或五字母前缀的 malformed gate 会再次被静默过滤；此外同一份摘要权威契约同时把 current source 数写成 19 和 18，后者位于 review-check 输入契约。两项都使正式验收或摘要边界存在两种解释，均为 open P1。

## 2. 独立性与范围

- 本 Reviewer 只执行 `contract_consistency` 角色，未修改 Worker source、manifest、task plan、Handoff、权威契约或 QA。
- 本轮未读取、探测或引用另一审查角色的任何 r4 证据，也未与其通信。
- 本 Reviewer 只写自己的 raw report/attestation；未创建、修改或探测 r4 sealed bundle、lock 或 temp。
- 重新审查了 fixed artifact、19 个 `sourceDocuments`、两份摘要权威 Markdown、package runner source、10 类 TaskPolicy、review evaluator/API/process、当前 task plan、G1 QA、Handoff，以及 G1～G5 的 target/source/idempotency/projection/overlay 语义。
- 历史 r1/r2/r3 证据只做 byte SHA 与 r3 sealed internal digest 复算，不把历史结论带入本轮判断。

## 3. 机械验证证据

| 命令 / 检查 | 结果 |
| --- | --- |
| `corepack pnpm --filter @airoaming/server g1:manifest:check` | 通过；current digest 精确等于 fixed digest |
| manifest source 分类 | `19 = 2 Markdown + 16 TypeScript + 1 apps/server/package.json`；review/spec/schema/migration/DB source 为 0 |
| package source 摘要 | manifest 与当前 `apps/server/package.json` 都是 `sha256:0aa5cc313c640a3f7dacedb297c61a64e1697a4fcf41f0dd9583cab1b401434a` |
| 9 个 non-tracer persistence specs | `9 files / 150 tests` 全部通过 |
| review protocol 四组 specs | manifest 4 + attestation 33 + bundle 45 + review-check 19 = `101 tests` 全部通过 |
| gate ownership spec | `3/3` 通过；`IMP-05A` 当前被显式断言，但第 5.1 节给出未覆盖的最小 malformed fixture |
| TaskPolicy constraint/source spec | `4/4` 通过；10 类模板/binding 精确矩阵与负例均通过 |
| SQLite trigger semantics | `36/36` 通过 |
| `corepack pnpm --filter @airoaming/server typecheck` | 通过 |
| `git diff --check` | 通过 |
| `schema-contract.spec.ts` | 精确 `1 passed / 1 failed`；唯一 expected Red 仍为 id-only `PersistenceState` |
| evaluator 定向 0/1/2 matrix | `0→pending`、`1 accepted→pending`、`1 rejected/open P1→rejected`、`2 accepted→accepted/allowed` |
| r1/r2/r3 历史 SHA 与 r3 internal digest | 全部与 Handoff 冻结值逐一一致 |

完整定向测试命令：

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

为严格避免接触本轮另一角色证据，本 Reviewer 没有对真实 r4 review root 运行 `g1:manifest:review-check`。0/1/2、真实进程退出、package-script delimiter、rejected/open-P1 first generation 与 second publish 均在隔离 temp workspace 中通过生产 API/CLI 的 19 个集成测试复验。

## 4. r3 Reviewer A findings 闭环复验

| r3 finding | r4 当前证据 | 状态 |
| --- | --- | --- |
| `G1-CONTRACT-P1-GATE-RANGE-DRIFT` | `IMP-05A` 已进入受支持 suffix grammar，QA 定义与 G1-9 owner 各恰好一次；但 malformed gate-like detector 仍能静默漏掉受支持 grammar 外的一/五字母前缀 | 仅具体 ID 闭环，整体 fail-closed 要求仍 open，详见 5.1 |
| `G1-CONTRACT-P1-FIRST-REVIEW-STATUS` | 权威状态表、evaluator、生产 API 与真实进程已统一；首份 rejected/open P1 均 exit 1/status rejected，但 publisher preflight 不以该 finding 阻止第二角色 CAS publish，最终仍 rejected | resolved |

## 5. Current open findings

### 5.1 `G1-CONTRACT-P1-GATE-RANGE-DRIFT` — malformed prefix 仍能绕过 fail-closed gate parser

严重度：`P1`，状态：`open`。

这里必须区分两件事：

- **受支持 grammar 本身已经正确**：`GATE_ID_PATTERN` 在 `g1-schema-gate-coverage.spec.ts:20` 接受 2～4 个大写字母、两位数字和可选 uppercase suffix，因此 `IMP-05A` 当前合法；`task_plan.md:45` 又显式列出它，实际 exactly-one/ghost 检查通过。
- **“不受支持的 gate-like syntax 必须 fail closed”仍不成立**：`GATE_LIKE_CELL_PATTERN` 在同文件 `:21` 也把前缀限制为 2～4 个大写字母。`extractQaGateIds` 的 `:39-51` 与 `extractPlanOwnership` 的 `:67-94` 对既不符合 valid grammar、又不符合这个窄 detector 的 token 没有最终 `else`，会直接跳过。

最小复现 fixture：

```md
| ABCDE-01 | scenario | assertion | status |
| G1-9 M2 | importer | `ABCDE-01` | pending |
```

对当前正则，`ABCDE-01` 同时得到 `GATE_ID_PATTERN=false`、`GATE_LIKE_CELL_PATTERN=false`；QA ID 与 plan ownership 因而都为空，exactly-one 和 no-ghost 仍可 Green。`A-01` 同样被静默忽略。独立正则探针结果为：

```text
IMP-05A      accepted
IMP-05A-extra rejected
IMP_05A      rejected
A-01         silently_ignored
ABCDE-01     silently_ignored
```

这不是只与 Handoff 措辞不同。正式 QA `G1数据库迁移执行与验收清单.md:137` 已把 `REV-00` 标为 pass，并明确要求 “malformed/前缀 token 不得静默过滤”；Handoff `:39-43` 又据此宣称任何 gate-like malformed syntax 都抛错。当前测试只覆盖 suffix 尾随垃圾、underscore 与 descending range，没有覆盖 prefix 长度越界。

影响：未来把任一安全 gate 前缀误写成一字母或五字母时，QA 与 plan 可以同时漏掉它而保持 3/3 Green，exactly-one 证明再次退化为“只证明 parser 已经决定看见的 ID”。这是 r3 P1 的同类绕过，而非新样式偏好。

必须修复：把 malformed detector 扩为受支持 grammar 外围的真正 gate-like 识别，例如至少覆盖任意大写字母前缀后接 `-/_ + digit`，或先用宽 gate-token grammar 识别、再用窄 valid grammar 校验；QA cell 和 plan code span 都必须有最终 fail-closed 分支。新增 `A-01`、`ABCDE-01` 的 QA/plan 负例，并保留当前 `IMP-05A`、尾随垃圾、underscore、descending range 断言。

### 5.2 `G1-CONTRACT-P1-SOURCE-COUNT-DRIFT` — 权威双审输入仍写 18 sources

严重度：`P1`，状态：`open`。

证据：

1. 同一摘要权威契约 `G1数据库Schema实施契约.md:1658-1665` 已正确冻结：两份 Markdown、16 个 TypeScript source 与 `apps/server/package.json`，共 19 个；package source 用于把真实 publish/recover package alias 绑定到 current digest。
2. 紧接着的双审派生门禁协议 `:1696-1702` 仍规定 `g1:manifest:review-check` 从“当前 18 个 sources”重新计算。这一段直接定义 verifier 的 fresh-source 输入，不是历史说明。
3. 当前机器事实是 19：`G1_SCHEMA_MANIFEST_SUPPORTING_PATHS` 包含 package.json，manifest 精确 19 项，package digest 与当前 bytes 相等，manifest spec 也断言 length=19 且禁止 review/spec source。
4. 正式 QA `REV-00` 与 Handoff 都要求 19，故同一 current digest 内同时存在 `18` 与 `19` 两种权威读法。

影响：若后续实现者按 13.2 的 18-source verifier 契约执行，最容易被排除的正是本轮新增的 `apps/server/package.json`，父编排复制的真实 package command 就能在摘要签收后漂移；若按 13.1/manifest 执行，则违反紧邻的派生门禁输入文字。当前实现虽然安全地使用 19，但文档是本项目事实源，不能签收包含互斥边界的 digest。

必须修复：把 13.2 的“当前 18 个 sources”改为“当前 19 个 sources（含 `apps/server/package.json`）”，并全文搜索 current authority/QA/Handoff，确保只有历史 r1～r3 记录保留旧数量。该权威文档属于 current `sourceDocuments`，修改后必须重新 generate/check、切换 digest/round并重新双审。

## 6. 其余一致性结论

- fixed artifact 与 fresh sources 一致；inventory 为 `44/556/105/210`、`44/70/60`、`195/195` CHECK、`194/194` trigger、`10/5/44` registries，completeness issue 为 0，base gate 仍是 immutable `0/2 pending false`。
- 19 个实际 source 精确包含 package.json，且不含 review evidence、spec、schema.prisma、migration 或 DB；机器边界本身未发现遗漏。
- 0/1/2 状态已统一：0 与 1 accepted/no-blocking 为 pending；1 rejected/open P0/P1 为 rejected；只有 2/2 accepted 为 accepted。CLI 只有最后一种 exit 0。
- publisher qualification codes 不包含 reviewer verdict/finding，因此首份 rejected/open P1 不阻止第二角色 publish；最终 gate仍保持 rejected。
- 10 类 TaskPolicy 的模板占位符均唯一绑定 `task_creation` 冻结来源。`story_parse/shot_generate` 使用 Chapter routing target，另以 `expectedTargetId/expectedTargetRowVersion` 绑定 active pending write target，retry/backoff 仍为 3→`[5,30]`、2→`[5]`。
- G2 strict DTO、Preflight unresolved exact decision、G3 物理 immutable owner、G4 LockSet nullability、G5 unsealed→bindings→seal→current→WC 与 base/overlay 所有权保持一致；current manifest 是 `effectiveStage=G1,appliedOverlays=[]`。
- r1/r2 八份 raw、r3 四份 raw 与 sealed file SHA 均未变化；r3 internal `bundleSnapshotDigest` 仍为 `sha256:45414800250472f44b4389f4aee6d11c564970f3ece7c175f71441fa360b7b40`。

## 7. 重审退出条件

Worker 必须先关闭 5.1 与 5.2 两项 open P1，并同步权威文档、gate parser 与机械负例。gate coverage spec、QA 与 task plan 本身不进入 base manifest 摘要；但 5.2 必须修改的 `G1数据库Schema实施契约.md` 属于 current `sourceDocuments`，所以两项一起正确收口后必然产生新 manifest digest，当前 r4 raw pair 不得复用。新 digest/round 上必须重新取得两个独立角色结论，在最终 sealed 2/2 accepted 前仍禁止生成 0001～0008 migration SQL。
