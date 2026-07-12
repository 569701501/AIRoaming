---
doc_id: AIR-REVIEW-20260712-G1-M0A-PASS2-R5-SQLITE-B
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: orchestrator, scrutiny-reviewer, developer
source: G1 M0-A Pass 2 r5 manifest、SQLite DSL、sealed reader 与 publisher/recovery 独立复核
---

# G1 M0-A Pass 2 r5 SQLite DSL 与机器约束独立复核

## 1. 复核结论

| 项目 | 结论 |
| --- | --- |
| reviewRoundId | `g1-m0a-pass2-r5` |
| reviewerRole | `sqlite_dsl_machine` |
| manifestDigest | `sha256:d981372c9051bf89fe6d01c4be94b50cfad7fd5bbe71dea36ae67dccb02e6825` |
| verdict | `accepted` |
| findings | `P0=0, P1=0, P2=0` |
| independentFromWorker | `true` |
| migration generation | 本 raw 结论不授权；base gate 仍为 `0/2 pending false` |

r4 Reviewer B 的原子覆盖 finding 已真实闭环。当前 reader 既保留初始 pathname/open FD 的严格 `nlink=1` 资格，又能在生产同形 `rename(temp, target)` 覆盖令旧 FD 发生 `nlink: 1→0` 时返回已读取的完整旧 generation；所有相邻但不满足原子覆盖身份的变体均 fail closed。未发现 P0/P1，结论为 `accepted`。

## 2. r4 finding 闭环复核

### 2.1 初始资格未放宽

`secureReadFile` 在读取前仍执行以下检查：

1. pathname 使用 `lstat`，必须是 regular file、尺寸不超限且 `nlink=1`。
2. open 后 FD 再做同样检查。
3. pathname 与 open FD 的 `dev/ino/size/mtimeNs/ctimeNs/nlink` 必须全部一致。

因此初始 symlink、directory、hardlink、超限文件和 lstat/open 身份交换均继续被拒绝。独立探针为初始 target 增加第二个 hardlink 后，得到 `G1_SCHEMA_REVIEW_BUNDLE_FILE_HARDLINK`。

### 2.2 真实原子覆盖返回旧完整事实

当前 post-read 顺序为：先从单一 FD 完整读取 bytes，再只校验旧 FD 的 regular shape/尺寸，随后区分“完全稳定”与“真实原子覆盖”。原子覆盖例外同时要求：

- 当前 pathname 存在、是 regular file 且 `nlink=1`；
- 当前 pathname 的 `dev/ino` 与旧 FD 不同；
- 旧 FD 的 `dev/ino/size/mtimeNs` 在读取前后稳定；
- 旧 FD 的 link count 精确为 `1→0`。

独立生产同形探针在同一目录写入并 fsync candidate，随后执行 `rename(candidate, target)`。结果为：

```json
{
  "oldFdNlink": "0",
  "returnedDigest": "sha256:5c854b45be2d9776235c00d2f3a684eff155a7e62189dcc010a10c8de3cde4a6",
  "diskDigest": "sha256:b34972964255b0d7a02c4a1986d82da7b485809d3c7b13347f441b339a0c1c3b",
  "returnedReviews": 1,
  "diskReviews": 2
}
```

上述 digest 是隔离探针的临时 generation 摘要。一次并发调用返回完整 generation 1 facts/digest，而覆盖后的 pathname 可由下一次普通读取完整解析为 generation 2；两者没有重开后偷换、跨 generation 混合或半份事实。

### 2.3 相邻变体全部 fail closed

| 场景 | 独立结果 | 判定依据 |
| --- | --- | --- |
| 初始 pathname 已有 hardlink | `FILE_HARDLINK` | 初始 `nlink!=1` 不具备读取资格 |
| 读取后删除 pathname、没有 replacement | `FILE_CHANGED` | 当前 pathname 不存在 |
| 读取后给旧 inode 增加 hardlink | `FILE_CHANGED` | pathname 未换 inode，且旧 FD `nlink=2` |
| 读取后原地 append | `FILE_CHANGED` | size/mtime/ctime 与 pathname 身份变化 |
| 同 inode 等长改写并恢复固定 mtime | `FILE_CHANGED` | `ctimeNs` 变化，且 pathname 仍是同 inode |
| 先把旧 target rename 为 `.old` 保留，再换入 candidate | `FILE_CHANGED` | pathname 虽换 inode，但旧 FD 仍为 `nlink=1`，不满足 `1→0` |

目标 bundle suite 还覆盖普通等长改写。上述负例与源码条件共同证明该例外只适用于旧 inode 被真实覆盖后 unlink 的生产语义，没有把一般 pathname replacement 或 in-place mutation 放行。

### 2.4 不重开、不混合 generation

`loadBundleInternal` 只把 `secureReadFile` 返回的单一 Buffer 交给 `parseSealedSnapshot`。后续 canonical JSON、snapshot self digest、envelope digest、report/attestation digest、round、role 与 manifest 校验均基于该 Buffer；没有重新打开当前 pathname。独立探针同时证明本次返回的旧摘要与磁盘上的新摘要不同且各自完整。

## 3. Publisher、recovery 与 durable boundary

