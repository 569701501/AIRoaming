---
doc_id: AIR-RCUT-R0B-SH10-HUMAN-HANDOFF-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: release-owner, rollback-owner, migration-reviewer, human, ai-agent
source: SH-10 技术证据收口与 CutoverPlanV1 契约
---

# R0-B SH-10 人工审阅 Handoff

## 1. 当前结论

```text
technical evidence remediation = completed
SH-01..SH-09 = passed_release_shadow
human roles/window/settings/warning = recorded_privately
cutover plan = digest_bound_confirmed
SH-10 = passed_human_review
shadow gate = generated_verified
AUTH-C1/C5/C7 = not_generated
C0..C7 = not_run
```

本文件是人工审阅作业单，不是 SH-10 签名，也不是授权文件。

## 2. 已准备的私有证据

私有证据保留在仓库外 0700 根，文件均为 0600；仓库只记录脱敏摘要。

| 证据 | 结果 |
| --- | --- |
| release commit | `29f40bbe287c9d4428aa6bf464d93806c1c84307` |
| G1 baseline machine manifest | `sha256:ad3b0e1ba884e20718e6e81994cbb8beaedbb9e6777e471ac2a21e4c94c2b1ea` |
| release effective schema identity | `sha256:2e9992459906946415f8072ef4ad210ba00c52393d6c83fc4d0af23e415b3559` |
| aggregate report | C/D 均 16/16 succeeded；`sha256:daca7e9201c86589326a5847ad75591828b1ab28e591ab03ce9af810d663e781` |
| fresh verify | C/D 各 16 份，32/32 `passed=true` |
| table count checkpoint | 45 表完全一致；table-count digest=`sha256:beb518e25cdb520898d0925294e0edd7e8ae5645491df7aa9acb50fe2cfabc5c` |
| checkpoint seal | `sha256:86863a951f73f91d83d8087b1bbd4825c5041d81c5d5c1ac0dd4782eabd6f2d9` |
| source recovery | pre/post 仅新增授权 `structure.json`；archive/member digest 已绑定 |
| secret scan | 735 files + 6 SQLite dump，sentinel hit=0 |
| permissions | 381 dirs + 1240 files，violation=0 |
| canonical index | 11 groups；index digest=`sha256:7ec5e52f73d21131322fc00a11a5148c04bd59dbf813799d8a202e28f480636b` |
| review bundle seal | `sha256:d014fc85363beb087debef7ff7c4f3f0d4acf9fecb4401e1577080ab2b192008` |

canonical index 明确把旧失败/副作用运行列为 non-canonical；不得从旧目录挑证据代替当前 index。

## 3. Release owner 私有字段

真实信息只写入仓库外 0600 私有记录；仓库只保留脱敏状态与摘要。Release owner 需要填写：

| 字段 | 要求 |
| --- | --- |
| releaseOwnerId | 真实责任人稳定标识 |
| rollbackOwnerId | 回滚责任人稳定标识 |
| recoveryContactId | 恢复联系人稳定标识 |
| maintenanceWindow | 明确开始、结束和时区 |
| settingsStartState | `already_sanitized` 或 `legacy_plaintext_requires_two_phase` |
| credentialAction | 前者对应 `verify_existing`；后者对应 `prestage_legacy` |
| maintenanceBaseUrl | 仅允许 `127.0.0.1` loopback |
| maintenanceTokenFile | 0600 私有文件；不得把内容写入证据或聊天 |
| source/release/target/backup/restore/archive/evidence roots | 全部绝对、无 symlink、按契约不重叠；目标为空 |

只有这些字段真实可用后，才能创建并校验 `airoaming_cutover_plan_v1`。plan 必须绑定 release identity `sha256:2e999245...5b3559`，不得使用 G1 baseline `ad3b...`。

维护窗口填写规则：带“例如”“示例”“比如”的时间只能用于解释格式，禁止直接写入 human input 或 plan。必须先把最终解析出的绝对起止时间和时区原样回显给 release owner；只有 owner 明确确认该实际值后，才能计算 `inputDigest/planDigest`。用户说“现在开始”时，应先解析成覆盖当前执行的明确绝对区间，再回显确认，不能沿用先前示例。

