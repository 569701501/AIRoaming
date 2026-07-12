---
doc_id: AIR-REVIEW-20260712-G1-M0A-PASS2-R2-CONTRACT
status: rejected
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: orchestrator, scrutiny-reviewer, developer, qa
source: G1 M0-A Pass 2 r2 fixed manifest digest and current contract sources
---

# G1 M0-A Pass 2 r2 契约与跨文档一致性独立复核

## 1. 复核身份与结论

| 项目 | 值 |
| --- | --- |
| review round | `g1-m0a-pass2-r2` |
| fixed manifest digest | `sha256:2fef00a5c016b48784db675fb9e88778c6e073dd6e0798c0c0fdbbeb2b5d279f` |
| reviewerId | `codex-scrutiny-contract-20260712-r2` |
| reviewerRole | `contract_consistency` |
| independentFromWorker | `true` |
| verdict | `rejected` |
| current findings | `0×P0 / 2×P1 / 1×P2` |

本轮不得签收。r1 Reviewer A 的 `5×P1 + 2×P2` 在当前文档与 source 中均已真实收口，但 r2 返工新增的安全条件没有完整进入总控退出范围，且 `story_parse/shot_generate` 的幂等 key 模板仍无法从冻结的精确输入契约中唯一解析。两项都会让后续 Worker 在签收或实现时得到多种合法解释，属 open P1。

## 2. 独立性与范围

- 本 Reviewer 只执行 `contract_consistency` 角色，未修改 Worker source、manifest、权威契约或验收清单。
- 本轮未读取、未引用 `sqlite_dsl_machine` r2 report/attestation 或其结论；只在执行本角色工作前做过文件是否存在的 metadata 检查。
- 重新审查了 fixed artifact、18 个 `sourceDocuments`、两份摘要权威 Markdown、Task/Outbox/Purge registries、review attestation/bundle/check 协议、当前 Handoff，以及 G1～G5 受 r1/r2 返工影响的开发契约与验收映射。
- 复核重点包括：计数/摘要/轮次一致性，10 类 TaskPolicy 与 5 类 Outbox handler，路由目标与写目标，retry/lease/terminal，legacy Preflight 决议，G2 strict DTO，G3 物理名，G4 nullability，G5 seal/overlay/path，以及总控 stage gate 覆盖。

## 3. 机械验证证据

| 命令 / 检查 | 结果 |
| --- | --- |
| `corepack pnpm --filter @airoaming/server g1:manifest:check` | 通过；current digest 精确为 fixed digest，base gate 仍是 `0/2 pending false` |
| 8 个 non-tracer persistence specs | `8 files / 128 tests` 全部通过 |
| 其中 review 四组 specs | `4 + 30 + 39 + 13 = 86` tests 通过 |
| SQLite trigger semantics | `33/33` 通过 |
| `corepack pnpm --filter @airoaming/server typecheck` | 通过 |
| `git diff --check` | 通过 |
| `schema-contract.spec.ts` | 精确 `1 passed / 1 failed`；唯一 expected Red 仍是 `PersistenceState` 当前只有 `id` |
| 无 r2 sidecar 时的 `g1:manifest:review-check` | exit 1；`receivedReviews=0,status=pending,migrationGenerationAllowed=false` |
| r1 四份历史证据 SHA-256 | 与 Handoff 记录的四个摘要逐一一致 |

定向测试命令：

```bash
corepack pnpm --filter @airoaming/server exec vitest run \
  src/persistence/g1-schema-model-source.spec.ts \
  src/persistence/g1-schema-constraint-source.spec.ts \
  src/persistence/g1-schema-domain-registry-source.spec.ts \
  src/persistence/g1-schema-manifest.spec.ts \
  src/persistence/g1-schema-review-attestation.spec.ts \
  src/persistence/g1-schema-review-bundle.spec.ts \
  src/persistence/g1-schema-review-check.spec.ts \
  src/persistence/g1-schema-trigger-sqlite-semantics.spec.ts
```

