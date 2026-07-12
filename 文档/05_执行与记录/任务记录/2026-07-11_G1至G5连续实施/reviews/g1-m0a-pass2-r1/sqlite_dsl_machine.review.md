---
doc_id: AIR-REVIEW-G1-M0A-PASS2-SQLITE-20260712
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G1 M0-A Pass 2 digest-bound SQLite DSL 与 machine 独立复核
---

# G1 M0-A Pass 2 SQLite DSL 与 machine 独立复核

## 1. 结论

**结论：rejected。**

本轮复核绑定：

| 项 | 值 |
| --- | --- |
| review round | `g1-m0a-pass2-r1` |
| reviewer id | `codex-scrutiny-sqlite-20260712` |
| reviewer role | `sqlite_dsl_machine` |
| manifest digest | `sha256:5496ddcd51d62d6a4f9a5e92856e0dfd881b29d3d3e90d7ee0a024323873f39e` |
| 独立于 Worker | 是 |
| open finding | 2 个 P0、8 个 P1 |

清单的来源绑定、模型/字段/FK/索引库存、CHECK/trigger binding 完整性、Task/Outbox 注册表机械字段和 SQL 可解析性均通过复核；但真实语义审计发现两个会阻断合法核心路径的 P0，以及八个会放宽契约或破坏 fail-closed 保证的 P1。按门禁规则，只要存在 open P0/P1，本角色不得给出 `accepted`。

## 2. 审查边界与方法

本角色只复核固定 digest 对应的 Pass 2 source-first machine manifest、其权威源数据、SQLite DSL 展开结果、Task/Outbox registry，以及 review parser/bundle/gate。未把尚未落地的 `schema.prisma`、migration SQL 或 fresh SQLite 当成已经交付的证据。

主要方法：

1. 重新计算 18 个 `sourceDocuments` 文件摘要、精确 allowlist 和 manifest 自摘要。
2. 不依赖待测 Prisma Schema，从实施契约 Markdown 独立解析 44 个模型、555 个 scalar field，并逐项比对物理表、字段顺序、类型、nullability、默认值、PK、unique、index、FK 和 relation navigation。
3. 从权威 builder 重新展开 195 个 CHECK binding 和 185 个 trigger binding，检查 template/version/args、规范化 SQL、物理 key、错误码和来源映射。
4. 将 44 张合成表及全部 185 个 trigger 交给 SQLite 3.51.0 实际 `CREATE`，确认 DSL 可解析；随后构造合法状态转换和对抗性直写，检查契约语义而不只检查字符串。
5. 独立核对 10 个 Task policy、8 个 target type、18 个 source type、5 个 Outbox handler 的机械字段与固定重试/租约规则。
6. 审阅 attestation parser、bundle loader、gate evaluator 和 CLI，并构造文件竞态验证 fail-closed 边界。

## 3. 通过的机械核对

| 核对项 | 结果 | 证据摘要 |
| --- | --- | --- |
| source allowlist | 通过 | 18/18，零缺失、零额外、零重复；4 个生产 review verifier source 已入摘要 |
| manifest digest | 通过 | 独立 JCS-compatible 重算与固定 digest 完全一致 |
| 模型库存 | 通过 | 44 model、555 scalar field、44 PK |
| 关系库存 | 通过 | 70 named unique、60 non-unique index、105 FK、210 relation field；105 组关系均恰好一条 outbound 与一条 inverse |
| CHECK binding | 通过 | 195/195，物理 key 唯一、无 orphan/duplicate/missing；展开结果与 manifest 逐字一致 |
| trigger binding | 通过 | 185/185，物理 key 和 185 个 `AIR_G1:<trigger>` 错误码唯一；无空 body、`WHEN 0`、TBD/placeholder |
| SQL 语法 | 通过 | `SQLITE_DSL_PARSE_OK|44|185`；保留字 `order/index` 均按契约引用 |
| Task registry | 通过 | 10 policy、20 个 strict input/output codec、8 target、18 source；lease=60、heartbeat=15、backoff 精确 |
| Outbox registry | 通过 | 5 handler、5 个 strict payload codec；maxAttempts=3、backoff=`[5,30]`、lease=60、heartbeat=15 |
| 现有自动测试 | 通过 | 7 个 spec 文件、92 个测试全部通过 |
| 类型检查 | 通过 | `@airoaming/server` TypeScript `--noEmit` 通过 |
| patch whitespace | 通过 | `git diff --check` 退出 0 |

