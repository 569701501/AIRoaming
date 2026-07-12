---
doc_id: AIR-REVIEW-20260712-G1-M0A-PASS2-R3-SQLITE-B
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: orchestrator, scrutiny-reviewer, developer
source: G1 M0-A Pass 2 r3 manifest、SQLite DSL 与 sealed review 文件事务独立复核
---

# G1 M0-A Pass 2 r3 SQLite / 机器契约复核

## 1. 结论

| 项目 | 结论 |
| --- | --- |
| review round | `g1-m0a-pass2-r3` |
| reviewer role | `sqlite_dsl_machine` |
| manifest digest | `sha256:210e5718052872aff4059f128525c56f3eafc7594dd488bc6275b3585e328963` |
| verdict | `rejected` |
| open findings | `P1 x 2` |
| migration gate | 不允许放行 |

清单、SQLite DSL 和大部分 sealed snapshot codec 已经闭合，但 reader 的同 inode 文件代际识别以及 publisher 在 rename 之后的 I/O 结果语义仍有两个 P1。按“无 P0/P1 才可 accepted”的规则，本轮不签收。

## 2. 已核对的机器事实

1. `g1:manifest:check` 输出目标 digest；存储 artifact 与 fresh source build 一致。
2. inventory 精确为 `44 models / 556 scalar fields / 105 foreign keys / 210 relation fields`；model/table/field/FK/relation 计数与唯一性自检通过。
3. `195 CHECK / 194 trigger`，physical key 无重复，并且 `195 / 194` 个 template binding exactly-once。
4. registry 精确为 `10 TaskPolicy / 5 OutboxHandler / 44 PurgeOwnership`，无缺项或重复 table/type。
5. `ConversationMessage` 的 `running/completed/failed`、`DialogueRuntimeSession` 的 `active/archived/closed`、`PendingDialogueArtifact` 的 `pending/applied/discarded/superseded/expired` 共11个状态均实际在 SQLite 中复验：普通 DELETE 失败且行保留；pending `activeSlotKey` 不能靠 DELETE 释放；Project deleting + processed `project.delete_files` + 无 active runtime task 三事实齐备后，显式 child-first purge 可成功。三个 guard 的 `normalizedWhen` 均为 `1`。
6. sealed codec 对 canonical JSON+LF、UTF-8 round-trip、manifest/round/role/path、report/attestation/envelope/self digest、generation-chain shape 和 16 MiB candidate 做了完整校验；CAS、`wx` lock/temp、temp fsync、atomic rename、第二代保留第一代 exact `envelopeBytes` 的主路径正确。
7. reader 对 sealed snapshot 只打开一个 FD 并从该 FD 读取、fstat 与解析；读完后 pathname 被 atomic replacement 时，返回已读旧 snapshot facts 与旧 digest，没有混用新路径。
8. 基础 manifest 仍固定为 `0/2 pending false`；raw pair 未被父 Orchestrator sealed 之前不进入 derived gate。

## 3. Findings

### P1 `G1_SQLITE_R3_FILE_IDENTITY_CTIME_MISSING` — 同 inode 内容更新可在现有 identity 中不可见

`sameFileIdentity` 仅比较 `dev / ino / size / mtimeNs / nlink`（`g1-schema-review-bundle.ts:330-338`），没有比较会随 inode 内容修改变化的 `ctimeNs`。`secureReadFile` 在 pathname stat、open FD stat 和 post-read FD stat 之间都重用这个不完整 identity（`:518-557`）。

最小复现使用两份同长且各自合法的 sealed snapshot：在 `afterSealedRead` 中对同一 inode 做等长 rewrite，然后恢复原 mtime。结果 `ino/size/mtimeNs/nlink` 全部不变、`ctimeNs` 已变，loader 仍成功返回旧 digest，而 pathname 已是新 snapshot。当前测试的 same-size rewrite 用例（`g1-schema-review-bundle.spec.ts:766-793`）依赖 `writeFile` 自然改变 mtime，没有覆盖保留 mtime 的常规文件同步/备份写法。

影响：reader 不能兑现“同 inode 内容更新 fail closed”的契约，返回的 generation 与调用结束时 pathname 可见 generation 可不一致。

建议：至少把 `ctimeNs` 纳入 pre-open/post-read identity，并增加“同 inode + 等长 + 恢复 mtime”回归用例。

### P1 `G1_SQLITE_R3_POST_RENAME_OUTCOME_AMBIGUOUS` — rename 已生效后的 I/O 失败会让 API 结果与可见 generation 脱节

publisher 在 atomic rename 后才执行 directory sync（`g1-schema-review-bundle.ts:1209-1214`），而 lock unlink + directory sync 在 `finally` 中执行（`:1233-1257`）。这导致两个明确的后提交结果：

- rename 后第一次 directory sync 失败时，新 snapshot 已在 final pathname 可见；若 `finally` 中的 lock unlink + 第二次 directory sync 成功，目录变更已被后一次 sync 提交，但 API 仍抛出前一个通用 `fileIo`。
- 主路径已 sync 并准备返回成功时，如果 lock unlink 或最后的 directory sync 失败，`finally` 会覆盖成功 return；新 generation 已可见且可能已持久化，调用方却只得到无 generation digest 的通用失败。lock 若留存，当前也没有明确的残留 lock 恢复协议。

影响：调用方无法从 API 结果判断该 digest 是“未发布”、“已可见但持久化未确定”还是“已发布仅 lock cleanup 失败”；用原 expected-previous 重试只会进入 CAS mismatch 或 publishLocked。

建议：显式记录 rename commit point，将 pre-commit failure、committed-visible/durability-unknown 和 committed-but-cleanup-failed 做成可恢复的结构化结果，且在错误中携带已生成的 `bundleSnapshotDigest`；同时为残留 lock/temp 定义身份校验和恢复路径。

## 4. 验证证据

| 验证 | 结果 |
| --- | --- |
| `corepack pnpm --filter @airoaming/server g1:manifest:check` | PASS，digest 为目标值 |
| inventory / physical-key / binding / registry 独立 `jq -e` 检查 | PASS |
| 9 个 non-tracer persistence suites | `9 files / 141 tests` PASS |
| real SQLite DSL suite | `36/36` PASS，含 44 tables + 194 triggers |
| dialogue 11 个状态的额外 SQLite 直接复验 | `11/11` 普通删除拒绝，`11/11` 三事实 purge 成功 |
| same-inode / same-size / restored-mtime 最小复现 | 复现 P1：loader 成功返回 old digest，pathname 已为 new digest，仅 ctime 变化 |

## 5. 残留风险与下一步

本复核不否定已通过的 inventory、SQLite 约束与 canonical codec 证据。必须先修复上述两个 P1，为 identity 和 post-rename failure 增加回归用例，重新 generate/check 形成新 digest，再启动下一轮独立复核。本报告不授权 migration SQL 生成。
