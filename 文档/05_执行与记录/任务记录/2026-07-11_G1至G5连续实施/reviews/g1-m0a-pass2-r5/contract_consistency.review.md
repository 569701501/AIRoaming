---
doc_id: AIR-REVIEW-20260712-G1-M0A-PASS2-R5-CONTRACT
status: accepted
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: orchestrator, scrutiny-reviewer, developer, qa
source: G1 M0-A Pass 2 r5 fixed manifest digest and current contract sources
---

# G1 M0-A Pass 2 r5 契约与跨文档一致性独立复核

## 1. 复核身份与结论

| 项目 | 值 |
| --- | --- |
| review round | `g1-m0a-pass2-r5` |
| fixed manifest digest | `sha256:d981372c9051bf89fe6d01c4be94b50cfad7fd5bbe71dea36ae67dccb02e6825` |
| reviewerId | `codex-scrutiny-contract-20260712-r5` |
| reviewerRole | `contract_consistency` |
| independentFromWorker | `true` |
| verdict | `accepted` |
| current findings | `0×P0 / 0×P1 / 1×P2` |

本 Reviewer 签收当前 r5 契约摘要。r4 Reviewer A 的两个 P1 均已真实闭环：受支持 gate grammar 仍严格为 2～4 个大写字母前缀，但更宽的 detector 会在 gate 定义表第一格与 G1 plan code span 拒绝一/五字母前缀、underscore 与 suffix-tail；19-source 边界在权威 §13.1/§13.2、manifest、source allowlist 与 package digest 中一致。0/1/2 review 状态、G1～G5 target/source/idempotency/projection/overlay 及历史摘要未发现新的 P0/P1。

唯一 advisory 是 manifest 装配函数的 JSDoc 仍把输入概括成“两份 Markdown + TypeScript allow-list”，没有提到已经正式进入摘要的 `apps/server/package.json`。机器 allowlist、权威契约和测试都正确，因此定级 P2，不阻断签收。

## 2. 独立性与范围

- 本 Reviewer 只执行 `contract_consistency` 角色，未修改 Worker source、manifest、task plan、Handoff、权威契约或 QA。
- 本轮未读取、探测或引用另一审查角色的任何 r5 证据，也未与其通信。
- 本 Reviewer 只写自己的 raw report/attestation；未创建、修改或探测 r5 sealed bundle、lock 或 temp。
- 从 current bytes 重新检查 fixed artifact、19 个 `sourceDocuments`、package scripts、gate parser、review evaluator/API/process、10 类 TaskPolicy、G1～G5 契约以及 r1～r4 历史摘要。
- 历史文件只做 SHA/internal digest 复算，不把其 Reviewer 结论作为本轮判断依据。

## 3. 机械验证证据

| 命令 / 检查 | 结果 |
| --- | --- |
| `corepack pnpm --filter @airoaming/server g1:manifest:check` | 通过；current digest 精确等于 fixed digest |
| manifest source 分类 | `19 = 2 Markdown + 16 TypeScript + 1 apps/server/package.json`；review/spec/schema/migration/DB source 为 0 |
| package source 摘要 | manifest 与当前 package bytes 均为 `sha256:0aa5cc313c640a3f7dacedb297c61a64e1697a4fcf41f0dd9583cab1b401434a` |
| 独立 gate 提取 | `185` 个定义且全部唯一；`IMP-05A` 定义 1 次、owner=`G1-9` 1 次；non-single owner 与 ghost 都为 0 |
| malformed fixtures | `A-01`、`ABCDE-01`、`IMP_05A`、`IMP-05A-extra` 在 QA 与 plan 双侧均拒绝 |
| positive scoping fixtures | `DEL-00（引用 ...）` 受控跳过；非 gate 表中的 `ABCDE-01` 不误报 |
| 9 个 non-tracer persistence specs | `9 files / 152 tests` 全部通过 |
| review protocol 四组 specs | manifest 4 + attestation 33 + bundle 47 + review-check 19 = `103 tests` 全部通过 |
| TaskPolicy constraint/source spec | `4/4` 通过；10 类模板/binding 精确矩阵与负例均通过 |
| SQLite trigger semantics | `36/36` 通过 |
| `corepack pnpm --filter @airoaming/server typecheck` | 通过 |
| `git diff --check` | 通过 |
| `schema-contract.spec.ts` | 精确 `1 passed / 1 failed`；唯一 expected Red 仍为 id-only `PersistenceState` |
| evaluator 定向 0/1/2 matrix | `0→pending`、`1 accepted→pending`、`1 rejected/open P1→rejected`、`2 accepted→accepted/allowed` |
| r1～r4 历史 SHA 与 r3/r4 internal digest | 全部与 Handoff 冻结值逐一一致 |

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

为严格避免接触本轮另一角色证据，本 Reviewer 没有对真实 r5 review root 运行 `g1:manifest:review-check`。0/1/2 状态、真实进程退出、package delimiter、rejected/open-P1 first generation 与 second publish 均由隔离 temp workspace 中的生产 API/CLI 集成测试复验。

