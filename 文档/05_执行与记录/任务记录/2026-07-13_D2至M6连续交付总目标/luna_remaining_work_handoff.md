---
doc_id: AIR-D2-M6-LUNA-REMAINING-001
status: ready_for_luna_next_stage
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: ai-agent, developer, qa, human
source: 当前 capability CLI、已提交阶段证据、D2/M6 总实施契约
---

# 给 Luna 的剩余工作总施工单

## 1. 先说结论

当前不是 M5 施工。M5-A0～A4、D2-A7、D2-A8、M6 tooling 与临时 C0-C7 rehearsal 已完成；当前唯一剩余是总收口和真实切换授权材料。

当前已完成 **M6**，按总 Handoff 做最终收口并停在授权边界；D2-A7/A8/M6 不要重复施工：

```text
D2-A5 Dialogue runtime（已完成，commit `fa26908`）
  → D2-A6 Outbox + Project delete（已完成，独立提交收口中）
  → D2-A7 final importer / verifier / ready coordinator（已完成 `7a41d5c`）
  → D2-A8 fresh/replay/restart/secret 综合见证（已完成）
  → M6 activate tooling + 隔离 C0～C7（当前）
  → ready_for_real_cutover_authorization
```

不需要用户逐阶段确认，但每阶段必须独立测试、复核、留痕、提交后再进入下一阶段。

## 2. 接管前真实基线

执行：

```bash
git status --short
git rev-parse HEAD
corepack pnpm --filter @airoaming/server exec tsx src/migration/db-capabilities.cli.ts --format json
corepack pnpm --filter @airoaming/server exec tsx src/migration/db-capabilities.cli.ts --check --format json
```

接管时应确认：

| 项目 | 事实 |
| --- | --- |
| 最新已提交基线 | M6 `c07ec8c`（包含 D2-A8 `07ffa3e`） |
| 已完成 | M5、D2-A0、D2-A1-2、D2-A2-1、D2-A2-2、D2-A3-1、D2-A3-2A/B、D2-A4、D2-A5 |
| capability | 8 个聚合项、36 个 operation；P7 已计入 evidence |
| 当前 blocker | capability report 为 `blockedIds=[]`；真实切换授权尚未提供 |
| 已绿且不得回退 | `project_chapter_script`、`outline_story_storyboard_preflight`、`layout_export`、`task_create_claim_complete_cancel_recover`、`settings_credential_secret_store` |
| final importer | 仍 fail-closed；`db:import --kind final` 不得放行 |
| `db:activate` | 已实现并通过临时根演练；真实 execute 仍受授权门禁 |
| 真实环境 | 不得接触真实 workspace、DB、Keychain、provider 或凭据 |

P8、D2-A7、D2-A8 任务目录均已记录实现、证据与复核。Luna 不得重复施工这些阶段，直接进入 M6。

## 3. 阶段任务与硬退出条件

### D2-A5：Dialogue runtime DB 事实源（已完成，勿重复）

目标：将 `ConversationThread`、`ConversationMessage`、`DialogueToolResult`、`DialogueRuntimeSession`、`PendingDialogueArtifact` 变成可重启事实源。

必须完成：

1. provider 调用前先提交 user message 与 assistant `running` 占位；完成、失败、取消都写终态。
2. tool call/result 以 `(threadId, toolCallId)` 幂等；重放不得重复写结果。
3. Script/Outline/Story/Storyboard pending artifact 持久化，并能在 Nest restart 后继续 adopt/discard。
4. running message、active runtime session 在 restart 后进入 `interrupted/failed`，不得永久 running。
5. 内存只保留活动 stream、AbortController 和短期投影；不能把 Map 当事实源。
6. project `deleting`、maintenance `draining/closed`、secret redaction 和错误稳定码必须有测试。

最小验收证据：`REP-08`、`REP-09`、`DLG-01`～`DLG-06`、tool replay、pending restart、fake provider、旧 workspace 隔离。

退出证据：`dialogue_pending_runtime=implemented`、`restartCovered=true`，`P7-DIALOGUE-DB-01`、项目 DB 29/29、server 全量与静态门禁通过；独立提交 `fa26908`。这是 P7 历史阶段值；D2-A6 后当前真实 `blockedIds=[]`。

### D2-A6：Outbox consumer + Project delete（已完成，勿重复）

目标：同一套可恢复 Outbox 同时收口 Project delete 和 Character reference 物理清理。

只允许五类事件：

```text
asset.promote
asset.delete
project.delete_files
secret.delete_old_ref
legacy_metadata.archive
```

必须完成：

1. strict payload codec、唯一 idempotencyKey、claim/heartbeat/lease fencing。
2. 5 秒/30 秒退避、最多 3 次、过期 lease 恢复、postcondition probe、terminal 不重开。
3. Project delete 事务内执行 `active → deleting`、冻结写入、取消可取消任务、写 `project.delete_files` intent。
4. deleting 栅栏覆盖 mutation、task create/claim/retry、Asset promote、current/pending pointer、Dialogue runtime。
5. handler 只删除本项目允许的 metadata/物理目录；不能越界其他项目，也不能删除被历史 Layout/Export 引用的 Asset。
6. Character delete intent 在 handler processed 后才补齐 `delete_character_reference` 的最终 evidence；重复请求、响应丢失、worker 重启、迟到 provider 都必须安全。
7. 真实 `db-capabilities --check` 只能在 36 operation 全闭合后返回 exit 0、`blockedIds=[]`。

最小验收证据：`OTB-01`～`OTB-05`、`DEL-00`～`DEL-05`、`SEC-04/05/11`、`OTB-FS-01`～`03`、`DEL-RUN-01`～`03`。