上述通过项证明 source-first 清单的机械完整性较好，但不能抵消下面的可复现状态机和不可变性漏洞。现有 92 个测试全部绿色也说明这些漏洞尚未被当前测试覆盖。

## 4. 阻断发现

### G1-SQL-OUTBOX-TERMINAL-PRECEDENCE — P0 / open

`trg_outbox_events_processed_immutable` 的第三个拒绝谓词是：

```sql
OLD.status IN ('processed', 'failed') AND NEW.status IS NOT OLD.status
OR NEW.attempt IS NOT OLD.attempt
OR NEW.available_at IS NOT OLD.available_at
OR NEW.lease_owner_id IS NOT OLD.lease_owner_id
OR NEW.lease_token IS NOT OLD.lease_token
OR NEW.lease_expires_at IS NOT OLD.lease_expires_at
OR NEW.last_error_json IS NOT OLD.last_error_json
OR NEW.updated_at IS NOT OLD.updated_at
OR NEW.processed_at IS NOT OLD.processed_at
```

SQLite 中 `AND` 优先于 `OR`。因此只有第一个状态比较受 `OLD.status IN ('processed','failed')` 限定，其余字段比较会对所有旧状态生效。合法 `pending→processing` 必须增加 attempt、写 lease 并更新 `updated_at`，因而必然被该 trigger 拒绝；heartbeat、retry 和 processing→processed 也同样被阻断。

真实 SQLite 复现的合法 claim 得到 `AIR_G1:trg_outbox_events_processed_immutable`。这不是边缘放宽，而是五类 Outbox handler 的 claim/heartbeat/completion 全部不可用，故为 P0。

要求修正：把整个 terminal immutable 字段集合放进括号，或把 terminal 保护拆为 `WHEN OLD.status IN (...)` 的独立 trigger；增加 pending→processing→heartbeat→processed、processing→pending recovery、terminal mutation 拒绝的真实 SQLite 正反例。

### G1-SQL-STORYBOARD-CHARACTER-JSONTYPE — P0 / open

`trg_storyboard_versions_formalize_guard` 遍历 `$.characterIds` 时使用：

```sql
json_type(character_json.value) <> 'text'
```

`json_each` 对 JSON string 元素暴露的 `value` 是已解包的 SQL TEXT，例如一个 UUID，而不是带引号的 JSON 文本。把它再次送入单参数 `json_type()` 会尝试把 UUID 当 JSON 文档解析并抛出 `malformed JSON`。正确的类型列是 `character_json.type`。

真实 SQLite 复现中，一个含合法非空 `characterIds` 的 pending Storyboard 在确认时直接得到 `malformed JSON`。因此正常 Storyboard formalization 主路径被阻断，故为 P0。

要求修正：使用 `character_json.type <> 'text'`，并增加 characterIds 为空、一个有效 Character.id、一个 legacy role token、非法非字符串元素、V2 未解析 token 的真实 SQLite 用例。

### G1-SQL-SEALED-CHILD-REPARENT — P1 / open

以下 child UPDATE guard 只检查 `NEW` parent 是否 formal/ready：

- `trg_story_scene_projections_parent_formal_update`
- `trg_story_beat_projections_parent_formal_update`
- `trg_storyboard_shot_projections_parent_formal_update`
- `trg_storyboard_shot_characters_parent_formal_update`
- `trg_export_artifacts_parent_ready_update`

