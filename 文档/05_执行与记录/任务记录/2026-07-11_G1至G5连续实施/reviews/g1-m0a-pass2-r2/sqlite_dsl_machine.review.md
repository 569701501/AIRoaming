---
doc_id: AIR-REVIEW-20260712-G1-M0A-PASS2-R2-SQLITE
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G1 M0-A Pass 2 r2 固定 manifest、两份权威 Markdown 与 16 个受控 TypeScript source
---

# G1 M0-A Pass 2 r2 SQLite / DSL / Machine 独立复核

## 1. 结论

| 项 | 结果 |
| --- | --- |
| reviewRoundId | `g1-m0a-pass2-r2` |
| manifestDigest | `sha256:2fef00a5c016b48784db675fb9e88778c6e073dd6e0798c0c0fdbbeb2b5d279f` |
| reviewerId | `codex-sqlite-dsl-machine-r2-20260712` |
| reviewerRole | `sqlite_dsl_machine` |
| independentFromWorker | `true` |
| verdict | `rejected` |
| open P0 / P1 / P2 | `0 / 2 / 0` |

本轮不能签收。模型、字段、关系、DSL 展开、SQLite 解析、Task/Outbox/Purge 注册表以及大部分高风险状态机已经闭合，但仍有两个可复现的 P1：

1. 三类未终结对话记录可在 active Project 下直接 `DELETE`，绕过既定终结协议和审计历史。
2. review bundle 的最终重验仍是逐文件串行，先重验的文件可在函数返回前被同 inode 等长改写，而 loader 仍返回旧的已解析事实。

按门禁规则，存在任一 open P1 时必须 `rejected`，`migrationGenerationAllowed` 必须保持 `false`。

## 2. 独立性与复核边界

- 从当前权威 Markdown、固定 manifest 和受控 TypeScript source 重新开始复核，没有沿用 r1 的签收结论。
- 未读取、未引用 `contract_consistency` 角色的 r2 报告、attestation 或结论。
- 未修改 Worker 源码、契约、manifest、测试或任务文档；本角色只写本报告与对应 attestation。
- 复核对象包括 source allow-list 与摘要、模型/字段/关系、195 个 CHECK、194 个 trigger、Task/Outbox/Purge 注册表、真实 SQLite 行为、source/effective 双摘要、review bundle 读取边界和 derived review gate 基础协议。
- `schema.prisma` 与 migration 尚未实现，`SCH-00` tracer 的单个 Red 仅作为阶段边界确认，不作为本轮新增 finding。

## 3. 固定输入与机器清点

### 3.1 Source 与 manifest 绑定

独立只读脚本按固定顺序重算两份 Markdown 与 16 个 TypeScript source 的 SHA-256，逐项与 `sourceDocuments` 比较，并独立实现 UTF-16 key 升序的 JCS-compatible canonicalization。结果：

```text
SOURCE_DIGEST_INDEPENDENT_OK
sourceCount=18
manifestDigest=sha256:2fef00a5c016b48784db675fb9e88778c6e073dd6e0798c0c0fdbbeb2b5d279f
issues=[]
```

官方只读校验同样通过：

```text
G1_SCHEMA_MANIFEST_OK apps/server/prisma/contracts/g1-schema-manifest.json sha256:2fef00a5c016b48784db675fb9e88778c6e073dd6e0798c0c0fdbbeb2b5d279f
```

base artifact 仍为 `ready_for_scrutiny`、`0/2 pending`、`migrationGenerationAllowed=false`，没有把双审状态写回受摘要约束的 base manifest。

### 3.2 模型、字段与关系

独立 Markdown parser 重新解析 44 个模型标题和 556 条字段定义，并逐项比较模型顺序、table、migration、字段顺序、逻辑名、物理列、类型、nullability、default、PK、unique、index、FK target/action、relation navigation 与 String classification。结果：

```text
INDEPENDENT_MODEL_CONTRACT_OK
models=44 scalarFields=556 primaryKeys=44
uniqueConstraints=70 indexes=60
foreignKeys=105 relationFields=210 stringFields=356
issues=[]
```

