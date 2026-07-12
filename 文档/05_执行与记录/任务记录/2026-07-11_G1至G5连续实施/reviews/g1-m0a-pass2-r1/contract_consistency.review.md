---
doc_id: AIR-REVIEW-20260712-G1-M0A-PASS2-CONTRACT-CONSISTENCY
status: rejected
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: orchestrator, scrutiny-reviewer, developer, qa
source: G1 M0-A Pass 2 固定摘要、G1 至 G5 正式方案/契约/验收清单与 Worker Handoff
review_round_id: g1-m0a-pass2-r1
manifest_digest: sha256:5496ddcd51d62d6a4f9a5e92856e0dfd881b29d3d3e90d7ee0a024323873f39e
reviewer_id: codex-scrutiny-contract-20260712
reviewer_role: contract_consistency
verdict: rejected
---

# G1 M0-A Pass 2 契约一致性独立复核

## 1. 复核结论

本轮结论为 `rejected`。

固定 manifest 的摘要、库存、source-only 重建、review bundle 协议与 fail-closed 机制本身均通过机械复核；Worker Handoff 对“尚未展开 Prisma Schema、尚未生成 migration、SCH-00 保持 Red、没有执行生产切换”的描述也与当前事实一致。

但跨文档复核仍发现 **5 个 open P1** 和 **2 个 open P2**。其中 5 个 P1 分别涉及：

1. `story_parse/shot_generate` 的 Task target 与 `expectedTargetField` 存在不可满足约束；
2. G1 retry/backoff 仍同时存在 `[5,30]` 与 `[5,30,120]` 两套时序；
3. legacy Preflight 的“保留历史确认记录”与“不插入 PreflightRevision”相冲突；
4. G4 `CandidateLockSetSummary.sourceApplicability` 的 TypeScript nullability 与正文/验收相冲突；
5. G5 正式 LayoutRevision 的编号事务漏掉强制 seal，随后又要求立即切 current。

依据固定 review 协议，任一 current review 存在 open P0/P1 即不得放行 migration generation。因此本报告不接受当前摘要进入 0001～0008 migration 生成；修订来源后必须重新生成 manifest、形成新摘要并重新双审，不能只改 derived gate 或本证明。

## 2. 独立性与复核边界

- Reviewer：`codex-scrutiny-contract-20260712`
- Role：`contract_consistency`
- Round：`g1-m0a-pass2-r1`
- 固定摘要：`sha256:5496ddcd51d62d6a4f9a5e92856e0dfd881b29d3d3e90d7ee0a024323873f39e`
- 本 Reviewer 未参与本轮 Worker 的契约或 manifest 编写，未修改被审文档、Schema、migration、业务代码、真实 workspace、SQLite、SecretStore 或生产配置。
- 本轮只创建本角色的 report 与 attestation；没有读取或代写另一 Reviewer 的结论。
- 复核对象是“当前文档与固定 manifest 是否足以无歧义地指导后续实施”，不是宣称 G1 Schema 或 G2～G5 功能已经实现。

## 3. 固定基线与机械证据

### 3.1 Manifest 身份与库存

`g1:manifest:check` 对当前 source 重建通过，输出固定摘要与本轮输入一致。抽查 manifest 与 Handoff 后确认：

| 项目 | 当前值 | 结论 |
| --- | ---: | --- |
| sourceDocuments | 18 | 两份权威 Markdown + 16 个 allowlist TypeScript source；review sidecar/spec 不入摘要 |
| models / scalar fields | 44 / 555 | 与 Handoff 一致 |
| FK / relation navigation | 105 / 210 | 与 Handoff 一致 |
| PK / named unique / named index | 44 / 70 / 60 | 与 Handoff 一致 |
| CHECK definition / binding | 195 / 195 | completeness 无 orphan/missing/duplicate |
| trigger definition / binding | 185 / 185 | completeness 无 orphan/missing/duplicate |
| TaskPolicy / OutboxHandler | 10 / 5 | 条目数量完整，但数量完整不等于语义无冲突 |
| completeness | ready=true, issueCount=0 | 结构完整性通过 |
| base review gate | 0/2, pending, false | 按设计保持 immutable；真实结论由 derived gate 计算 |