这允许把 child 从 confirmed/archived 或 ready parent 改挂到同 scope 的 pending/unready parent。由于 `NEW` parent 尚未 sealed，guard 不触发；原 sealed parent 随即丢失它在确认/ready 时被证明完整的集合。

真实 SQLite 复现得到：

```text
FORMAL_REPARENT_BYPASS|pending
READY_ARTIFACT_REPARENT_BYPASS|queued
```

要求修正：parent FK 应从 INSERT 起不可变，或 UPDATE 时同时保护 `OLD` 与 `NEW` 任一 formal/ready parent；为五类 child 增加从 sealed parent 移出的负例。

### G1-SQL-STORYBOARD-V1-RESOLUTION — P1 / open

契约规定：V1 token 若命中同 Project 的 `Character.id`，child `characterId` 必须等于该 Character；只有未命中 Character 的 legacy role token 才能保留 null。当前条件却是：

```sql
NEW.schema_version = 1
AND (
  shot_character.character_id IS NULL
  OR EXISTS (... character.id = character_json.value ...)
)
```

因此，即使 token 明确解析到 Character，`character_id=NULL` 也会通过。它把“未解析 legacy 例外”错误扩大为“V1 永远可空”，破坏 formal projection 的直接映射证据。

要求修正：分支应表达“命中时必须精确绑定；仅在不存在同 Project Character 命中时才允许 null”，并为命中/non-match/V2 三类 token 建正反例。

### G1-SQL-LAYOUT-SEAL-PROVENANCE — P1 / open

Layout seal 存在一组共同指向“来源投影并未被完整证明”的缺口：

1. `layout_document_v1` 分支未要求 `json_type(document,'$.canvases')='array'`，缺失或错误类型可被当作零条投影并 seal。
2. panel/free-image 的 source-backed 元素没有要求 shot/candidate/candidateLockRevision/asset/sourceDigest 全部非空；现有 shape 允许只保存 asset/digest。
3. `legacy_chapter_layout_v1` 的 `sourceResolution='complete'` 没有强制每项 relational ID 全部非空。
4. `trg_layout_source_bindings_scope_insert/update` 分别验证 Candidate 与 Asset 的 scope/ready，但没有验证 `candidate.asset_id = binding.asset_id`；因此 Candidate/Lock 可以属于 Asset A，binding 同时指向同 scope 的无关 ready Asset B。

这些路径都能让 `bindingSetSealedAt` 表示“已完整验证”，而来源链实际不完整或互相矛盾。

要求修正：冻结 document kind 的顶层数组形状；source-backed 元素与 complete legacy binding 强制全字段；scope trigger 增加 Candidate/Lock/Asset 同一条 provenance chain；增加 missing canvases、partial source、complete+null、candidate/asset mismatch 的 SQLite 负例。

### G1-SQL-DELETING-TASK-SUCCESS — P1 / open

契约要求 owner Project 进入 deleting 后，running task 的 recovery/finish 只能收敛 cancelled/failed，不能成功或重试。`trg_task_attempts_finish_materialize` 当前先执行：

```sql
CASE
  WHEN NEW.outcome = 'succeeded' THEN 'succeeded'
  WHEN NEW.outcome = 'cancelled' THEN 'cancelled'
  WHEN NEW.outcome IN ('failed', 'interrupted') AND ... Project active ...
    THEN 'retrying'
  ELSE 'failed'
END
```

Project active 检查只保护 retry 分支；`NEW.outcome='succeeded'` 在 Project deleting 时仍直接物化为 Task succeeded。`finish_validate` 也没有为该分支补充 owner lifecycle 拒绝。

要求修正：finish 的所有结果先按 owner Project lifecycle 分流；deleting 时把 succeeded/interrupted/failed 收敛到契约允许的 cancelled/failed，并增加“claim 后 Project deleting、随后 outcome=succeeded”的负例。

### G1-SQL-MIGRATION-EFFECTIVE-DIGEST — P1 / open

