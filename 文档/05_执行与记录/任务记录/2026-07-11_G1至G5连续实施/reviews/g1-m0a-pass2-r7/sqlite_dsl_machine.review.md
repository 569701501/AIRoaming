---
doc_id: AIR-G1-M0A-PASS2-R7-SQLITE-DSL-REVIEW
status: rejected
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G1 M0-A Pass2 r7 独立静态与运行证据复核
---

# G1 M0-A Pass2 r7 SQLite DSL 与机器约束复核

## 1. 复核身份与结论

| 字段 | 值 |
| --- | --- |
| reviewRoundId | `g1-m0a-pass2-r7` |
| manifestDigest | `sha256:c32dd95ab61a2d8a89c25dbab45d0f3efb7323d504f6031dc2e51e38b5943d06` |
| reviewerId | `codex-scrutiny-sqlite-20260712-r7` |
| reviewerRole | `sqlite_dsl_machine` |
| independentFromWorker | `true` |
| reviewedAt | `2026-07-12T00:26:40.000Z` |
| verdict | `rejected` |

本轮发现 1 个未关闭的 P1：Schema 与 migration writer 在授权检查和随后读取 manifest 之间存在 TOCTOU 窗口。两次 gate 都没有把已复核快照与实际渲染输入绑定，因此第二次 gate 不能闭合该窗口。依据当前复核规则，本轮结论为 `rejected`。

## 2. 范围与边界

本次复核覆盖：

- 固定 digest 对应的 Schema manifest、Schema implementation contract、Task/Outbox registry 与 Handoff；
- Prisma Schema renderer/writer、SQLite migration renderer/writer/verifier、review-check 和 attestation 解析约束；
- 44 个模型的字段、主键、外键、关系、唯一约束、索引、CHECK、trigger，以及 `0008` rebuild/copy/校验/切换顺序；
- pinned Prisma 6.19.3 上的迁移部署、幂等、失败回滚、漂移与文件系统攻击面测试。

本复核未读取、探测或引用同轮 `contract_consistency` reviewer 的原始证据；未访问真实数据库、真实 workspace、settings、secrets 或 dataRoot；未执行 publish、seal 或 recovery。所有主动变异证明均为内存只读构造，不写入目标 Schema、migration 或 manifest 路径。

## 3. 已确认的基线证据

### 3.1 Manifest 与渲染计划

- manifest 内嵌/canonical digest 与本轮固定 digest 一致；manifest 原始文件 SHA-256 为 `43177ac6e43858e19a6b934b236aea5b238530a103d774919212cbcada5d15fa`。
- 当前 Prisma Schema 原始文件 SHA-256 为 `f80e464cf14b483e933a976aa2f34737696a7a9b932fd1dbdaff599ce58d49fb`。
- 迁移计划包含 9 个精确路径 artifact；7 个模型组大小为 `4/6/10/5/9/4/6`。
- 清单总量为 44 models、556 scalar fields、44 primary keys、105 foreign keys、210 relation navigations、70 unique constraints、60 indexes、195 CHECK constraints、194 triggers。
- `0008` rebuild 43 张表并复制 549 列；仅 `chapter_scenes` 保留原表。脚本包含 43 次 DROP、43 次 ALTER/rename、86 次双向 EXCEPT；每张重建表在 DROP 前均执行行数与全列双向差集校验。
- `0008` 先完成全部 rebuild，再创建 194 个 trigger；在事务前执行 `foreign_keys=OFF` readback guard，在 COMMIT 前执行 `foreign_key_check`，COMMIT 后恢复 `foreign_keys=ON`。
- `0008` 的基线 SHA-256 为 `b85f56aaa4d1a95b17a51f87fd9c3b9ca4833316afd298da5e73249ba0407887`。

### 3.2 运行与负向证据

- 7 个针对性测试文件共 69 个测试通过；覆盖 migration plan、Prisma Schema、SQLite trigger 语义、manifest、模型、约束和领域规则。
- pinned Prisma 6.19.3 的空库部署成功应用 8 个 migration，第二次部署无 pending migration；verifier 确认 `foreign_keys=ON`、精确 inventory、健康状态和 ledger。
- orphan/P3018 回滚后 P3009、外层事务 FK guard、同计数内容改写、artifact 篡改/缺失/多余、文件/目录 symlink 与 hardlink 等负向用例均通过。
- server 全量测试 26 个文件、253 个测试通过；server typecheck、manifest check、Schema check、`prisma validate` 均通过。
- 当前 review-check 精确返回 `0/2 pending`，Schema writer、migration writer 与 migration check 均按预期被 gate 拒绝；测试后不存在目标 migration 目录、sealed bundle、stage 残留或 `/tmp/g1-migration-*` 残留。

这些基线说明渲染内容与常规失败路径已有较强覆盖，但不能消除下述授权快照 TOCTOU。

## 4. Findings

### G1-SQLITE-P1-WRITER-MANIFEST-TOCTOU

| 字段 | 值 |
| --- | --- |
| severity | `P1` |
| status | `open` |
| summary | Schema 与 migration writer 的 gate 结果未绑定随后实际读取和渲染的 manifest 字节，路径替换可使保留旧内嵌 digest 的未签名内容通过两次 gate 并进入原子提交。 |