### 3.3 CHECK / trigger DSL 重新展开

不是只比较物理 key；复核脚本直接调用六个当前 DSL source builder，从 template + args 重展开并与 manifest 的 frozen templateSources 和完整 effective constraints 逐字比较：

| 分区 | bindings | 新增/effective 定义 |
| --- | ---: | ---: |
| `check-base-v1` | 125 | 125 base CHECK |
| `check-gap-v1` | 70 | 70 gap CHECK |
| `trigger-core-a-v1` | 39 | 36 新增 trigger，3 个 base 重展开 |
| `trigger-core-b-v1` | 67 | 67 trigger |
| `trigger-runtime-a-v1` | 34 | 33 新增 trigger，1 个 base 重展开 |
| `trigger-runtime-b-v1` | 54 | 52 新增 trigger，2 个 base 重展开 |

```text
DSL_REEXPANSION_OK
effectiveChecks=195
effectiveTriggers=194
completenessIssues=[]
```

另行检查了 physical key 唯一性、template/version/argsKeys 精确匹配、binding exactly-once、UPDATE OF 列存在、`order/index` 引号、空 SQL、placeholder、固定 `AIR_G1:<trigger>` RAISE literal 与 `normalizedSql` 重组，结果：

```text
DSL_INVARIANTS_OK
models=44 checks=195 triggers=194
checkBindings=195 triggerBindings=194
issues=[]
```

把 556 个物理列、195 个 CHECK 与 194 个 trigger 装入真实 SQLite 松表，全部成功解析：

```text
SQLITE_DSL_PARSE_OK|44|194
```

### 3.4 注册表

TaskPolicy、OutboxHandler、PurgeOwnership 与非 TaskPolicy 的 domain registry 均从当前 source builder 重建并与 manifest 深比较；随后独立检查 exact root keys、codec strictness、target/source owner、retry、lease、binding coverage 和 purge guard table/event/name：

```text
REGISTRY_INVARIANTS_OK
taskPolicies=10 outboxHandlers=5 purgeEntries=44
targetTypes=8 sourceTypes=18
purgeClasses={global_or_cross_project:9,project_history_or_cascade_root:25,project_private_child:8,project_ephemeral_state:2}
issues=[]
```

33 个 project-owned history/private-child guard 的 SQL 都包含 Project deleting、processed `project.delete_files` Outbox 和无 active runtime task 三项数据库事实：

```text
PURGE_GUARD_FACTS_OK
checked=33
issues=[]
```

该机械结果只证明 guard 定义中存在三项事实，不证明其 `WHEN` 覆盖所有必须拒绝的状态；P1-01 正是后一类语义缺口。

## 4. Findings

### 4.1 `G1-R2-SQLITE-P1-ACTIVE-DIALOGUE-DELETE-BYPASS` — P1 open

#### 现象

以下三个 DELETE trigger 的 `WHEN` 只覆盖 terminal 状态：

| 表 | trigger | 实际 `WHEN` | 未被覆盖的状态 |
| --- | --- | --- | --- |
| `conversation_messages` | `trg_conversation_messages_terminal_immutable_delete` | `OLD.status IN ('completed', 'failed')` | `running` |
| `dialogue_runtime_sessions` | `trg_dialogue_runtime_sessions_terminal_immutable_delete` | `OLD.status IN ('archived', 'closed')` | `active` |
| `pending_dialogue_artifacts` | `trg_pending_dialogue_artifacts_terminal_immutable_delete` | `OLD.status IN ('applied', 'discarded', 'superseded', 'expired')` | `pending` |

source 位置：

- `apps/server/src/persistence/g1-schema-trigger-dsl-runtime-a.ts:394-400`
- `apps/server/src/persistence/g1-schema-trigger-dsl-runtime-a.ts:437-443`
- `apps/server/src/persistence/g1-schema-trigger-dsl-runtime-a.ts:493-499`

当 `WHEN` 为 false 时，trigger body 中完整的三事实 purge predicate 根本不会执行。因此 active Project 下可以直接删除这些未终结记录。

#### 真实 SQLite 反例