### 3.2 Review 协议

以下定向 suite 通过：

```text
g1-schema-manifest.spec.ts
g1-schema-review-attestation.spec.ts
g1-schema-review-bundle.spec.ts
g1-schema-review-check.spec.ts
```

结果为 `4 files / 83 tests` 全部通过。它覆盖固定 round、两角色、不同 reviewerId、report digest、canonical JSON、source/report stale、tamper、unknown file、symlink/hardlink/type/size、目录与文件替换、open P0/P1、rejected verdict、0/1 pending 与精确 2/2 accepted。Server typecheck 与 `git diff --check` 同样通过。

本 Reviewer 开始复核时，真实 `g1:manifest:review-check` 为：

```text
receivedReviews=0
acceptedReviews=0
status=pending
migrationGenerationAllowed=false
exit=1
```

这与 Handoff 一致，不是故障。当前报告为 rejected，装载本证明后 derived gate 应继续 fail closed。

### 3.3 SCH-00 与 Handoff 真实性

`schema-contract.spec.ts` 结果为 `1 passed / 1 failed`，失败精确落在 `PersistenceState` 当前只有 `id`、缺少 `storageContractVersion/activationState/firstBusinessWriteAt`。这证明：

- 当前只完成了 Pass 2 契约/manifest 准备；
- 44 模型的 555 字段尚未展开到 Prisma Schema；
- migration 尚未生成；
- Handoff 没有把 manifest ready 冒充 Schema ready。

## 4. 阻塞发现（P1）

### 4.1 `G1-CONTRACT-P1-TASK-TARGET-BINDING`：G2 两类任务的 target 映射不可满足

**状态：open / P1**

证据：

- `文档/04_方案与决策/2026-07-11_G1任务与Outbox实施注册表.md:67-68` 把 `story_parse/shot_generate` 的 `GenerationTask.target` 固定为 `chapter → Chapter.id`，同时把 `input.expectedTargetId` 固定为 active pending Story/StoryboardVersion ID。
- 同文件 `:101-108` 又规定：只要 `expectedTargetField` 非空，codec 的同名字段必须与 `target.id` 完全相等；两类任务的字段均是 `expectedTargetId`。
- `apps/server/src/persistence/g1-schema-constraint-source.ts:684-703` 与 manifest 已把上述组合机器化：`target.type=chapter`、`idOwner=Chapter.id`、`expectedTargetField=expectedTargetId`。
- `文档/04_方案与决策/2026-07-11_G2上游版本链与Freshness开发方案.md:554-575` 又写成“任务 target 指向 pending 版本”，并以 active pending pointer 校验 task target。
- `文档/04_方案与决策/2026-07-11_G2版本来源与Freshness契约字典.md:1036-1058` 的完成条件实际比较 `expectedTargetId` 与 pending pointer，而不是 Chapter ID。

冲突是不可满足的：正常情况下 `Chapter.id` 不可能等于 `StoryVersion.id/StoryboardVersion.id`。若 runtime 严格执行注册表 3.3，两类任务全部无法创建；若忽略 3.3，则 manifest 中 `expectedTargetField` 的统一语义失真；若按 G2 主方案把 `GenerationTask.targetId` 写 pending version，则又违反 registry 的 `Chapter.id` owner。

解除条件：在同一权威层明确区分“GenerationTask 的 polymorphic target”与“输出要写入的 expected pending version”，或者正式改变 target enum/owner；随后同步 registry prose、结构化 source、G2 主方案、G2 exact contract、codec 与 TSK-00 负例。修复后必须产生新 manifest digest。

### 4.2 `G1-CONTRACT-P1-RETRY-BACKOFF`：G1 runtime task 仍有两套 retry 时序

**状态：open / P1**

证据：

