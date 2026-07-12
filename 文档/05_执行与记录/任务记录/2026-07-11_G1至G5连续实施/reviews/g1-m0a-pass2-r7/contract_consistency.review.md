---
doc_id: AIR-REVIEW-G1-M0A-PASS2-R7-CONTRACT-CONSISTENCY
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: orchestrator, scrutiny-reviewer, developer
source: G1 M0-A Pass 2 r7 独立契约一致性复核
---

# G1 M0-A Pass 2 r7 契约一致性独立复核

## 1. 结论

| 项目 | 结论 |
| --- | --- |
| reviewRoundId | `g1-m0a-pass2-r7` |
| reviewerRole | `contract_consistency` |
| reviewerId | `codex-scrutiny-contract-20260712-r7` |
| independentFromWorker | `true` |
| 固定 manifestDigest | `sha256:c32dd95ab61a2d8a89c25dbab45d0f3efb7323d504f6031dc2e51e38b5943d06` |
| verdict | `accepted` |
| findings | P0 = 0，P1 = 0，P2 = 0 |

本角色未发现阻止该固定 manifest 进入后续封存编排的开放 P0/P1。此结论只是一个未封存的独立 raw review；它本身不改变 base manifest 的 `0/2 pending`，也不授权生成 migration。只有 Orchestrator 对同一 manifest 完成准确 `2/2` 独立 accepted attestation 的封存与派生门禁验证后，写入路径才可能获准。

## 2. 独立性、范围与边界

- 已独立通读仓库协作规则、handoff、Schema 实施契约、G1 任务与 Outbox 注册表、固定 manifest 的 23 个 `sourceDocuments`、任务计划、进度/发现记录、QA 清单，以及 G1-G5 与本轮状态、所有权和验收有关的权威段落。
- 已机械核对实现、测试、固定 manifest、r1-r6 历史封存证据和跨文档状态；未继承 worker 或历史 reviewer 的结论。
- 严格未读取、探测、引用或等待本轮 `sqlite_dsl_machine` raw 文件或结论，亦未与 peer reviewer 通信。
- 未调用真实 r7 根目录的派生 review reader/writer，避免其枚举 peer raw；派生门禁语义改在隔离临时工作区的生产级集成测试中验证。
- 未生成 migration，未触碰真实数据库、工作区设置、SecretStore 或 dataRoot，未执行 publish、seal、recover，也未修改生产代码、权威文档、manifest、Schema、任务记录或 QA 状态。

## 3. r6 两项 P1 闭环

### 3.1 外键物理名与 defining relation

r7 实现已把外键名收紧为唯一公式：

```text
fk_{localTable}_{orderedLocalColumns.join("_")}__{targetTable}
```

`assertG1PrismaForeignKeyContract` 对 105 个外键逐一验证：名称与公式精确相等、全局无重复；每个外键只被一个 defining relation 消费；该 relation 的目标模型、本地字段、引用字段、`onDelete`、`onUpdate` 均与外键契约精确一致；不存在重复消费或未消费外键。负向测试覆盖非空但错误的名字、空名字、本地/引用字段与动作漂移、重复消费和未消费。直接只读断言结果为 `foreignKeys=105`、`relations=210`、Schema exact。

结论：`G1_SQLITE_R6_RENDERER_FK_NAME_NOT_EXACT` 已闭环。

### 3.2 renderer/source 资格边界

固定 manifest 恰含 23 个 `sourceDocuments`，其中包含 Prisma Schema renderer/CLI、migration plan renderer/CLI、manifest/review verifier 及其直接契约源。独立重算 23 个文件 SHA 无不匹配，去除 `manifestDigest` 后的规范化 payload 摘要精确重算为固定 digest。

资格检查对 20 个 TypeScript source 扫描静态相对 import、动态相对 import 和相对 `require` 的传递闭包；闭包必须仍在 23 项 allowlist 内。测试同时固定“恰为 23 项”并通过注入未绑定 helper 的负向变异证明 fail closed。

