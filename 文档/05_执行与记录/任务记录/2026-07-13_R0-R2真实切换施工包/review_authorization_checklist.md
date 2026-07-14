---
doc_id: AIR-RCUT-REVIEW-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: reviewer, qa, release-owner, human, ai-agent
source: R0-A 实施契约、R1 Runbook、G1 正式验收清单
---

# R0-R2 复核、授权与回滚清单

## 1. 使用规则

- Worker/Luna 只能勾选“实现完成”和自动测试结果，不能勾选 Scrutiny、SH-10 或真实授权。
- Scrutiny Reviewer 只读复核，不在复核阶段修代码。
- Runtime Reviewer 的 `passed_isolated` 不等于真实切换授权。
- AUTH-C1/C5/C7 必须是三个独立、绑定当前 evidence digest 的授权文件，不能用一次“继续”覆盖全部阶段。
- 任一身份、路径、digest 或责任人变化，旧授权失效。

## 2. R0-A Scrutiny Review

### SecretStore

- [x] final/ready 生产入口不再硬编码 fake adapter/root。
- [x] production 通过 SecretStore 窄接口验证 Keychain health 和 fingerprint。
- [x] 自动化测试只用 fake store/fake executor，真实 `security` 调用为 0；另有授权 disposable smoke，未触碰默认用户 Keychain。
- [x] Keychain put 的 args 不含 secret；不存在 `-w <secret>`，敏感输入不进入继承 stdout/stderr 或错误对象。
- [x] secret 不进入 argv/stdout/stderr/evidence/DB/backup/archive/git。
- [x] legacy plaintext 使用 prestage→verify→atomic redact；失败旧字节不变。
- [x] 已脱敏起点不恢复 plaintext、不重写 secretRef。

### Runtime bundle

- [x] closed profile 验证 top-level active mutation/stream=0。
- [x] 每个 participant active/queued=0、blockedReason=null。
- [x] 缺字段、旧弱 bundle、digest/secret 篡改均拒绝。

### Evidence/Activate

- [x] evidence manifest 含 cutoverId/appCommit/plan/run/source/snapshot/decisions/effective identity。
- [x] step/manifest/C6_READY/COMPLETED canonical digest 可重算。
- [x] temp→fsync→rename→parent fsync；失败不推进。
- [x] activate 的 maintenance/evidence/authorization 字段 required。
- [x] CLI 缺任一字段在 Prisma 初始化前失败。
- [x] activate 复用单一 verified evidence loader，不保留弱 parser。
- [x] C6_READY 必须验证内容 digest，不只判断存在。
- [x] dry-run 零写；execute 只写 db_only+activatedAt。

### Production runner

- [x] `db:cutover status/step` 入口存在且 exact grammar。
- [x] C0 是无 AUTH 的只读证据步；C0 passed 后才能生成 AUTH-C1。
- [x] 一次只执行下一 step；同输入 replay、不同输入冲突。
- [x] C0～C7 调用真实 domain service，不用 marker 代替（仅隔离执行，真实运行仍待授权）。
- [x] C6 真实调用 MetadataArchiveService。
- [x] C7 顺序固定为 activate→evidence→COMPLETED→reopen→first write（隔离 fresh 链）。
- [x] child process 不使用 shell，测试可注入 fake executor。
- [x] 所有自动化测试仅临时根；disposable smoke 仅使用临时 HOME/Keychain，无默认用户 Keychain、真实 DB、provider、workspace 操作。

### 回归与文档

- [x] R0-A 矩阵所有自动化项 passed_isolated；RCUT-SEC-13 为 `passed_real_disposable`。
- [x] server 全量、typecheck、build、Prisma/G1/capability/diff check 全绿。
- [x] progress/findings/完成记录或阶段记录已同步。
- [x] 未跟踪 DB、图片、secret、真实报告、绝对路径或大型 trace。

Scrutiny 输出：

```text
结论：passed / changes_requested
生产 SecretStore：
证据/activate 绕过检查：
runner C0～C7 完整性：
测试隔离：
残留风险：
```

## 3. R0-A Runtime Review（隔离）

- [x] 两个 fresh 临时根完成完整 C0～C7（真实 domain service，fake maintenance/SecretStore，仅隔离 SQLite）。
- [x] C5 smoke 失败路径已通过隔离测试。
- [x] C7 crash/reopen、first-write/file-guard 故障路径已通过隔离 fresh 链。
- [x] RCUT-RB-01 C1～C4 统一失败矩阵完成。
- [ ] 真实 Prisma migrate/final/ready/backup/materialize/API/activate/first write。
- [ ] 允许的 fake 仅 SecretStore/provider/command executor。
- [ ] resume、tamper、C4 failure、C5 failure、C7 crash-reconcile 通过。
- [ ] fake executor 证明未调用系统 `security` 和真实应用进程。
- [ ] 全根 sentinel scan=0（fake secret root 单独 allowlist）。

Runtime 输出状态只能是：

```text
passed_isolated
changes_requested
```

## 4. R0-B Release/Plan Review

- [ ] R0-A 独立提交已固定且工作树干净。
- [ ] release appCommit、Node/pnpm/Prisma、schema/migration checksum 冻结。
- [ ] plan 文件 0600；evidence/backup/restore/archive roots 0700。
- [ ] 所有真实路径由 release owner 在仓库外填写。
- [ ] 根两两不重叠，目标为空，无 symlink，空间足够。
- [ ] maintenance loopback/token file 权限通过。
- [ ] 当前 settings 起点已判定为 `already_sanitized` 或 `legacy_plaintext_requires_two_phase`。
- [ ] Keychain 与 OpenCode auth 责任边界确认。
- [ ] release-specific SH-01～09 全绿。
- [ ] Migration reviewer 完成 SH-10；报告 blocker=0，warning 已接受。
- [ ] rollback owner、窗口和恢复联系人已登记。

