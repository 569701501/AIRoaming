---
doc_id: AIR-G3-M5-A4-2-HANDOFF-REVIEW-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A4-2 五份施工资料与当前 restore 代码只读复核
---

# M5-A4-2 Scrutiny Review

## 结论

`passed_for_a4_2`。

本结论表示 A4-2 代码、测试和文档通过只读静态复核，不表示 A4-3/A4-4 或 M5 整体完成。M5 仍为 `hardening_required`。

## 实现前基线

| 检查项 | 结论 |
| --- | --- |
| 是否基于当前生产代码的真实缺口 | 是；CLI 缺 release root，summary/DB 只做浅验证 |
| 输入与错误码是否唯一 | 是；显式 `--release-root`，identity 失败统一 `RESTORE_RELEASE_IDENTITY_MISMATCH` |
| 16-slice/manifest/DB 是否三方绑定 | 是；固定顺序、runId、版本、四摘要、counts、verification、issue 均有字段表 |
| PersistenceState 是否有不可伪造固定门 | 是；不仅比较 manifest，还固定 coordinated 为 `shadow/null/null` |
| 测试是否区分 digest 与 semantic verification | 是；raw tamper 与 resealed tamper 分开，reseal 要同步更新 bundle basename |
| 是否规定零目标写入 | 是；所有失败和 verify-only 均检查 target/staging 不存在 |
| 是否限制代码范围 | 是；禁止 backup fence、Schema/migration/importer、A4-3、D2/M6 |
| 是否保留真实数据安全边界 | 是；仅临时 release/bundle/DB/target，不访问真实 SecretStore |

## 实现后静态证据

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| release identity 是否来自显式参数 | 通过 | `RestoreInput.releaseRoot` 和 `--release-root` 必填，调用既有 loader |
| 16-slice 是否三方绑定 | 通过 | `FULL_SHADOW_SLICE_ORDER`、manifest.runIds、run-summary slices 逐索引核对 |
| DB ledger 是否精确读取 | 通过 | read-only SQLite prepared statements 核对 16 runs、schema versions、verification 和 open issues |
| PersistenceState 是否固定协调状态 | 通过 | manifest 与 DB 均要求 `shadow/null/null` |
| semantic tamper 是否越过外层 digest | 通过 | 测试重算 manifest/SEALED 并同步 bundle basename 后仍被拒绝 |
| 失败是否零目标写入 | 通过 | release mismatch、raw/semantic tamper 测试均在 verify-only 且目标保持不存在 |
| 回归是否通过 | 通过 | 定向 22/22；server 全量 49 files/329 tests；typecheck/G1/Prisma validate/diff check 全绿 |

## 结论与残留

- A4-2 可独立交付，A4-RST-01/02 可标记 `passed`。
- A4-3/A4-4 尚未执行；不得把本结论解释为 M5 completed 或 D2/M6 开始授权。

## Luna 实现后复核重点

1. `releaseRoot` 是否由每个调用者显式传入，没有测试默认值渗入生产。
2. semantic tamper 是否真的重算 manifest/SEALED 并重命名 bundle，而不是被旧 digest/basename 提前挡住。
3. DB 查询是否使用 read-only 连接和 prepared statement，JSON 是否 canonical 比较。
4. 是否逐 run 检查 open MigrationIssue，并固定 PersistenceState 为 `shadow/null/null`。
5. 是否只完成 A4-2 后停止。
