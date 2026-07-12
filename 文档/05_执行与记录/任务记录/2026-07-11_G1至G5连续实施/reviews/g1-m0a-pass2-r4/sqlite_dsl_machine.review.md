---
doc_id: AIR-REVIEW-20260712-G1-M0A-PASS2-R4-SQLITE-B
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: orchestrator, scrutiny-reviewer, developer
source: G1 M0-A Pass 2 r4 manifest、SQLite DSL 与 sealed review 文件事务独立复核
---

# G1 M0-A Pass 2 r4 SQLite DSL 与机器约束独立复核

## 1. 复核结论

| 项目 | 结论 |
| --- | --- |
| reviewRoundId | `g1-m0a-pass2-r4` |
| reviewerRole | `sqlite_dsl_machine` |
| manifestDigest | `sha256:0acc15df259d1744bb26c6b853e994dadc6c4be48fcb1d8e2c798254bc01a237` |
| verdict | `rejected` |
| open finding | `P1 × 1` |
| migration generation | 不允许；base gate 仍为 `0/2 pending` |

本轮存在一个可复现的 P1：真实发布形态的 `rename(temp, target)` 原子覆盖会令已打开的旧 `target` 文件描述符变成 `nlink=0`；当前 reader 在判定“路径已被原子替换，应返回已读旧事实”之前，先把该旧文件描述符判为 hardlink-invalid 并报错。因而实现没有满足“原子路径替换返回旧事实”的线性化契约，结论为 `rejected`。

## 2. 已验证且通过的边界

1. manifest 自检通过，摘要与本轮声明一致；source inventory 为 19，结构计数为 `44/556/105/210`，binding 计数为 `195/194`，registry 计数为 `10/5/44`，完整性检查为 `true/0`。
2. base gate 精确保持 `requiredIndependentScrutinyReviews=2`、`acceptedReviews=0`、`status=pending`、`migrationGenerationAllowed=false`；publish 与 recovery 的所有返回分支也都没有授权 migration generation。
3. `ctimeNs` 已纳入同一文件身份判断；同 inode、同 size、恢复旧 mtime 的重写会被拒绝，相关回归测试通过。
4. marker 在 rename 前完成完整编码、文件 `fsync` 和目录 `fsync`；marker 身份绑定 schema version、round、role、manifest、旧/新 bundle digest、sealed reviews 与 recovery token。
5. bundle rename 是逻辑 commit 点；rename 后第一次 bundle 目录同步是 durable boundary。五个注入阶段分别覆盖 rename 前、bundle 目录同步、lock close、lock unlink、lock 最终目录同步。
6. rename 前故障保持旧 bundle；前三个 rename 后故障返回 recovery-required，磁盘为新 digest、marker 保留、普通 reader fail closed；最后目录同步故障返回 cleanup warning，marker 已移除且 reader 在该窗口可读新 bundle。
7. recovery 精确校验 marker 身份与 recovery token，以发布时相同 codec 读取和验证 bundle；在清 marker 前先同步 bundle 目录，错误 token 不清 marker。final-sync warning 明确认可 marker 已移除后的可读窗口；若崩溃后旧 marker 重新显现，则 reader 重新 fail closed。
8. 9 个目标测试文件共 150 个测试通过，其中真实 SQLite trigger semantics 为 36/36；TypeScript typecheck 通过。

上述通过项不能抵消第 3 节的 P1，因为现有原子替换测试没有模拟生产覆盖语义：它先把旧 target 重命名为另一路径，再新建 target，因此旧文件描述符仍为 `nlink=1`；生产发布直接用 `rename(temp, target)` 覆盖，旧 inode 没有其他目录项时会成为 `nlink=0`。

## 3. Finding

### P1 — `G1_SQLITE_R4_ATOMIC_REPLACE_NLINK_MISCLASSIFIED`

**状态：** `open`

**问题：** `secureReadFile` 在读取后先对旧文件描述符执行常规文件校验。真实的原子覆盖发生后，旧文件描述符仍可稳定提供已打开时的旧 bytes，但 POSIX 文件语义会把其 link count 从 1 变为 0。当前顺序先以 `G1_SCHEMA_REVIEW_BUNDLE_FILE_HARDLINK` 拒绝该 `nlink=0`，随后用于识别路径替换并返回旧事实的分支无法到达；而 except-ctime 身份比较本身也要求 `nlink` 不变。