- `文档/04_方案与决策/2026-07-11_G1数据库事实源与DB-only切换开发方案.md:554-564` 仍规定明确可重试错误使用 `5 秒、30 秒、120 秒，最多 3 次`。
- `文档/04_方案与决策/2026-07-11_G1任务与Outbox实施注册表.md:30-35,99-116` 明确裁决 `maxAttempts` 是总 attempt 数，`maxAttempts=3` 只有两次 delay，精确为 `[5,30]`，并明确“不登记永远不会消费的 120”。
- `文档/06_测试与验收/G1数据库迁移执行与验收清单.md:239-244` 的 TSK-12 同样要求 `[5,30]`，最后一次失败不再写 `nextRunAt`。

这不是措辞差异：它会决定第三次失败后是否仍写 future `nextRunAt`、是否存在第四次 attempt，以及 recovery/terminal trigger 应接受什么形状。主方案仍是 active 且直接面向实施者，不能只依赖后读者知道注册表优先级来规避。

解除条件：把主方案的时序统一为 registry/TSK-12 的总 attempt 语义，并增加一个机器用例证明 `120` 不进入 runtime policy 或 terminal row。

### 4.3 `G1-CONTRACT-P1-PREFLIGHT-LEGACY`：legacy Preflight 导入结果仍不唯一

**状态：open / P1**

证据：

- `文档/04_方案与决策/2026-07-11_G2上游版本链与Freshness开发方案.md:606-612` 对只有 storyboard ID/时间的旧 preflight 仍要求“保留历史确认记录但标记 source unresolved”。
- `文档/04_方案与决策/2026-07-11_G1数据库Schema实施契约.md:613-625` 则明确三项 source 字段始终非空；证据不足时不得插入 `PreflightRevision`，只建 `PREFLIGHT_SOURCE_UNRESOLVED` blocker；切换前必须显式选择 `drop_current_preflight_and_reconfirm_after_cutover`，并保持 current pointer 为 null。
- `文档/04_方案与决策/2026-07-11_G2版本来源与Freshness契约字典.md:212-225,1060-1082` 与 G1 exact contract 一致，也明确“不插入伪 revision”。
- `文档/04_方案与决策/2026-07-11_G3漫画版式契约与旧值迁移字典.md:609-619` 最终同样要求 pointer 为空、issue resolved、DB-only 后重新确认。

“保留历史确认记录”没有说明只保留到 provenance/archive；按通常上下文可被实现成一条 unresolved PreflightRevision，但目标表又不允许 nullable source 三元组。这会造成 importer shape、final activation blocker 和 NewWorkGate 三者不一致。

解除条件：主方案必须明确历史证据保存在哪个 provenance/archive 实体，并明确绝不创建 PreflightRevision；同步 G2 migration 用例，断言 current pointer 为 null、issue/decision digest 完整、DB-only 后重确认前 NewWorkGate 阻断。

### 4.4 `G1-CONTRACT-P1-G4-LOCKSET-NULLABILITY`：G4 可复制 TypeScript 契约无法表达验收要求

**状态：open / P1**

证据：

- `文档/04_方案与决策/2026-07-11_G4候选定稿与影响预览契约字典.md:343-355` 的 `CandidateLockSetSummary` 声明 `sourceApplicability: TaskApplicability`，即非 null。
- 同文件 `:358-363` 又要求只有 complete lock set 才聚合该值，`incomplete/unresolved` 时必须为 null。
- `文档/06_测试与验收/G4候选定稿返修验收清单.md:161-177` 的 LKS-02～04 明确断言 `digest/sourceApplicability=null`。

该文档自称可直接复制到 Shared types/runtime parser，当前定义会迫使实现者在三种错误做法中选择：违反 TypeScript 类型、伪填 `current/historical/legacy_unresolved`，或偏离验收。伪填尤其可能让 G5 revision gate 把结构不完整的 lock set 当作有合法来源适用性。

解除条件：把字段改为 `TaskApplicability | null`，同步 strict codec/schema 与 complete/incomplete/unresolved 表驱动测试，并确认所有响应 DTO 均使用同一 nullability。

### 4.5 `G1-CONTRACT-P1-G5-LAYOUT-SEAL`：正式 LayoutRevision 编号事务在切 current 前漏 seal

**状态：open / P1**

证据：