结论：`G1_SQLITE_R6_RENDERER_SOURCE_UNBOUND` 已闭环。

## 4. Manifest、base gate 与派生门禁

| 核对项 | 结果 |
| --- | --- |
| sourceDocuments | 23；独立 SHA 重算 23/23 一致 |
| manifestDigest | 规范化重算与固定 digest 一致 |
| manifest 文件 SHA-256 | `43177ac6e43858e19a6b934b236aea5b238530a103d774919212cbcada5d15fa` |
| 完整性 | `ready=true`，`issueCount=0` |
| 主计数 | 44 models；556 scalar fields；105 FKs；210 relations；70 uniques；60 indexes；195 CHECKs；194 triggers |
| base gate | 永久事实快照：`required=2`、`accepted=0`、`status=pending`、`migrationGenerationAllowed=false` |
| derived gate | 仅由当前轮封存 bundle 派生；须同 manifest、准确 2/2、双角色 accepted、无阻塞 finding，才可为 accepted |

base manifest 没有也不应被 raw 或 sealed review 回写。隔离集成测试覆盖 `0/2`、`1/2`、准确 `2/2`、超过/不匹配 `2/2`、rejected、开放 P1、陈旧 identity、bundle/CAS 漂移和恢复语义；所有失败路径均阻止写入，base artifact 保持不变。

## 5. Schema 与 migration writer 审核

### 5.1 Prisma Schema writer

- 写入前读取生产派生门禁并要求准确 accepted `2/2`，同时把 `manifestDigest`、`attestationSetDigest`、`bundleSnapshotDigest` 和 expected Schema 绑定为同一授权身份。
- 在目标同目录用独占创建与 `0600` 权限建立 staging 文件，写入后 `fsync`；rename 前再次执行同一生产派生门禁并比较双次身份与 expected bytes。
- rename 前验证 staging 为普通、非符号链接、`nlink=1`，并核对打开 FD 与路径 inode、size、mtime 及完整 bytes；随后原子 rename 并同步目录。
- CLI 无 skip/force 绕过参数；只读 Schema check 只证明当前文件与固定 manifest 精确一致，不冒充派生授权。

### 5.2 Migration plan writer

- staging 前与 rename 前各执行一次派生门禁，并在两次均校验固定 manifest、当前 Schema exact、三段 review identity 与完整 9-artifact migration plan identity。
- staging root 与目标同父目录；文件以独占创建、`0600` 权限写入并同步。rename 前验证精确目录树、文件类型、`nlink`、bytes 和 SHA，无额外条目；目标必须不存在，随后原子 rename、同步父目录并做落盘后精确树复核。
- CLI 无 skip/force；正式 migration 目录当前不存在，亦无 staging 残留。

纯函数构建得到 9 个 artifacts、8 个 migrations；计数为 44 models、556 scalar fields、105 FKs、70 uniques、60 indexes、195 CHECKs、194 triggers、43 rebuild tables、549 copied columns。该构建未写入正式目录，也未连接数据库。

## 6. r1-r6 历史证据不可变性

按实施契约固定表逐一重算 r1-r6 共 28 个历史 sealed 文件 SHA-256，28/28 一致。另独立核对 bundle 内部摘要：

- r3 末代：`sha256:45414800250472f44b4389f4aee6d11c564970f3ece7c175f71441fa360b7b40`
- r4 末代：`sha256:af02b5ab0d6a476fd1be61fd4b71ccd40811c97bfae0b17a3035f17b393c2a27`
- r5 首代 / 末代：`sha256:f267e32886af1f91f22e0e7cda1f5803709a2088d0fedd2d08e31cd60d2eb422` / `sha256:970c80b9511730aee257fb0eb9f18084947f991fee154cf19eb8b4720e5bb0e6`
- r6 首代 / 末代：`sha256:3da52be62e7a0458afe2646fee43614f56c1141403970f8769d464f620d8050c` / `sha256:1ec86bc4a83a54c4f91c408d190c82c513cb29ba157b8c7282585890b0bfc534`