**生产语义与期望线性化：** reader 在旧 inode 上完成 open 和 read；publisher 将已写入并 fsync 的 candidate 以 `rename(candidate, target)` 覆盖 target。此时当前 pathname 指向新 inode，旧 open FD 指向无目录项但内容稳定的旧 inode。只要旧 FD 的 `dev/ino/size/mtime` 与读取前一致、当前 pathname 是另一个合法 regular inode，reader 应在线性化到 rename 之前，返回已经读取的完整旧 bytes、旧 facts 和旧 digest；不得 reopen 后返回新事实，也不得混合新旧内容。同 inode 的 ctime 变化仍必须 fail closed。

**最小复现结果：** 使用有效的旧/新 sealed bundle，在 `afterSealedRead` hook 内写出 candidate 并直接执行 `rename(candidate, target)`，当前实现得到：

```json
{
  "outcome": {
    "status": "error",
    "code": "G1_SCHEMA_REVIEW_BUNDLE_FILE_HARDLINK"
  },
  "expectedOld": "sha256:c81ed737a33143c6788da252ace6ea60bfac21404fdf2255086a71116cbc9137",
  "newDigest": "sha256:20ba944c38c264a5c368865f512f6e0a152dae0a9c6927a7db5d5e895fc9eea"
}
```

**修复要求：**

1. 区分 open 前 pathname 安全校验与 read 后旧 FD 校验，不把原子覆盖造成的旧 FD `nlink: 1 → 0` 自动等同为非法 hardlink。
2. 仅当当前 pathname 已解析为不同的合法 regular inode，且旧 FD 的内容身份 `dev/ino/size/mtime` 在读取前后保持一致时，允许上述 nlink/ctime 变化并返回已读取旧事实。
3. 保持同 inode ctime 变化 fail closed，保留对真实 hardlink、非 regular 文件、size/mtime/content race 的拒绝。
4. 新增生产同形回归：`write candidate → fsync candidate → rename(candidate, target)`，断言并发 reader 返回旧 digest 与旧 facts，且没有 reopen/mixed read；现有“旧 target 先 rename 到 `.old`”用例不能替代该回归。

**证据文件：**

- `apps/server/src/persistence/g1-schema-review-bundle.ts`
- `apps/server/src/persistence/g1-schema-review-bundle.spec.ts`

## 4. 验证命令与结果

```bash
corepack pnpm --filter @airoaming/server g1:manifest:check
```

结果：通过，输出 digest 为 `sha256:0acc15df259d1744bb26c6b853e994dadc6c4be48fcb1d8e2c798254bc01a237`。

```bash
jq -e '
  .manifestDigest == "sha256:0acc15df259d1744bb26c6b853e994dadc6c4be48fcb1d8e2c798254bc01a237"
  and .facts.tableCount == 44
  and .facts.columnCount == 556
  and .facts.indexCount == 105
  and .facts.triggerCount == 210
  and .facts.insertBindingCount == 195
  and .facts.selectBindingCount == 194
  and .facts.sourceInventoryCount == 19
  and .facts.completeness.complete == true
  and .facts.completeness.missingCount == 0
  and .reviewGate.requiredIndependentScrutinyReviews == 2
  and .reviewGate.acceptedReviews == 0
  and .reviewGate.status == "pending"
  and .reviewGate.migrationGenerationAllowed == false
' apps/server/src/persistence/g1-schema-manifest.json
```

结果：通过。

```bash
corepack pnpm --filter @airoaming/server exec vitest run \
  src/persistence/g1-schema-model-source.spec.ts \
  src/persistence/g1-schema-constraint-source.spec.ts \
  src/persistence/g1-schema-domain-registry-source.spec.ts \
  src/persistence/g1-schema-manifest.spec.ts \
  src/persistence/g1-schema-review-attestation.spec.ts \
  src/persistence/g1-schema-review-bundle.spec.ts \
  src/persistence/g1-schema-review-check.spec.ts \
  src/persistence/g1-schema-gate-coverage.spec.ts \
  src/persistence/g1-schema-trigger-sqlite-semantics.spec.ts
```

结果：9 个测试文件、150 个测试全部通过；真实 SQLite suite 为 36/36。

```bash
corepack pnpm --filter @airoaming/server typecheck
```

结果：通过。

另以同一 bundle codec 构造有效旧/新 snapshot，并在 `afterSealedRead` 中执行生产同形的 `rename(candidate, target)` 覆盖；复现结果为第 3 节所示 `G1_SCHEMA_REVIEW_BUNDLE_FILE_HARDLINK`，确认 P1。

## 5. 最终判定

本轮 `sqlite_dsl_machine` 独立复核为 `rejected`。在 P1 修复并加入真实覆盖形态回归前，本 reviewer 不接受该 raw pair，base gate 必须继续保持 `0/2 pending`，migration generation 必须继续为 `false`。
