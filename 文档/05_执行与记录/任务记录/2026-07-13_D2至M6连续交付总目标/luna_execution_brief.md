---
doc_id: AIR-D2-M6-LUNA-BRIEF-001
status: superseded
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: ai-agent, developer, qa, human
source: 当前代码、capability CLI、D2/M6 总 Handoff
---

# Luna 连续施工简版

> 已失效。请从 `../2026-07-13_M6-A1真实切换验收补强/handoff.md` 开始。

## 1. 领取方式

从本文件开始执行，不需要用户逐阶段确认。完整契约仍以同目录的 `handoff.md`、`remaining_work.md`、`implementation_contract.md`、`test_matrix.md` 为准；本文件只把“现在做什么、做到什么算完、下一步是什么”压成可执行清单。

当前不是 M5 施工：M5-A0～A4 已完成。D2-A5 Dialogue runtime 已完成并提交 `fa26908`，D2-A6 已提交 `075986f`；当前接管点是 D2-A7，工作树有未验收草稿。请以同目录 `luna_execute_all_remaining.md` 为唯一执行入口，不能重复施工 P7/P8、不能跳到 M6，也不能把未验收草稿当成 implemented。

## 2. 开工前事实检查

执行并把原始 JSON 摘要写入阶段记录：

```bash
git status --short
git rev-parse HEAD
corepack pnpm --filter @airoaming/server exec tsx src/migration/db-capabilities.cli.ts --format json
corepack pnpm --filter @airoaming/server exec tsx src/migration/db-capabilities.cli.ts --check --format json
```

当前应看到：8 个聚合 capability、36 个 operation、`blockedIds` 精确为：

```text
character_scene_asset_candidate_lock
project_delete_outbox
```

当前已绿且不得回退：`project_chapter_script`、`outline_story_storyboard_preflight`、`layout_export`、`dialogue_pending_runtime`、`task_create_claim_complete_cancel_recover`、`settings_credential_secret_store`。当前 `character_scene_asset_candidate_lock` 仍是 `partial`，唯一未闭合 operation 是 `delete_character_reference`；另一个 blocker 是 Project delete/Outbox。

## 3. 连续执行顺序

### 当前接管点：P9 D2-A7

P7 Dialogue 已由 `fa26908` 独立提交，P8 Outbox/Project delete 已由 `075986f` 独立提交。不要重复审查/实现 P7/P8，按 `luna_execute_all_remaining.md` 收口当前 D2-A7 草稿。

### P5 收口：Character delete（先做契约，后等 Outbox）

目标：完成 `delete_character_reference` 的 DB 业务语义，但在 Outbox consumer 未存在前不得宣称 capability 已绿。

必须做：

- 校验 Character、Asset、Visual、Candidate/Lock 的同项目/同章节范围。
- 禁止删除 Character、历史 Visual、已被 Candidate/Lock/Layout/Export 引用的历史 Asset。
- 事务内只切换 current/preview 引用、标记允许清理的 Asset，并写唯一 `asset.delete` intent；响应重放不新增 intent。
- 公开 API 返回稳定的 pending/accepted 语义；物理删除只能由 P8 Outbox handler 完成。
- 补“当前视觉删除、主视觉锁定、历史引用保护、重复请求、响应丢失、旧 workspace 隔离”测试。

退出条件：P5 intent 测试和契约通过后，记录为 `passed_for_intent_boundary`，立即进入 P6；capability 保持 `partial`，不得修改 blocker 数字。物理删除、processed fencing 和 `delete_character_reference` 的最终 evidence 统一在 P8 Outbox 完成后回补。

### P6：Layout/Export DB-only

关闭 `build_layout`、`export_layout`、`export_asset_package`。

- Layout Working Copy 使用 rowVersion CAS；seal 创建不可变 LayoutRevision 与完整 source binding。
- binding 必须能追溯 Shot→Candidate→CandidateLockRevision→Asset；换锁只产生 stale，不改写旧 Layout。
- Export/Package 只从 DB 文档、关系和受控 Asset storage 生成，不扫描旧业务 JSON/Markdown。
- staging 文件必须 temp→fsync→rename，失败不得出现半成品；ready/current 只在 postcondition、digest、renderer/profile/source digest 全齐后写入。
- 导出和 manifest 全部通过 credential redactor/sentinel。

证据：LAY-01～06、EXP-01～06、A4-LAY-RESTART、A4-LAY-STALE、A4-EXP-FAIL、A4-EXP-REPLAY、A4-PKG-DB、A4-SECRET。通过后把 `layout_export` 从 unsupported 升为 implemented，`restartCovered=true`，并按真实 report 计算 blocker，不得手改数字。

### P7：Dialogue runtime DB 事实源

关闭 `dialogue_pending_runtime`。

