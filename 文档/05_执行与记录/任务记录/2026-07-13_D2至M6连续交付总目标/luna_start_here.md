---
doc_id: AIR-D2-M6-LUNA-START-002
status: ready_for_luna_next_stage
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: ai-agent, developer, qa, human
source: 当前 HEAD、capability CLI 与 D2/M6 总施工资料
---

# Luna 当前执行入口

## 先看结论

M5 已完成，不要重复施工。D2-A5 Dialogue runtime 已完成并独立提交，D2-A6 Outbox/Project delete 也已完成并复核；P8 独立提交正在收口。

Luna 从 **D2-A7 final importer / verifier / ready coordinator** 开始，连续执行到 M6 隔离演练结束；每阶段内部测试、复核、独立提交后自动进入下一阶段，不需要用户逐步确认。

当前真实基线：

```text
capabilities = 8
operations = 36
blockedIds = []
```

已绿且不能回退：

```text
project_chapter_script
outline_story_storyboard_preflight
layout_export
dialogue_pending_runtime
task_create_claim_complete_cancel_recover
settings_credential_secret_store
```

## 开工核对

```bash
git status --short
git rev-parse HEAD
cd apps/server
node --import tsx src/migration/db-capabilities.cli.ts --format json
node --import tsx src/migration/db-capabilities.cli.ts --check --format json
```

预期：先确认 P8 独立提交已存在；report 为 8/36/0，`--check` exit 0。若工作树仍有 P8 草稿，先完成提交和记录，不得重复实现。

## 连续顺序

### 1. D2-A6：Outbox + Project delete（已完成，禁止重复施工）

交付一个可恢复的 Outbox consumer，并同时完成 Character delete 物理清理：

- 只允许 `asset.promote`、`asset.delete`、`project.delete_files`、`secret.delete_old_ref`、`legacy_metadata.archive` 五类事件。
- payload 严格解码；事件有唯一 `idempotencyKey`；claim、heartbeat、lease token、过期恢复和 owner fencing 完整。
- 失败按 5 秒/30 秒退避，最多 3 次；processed/failed 是终态，不能重开。
- 每个 handler 先做 postcondition probe；路径必须在受控临时根内，不能跨项目、不能删除历史引用资产。
- Project delete 在一个事务内完成 `active → deleting`、冻结 manifest、取消可取消任务、写 `project.delete_files` intent；deleting 栅栏覆盖 mutation、task、Asset、pointer、Dialogue。
- 只有 delete event processed 且无 active runtime task 才允许 DB purge。
- Character delete 只清理允许的当前视觉物理文件；历史 Visual、Candidate、Layout、Export 引用必须保留。

最低证据：`OTB-01～05`、`DEL-00～05`、`SEC-04/05/11`、`OTB-FS-01～03`、`DEL-RUN-01～03`。

退出证据：见 `2026-07-13_D2-A6项目删除与Outbox/`，P8 定向 5/5、restart/lease/path/secret 证据通过，capability `blockedIds=[]`。

### 2. D2-A7：final importer / verifier / ready coordinator

- 复用现有 16-slice shadow mapper，不复制第二套转换逻辑。
- 只接受 sealed snapshot、有效 decisions、显式空目标 DB/roots、匹配 effective identity 和 fake/受控 SecretStore。
- final run、16 slice report、ledger、source/effective identity、integrity/FK、current/pending、Asset bytes、公开 DTO 全部可验证。
- 目标非空、digest 冲突、secret sentinel 非零、任一 slice 失败时 fail-closed，绝不写 ready。
- 只有 final succeeded、verify passed、capability=0、blocker=0、secret=0、backup 条件满足且 `activatedAt/firstBusinessWriteAt=null` 才能写 `ready_for_activation`。

最低证据：`FIN-01～10`；不得执行真实 final import。

### 3. D2-A8：双 fresh/replay 综合见证

使用正式 CLI/Service，在两个独立临时根完成 `snapshot → decisions → final import → verify → ready`，并覆盖同库 replay 零新增、Nest restart、旧 metadata 隔离、Asset sha256/bytes、全范围 SEC sentinel、8/36/0 capability。通过后标记 `d2_passed` 并独立提交。

### 4. M6：activate tooling + C0～C7 隔离演练

实现 `CutoverCoordinator`（或等价编排器）、`db:activate --dry-run|--execute`、effective manifest 校验、maintenance/read/API/rollback smoke、metadata-only archive、`firstBusinessWriteAt` 钩子、file bridge fence 和 rollback summary。

只在带唯一 marker 的三根临时 fixture 依次执行：

```text
C0 release/门禁 → C1 drain/closed → C2 snapshot/恢复 → C3 fresh DB/fake SecretStore
→ C4 final/verify/ready → C5 maintenance smoke → C6 metadata-only archive
→ C7 activate execute/reopen writes
```

`--dry-run` 必须零写；`firstBusinessWriteAt` 非空后禁止 file-only rollback；不提供自动 down migration。

## 每阶段固定门禁

```bash
corepack pnpm --filter @airoaming/server test -- --testTimeout=30000
corepack pnpm -w typecheck
corepack pnpm --filter @airoaming/web build
corepack pnpm --filter @airoaming/server g1:manifest:check
corepack pnpm --filter @airoaming/server g1:schema:check
corepack pnpm --filter @airoaming/server g1:migration:check
git diff --check
```

定向测试、Scrutiny Review、适用的临时根 Runtime Review、阶段文档和独立 commit 缺一不可。真实 workspace、DB、Keychain、provider、凭据、真实 final import、真实 `db:activate --execute` 和真实 C0～C7 全部禁止。

## 最终停止条件

生成最终 capability/final/replay/WIT/C0～C7 摘要、Scrutiny Review、Runtime Review、完成记录和 `real_cutover_handoff.md`，状态只能写：

```text
ready_for_real_cutover_authorization
```

到此停止，向用户集中申请一次真实切换授权；本任务不执行 R1。

## 详细资料

按以下顺序补充阅读：

1. `luna_remaining_work_handoff.md`
2. `handoff.md`
3. `remaining_work.md`
4. `implementation_contract.md`
5. `test_matrix.md`
6. `file_map.md`
7. `autonomy_protocol.md`
