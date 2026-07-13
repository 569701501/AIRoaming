---
doc_id: AIR-D2-M6-MASTER-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: ai-agent, developer, qa
source: G1/G2/G3 正式契约、当前 Prisma schema、capability registry 与总 Handoff
---

# D2 至 M6 连续交付实施契约

## 1. 不变量

所有阶段共同遵守：

1. `文档/` 是事实源；代码改变协议、状态或路径时同步对应文档。
2. DB 模式的业务 metadata 只以 SQLite 为正式事实源。
3. Asset、Export 等大字节可留在受控物理存储，DB 保存身份、状态、路径、摘要、来源和 current 指针。
4. 0001～0010 migration 冻结，禁止修改字节。
5. confirmed/ready/sealed/processed/final 历史不可原地覆盖或删除。
6. milestone、lifecycle、activation 与任务状态只能按既有状态机推进。
7. 多表业务命令必须在一个 Prisma 事务内完成；外部文件副作用使用 DB intent/Outbox 和可重放 postcondition。
8. 所有并发写使用 observed ID/rowVersion/digest/claimToken；禁止服务端提交前读取最新值代替用户观察值。
9. 公开错误使用稳定 code；不得泄漏绝对路径、正文、prompt、key、Authorization 或 provider 原始响应。
10. 测试只用临时根、fresh SQLite、fake executor/fake provider/fake SecretStore。

## 2. Repository 边界

禁止继续把整棵 `LocalProject` 当 DB 写模型。各阶段按领域命令仓储写入：

| 领域 | 推荐边界 |
| --- | --- |
| Project/Chapter/Script/Outline | `ProjectScriptCommandRepository` |
| Story/Storyboard/Preflight | 既有 Version repositories/services |
| Character/Scene/Asset/Visual/Lock | 新增窄 command repository，复用 persistent task |
| Layout/Export | `LayoutCommandRepository`、`ExportCommandRepository` |
| Dialogue | `DialogueRepository` 或等价持久层 |
| Outbox/Delete | `OutboxRepository`、`OutboxWorker`、`ProjectDeletionService` |
| Migration/Activation | `FinalImporter`、`FinalMigrationVerifier`、`CutoverCoordinator`、`DbActivateService` |

`ProjectsService` 和 `DialogueService` 保持门面/编排职责，不堆入底层事务细节。

## 3. 读模型与缓存

- `ProjectRepository` 的 DB identity map 只是一层缓存，不是事实源。
- 任一直接 Prisma mutation 成功后，刷新受影响 project，或让 DB read-model 每次按事务后事实重建；不能靠重启隐藏同进程不一致。
- refresh 只读 DB，不扫描 legacy workspace。
- DB DTO 必须可在移走旧 metadata 后读取。
- 旧 metadata mutation/isolation 是每个业务阶段的必测项。

## 4. 版本与 freshness

- Script Working Copy 与 published ScriptVersion 分离。
- Story/Storyboard 的权威 document 与 projection 同事务。
- Preflight/Layout/Export 都绑定其生成时的上游正式版本和 digest。
- 上游变化只使下游 stale/historical，不改写旧版本。
- Candidate lock 是不可变修订；布局绑定保存时使用的 lock revision。
- current 指针必须显式更新；不得以 updatedAt 最大值代替。

## 5. operation capability 契约

### 5.1 状态

聚合 capability 保留 `implemented/partial/unsupported`。

操作级写状态允许：

- `implemented`：公开 DB 成功路径、失败路径、restart 和 evidence 均存在。
- `retired`：旧操作不再是 DB 合法入口，但存在稳定拒绝、明确 replacement，且 replacement 的用户意图已被测试覆盖。
- `partial`：只完成部分语义，继续阻塞。
- `unsupported`：未实现，继续阻塞。

### 5.2 retired 不是拒绝即完成

`retired` 必须包含：

```ts
interface RetiredOperationEvidence {
  retirementReason: string;
  replacement: string;
  rejectionTestId: string;
  replacementTestId: string;
}
```

缺任一字段仍算 blocked。聚合 capability 只有在所有 active operation implemented、所有 retired operation 合规且聚合读写/restart evidence 齐全时才可绿。

### 5.3 更新顺序

1. 先实现公开路径。
2. 跑测试产生稳定 test ID。
3. 再更新 operation evidence。
4. 再更新聚合项。
5. 运行 `db:capabilities --check`。

禁止先改 registry 再补代码。

## 6. 文件副作用协议

用于 Asset promote/delete、Export、Project delete、metadata archive：

```text
DB intent pending
  -> claim + lease token
    -> staging write / external action
      -> fsync + rename / postcondition probe
        -> digest verification
          -> fenced DB completion
```

要求：

- 路径必须是 storageKey/受控相对路径；拒绝绝对路径、`..`、symlink、特殊文件和根重叠。
- 写入使用同根 temp，写文件 fsync，rename，父目录 fsync。
- 响应丢失或 worker 崩溃后通过 postcondition probe 判断是否已完成。
- claimToken 失效的 worker 不得完成 DB 状态。
- redactor 在持久化错误前执行。

## 7. Outbox 协议

现有 `OutboxEvent` schema 和 5 类 handler registry 是权威，不新增近似队列表。