- Thread、Message、running assistant、ToolResult、PendingDialogueArtifact、RuntimeSession 全部持久化。
- provider 调用前先提交 user + assistant running；重启后 running 收敛为 interrupted/failed。
- toolCall 幂等；pending adopt/discard 可重启继续；活动 stream/AbortController 只能留在内存。
- maintenance draining/closed、project deleting、secret redaction 和错误稳定码必须覆盖。

证据：REP-08、REP-09、DLG-01～06、restart/replay。通过后 capability 变 implemented、`restartCovered=true`。

### P8：Outbox consumer + Project delete（同时闭合 Character delete）

关闭 `project_delete_outbox`，并回头完成 P5 的 Character delete capability。权威 handler 仅允许这五类：

```text
asset.promote
asset.delete
project.delete_files
secret.delete_old_ref
legacy_metadata.archive
```

必须实现：strict payload codec、唯一 idempotencyKey、claim/heartbeat/lease fencing、5/30 秒退避、最多 3 次、过期恢复、postcondition probe、terminal 不重开、递归 redactor。Project delete 必须事务内 active→deleting、取消可取消任务、冻结 manifest、写 `project.delete_files` intent；只有 handler processed 且无 active runtime task 才允许 purge。

证据：OTB-01～05、DEL-00～05、SEC-04/05/11、OTB-FS-01～03、DEL-RUN-01～03。通过后运行 `db-capabilities --check`，唯一正确结果是 exit 0、`blockedIds=[]`；同时把 `delete_character_reference` 的真实证据补入 registry。禁止用“物理 rm 已执行”替代 Outbox 证据。

### P9：D2-A7 final importer / verifier / ready coordinator

- 复用现有 16-slice shadow mapper，不复制第二套转换逻辑。
- final 只接受 sealed snapshot、decisions、显式空目标 DB/roots、匹配 effective identity 和受控 SecretStore。
- 产生唯一 `MigrationRun(kind=final,status=succeeded)`；报告包含 16 slice 的 count/digest/status、source/snapshot/decision/effective identity。
- 失败、重放冲突、目标非空、secret sentinel 非零时 fail-closed，绝不写 ready。
- verifier 覆盖 integrity/FK/ledger/source/current/pending/Asset/API；ready coordinator 同事务校验 capability=0、blocker=0、secret=0、backup 条件，写 `ready_for_activation`，但 `activatedAt` 和 `firstBusinessWriteAt` 必须为空。

证据：FIN-01～10。`db:import --kind final` 不得在未满足条件时放行。

### P10：D2-A8 综合见证

使用正式 CLI/Service，在两个独立 fresh 临时根完成 snapshot→decisions→final import→verify；做同库 replay、Nest restart、旧 metadata mutation isolation、Asset digest、全范围 SEC sentinel、capability 8/36/0。通过后状态写为 `d2_passed`。

### P11：M6 tooling 与隔离 C0～C7

实现 `CutoverCoordinator`、`db:activate --dry-run|--execute`、effective manifest identity、maintenance/read/API/rollback smoke、metadata-only archive、firstBusinessWriteAt 钩子、file bridge fence、rollback summary。只在三根带 marker 的临时 fixture 依次演练 C0→C7，不接真实 DB、workspace、Keychain、provider 或凭据。

证据：ACT-01～09、RB-01～06、RST/FLT 适用项和 M6-C0～C7。`--dry-run` 必须零写；firstBusinessWriteAt 非空后禁止 file-only 回滚。

### P12：最终停点

生成总进度、最终 capability/final/replay/WIT/C0～C7 摘要、Scrutiny Review、Runtime Review、完成记录和 `real_cutover_handoff.md`。最终状态只能是：

```text
ready_for_real_cutover_authorization
```

到这里停止，集中向用户申请一次真实切换授权；本连续任务不执行 R1。

## 4. 每阶段固定门禁

每阶段都必须：先失败测试→实现→定向测试→server 全量→typecheck/web build→Prisma/G1→diff check→Scrutiny→适用 Runtime→文档→独立 commit。server 全量统一使用 30 秒超时，命令为：

```bash
corepack pnpm --filter @airoaming/server test -- --testTimeout=30000
corepack pnpm -w typecheck
corepack pnpm --filter @airoaming/web build
corepack pnpm --filter @airoaming/server g1:manifest:check
corepack pnpm --filter @airoaming/server g1:schema:check
corepack pnpm --filter @airoaming/server g1:migration:check
git diff --check
```

每个阶段只提交自己的代码、测试和简短记录；不提交真实数据库、workspace、图片、Keychain、provider key、完整日志或自建 review-attestation/CAS 流程。

## 5. 只有这些情况才停

需要真实环境授权、同一硬阻塞有三轮有证据方案仍无法推进、发现无法安全绕开的用户冲突改动，或正式文档互相冲突且无法由更新事实源消解。普通测试失败、重构、补 migration、补测试都继续在当前阶段解决，不要把问题抛回用户。