1. publisher 先以 `wx` marker 获得独占权，再在锁内读取 current generation 并执行 expected-previous digest CAS；重复角色和 manifest drift 在 rename 前拒绝。
2. candidate 先由与 reader 相同的 sealed codec 完整解析，再写入同目录 `wx` temp、完成 file sync。marker 绑定 round、role、manifest、previous/new digest、sealed count 与 recovery token，完成 canonical bytes 写入、truncate 与 file sync；随后同步目录，才进入 rename。
3. `rename(temp, review-bundle.v1.json)` 是可见 commit point；rename 后第一次 bundle-directory sync 是 durable boundary。
4. 五个 fault stage 的结果未回退：

| fault stage | 结果 | 磁盘与 reader 语义 |
| --- | --- | --- |
| `before_atomic_rename` | error / `not_committed` | 保留上一代，清理本次 temp/marker |
| `bundle_directory_sync` | `committed_recovery_required` | 新摘要已可见，marker 保留，普通 reader blocked |
| `lock_close` | `committed_recovery_required` | 新摘要已 durable，marker 保留，普通 reader blocked |
| `lock_unlink` | marker 仍在则 recovery-required；unlink 已可见则 cleanup-warning | 不把不确定清理虚构成未提交 |
| `lock_final_directory_sync` | `committed_cleanup_warning` | marker 已不可见，普通 reader 可读完整新 generation；崩溃后 marker 若重现则重新 fail closed |

5. recovery 精确校验 token、round、role、manifest、previous/new digest 与 sealed count，使用同一 sealed codec 读回 bundle；先同步 bundle directory，再 unlink marker 并做最终目录同步。错误 token 不清 marker。
6. publish 的所有结构化结果和 recovery 结果均固定 `migrationGenerationAllowed=false`；只有最终 derived review-check 可以授权 migration。

对应 API 与真实 package-script process tests 均在本轮 47 个 bundle tests 和 19 个 review-check tests 中通过。

## 4. Manifest inventory 与真实 SQLite

| 项目 | 实测结果 |
| --- | --- |
| manifest digest | `sha256:d981372c9051bf89fe6d01c4be94b50cfad7fd5bbe71dea36ae67dccb02e6825` |
| status | `ready_for_scrutiny` |
| sourceDocuments | `19 = 16 TypeScript + 2 Markdown + package.json` |
| model / scalar / FK / relation | `44 / 556 / 105 / 210` |
| CHECK / trigger | `195 / 194` |
| physical CHECK / trigger bindings | `195 / 194` |
| TaskPolicy / OutboxHandler / PurgeOwnership | `10 / 5 / 44` |
| completeness | `ready=true, issueCount=0` |
| base review gate | `required=2, accepted=0, status=pending, migrationGenerationAllowed=false` |
| real SQLite | `36/36`；实际创建 44 张 authority tables 与 194 个 triggers |

9 个目标测试文件共 `152/152` 通过；其中 review protocol 为 `103` tests，真实 SQLite semantics 为 `36/36`。Server typecheck 通过。

## 5. 验证命令与结果

```bash
corepack pnpm --filter @airoaming/server g1:manifest:check
```

结果：exit 0，摘要精确为 `sha256:d981372c9051bf89fe6d01c4be94b50cfad7fd5bbe71dea36ae67dccb02e6825`。

```bash
jq -e '
  .manifestDigest == "sha256:d981372c9051bf89fe6d01c4be94b50cfad7fd5bbe71dea36ae67dccb02e6825"
  and (.sourceDocuments | length) == 19
  and .counts.models == 44
  and .counts.scalarFields == 556
  and .counts.foreignKeys == 105
  and .counts.relationFields == 210
  and .counts.checks == 195
  and .counts.triggers == 194
  and .counts.checkBindings == 195
  and .counts.triggerBindings == 194
  and .counts.taskPolicies == 10
  and .counts.outboxHandlers == 5
  and .counts.purgeOwnershipEntries == 44
  and .completeness.ready == true
  and .completeness.issueCount == 0
  and .reviewGate.requiredIndependentScrutinyReviews == 2
  and .reviewGate.acceptedReviews == 0
  and .reviewGate.status == "pending"
  and .reviewGate.migrationGenerationAllowed == false
' apps/server/prisma/contracts/g1-schema-manifest.json
```

结果：exit 0。

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

结果：9 files / 152 tests 全部通过；真实 SQLite suite 为 36/36。

```bash
corepack pnpm --filter @airoaming/server typecheck
```

结果：exit 0。

另以 `tsx --eval` 在系统临时 workspace 构造两代有效 snapshot，candidate 执行 write + file sync + `rename(candidate,target)`，并逐项执行第 2.3 节负例。输出与表格一致，临时 workspace 全部删除；未在项目真实 r5 review root 创建 sealed bundle、publisher marker 或 temp。

## 6. 最终判定与边界

本轮 `sqlite_dsl_machine` 独立复核为 `accepted`，findings 为空。该结论仅表示 Reviewer B 对当前固定 digest 的 raw 审查通过；在父 Orchestrator 密封两名独立 accepted attestation 并由 derived review-check 返回 `2/2 accepted`、exit 0 前，migration generation 仍必须保持禁用。