文件 SHA 与 bundle 内部 self/payload digest 均保持各自契约含义，未发现历史证据被改写。

## 7. G1-G5 所有权、状态与验收一致性

| 范围 | 权威口径与核对结论 |
| --- | --- |
| G1 | G0 已完成；G1 为 `in_progress`。G1-0 已签署；M0-A r7 从 base `0/2 pending` 开始，正式 migration 仍等待本轮封存派生门禁。Schema 文档 active 不等于实现完成。 |
| G2 | 方案/ADR 已接受但实现与 QA 仍 pending/not_run。G1 只拥有 current/pending/source 及基础形式约束；active-pending 唯一性、rowVersion/CAS、freshness、NewWorkGate 和 V2 runtime 属于 G2 overlay。 |
| G3 | 方案已接受但未实施。G1 拥有 `comicFormat` 非空、无默认值与二值 CHECK；不可变 trigger、解析/UI 和 legacy 决策属于 G3 overlay。 |
| G4 | 方案已接受但未实施。G1 拥有候选 provenance、锁动作空值/作用域、历史不可变与 revision 降序索引；previous 非空唯一、线性链/CAS、重放与影响分析属于 G4 overlay。 |
| G5 | 方案已接受但未实施。G1 拥有 Layout/Export 基础字段、binding seal 与 ready export 基础不可变；previous 线性唯一、WC 重放、发布/任务原子转换和 runtime completeness 属于 G5 overlay。 |

各 QA 文件仍以 `not_run` 为事实状态；G1 的 dry evidence 仅为 `dry_pass`，SCH-00 至 SCH-15 未被本轮 raw 复核伪装为已完成。未发现跨文档提前宣称 G2-G5 已实施或把 overlay 约束错误下沉到 G1 base 的情况。

## 8. 机械验证证据

| 验证 | 结果 |
| --- | --- |
| `pnpm --filter @airoaming/server g1:manifest:check` | PASS；固定 digest、23 个源与完整性一致 |
| 独立 manifest SHA/规范化摘要脚本 | PASS；23/23 source SHA 一致，payload digest 精确一致 |
| server Vitest（排除两项会读取真实 r7 root 的 current-root 用例） | PASS；26 files，251 passed，2 skipped，共 253 tests |
| `pnpm --filter @airoaming/server typecheck` | PASS |
| `prisma validate --schema prisma/schema.prisma`（临时 `DATABASE_URL`） | PASS；未创建数据库文件 |
| Prisma Schema + 105 FK 直接只读精确断言 | PASS；Schema exact，105 FKs，210 relations |
| migration plan 纯构建与精确计数 | PASS；9 artifacts，8 migrations |
| r1-r6 固定文件 SHA 与内部 bundle digest | PASS；28/28 文件 SHA 一致，内部摘要一致 |
| 正式 migration/staging 残留检查 | PASS；正式 migration tree 不存在，无 staging 残留 |
| `git diff --check` | PASS |

被排除的两项用例分别是当前根目录 Schema writer/check 与 migration writer/check；排除原因仅是本轮独立性禁令禁止探测 peer raw，不是产品测试失败。相同生产 gate、CAS、staging、原子写与失败关闭路径已由隔离临时工作区测试覆盖。

## 9. Findings

无。

## 10. 未被本结论接受或授权的事项

- 本报告不声称 r7 已完成 sealed 双审，也不声称当前派生门禁已经 accepted；raw pair 在封存前仍按 `0/2` 处理。
- 本报告不授权 Schema/migration 写入，不授权 M0-B、真实数据库迁移、cutover、发布或恢复操作。
- 正式 migration 尚未生成；SCH-00 至 SCH-15 仍须在后续获授权阶段按 QA 清单执行并留证。
- 真实 r7 根目录派生 reader 未在本角色中运行；这是 peer raw 隔离边界，不能被解释为门禁通过证据。

在上述边界下，本角色对固定 manifest 的契约一致性 verdict 为 `accepted`。