`MigrationVerificationV1` 契约要求 final succeeded run 的 verification object 必须包含合法 `effectiveSchemaManifestDigest=sha256:*`，并由 trigger 检查。当前 `trg_migration_runs_state_transition` 检查 integrity、FK、failed ledger、checksum、`sourceManifestDigest` 和 open blocker，却完全没有读取或校验 `effectiveSchemaManifestDigest`。

仓库中该 key 只出现在人类契约，不在 manifest SQL/binding 中。于是缺少有效 schema 摘要的 final run 可以进入 succeeded，并继续成为 Persistence activation 的依据。

要求修正：在 verification trigger 中检查 key 存在、JSON type、完整 sha256 格式，并与 activation 所使用的 effective manifest 身份建立精确等值关系；增加缺字段、错格式、错 digest 的负例。

### G1-REVIEW-BUNDLE-FINAL-SNAPSHOT-TOCTOU — P1 / open

`readBundleFile()` 会对“当前正在读取的单个文件”做 pre-open/open/post-read 的 dev/ino/size/mtime/ctime/nlink 检查；但读取下一个文件后，loader 不再复验先前已经关闭的文件。最终 `validateRoundRootUnchanged()` 只复核 round directory 的 dev/ino、canonical path 和 entry names，不复核每个文件的最终 identity/metadata/digest。

对测试 hook 做竞态注入：在后续 report 即将打开时，给已经验证并关闭的 attestation 追加空白。loader 仍返回 accepted 的已读对象，而磁盘上的 attestation 已变成非 canonical JSON：

```json
{"loaderAccepted":true,"loadedReviewer":"audit","diskNowNonCanonical":true,"changed":true}
```

因此 bundle 并非从一个保持到函数返回时的稳定快照得出，可能评估已经不再对应磁盘 bundle 的旧字节。

要求修正：capture 时保存四个文件的 identity/metadata，全部读取后逐个重新 lstat/fstat/digest 复验；或在同一受控目录 fd/snapshot 语义下保持句柄并在返回前复核。增加“修改先读 attestation/report”“原位追加”“rename replace”“swap/restore”的竞态负例。

### G1-SQL-PURGE-ROOT-GUARDS-INCOMPLETE — P1 / open

契约 12.4 明确要求穷尽“自身为历史根”或“DELETE 会 Cascade 私有历史”的父表，至少覆盖 Character/Scene/Visual、Conversation/Tool/Pending 等，且不得依赖某个恰好存在的 child trigger。

manifest 中 `characters`、`chapter_scenes`、`scene_visuals`、`character_visuals`、`shots` 和 `conversation_threads` 均没有任何 DELETE trigger。于是 active Project 下的空 Character/Scene/Visual/Shot/Thread 可直接删除；ConversationThread 还具有多个 `onDelete=Cascade` 子关系，空 thread 或只含未触发 terminal-delete guard 的子树可绕父删除。

要求修正：为每个历史根/私有 cascade parent 增加沿 owner 链验证三条件的 DELETE guard，重新对 44 模型 FK/owner graph 做闭包核对；增加 active 空 root、active 带 child、deleting 但缺 event、存在 active task、三条件全满足的正反例。

### G1-SQL-CREDENTIAL-CLEAR-REVERT — P1 / open

Credential 生命周期冻结为 configured→clearing（同事务存在 delete-old-ref intent）→unconfigured（匹配 event processed 后清 ref/fingerprint）。当前 `trg_credential_metadata_secret_ref_update` 保护进入 clearing 和最终清 ref，但没有拒绝 `clearing→configured` 且保留同一旧 ref/fingerprint。

真实 SQLite 复现：创建匹配 pending `secret.delete_old_ref`，合法进入 clearing，然后直接改回 configured，结果为：

```text
CREDENTIAL_CLEAR_REVERT_BYPASS|configured|1|1
```