- `文档/04_方案与决策/2026-07-11_G5LayoutDocument与编辑命令契约字典.md:862-866` 正确规定固定顺序为 `unsealed Revision → LayoutSourceBinding[] → bindingSetSealedAt → current`。
- 同文件 `:884-892` 的“创建正式版本”编号事务却只列出插 Revision、插 Bindings、更新 `Chapter.currentLayoutRevisionId`、更新 Working Copy，完全漏掉 seal update。
- `文档/04_方案与决策/2026-07-11_G1数据库Schema实施契约.md:1219-1227` 明确 INSERT 不得预填 seal，且 Chapter current 只能指向 sealed revision。因此照 G5 编号事务执行，步骤 6 必然被数据库拒绝。
- `文档/06_测试与验收/G5成稿编辑器与确定性导出验收清单.md:184-195` 的 G5-REV-004 只要求 Revision/Bindings/current/WC 同事务，也没有断言 seal；`:69` 还使用不存在的“ready LayoutRevision”状态，而正式完成态实际由 `bindingSetSealedAt` 表达。

这会使 API 主成功路径无法满足 G1 base trigger，或者诱导实现者绕过/放宽“current 必须 sealed”的完整性保护。

解除条件：在 G5 编号事务中显式加入 seal 并放在 current 更新之前；G5-REV-004/DB-006 必须直接断言 INSERT unsealed、投影一致后单向 seal、current 只指 sealed、seal 后 Revision/Bindings 不可改。

## 5. 非阻塞发现（P2）

### 5.1 `G1-CONTRACT-P2-G5-OVERLAY-OWNERSHIP`：G5 QA 仍把 G1 base 字段写成 G5 ADD COLUMN

**状态：open / P2**

- `文档/06_测试与验收/G5成稿编辑器与确定性导出验收清单.md:62-70` 的 G5-DB-001 写成“G5 Prisma migration 增加 LayoutRevision previous/contentBasedOn/saveReason”。
- `文档/04_方案与决策/2026-07-11_G1数据库Schema实施契约.md:1212-1227,1752-1754` 已把这些字段归入 G1 base，并明确后续文档不得重复 ADD COLUMN。
- `文档/04_方案与决策/2026-07-11_G5高自由成稿编辑器开发方案.md:392-416` 也说明 G5 只增加 previous 线性、autosave replay、publication 状态机/current finalize 等 overlay 约束。

G1 的全局解释规则暂时避免了实际重复加列，因此本项列 P2；但 QA 唯一条目仍应改成验证“字段由 G1 base 已存在，G5 migration 只叠加 overlay”，否则阶段证据会错误归属。

### 5.2 `G1-CONTRACT-P2-G5-PRISMA-PATH`：G5 实施改动面指向不存在的 Prisma 根

**状态：open / P2**

- `文档/04_方案与决策/2026-07-11_G5高自由成稿编辑器开发方案.md:779-792` 列出 `packages/db/prisma/schema.prisma` 与 `packages/db/prisma/migrations/*`。
- 当前事实路径是 `apps/server/prisma/schema.prisma` 与 `apps/server/prisma/migrations/*`；G1 manifest/Handoff 也使用 `apps/server/prisma`。

该段注明“实施时以真实代码复核为准”，故不作为放行阻塞；仍建议同步路径，避免后续 Worker 在错误包下新增第二套 Prisma 事实源。

## 6. 横向覆盖结果