退出证据：P8 定向 5/5、Nest restart、lease recovery、path/hash fencing、fake secret/metadata archive 与 capability 8/36/0；详见 P8 任务目录。先独立提交，再进入 D2-A7。

### D2-A7：final importer / verifier / ready coordinator

目标：把已有 16-slice shadow mapper 升级为真正 final runner，不复制第二套转换逻辑。

必须完成：

1. 输入必须是 sealed snapshot、有效 decisions、显式空目标 DB/roots、匹配 effective identity 和受控 fake SecretStore。
2. 产生唯一 `MigrationRun(kind=final,status=succeeded)`；report 必须记录 16 slice 的 count/digest/status、source/snapshot/decision/effective identity。
3. 失败、目标非空、source/decision 冲突、secret sentinel 非零时 fail-closed，绝不写 ready。
4. verifier 检查 integrity/FK、ledger、ImportedEntitySource、issue、entity count、current/pending 指针、Asset bytes、公开 DTO。
5. ready coordinator 只在 final succeeded、verification passed、capability=0、blocker=0、secret=0、backup 条件满足且 `activatedAt/firstBusinessWriteAt=null` 时写 `ready_for_activation`。

最小验收证据：`FIN-01`～`FIN-10`，并证明 `db:import --kind final` 在不满足前置条件时仍 fail-closed。

退出：独立提交，状态标记 `d2_final_import_ready`；不得执行真实 final import。

### D2-A8：综合见证

使用正式 CLI/Service，在两个独立 fresh 临时根完成：

```text
snapshot → decisions → final import → verify → ready
```

同时覆盖：同库 replay 零新增、Nest restart、旧 metadata mutation isolation、Asset sha256/bytes、全范围 SEC sentinel、8 capability/36 operation/`blockedIds=[]`、server 全量与 Prisma/G1 门禁。

退出：状态 `d2_passed`，独立提交综合证据；未通过不得进入 M6。

### M6：activate tooling 与 C0～C7 隔离演练

必须实现：

- `CutoverCoordinator` 或等价编排器。
- `db:activate --dry-run|--execute`。
- effective manifest identity 校验。
- maintenance/read/API/rollback smoke。
- metadata-only archive；Asset storage 保留。
- `firstBusinessWriteAt` 业务事务钩子。
- 激活后/首写后 file bridge fence。
- rollback restore ledger/summary。

只在带唯一 marker 的三根临时 fixture 按顺序执行：

```text
C0 release/门禁
→ C1 drain/closed
→ C2 snapshot/备份恢复
→ C3 fresh DB + fake SecretStore
→ C4 final import/verify/ready
→ C5 DB maintenance smoke
→ C6 metadata-only archive
→ C7 activate execute + reopen writes
```

必须覆盖 `ACT-01`～`ACT-09`、`RB-01`～`RB-06` 及适用 RST/FLT。`--dry-run` 必须零写；`firstBusinessWriteAt` 非空后禁止 file-only rollback；不提供自动 down migration。

退出：独立提交，状态 `m6_tooling_passed`。

### 最终停点

生成总进度、capability/final/replay/WIT/C0～C7 摘要、最终 Scrutiny Review、Runtime Review、完成记录和 `real_cutover_handoff.md`。最终状态只能写：

```text
ready_for_real_cutover_authorization
```

到这里停止，集中向用户申请一次真实切换授权；本施工单不执行 R1。

## 4. 每阶段统一执行模板

每阶段都按以下顺序，不得跳过：

1. 读本阶段契约、file map、test matrix 和现有代码。
2. 先补会失败的 contract/integration test，再实现。
3. 定向测试通过后跑 server 全量（显式 30 秒超时）。
4. 跑 workspace typecheck、web build、Prisma validate、G1 manifest/schema/migration、`git diff --check`。
5. 做只读 Scrutiny Review；适用时在 fresh 临时根做 Runtime Review。
6. 更新 `execution_status.md`、`progress.md`、阶段目录和 capability evidence。
7. 每阶段只提交自己的代码、测试和记录；提交后才进入下一阶段。

统一门禁命令：

```bash
corepack pnpm --filter @airoaming/server test -- --testTimeout=30000
corepack pnpm -w typecheck
corepack pnpm --filter @airoaming/web build
corepack pnpm --filter @airoaming/server g1:manifest:check
corepack pnpm --filter @airoaming/server g1:schema:check
corepack pnpm --filter @airoaming/server g1:migration:check
git diff --check
```

## 5. 禁止事项与停止规则

禁止：真实 workspace/DB/Keychain/provider key、真实 final import、真实 `db:activate --execute`、真实维护窗口、真实 metadata archive/delete、修改 0001～0010 migration、跳过 Outbox 直接 `rm`、用拒绝响应冒充 implemented、继续扩大 review-attestation/CAS 审查基础设施。

只有以下情况才停止并汇总：需要真实环境授权；同一硬阻塞连续三轮有证据仍无法推进；无法绕开的用户未提交冲突；权威文档冲突且无法由更晚事实源消解。普通测试失败、重构、补测试和小型 0011+ migration 不得停。

## 6. 领取入口

Luna 先读本文件，再读同目录：

1. `handoff.md`
2. `implementation_contract.md`
3. `test_matrix.md`
4. `file_map.md`
5. `remaining_work.md`
6. `autonomy_protocol.md`
7. 当前阶段对应的 D2 施工资料和 G1 验收清单。

本文件解决“做什么、顺序是什么、做到什么算完”；各阶段原始契约解决“具体文件、函数、字段和测试编号”。