如果外部 SecretStore 删除已发生而 fenced completion 尚未提交，该直写可让 metadata 回到 configured 并继续指向已删除 ref，同时使 handler 的 “仍为 clearing+old” completion 前置失败。

要求修正：增加显式 Credential status transition trigger；clearing 只允许保持 clearing，或在匹配 processed 证据下进入 unconfigured 并同步清空 ref/fingerprint；增加清理中回退、跳转 rotating/error/configured 的负例。

## 5. 高风险域审计摘要

| 域 | 结论 |
| --- | --- |
| Persistence singleton / activation | singleton、删除重插、首激活/首写、run/digest identity 基本闭合；但 final migration verification 缺 effective digest，见 P1 |
| Asset ever-ready | ready transition、ready core immutable、missing/deleting 与 delete guard 基本闭合 |
| Task/Attempt/Slot/Source | claim、heartbeat、fencing、slot 与 source seal 主结构基本闭合；Project deleting 后 succeeded 分支错误，见 P1 |
| Outbox | registry 完整；terminal trigger 运算符优先级令合法运行闭环整体不可用，见 P0 |
| Story/Storyboard projection | 计数/顺序/owner 映射主体存在；Storyboard character formalization 有 P0 与 V1 resolution P1，child reparent 另有 P1 |
| Layout/Export | append-only、ready 形状主体存在；layout provenance seal 与 ready artifact reparent 有 P1 |
| Credential | owner/ref 格式和清空证据主体存在；clearing 可回退，见 P1 |
| 受控 purge | Project/Chapter 与许多历史 leaf 有三条件；若干 root/cascade parent 未覆盖，见 P1 |
| Review parser/gate | schema、role、digest、round、report digest、duplicate、P0/P1/P2 和 2/2 规则实现齐全；bundle 最终快照有 TOCTOU，见 P1 |

## 6. 验证命令与结果

```text
corepack pnpm --filter @airoaming/server g1:manifest:check
PASS；digest=sha256:5496ddcd51d62d6a4f9a5e92856e0dfd881b29d3d3e90d7ee0a024323873f39e

独立模型/字段/FK/relation 比对
PASS；44/555/44/70/60/105/210，零差异

独立 binding 重展开
PASS；CHECK 195/195，trigger 185/185

SQLite 3.51.0 合成 schema + trigger CREATE
PASS；SQLITE_DSL_PARSE_OK|44|185

registry mechanics
PASS；REGISTRY_MECHANICS_OK；10 Task / 8 target / 18 source / 5 Outbox

corepack pnpm --filter @airoaming/server exec vitest run \
  src/persistence/g1-schema-manifest.spec.ts \
  src/persistence/g1-schema-model-source.spec.ts \
  src/persistence/g1-schema-constraint-source.spec.ts \
  src/persistence/g1-schema-domain-registry-source.spec.ts \
  src/persistence/g1-schema-review-attestation.spec.ts \
  src/persistence/g1-schema-review-bundle.spec.ts \
  src/persistence/g1-schema-review-check.spec.ts
PASS；7 files / 92 tests

corepack pnpm --filter @airoaming/server typecheck
PASS

git diff --check
PASS
```

报告与 attestation 固化后的 parser/bundle/review-check 结果不回写本报告，以避免报告 digest 与 attestation 形成循环变更；最终命令结果由本轮交付终端证据记录。

## 7. 复核边界与退出条件

本轮只证明固定 digest 的 Pass 2 machine source。它不证明未来 `schema.prisma`、0001～0008 migration SQL、两个 fresh deploy、真实 sqlite_master drift、integrity/FK check 或完整用户路径已经通过；这些仍属于后续实施/运行证据。

重新送审前至少需要：

1. 修复并关闭本报告全部 open P0/P1。
2. 为每项发现增加真实 SQLite 正反例，避免只做字符串断言。
3. 重新生成 manifest、产生新的 digest，并以新的 review round 重新取得两个独立角色 attestation。