复核脚本创建 44 张 loose authority table，插入 active Project、ConversationThread，以及 running/active/pending 三行，安装 manifest 中对应 DELETE trigger 后直接执行 DELETE：

```json
{"table":"conversation_messages","deleteError":null,"remaining":0}
{"table":"dialogue_runtime_sessions","deleteError":null,"remaining":0}
{"table":"pending_dialogue_artifacts","deleteError":null,"remaining":0}
```

#### 契约冲突与影响

- `conversation_messages` 的 running assistant 应通过 `running→completed|failed` 唯一终结；进程中断也应写 `DIALOGUE_STREAM_INTERRUPTED` 失败证据。直接 DELETE 丢失流式消息审计。
- `dialogue_runtime_sessions` 的唯一迁移是 `active→archived|closed`；外部 session 失效后保留旧行并新建另一行。直接 DELETE 可绕过该历史保留。
- `pending_dialogue_artifacts` 明确要求替换 active pending 时先 `superseded` 再插新行，并明确写明 `activeSlotKey` 不得靠 delete 绕过。当前直接 DELETE 正好绕过该约束。
- 权威依据见 `G1数据库Schema实施契约.md:920-921,965,991-992,1589-1598`。

#### 必须修复

DELETE 门禁需要对这些表 fail-closed。至少应保证 running/active/pending 在普通路径不可删除；若删除只允许协调 purge，则 `WHEN` 应覆盖所有状态，并在 body 中验证完整 purge 三事实。修复后必须增加真实 SQLite 负例：

1. active Project 下三种未终结状态的直接 DELETE 全部 ABORT；
2. 不完整 purge 三事实仍 ABORT；
3. 三事实齐全的协调 purge 按显式删除顺序成功；
4. pending artifact 只能先转 terminal，不能通过 DELETE 释放 active slot。

### 4.2 `G1-R2-SQLITE-P1-REVIEW-BUNDLE-FINAL-SNAPSHOT-RACE` — P1 open

#### 现象

`validateBundleFilesUnchanged()` 在 `apps/server/src/persistence/g1-schema-review-bundle.ts:623-698` 中按 entry 串行执行：重开、读取、hash、post-stat，然后关闭当前 handle，再验证下一个文件。`loadG1SchemaReviewBundleV1()` 在 `:864-871` 完成该循环后只再次校验 round directory identity/entries，并返回第一次解析出的 `outcome.value.bundle`。

这意味着文件 A 通过最终重验并关闭后，在文件 B/C/D 的最终重验期间，A 仍可被同 inode 等长改写。此类 in-place rewrite 不改变 round directory 的 entry set 或 directory metadata；循环不会回到 A，函数仍返回 A 的旧解析事实。

#### 可复现反例

使用临时 workspace 构造合法四文件 bundle；两份 report 接近 5 MiB 以稳定放大最终串行窗口。在读取最后一个 report 的测试 hook 中安排定时等长改写第一个 attestation，仅把 canonical JSON 中同长度的 reviewerId 从 `reviewer-contract-a` 改为 `reviewer-contract-b`。结果：

```text
delay=2ms  -> REJECTED G1_SCHEMA_REVIEW_BUNDLE_FILE_CHANGED
delay=4ms  -> REJECTED G1_SCHEMA_REVIEW_BUNDLE_FILE_CHANGED
delay=6ms  -> RETURNED, mutationBeforeReturn=true, returnedReviewer=reviewer-contract-a, fileIsMutated=true
delay=8ms  -> RETURNED, mutationBeforeReturn=true, returnedReviewer=reviewer-contract-a, fileIsMutated=true
delay=10ms -> RETURNED, mutationBeforeReturn=true, returnedReviewer=reviewer-contract-a, fileIsMutated=true
```

6/8/10ms 三次都证明：mutation 在 loader 返回前完成；返回对象仍是旧 reviewerId；路径上的 attestation 已是新 canonical bytes。

现有 `g1-schema-review-bundle.spec.ts` 的 39 个用例会在初次 load 的 later-file hook 中改写 earlier file，因而能被随后开始的 final loop 捕获；它没有在 final loop 已验证第一个 entry 后再改写该 entry，所以 39/39 Green 没有覆盖上述窗口。