通用状态：

```text
pending -> processing -> processed
                    \-> failed
processing lease expired -> pending with backoff
```

- claim 原子 attempt+1，生成唯一 leaseToken。
- heartbeat/finish/retry 都按 id+leaseToken CAS。
- 旧 token 更新 0 行。
- terminal 清 lease，不可重开。
- 第 3 次后只能 processed/failed。
- payload codec 拒绝 unknown、null 泄漏、secret、绝对路径。

## 8. Secret 规则

- 生产 macOS adapter 只通过已完成的 SecretStore 边界调用；自动测试继续注入 fake executor。
- 文本 provider key 继续遵守 OpenCode-owned 边界；图片 provider secret 只保存 secretRef/fingerprint metadata。
- replace/clear 的旧 ref 删除由 `secret.delete_old_ref` Outbox handler 完成。
- 无 SecretStore、Keychain 拒绝或锁定时明确失败，不回退明文 JSON。
- 所有报告、DB JSON、Task、Artifact、Export、日志和 fixture 使用公共递归 redactor/sentinel scanner。

## 9. final importer 契约

### 9.1 输入

必需显式参数：

- sealed snapshot。
- normalized decisions artifact。
- fresh/absent target dataRoot、workspaceRoot。
- explicit SQLite URL。
- runId。
- report output。
- fake/受控 SecretStore binding。
- `--format json`。

不读取默认根或隐式环境 fallback。

### 9.2 16-slice 复用

final 与 shadow 共用 mapper/planner/codec。允许重构现有 shadow importer，把“计划生成”和“在 run context 写入”分离；禁止复制 16 套 final importer。

final 需要一个权威 aggregate run：

```ts
{
  kind: "final",
  status: "succeeded",
  sourceManifestDigest,
  snapshotManifestDigest,
  decisionsDigest,
  reportDigest,
  verificationJson: {
    schemaVersion: 1,
    effectiveSchemaManifestDigest,
    slices: [/* fixed 16 order */]
  }
}
```

每个 slice 的 count、digest、status 和 evidence 必须进入 aggregate report。是否保留内部 child shadow evidence 可由实现决定，但 `cutoverRunId` 只能指向权威 succeeded final run。

### 9.3 失败

- 任一 blocker/failed：aggregate final 终态对应失败，ready 不写。
- 目标非空、identity 不同、report 冲突：fail-closed。
- 不删除或改写旧终态 MigrationRun。
- 失败可丢弃临时目标；源 snapshot 字节不变。

## 10. ready_for_activation

`CutoverCoordinator` 负责写 ready，不允许 CLI 或 importer 随手 update。

同一事务校验：

- final run kind/status。
- source identity。
- verification effective identity 与当前 release。
- blocker=0。
- capability=0。
- secret scan=0。
- maintenance/backup 条件。
- state 仍为 shadow/recovery 合法形状。

写入：

```text
activationState = ready_for_activation
cutoverRunId = final run id
sourceManifestDigest = final source digest
effectiveSchemaManifestDigest = verification effective digest
lastVerifiedAt = now
activatedAt = null
firstBusinessWriteAt = null
```

## 11. activate 与 first write

`db:activate`：

- `--dry-run` 零写。
- `--execute` 只允许显式参数、`--gate ACT-08` 和已验证 sealed backup。
- 原子 ready→db_only，首次写 activatedAt，不写 firstBusinessWriteAt。
- 激活后立即读回 state/final run/release identity。

所有非迁移业务 UnitOfWork：

- 事务内检查 PersistenceState。
- db_only 且 firstBusinessWriteAt 为空时，在同一业务事务首次写入。
- 业务事务回滚时 firstBusinessWriteAt 也回滚。
- migration/verify/maintenance rollback smoke 不得触发 first write。

## 12. schema 变更规则

只有当前 schema 无法表达已批准语义时才允许 0011+：

1. 在 findings 写出缺口和替代方案。
2. 新增 ADR，明确模型、状态、迁移与回滚影响。
3. 使用小 migration，不扩写旧大 DSL。
4. 更新 Prisma schema、约束/触发器的最小权威来源和 effective manifest。
5. 跑 fresh、已有 0001～0010 replay、0011+ upgrade、FK/integrity 和负例。

不得为了省事放宽删除、scope、终态不可变或 activation trigger。

## 13. API/Web 契约

- file mode 兼容行为保持，除非正式退役文档明确修改。
- DB mode 使用 capability DTO 分支，服务端仍做模式保护。
- 409 冲突不自动覆盖或重试；前端提示重新加载后人工确认。
- destructive/safe replacement 必须在 response details 暴露稳定 `replacement`。
- Shared DTO 先更新，Server 与 Web 同提交通过 typecheck。
- 不把绝对路径、secretRef、内部 report、MigrationRun 细节泄漏给普通业务 DTO。

## 14. 文档与提交

- 每阶段只写必要的 implementation note、progress、review，不复制五份大模板。
- 重大新状态机/产品语义才写 ADR。
- 每阶段一个独立 commit；大阶段可拆两个内部 commit，但必须在阶段 review 前保持可回归。
- 不提交真实 DB、workspace、图片、key、完整正文、绝对路径或大型运行日志。
