---
doc_id: AIR-RCUT-LUNA-REVIEW-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: human, ai-agent, developer, qa, release-owner
source: R0-A 当前实现、隔离测试与复核清单
---

# R0-A Luna 独立复核与提交收口 Handoff

## 1. 交付目标

本任务只收口 R0-A 的最后一道门：由独立于当前实现者的 Luna 对生产入口代码做一次静态 Scrutiny Review 和一次隔离 Runtime Review；如发现阻塞，只修 R0-A 范围并重新验证；全部通过后创建一个独立提交。

完成后的允许状态是：

```text
production_entry = ready_for_real_cutover_authorization_review
real_operations = 0
R0-B/R1/R2 = not_started
```

这不是授权真实切换，也不是填写真实 plan。完成后必须停止，等待用户另行授权 R0-B。

## 2. 当前基线

- R0-A 完整定向基线：14 个 spec、106 个测试通过；最新 SecretStore/runner 定向为 18 个测试通过，真实 disposable smoke 另有脱敏运行证据。
- 服务端全量：69 个 spec、472 个测试通过。
- workspace typecheck、server/web build、Prisma/G1/capability、`git diff --check` 已通过。
- 两个 fresh 临时根已完成真实 domain C0～C7；另有 C1～C4 统一失败矩阵、C5 smoke failure、C7 crash/reopen、首笔写入后的 file-guard 证据。
- `luna_independent_scrutiny_review.md` 已由 Luna 基于最新工作树更新为 `passed`；`luna_independent_runtime_review.md` 为 `passed_isolated`。两份记录只覆盖 R0-A 与隔离平台 smoke，不代表真实 C0～C7 或 AUTH。
- 已在临时 HOME/disposable Keychain 上完成一次受控真实 `/usr/bin/security` 子进程 smoke；默认用户 Keychain、provider、workspace/dataRoot、维护 API、真实数据库和真实用户凭据操作次数均为 0，未生成 AUTH。

## 3. 必读顺序

1. 本文件。
2. `handoff.md`。
3. `implementation_contract.md`。
4. `evidence_and_test_matrix.md`。
5. `review_authorization_checklist.md`。
6. `progress.md`、`findings.md`、`real_cutover_runbook.md`。
7. `apps/server/src/migration/cutover-runner.service.ts` 及其 spec。
8. `apps/server/src/migration/cutover-plan.service.ts`、`cutover-evidence.service.ts`、`db-cutover.service.ts` 及其 spec。
9. `apps/server/src/settings/secret-store.ts`、`cutover-credential-verifier.ts`、`cutover-settings.service.ts` 及其 spec。

## 4. 执行边界

### 允许

- 只读检查当前 diff、源码、测试和 R0-A 文档。
- 在 `os.tmpdir()` 下创建唯一临时根和隔离 SQLite。
- 使用 fake SecretStore、fake security executor、fake maintenance/provider/command executor。
- 如果发现真实阻塞，只修改 R0-A 生产入口、测试和对应留痕文档。
- 重新运行定向测试、服务端全量和静态门禁。
- 在所有门禁通过后，提交 R0-A 相关文件。

### 禁止

- 不访问真实 workspace、dataRoot、数据库、Keychain、provider、维护 API 或用户凭据。
- 不执行 `db:cutover` 的真实 plan，不生成 `AUTH-C1`、`AUTH-C5`、`AUTH-C7`。
- 不执行真实停写、snapshot、final import、backup、restore、archive、activate 或首笔真实业务写入。
- 不修改 Prisma schema、migration tree、trigger、G4/G5、R0-B/R1/R2。
- 不把当前 Codex 的 Review 原文直接改成通过；必须留下 Luna 独立检查的文件、命令、结果和残留风险。
- 不提交 `文档/05_执行与记录/任务记录/2026-07-14_项目完成度复核/` 等无关改动。

## 5. 阶段 A：静态 Scrutiny Review

### A1. 先确认范围

检查：

- `git diff --name-only` 是否只包含 R0-A 实现、测试和留痕；发现无关改动时不要删除，记录并从提交中排除。
- R0-A 是否仍未修改 schema/migration/trigger。
- 新增文件是否都在临时测试边界内，没有真实路径、真实 secret、真实绝对路径或大体积 trace。

### A2. 必查不变量