## 4. r1 Reviewer A findings 闭环复验

| r1 finding | r2 当前证据 | 状态 |
| --- | --- | --- |
| `G1-CONTRACT-P1-TASK-TARGET-BINDING` | `story_parse/shot_generate` 已以 `Chapter.id` 作 routing target，`expectedTargetId + expectedTargetRowVersion` 独立绑定 active pending Story/Storyboard；G1 registry/source、G2 方案/字典/验收和生成任务协议一致 | resolved |
| `G1-CONTRACT-P1-RETRY-BACKOFF` | `maxAttempts` 统一表示总 attempt；3 次只有 `[5,30]`，2 次只有 `[5]`，无 `120` 或第 4 次 attempt | resolved |
| `G1-CONTRACT-P1-PREFLIGHT-LEGACY` | 旧 Preflight 来源不可证时不插伪 `PreflightRevision`，current=null，建 `PREFLIGHT_SOURCE_UNRESOLVED`；final 前只能用 exact `drop_current_preflight_and_reconfirm_after_cutover` 决议收口 | resolved |
| `G1-CONTRACT-P1-G4-LOCKSET-NULLABILITY` | `CandidateLockSetSummary.sourceApplicability` 已为 `TaskApplicability | null`，incomplete/unresolved 必须 null，并有 G4 QA 定向用例 | resolved |
| `G1-CONTRACT-P1-G5-LAYOUT-SEAL` | 正式版本事务已固定为 `unsealed Revision -> Bindings -> seal -> current -> WC basedOn`，G5 QA 补齐事务回滚和负例 | resolved |
| `G1-CONTRACT-P2-G5-OVERLAY-OWNERSHIP` | G5 明确声明 previous/contentBasedOn/saveReason/seal 字段已属 G1 base，G5 只加 overlay，不再 `ADD COLUMN` | resolved |
| `G1-CONTRACT-P2-G5-PRISMA-PATH` | G5 改动面已指向实际路径 `apps/server/prisma/schema.prisma` | resolved |

## 5. Current open findings

### 5.1 `G1-CONTRACT-P1-GATE-RANGE-DRIFT` — r2 新增安全门禁未进入总控退出范围

严重度：`P1`，状态：`open`。

证据：

1. `G1数据库迁移执行与验收清单.md` 已新增并保留 `SEC-11`、`TSK-23`、`DEL-05`、`LAY-05`、`LAY-06`、`EXP-06`、`ACT-09`。它们分别封闭 credential clearing 回退、deleting 中 Task 错误成功/重试、44 表 purge owner graph、Layout seal/provenance、child reparent 和 recovery 五项 identity 形状。
2. `task_plan.md:41-46` 仍把各切片核心退出闸门写成 `SEC-01～10`、`TSK-00～22`、`DEL-00～04`、`LAY-01～04`、`EXP-01～05`、`ACT-01～08`。按该总控可在不运行上述 r2 安全用例的情况下签收对应切片。
3. 同一 G1 QA 的说明段 `:203` 仍明言 G1-8 必须使用 `LAY-01～04/EXP-01～05`，与紧接着的 `LAY-05/06` 及 `EXP-06` 表格自相矛盾。
4. r2 `handoff.md:169` 的 Reviewer A 必审映射仍只列 `DEL-00` 和 `ACT-01～08`；`findings.md:64` 的当前门禁摘要也仍是 `ACT-01～08`。

影响：r2 为解决 high-risk bypass 新增了 source/trigger/QA，却没有让它们成为 stage completion 的必要条件。这不是纯措辞问题；执行 Agent 可按总控范围合法跳过清凭据回退、删除中任务、purge root、Layout provenance/reparent 和 recovery shape 的回归。

必须修复：将总控、G1 QA 说明段、Handoff 必审点和当前门禁摘要统一到新的最大范围，并用机械检查证明 QA 中所有非历史 gate ID 都归属一个且只归属一个总控切片。