## 4. r4 Reviewer A findings 闭环复验

### 4.1 `G1-CONTRACT-P1-GATE-RANGE-DRIFT` — resolved

- `GATE_ID_PATTERN` 仍是 `^[A-Z]{2,4}-\d{2}(?:[A-Z][A-Z0-9]*)?$`，没有为修复 detector 而放宽正式 ID。
- `GATE_LIKE_CELL_PATTERN` 已扩为 `^[A-Z]+(?:-|_)?\d`。valid grammar 先判断，受控 reference 次之，宽 detector 最后拒绝非法形状。
- QA parser 只在第一格 header 精确为 `ID` 或 `Gate` 的表内解释 gate cell；普通非 gate 表不扫描其数据值。plan parser 只读取 G1 slice 行中的 code spans。
- 独立 fixture 证明 `A-01/ABCDE-01/IMP_05A/IMP-05A-extra` 在 QA/plan 双侧 fail closed；controlled reference 与非 gate 表不误报。
- current QA/plan 的 185 个 gate 全部 exactly-one，`IMP-05A` 明确属于 G1-9，无 ghost。

### 4.2 `G1-CONTRACT-P1-SOURCE-COUNT-DRIFT` — resolved

- 权威 Schema 实施契约 `:1658` 与 `:1701` 都精确写 19，并在后者展开 `16 TypeScript + 2 Markdown + apps/server/package.json`。
- manifest 精确 19 项；package.json 恰好 1 项且 byte SHA 与 source fact 相等。
- current authority/QA/Handoff 没有残留“当前 18 sources”；任务 progress 中的 18 只是新增 package source 之前的历史时间线，findings 已明确记录 18→19。
- allowlist 与 manifest 不含 `reviews/`、report、attestation、spec、schema.prisma、migration、SQLite 或 DB。

## 5. Current advisory finding

### 5.1 `G1-CONTRACT-P2-MANIFEST-SOURCE-COMMENT` — 装配函数 JSDoc 漏写 package source

严重度：`P2`，状态：`open`。

`g1-schema-manifest-source.ts:93-96` 当前写道：Pass 2 artifact “only from the two Markdown authorities and the explicit TypeScript source allow-list”。但同文件 `:23-35` 的 supporting paths 已包含 `apps/server/package.json`，权威契约与 manifest 也固定为 `2 Markdown + 16 TypeScript + package.json`。

影响限于维护者理解：执行常量、artifact、package SHA、fresh check 与负例测试均正确，无法利用这段注释绕过摘要，故不是 P0/P1。但未来维护者只看函数注释时可能误以为 package runner 不属于受审输入。

建议修复：在下一次本来就需要修改 current source/digest 时，把 JSDoc 改为“两份 Markdown authority、显式 TypeScript allow-list 与 package.json supporting source”，并保留无 Prisma/migration/SQLite 输入的说明。若选择现在修复，由于该 `.ts` 本身属于 `sourceDocuments`，必须重新 generate/check 并切换 round/digest；不得在 r5 sidecar 发布后原地修改。

## 6. 其他一致性结论

- fixed artifact inventory 为 `44/556/105/210`、`44/70/60`、`195/195` CHECK、`194/194` trigger、`10/5/44` registries；completeness issue 为 0，base gate 保持 immutable `0/2 pending false`。
- 0 与 1 accepted/no-blocking 为 pending；1 rejected/open P0/P1 为 rejected；只有 2/2 accepted 为 accepted。除最后一种外 process exit 非零。
- publisher qualification codes 不包含 Reviewer verdict/finding，首份 rejected/open P1 不阻止第二角色 CAS publish；最终 gate仍拒绝。
- 10 类 TaskPolicy 占位符均唯一绑定 `task_creation` 冻结来源。`story_parse/shot_generate` 使用 Chapter routing target，另以 `expectedTargetId/expectedTargetRowVersion` 绑定 active pending write target；retry/backoff 仍为 3→`[5,30]`、2→`[5]`。
- G2 strict DTO、Preflight unresolved exact decision、G3 physical immutable owner、G4 LockSet nullability、G5 unsealed→bindings→seal→current→WC 与 base/overlay ownership 一致；manifest 仍是 `effectiveStage=G1,appliedOverlays=[]`。
- r1/r2 八份 raw、r3/r4 各四份 raw 与 sealed file SHA 均未变化；r3 internal digest 为 `sha256:45414800250472f44b4389f4aee6d11c564970f3ece7c175f71441fa360b7b40`，r4 为 `sha256:af02b5ab0d6a476fd1be61fd4b71ccd40811c97bfae0b17a3035f17b393c2a27`。

## 7. 签收边界

本结论只签收 fixed r5 source-only contract，不能冒充 Schema/migration 或真实用户路径完成。父编排仍须密封两个独立角色的 current raw pair，并以最终 `review-check` 证明精确 2/2 accepted；在此之前继续禁止生成 0001～0008 migration SQL。P2 advisory 不授权修改 current source；任何摘要源变化都必须生成新 digest 并重新双审。