### 3.1 当前记录状态

- 三类责任人、维护窗口、settings 起点、credential action、warning 决定和 Migration reviewer 标识已由人类明确提供并写入私有记录。
- `maintenanceBaseUrl` 采用代码事实中的 loopback `http://127.0.0.1:4310`。
- 私有 plan 已生成并通过校验：`cutoverId=cutover-20260714-2200`、`runId=cutover-final-20260714-2200`、`planDigest=sha256:d08b7e3aa2561c556ad25348d6b9dbcd08f487a1c428233b59763fc9df0412da`。
- review packet digest=`sha256:a28ab7e1a59a9b8ba26a89e6522bd235ec0ad2176085b12a72574a3bc20f35fd`，已由人类明确做 digest-bound 确认。
- maintenance token 已按 C0 前置契约随机生成并写入私有 0600 文件；内容未打印、不来自用户现有凭据，仅用于 C0 非空/权限校验。

## 4. Migration reviewer 必须做出的 warning 决定

唯一待处理 warning：

```text
slice = script-pending-revision
warningCount = 1
blockerCount = 0
meaning = 旧 Dialogue reference 只作为 source evidence 保留，
          不恢复成可执行 Dialogue FK
```

Reviewer 必须二选一，并把决定写入私有审阅记录：

- `accepted`：确认这是预期的历史证据保留，不影响当前可执行状态；记录理由和 reviewerId。
- `rejected`：说明需要恢复的具体关系和验收标准；SH-10 继续 `changes_requested`。

Codex/Luna 不得替 Reviewer 选择 `accepted`。

当前人类已明确选择 `accepted`，理由与 reviewer 标识已写入 0600 私有记录。该决定关闭 warning disposition 缺口，但不自动构成对随后生成的 plan digest 的签名。

## 5. SH-10 签署条件

真实 Migration reviewer 必须：

1. 独立重算 canonical index、checkpoint 和 seal digest。
2. 确认 plan 的 `appCommit/planDigest/runId/effectiveSchemaManifestDigest` 与证据完全一致。
3. 确认责任人、窗口、settings 起点与 credential action 已填写。
4. 明确处理 warning。
5. 使用真实 `reviewerId/signedAt` 生成 `airoaming_cutover_shadow_gate_v1`，并逐项绑定 SH-01～SH-10 evidence digest。

1～5 已完成：人类已确认实际 `planDigest` 与 `review packet digest`；SH-10 evidence=`sha256:b0d58efef766f8dc4dc2d57f14566f9187fbaf0b798d09e65001d14629518e21`，gate=`sha256:e5d150ae57baa4578b07d03a8e1bfdd508531695bb6c53c60cd1f5e040439d3c`。随后按用户明确指示完成 C0 只读检查，C0 evidence=`sha256:3444ae2d...9a3ba11`；没有生成 AUTH 或进入 C1～C7。

SH-10 gate 仍不等于 AUTH-C1。即使 SH-10 通过，也只能进入 C0 只读检查；停写必须另行取得 AUTH-C1。

## 6. 禁止事项

- 不得由 Codex/Luna 填写 reviewerId 或冒充人工签名。
- 不得生成 AUTH、停写、访问默认 Keychain 或执行 C1～C7。
- 不得把真实路径、token、secretRef、Keychain 输出、用户正文或完整 prompt 提交到 git。

## 7. 最终停止点

```text
R0-B = completed_SH10_gate_verified
SH-01..SH-09 = passed_release_shadow
SH-10 = passed_human_review
R1-C0 = passed_read_only
maintenance token = generated_private_0600
AUTH-C1/C5/C7 = not_generated
C1..C7 = not_run
next = waiting_explicit_AUTH_C1_instruction
```

本 Handoff 至此完成。C0 只读步骤已通过；AUTH-C1 仍需单独确认，不得自动继续。