#### 影响

derived gate 可在 bundle 路径事实已经改变时继续消费旧 attestation/report facts；“全部首读后逐文件 secure reopen”不能等价为一个不可变的最终 bundle snapshot。该缺口位于双审门禁的信任边界，属于 P1。

#### 必须修复

需要先明确并实现可证明的发布/读取原子边界，不能只再增加一次同样的串行循环。可选方向包括：

- 将四个逻辑文件发布为一个 canonical immutable bundle，由单文件安全 open/read/hash 形成门禁输入；或
- 对 review round 使用可验证的独占锁/不可变发布协议，写入者只能通过完整临时目录原子发布，reader 在锁和目录 generation 下读取；或
- 采用等价的内容寻址不可变对象，使 gate 返回值绑定一个不会被原地改写的 bundle identity。

同时增加确定性 regression seam：在 final validation 的第一个 entry 已完成后改写该文件，旧实现必须 Red，修复后必须 fail-closed 或返回新不可变 snapshot 的事实。

## 5. 已通过的高风险语义

除上述 findings 外，本角色从当前 SQL 重新检查并在真实 SQLite 中验证了以下行为，没有发现其他 open P0/P1/P2：

- Outbox：pending claim、heartbeat、expired recovery、reclaim、processed/failed 终结与 terminal freeze；state-transition OR 已完整括号化。
- Storyboard：使用 `json_each.type` 拒绝非 string token；V1 resolved token 必须绑定 Character；仅 unresolved V1 可保留 null；V2 不允许 unresolved；空 `characterIds` 与零 child 合法。
- sealed child：Story Scene/Beat、Storyboard Shot/Character、ExportArtifact 的 parent FK 不可重绑。
- Layout：要求 canvases/elements array；允许纯文字零 binding；拒绝 partial/null provenance；完整 binding 与文档精确投影；Candidate/Lock/Asset 必须构成同一 provenance chain。
- Task finish：Project deleting 时 Attempt `succeeded` 不能把 Task materialize 为 succeeded；`maxAttempts` 表示总次数；最终失败清空 `nextRunAt`。
- source/effective 双摘要：final migration success 要求严格 lowercase effective digest 和 source identity；PersistenceState 分别绑定 run source 与 verification effective，可接受二者不同，激活后两者不可改写。
- purge：8 个本轮补齐的空 root guard 在 active Project 下均拒绝；只有 Project deleting + processed delete-files Outbox + 无 active runtime task 才允许。
- Credential：`clearing` 不能回跳 configured/rotating/error，只能凭 processed old-ref 证据进入 ref/fingerprint 全空的 unconfigured。

## 6. 验证命令与结果

### 6.1 完整非 tracer suite

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

结果：`8 passed / 128 passed`。其中既有 SQLite suite 为 `33/33`，bundle suite 为 `39/39`。两个 open P1 均由现有 suite 未覆盖的新反例触发，因此既有 Green 不改变本轮 rejected 结论。

### 6.2 类型与 manifest

```bash
corepack pnpm --filter @airoaming/server typecheck
corepack pnpm --filter @airoaming/server g1:manifest:check
git diff --check
```

结果：全部 exit 0；manifest digest 精确为本报告固定 digest。

### 6.3 SCH-00 阶段 tracer

```bash
corepack pnpm --filter @airoaming/server exec vitest run src/persistence/schema-contract.spec.ts
```

结果：精确 `1 passed / 1 failed`；唯一 Red 是当前 `PersistenceState` 只有 `id`，缺 `storageContractVersion/activationState/firstBusinessWriteAt`。这与 Handoff 的“Pass 2 已就绪、Schema 尚未实现”阶段边界一致。

## 7. 最终判定

```text
verdict=rejected
openP0=0
openP1=2
openP2=0
migrationGenerationAllowed=false
```

必须先修复 P1-01 与 P1-02、补充对应真实 SQLite/TOCTOU regression，并在新的固定 manifest digest/review round 下重新进行两名独立 reviewer 的完整复核；不能沿用本轮 attestation 改成 accepted。