### 5.2 `G1-CONTRACT-P1-IDEMPOTENCY-TEMPLATE-BINDING` — G2 pending 写目标与幂等模板变量没有唯一绑定

严重度：`P1`，状态：`open`。

证据：

1. 权威 registry `G1任务与Outbox实施注册表.md:67-68,103-108` 与 machine source `g1-schema-constraint-source.ts:719-753` 都把两类任务的 exact write input 定义为 `expectedTargetId`，分别绑定 `Chapter.pendingStoryVersionId` 和 `Chapter.pendingStoryboardVersionId`。
2. 同两项 `idempotencyKeyTemplate` 却分别使用 `{pendingStoryVersionId}` 与 `{pendingStoryboardVersionId}`，而不是已冻结的 `{expectedTargetId}`。
3. G2 契约与任务协议只规定 `chapterId/expectedTargetId/expectedTargetRowVersion/sourceDigest`，没有定义上述两个 pending alias 为 codec 字段，也没有定义“模板占位符→input field/pointer snapshot”的 machine binding。
4. manifest 校验和当前 TSK-00 测试会确认 template 非空，但不会验证每个占位符都能从 strict input/派生字段中唯一解析。G2-TASK-10 仅验证“相同 key 重放”，没有验证 active pending 指针变化后仍用创建时的冻结目标构造同一 key。

影响：一个实现可从当前 Chapter pointer 动态取值，另一个可从 task input 的 `expectedTargetId` 取值。当 B pending 替换 A 时，前者会改变 A 任务的幂等身份；后者保持创建时身份。这使 at-least-once 重放与迟到收敛的精确行为不再唯一。

必须修复：优先将两个 template 统一为 `{expectedTargetId}`；如确实需要 alias，则必须在 manifest 中新增显式、可验证的 placeholder binding，并增加穷尽测试，拒绝未绑定占位符及 pending pointer 切换后的 key drift。

### 5.3 `G1-CONTRACT-P2-REV01-TEST-COUNT` — REV-01 的通过证据还停在 83 tests

严重度：`P2`，状态：`open`。

`G1数据库迁移执行与验收清单.md:138` 把 REV-01 标为 pass，但仍记录 `4 files / 83 tests`。当前四个精确 suite 实跑分别是 manifest `4`、attestation `30`、bundle `39`、review-check `13`，合计 `86`。Handoff 的总数 `8 files / 128 tests` 是对的，所以这不改变机械结果，但已标 pass 的精确证据数应同步到当前 suite。

## 6. 其他一致性结论

- fixed artifact 与 fresh sources 一致；current inventory 为 `44/556/105/210`、`44/70/60`、`195/195`、`194/194`、`10/5/44`，completeness issue 为 0。
- base manifest 保持 immutable `0/2 pending false`，derived gate 的 stale/tamper/rejected/open P0/P1/role/reviewer/report digest 协议与 r2 固定目录一致。
- G2 strict DTO、routing/write target 分离、pending rowVersion CAS、SourceSnapshot/freshness 与 Preflight unresolved 决议未发现除 5.2 幂等占位符外的新 P0/P1。
- G3 `project_comic_format_immutable` 物理名，G4 LockSet nullability/线性索引，G5 target/order、seal/current 事务、base/overlay 所有权与 Prisma 路径在当前文档间一致。
- G2～G5 overlay 只声明后续阶段所有权，`effectiveStage=G1` 且 `appliedOverlays=[]`，未将后续功能冒充为 G1 base 已完成。

## 7. 重审退出条件

Worker 必须先收口两个 open P1，同步相关权威文档/source/tests，然后重新生成并检查 manifest。由于幂等 registry 属当前 18 个 digest sources，对它的正确修复必然产生新 manifest digest；当前 r2 sidecar 不得复用。修复后应在新 round/digest 上重跑两名独立 Reviewer，在此之前仍禁止生成 0001～0008 migration SQL。