- Secret 不进入 argv、stdout/stderr、日志、evidence、DB、backup、archive 或 git；Keychain put 不能使用 `-w <secret>`。
- legacy settings 必须先 prestage/verify，再 temp→write→fsync→rename；put、verify、write、fsync、rename 任一步失败时旧文件字节不变且无明文副本。
- runtime cutover profile 必须 closed；top-level 和每个 participant 的 active/queued 都为 0，`blockedReason=null`。
- evidence 必须绑定 cutoverId、appCommit、planDigest、runId、source/snapshot/decisions/effective identity；C6_READY/COMPLETED 必须校验内容 digest。
- C0～C7 不能跳步；同输入只能 replay，不同 identity 必须冲突；失败 step 不得写 passed。
- C7 必须遵守 `activate → evidence → COMPLETED → reopen → first write`；db_only 且 `firstBusinessWriteAt=null` 的崩溃恢复不能重写 `activatedAt`；首笔写入后 file bridge 必须拒绝。
- child process 必须 `shell:false`，secret 只能通过受控敏感输入通道传递。
- 所有真实系统依赖必须在依赖注入边界之外，测试只能注入 fake。

### A3. 静态结论

把独立结论写入 `scrutiny_review.md`：

- 无阻塞：`status: passed`，列出检查过的文件、关键结论和 diff 范围。
- 有阻塞：保持 `status: changes_requested`，每条写明复现方式、影响、最小修复和重新验证命令；修复后重新执行 A1～A3。

## 6. 阶段 B：隔离 Runtime Review

### B1. 定向测试

使用当前矩阵第 11 节的命令。若文件列表发生变化，先同步命令，不能执行指向不存在 spec 的旧命令。必须确认：

- 14 个 spec、106 个测试通过；
- 最新 Keychain 生产参数为 `-U -w`，`-w` 最后；`RCUT-SEC-13` 的临时 HOME/disposable Keychain smoke 已通过，完整服务端全量为 69 spec/472 tests；
- 测试只创建唯一临时根；fake SecretStore/security/maintenance/provider/command executor 调用真实次数为 0；
- C1～C4 失败矩阵、C5 smoke failure、C7 crash/reopen、首写 file-guard 和 RCUT-RB-01 均有直接断言。

### B2. 全量门禁

依次执行：

```text
pnpm --dir apps/server test -- --pool=forks --poolOptions.forks.singleFork=true --testTimeout=60000 --reporter=dot
pnpm typecheck
pnpm --dir apps/server build
pnpm --dir apps/web build
pnpm --dir apps/server prisma:validate
pnpm --dir apps/server g1:manifest:check
pnpm --dir apps/server g1:schema:check
pnpm --dir apps/server g1:migration:check
pnpm --dir apps/server db:capabilities --check --format json
git diff --check
```

### B3. 运行结论

把独立结论写入 `runtime_review.md`：

- 自动化与隔离链全绿：`status: passed_isolated`；明确“真实系统未触碰”。
- 任一测试或隔离链失败：`status: changes_requested`；不得用历史通过数字覆盖失败。

## 7. 阶段 C：修复规则（只有发现阻塞时执行）

1. 先新增一个带 `RCUT-*` ID 的失败测试，证明问题真实存在。
2. 只改 R0-A 相关实现，不扩大到 R0-B/R1/R2。
3. 重新跑受影响 spec，再跑完整定向、全量和静态门禁。
4. 更新 `progress.md`、`findings.md`、`scrutiny_review.md`、`runtime_review.md` 和 `evidence_and_test_matrix.md`。
5. 仍有任何阻塞就停在 `changes_requested`，不得提交“半通过”状态。

## 8. 阶段 D：独立提交

只有同时满足以下条件才允许提交：

- Scrutiny=`passed`；
- Runtime=`passed_isolated`；
- RCUT-REG-01～07 全部 `passed_isolated`；RCUT-REG-08 更新为独立复核通过；
- 总状态更新为 `ready_for_real_cutover_authorization_review`；
- `git diff --check` 通过；
- 提交中没有真实路径、secret、数据库文件、图片、trace 或无关项目审计文档。

提交前使用显式路径逐项暂存，不要使用全量暂存。提交信息建议：

```text
chore(migration): close R0-A production entry review
```

提交后记录 commit SHA、提交文件清单和所有验证命令；工作树中的无关改动不得被带入提交。

## 9. 停止条件

出现任一情况立即停止并报告：

- 需要真实路径、真实凭据或真实 Keychain 才能验证；
- 需要修改 schema/migration/trigger；
- 需要生成 AUTH 文件或执行真实 C0～C7；
- 测试不再能保证临时根隔离；
- 无法把修复限制在 R0-A；
- Scrutiny 或 Runtime 仍有阻塞。

## 10. 交付格式

```text
结论：ready_for_real_cutover_authorization_review
独立 Scrutiny：passed
独立 Runtime：passed_isolated
定向：<spec>/<tests>
全量：<spec>/<tests>
静态门禁：typecheck/build/Prisma/G1/capability/diff
新增或修复：<文件和 RCUT ID>
独立提交：<sha；若未通过则填未提交>
真实系统操作：0
停止点：未生成 AUTH，未进入 R0-B/R1/R2
残留风险：<只写真实存在的风险>
```