#### 静态证据

1. `apps/server/src/persistence/g1-prisma-schema.ts:439-451` 先等待 `runG1SchemaReviewCheckV1`，再单独 `readFile(manifest)`；后续只比较 JSON 内嵌的 `manifest.manifestDigest === gate.manifestDigest`，未对刚读取的内容重新计算 canonical self-digest，也未把 gate 结果绑定到该字节快照。
2. Schema writer 在 `apps/server/src/persistence/g1-prisma-schema.ts:480` 与 `apps/server/src/persistence/g1-prisma-schema.ts:499` 对首轮和最终 gate 重复同一非原子序列。每个 gate 后均有独立的路径读取窗口，因此“双 gate”并不闭合 TOCTOU。
3. `apps/server/src/persistence/g1-migration-plan.ts:1132-1152` 采用相同模式，并在 `apps/server/src/persistence/g1-migration-plan.ts:1187` 与 `apps/server/src/persistence/g1-migration-plan.ts:1226` 重复于首轮和最终 gate。
4. `apps/server/src/persistence/g1-schema-review-check.ts:245-281` 验证的是 review-check 当时取得的 storedSource 快照，而不是 renderer 随后重新读取的路径内容。

#### 可重复的只读变异证明

- Schema：基线输出 SHA-256 为 `f80e464cf14b483e933a976aa2f34737696a7a9b932fd1dbdaff599ce58d49fb`。仅将 `Project.name.nullable` 改为 `true`，保留固定的内嵌 `manifestDigest` 不变，`buildG1PrismaSchema` 仍接受该对象，并输出 SHA-256 `d18e85f512c7589d05259bd14d34c908a3e6876c916a9ec7691b9a85992f0bca`。
- Migration：基线 `0008` SHA-256 为 `b85f56aaa4d1a95b17a51f87fd9c3b9ca4833316afd298da5e73249ba0407887`。仅将首个 CHECK `ck_app_preferences_row_version.normalizedExpression` 改为 `1`，保留固定的内嵌 `manifestDigest` 不变，`buildG1MigrationPlanV1` 仍接受该对象，并输出 `0008` SHA-256 `15e488c04fa381570c4d4a6dabe2a8171d9d928cb52adec73a39e2cf696afac0`。

两组变异都改变了实际生成物，却没有改变 writer 用来与 gate 比较的内嵌 digest 字段，证明该比较不是内容绑定。

#### 可利用时序

在未来真实达到 `2/2 accepted` 后，可形成以下交错：

1. 路径上放置已签名 manifest `M`，review-check 返回 accepted；
2. 在随后 `readFile` 前将路径替换为内容已改变但仍携带旧 digest 字段的 `M′`，renderer 接受并 stage `M′` 的输出；
3. 最终 gate 执行时临时恢复 `M`，使 review-check 再次 accepted；
4. 在最终 gate 后的再次读取前重新放置 `M′`；两轮 renderer 得到相同的篡改期望字节，最终比较成立并原子 rename。

因此，第二次 gate 只重复验证了可被临时恢复的路径快照，并没有证明最终提交字节来自 reviewer 签署的 manifest。

#### 影响

该缺陷允许绕过固定 digest 与双 reviewer 授权边界，将 reviewer 未签署的 Schema 或 SQLite 约束写入正式输出。示例变异可放宽非空字段或把 CHECK 退化为恒真表达式，直接削弱数据契约和数据库强制约束。该问题位于 writer 的最终提交授权链，故定级为 P1。

#### 修复退出条件

1. Schema 与 migration writer 在首轮、最终 gate 后取得的每份 manifest 字节，都必须重新验证内嵌 canonical self-digest（使用等价于 `verifyG1SchemaManifestDigest` 的校验），且计算结果必须与 gate digest 相等；不得只相信 JSON 内嵌字段。
2. 优先由 review-check 返回并绑定它实际验证的精确 manifest 字节/事实，或通过同一打开文件描述符与身份校验保证 gate、渲染和提交使用同一不可替换快照。
3. migration writer 还必须在同一已验证快照中把当前 Schema 与签署 manifest 绑定，避免独立路径读取产生同类窗口。
4. 为 Schema 和 migration writer 的首轮 gate 后、最终 gate 后分别增加确定性 fault-injection/path-swap 测试。保留旧 digest 的 `nullable` 与 CHECK 变异必须在 stage/rename 前失败，并验证无 stage、temp 或正式输出残留。

## 5. 最终结论

本轮共有 1 个 finding：`G1-SQLITE-P1-WRITER-MANIFEST-TOCTOU`，严重度 P1，状态 open。尽管 manifest、SQLite DSL、rebuild 校验、trigger 语义、Prisma 部署和多数文件系统负向路径均通过，writer 的授权快照仍未与实际提交内容绑定，不能签发接受结论。

最终 verdict：`rejected`。

## 6. 未签署边界

本报告仅是 `sqlite_dsl_machine` reviewer 对固定 review round 的独立复核证据，不代表 `contract_consistency` reviewer，不构成 2/2 接受，不授权 Schema/migration write、publish、seal 或 recovery，也不证明任何真实用户数据路径已执行。