| 范围 | 复核结果 |
| --- | --- |
| G1 Schema 实施契约 | 44 模型、字段/FK/索引/CHECK/trigger、formal projection、Task/Attempt/Slot、Outbox、Secret、delete/purge、activation 边界均有明确基线；未发现新增 P0。 |
| G1 Task/Outbox registry | 10/5 数量与 machine source 对齐；codec/source/retry/replay/terminal 字段均存在；发现 target binding 与 backoff 两项 P1。 |
| G1 DB-only 主方案与 QA | maintenance/snapshot/runtime bundle/importer/activation/rollback 边界可追踪；发现 retry 时序 P1。 |
| G2 主方案/契约/QA | Working Copy、不可变 version、freshness、pending CAS、迟到结果、NewWorkGate 基本闭环；发现 target 与 legacy Preflight 两项 P1。 |
| G3 主方案/契约/QA | comicFormat canonical 值、创建必选、更新不可变、旧 alias 决议与 Preflight 重新确认边界可追踪；没有独立新增 P0/P1。 |
| G4 主方案/契约/QA | lock revision 线性、preview/commit、impact digest、historical 输出保留基本闭环；发现 lock-set nullability P1。 |
| G5 主方案/两份契约/QA | LayoutDocument、Working Copy、Revision、source replacement、renderer、publication、Artifact/current finalize 基本闭环；发现 revision seal P1 与两项 P2。 |
| Review protocol | 固定 round、四文件 allowlist、两角色、report/manifest digest、canonical bytes、stale/tamper/TOCTOU fail-closed 均有代码与 83 个测试证据。 |
| Handoff/留痕 | 对当前完成度、SCH-00 Red、无 migration、无真实切换、0/2 pending 的叙述真实；但“P0/P1 文档冲突已收口”这一结论被本报告的 5 个 P1 推翻。 |

## 7. G1 关键闸门映射

`文档/06_测试与验收/G1数据库迁移执行与验收清单.md` 中以下 Gate ID 均存在唯一条目、命令入口与判定口径：

| Gate | 定义完整性 | 当前复核意见 |
| --- | --- | --- |
| REV-00～03 | 已定义且当前有 pass 证据 | manifest/review protocol 机械部分通过 |
| REV-04 | 已定义 | 本角色已执行，结论 rejected |
| REV-05 | 已定义 | 由另一独立 Reviewer 决定，本报告不代签 |
| REV-06 | 已定义 | 因本报告存在 open P1，当前摘要不得达到 accepted |
| TSK-00 | 已定义 | 字段清单完整，但 target binding P1 表明“存在字段”尚不等于语义闭合 |
| OTB-01～05 | 已定义 | payload、claim/fencing、重放、backoff、领域完成条件可追踪 |
| DEL-00 | 已定义 | deleting 根写栅栏与晚到 promote 收敛可追踪 |
| MNT-01～04 | 已定义 | 同 PID maintenance、写栅栏、active 归零、reopen 可追踪 |
| SNP-01～05 | 已定义 | 双 manifest、路径/只读、脱敏、transform、可重复可追踪 |
| RUN-01～05 | 已定义 | runtime bundle strict codec、封口、无秘密、幂等、不可观察边界可追踪 |
| ACT-01～08 | 已定义 | DB 身份、final 资格、ready shape、smoke、激活、first write、无 fallback、回滚边界可追踪 |
| WIT-01 | 已定义 | 正式 importer 到临时 DB-only reopen；只放行 G2～G5 临时开发，不放行生产切换 |

## 8. 安全、授权与生产边界

本轮未发现文档把临时 WIT-01、shadow/import 演练或 derived review gate 偷换成生产授权：

- G1 总控计划仍规定 M0～M3 只在隔离环境执行；
- M4 正式停写、真实 snapshot、真实 Secret 迁移和正式 DB-only 激活必须在动作发生前再次取得用户明确授权；
- WIT-01 只允许 G2～G5 在临时 DB-only substrate 上继续开发；
- Handoff 明确没有读取真实 SQLite 作为期望源、没有执行真实 SecretStore 或生产切换；
- review accepted 也只允许进入 migration generation，不等价于生产执行授权。

这些边界保持有效。修复本报告 findings 不得顺带扩张到真实 workspace、真实凭据或正式切换。

## 9. 重新送审条件

Worker 至少需要：

1. 修复全部 5 个 P1，并决定是否顺带清理 2 个 P2；
2. 同步所有受影响的主方案、exact contract、registry machine source 与 QA，不只修一处文案；
3. 为 task target、retry terminal、Preflight no-row、G4 nullability、G5 seal/current 顺序增加直接机械用例；
4. 重新运行 manifest generate/check，使旧摘要自然 stale；
5. 保持 SCH-00 在 Schema 尚未实施时诚实 Red；
6. 由两名独立 Reviewer 对新摘要重新出具 report/attestation；不得复用本轮结论。

在这些条件满足前，`migrationGenerationAllowed` 必须保持 false。