不得写入仓库的字段：

```text
真实绝对路径
用户名/账户名
token file 内容
secretRef 原值
Keychain 输出
用户正文、完整 prompt、真实图片
```

## 5. C0 与 AUTH-C1

C0 先行检查：

- [ ] C0 未接收 authorization file，只执行 release/capability/root/space/SH-01～10 的只读检查。
- [ ] C0 passed evidence 可独立重算，planDigest 与 R0-B 冻结值一致。

授权文件检查：

- [ ] scope=`AUTH-C1`。
- [ ] cutoverId/appCommit/planDigest/runId/evidenceDigest 精确匹配 C0 passed gate。
- [ ] 用户确认只授权停写及 plan 指定的 C3 Keychain verify/prestage，不授权 C5/C7。
- [ ] authorizedAt/authorizedBy/authorizationDigest 有效。
- [ ] Luna/Codex 没有代签。

缺失时最终结论：`blocked_waiting_auth_c1`。

## 6. C1～C4 运行复核

- [ ] 进入 C1 前 AUTH-C1 精确绑定 C0 evidence，后续 C1～C4 校验该历史 gate digest。
- [ ] C1 同 PID closed，全部 active/queued=0，runtime bundle 严格有效。
- [ ] C2 source pre/post 相同，snapshot sealed，settings 仅 redacted artifact。
- [ ] C3 fresh DB/migration exact；Keychain evidence 匹配；旧 settings 按起点规则处理。
- [ ] C4 final succeeded、16 slice、blocker=0、integrity/FK/secret=0。
- [ ] ready identity 精确；activatedAt/firstBusinessWriteAt=null。
- [ ] legacy plaintext 若存在，只在 C4 全绿后原子清除。
- [ ] pre-cutover backup sealed；verify-only/materialize/API/Asset hash 全绿。
- [ ] C0～C4 evidence 可独立重算。

## 7. AUTH-C5 与 C5/C6

- [ ] AUTH-C5 绑定 C4 evidence digest。
- [ ] 用户明确授权关闭旧 file 进程并进入 smoke/archive，未授权 C7。
- [ ] C5 DB-mode closed 启动健康，关键只读路径通过。
- [ ] ephemeral business write 完整 rollback，firstBusinessWriteAt=null。
- [ ] 日志无 fallback/secret/未处理 lease/outbox。
- [ ] C6 archive metadata-only、Asset bytes 未复制、活动 Asset 可读。
- [ ] archive/evidence/runtime roots secret scan=0。
- [ ] C6_READY 内容与 manifest digest 精确一致。

缺失时最终结论：`blocked_before_activation`。

## 8. AUTH-C7 与不可逆边界

- [ ] AUTH-C7 绑定最新 C6 evidence digest。
- [ ] 用户明确理解首次业务写后禁止 file-only/down migration。
- [ ] activate dry-run 零写且全绿。
- [ ] execute 前 PersistenceState=ready、firstBusinessWriteAt=null。
- [ ] execute 后仅 db_only+activatedAt。
- [ ] C7/COMPLETED 在 reopen 前落盘并复核。
- [ ] 第一笔真实业务写与 firstBusinessWriteAt 同事务。
- [ ] file bridge 启动明确拒绝。

缺失时不得把状态写成 `real_cutover_completed`。

## 9. 回滚决策

| 时点 | 允许动作 | 禁止动作 |
| --- | --- | --- |
| C0 前或 C0 失败 | 修文档/plan，重新运行 C0；不得生成授权 | 无授权停写 |
| C1～C3 失败 | 保持旧进程 closed；授权后 reopen；清理新目标/prestage | 双边写、恢复 plaintext 副本 |
| C4 失败 | 丢弃目标；按 settings 起点从 Keychain 或旧字节恢复服务 | 伪造 ready、跳过 blocker |
| C5/C6 失败且无首写 | 使用 snapshot/runtime/pre-cutover 证据恢复同 bridge release | 更旧应用、down migration |
| execute 后无首写 | 仅经授权恢复 pre-cutover bundle或 reconcile C7 | 手改 PersistenceState |
| 首写后 | 兼容 DB 应用或 coordinated backup restore | file-only、自动 down、旧 metadata 覆盖 DB |

每次回滚必须新建 rollback run/evidence，不删除原 final/cutover 证据。

## 10. R2 观察期与最终结论

- [ ] OBS-01～10 全部 `passed_real`。
- [ ] 观察期内未读写旧业务 JSON/Markdown。
- [ ] 三次重启、任务 crash、迟到结果、Asset 恢复、删除 Outbox、backup restore 通过。
- [ ] 真实项目逐阶段只读可用。
- [ ] 全局 secret scan=0。
- [ ] 旧 metadata/backup 仍保留，未自动删除。

允许的状态流：

```text
production_entry_changes_required
-> ready_for_real_cutover_authorization_review
-> blocked_waiting_auth_c1
-> authorized_for_c1
-> blocked_waiting_auth_c5
-> authorized_for_c5
-> blocked_waiting_auth_c7
-> authorized_for_c7
-> real_cutover_completed
-> db_only_observation_passed
```

只有 `db_only_observation_passed` 后，才允许进入 G4。
