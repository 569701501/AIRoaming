---
doc_id: AIR-G3-M5-A4-2-REVIEW-001
status: ready_for_review
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A4-2 handoff、实施契约与测试矩阵
---

# M5-A4-2 复核清单

## 1. Luna 提交前自检

- [ ] 所有 restore 调用显式提供 `releaseRoot`，没有默认 cwd/repoRoot 生产行为。
- [ ] CLI 缺失、重复、非绝对或未知参数在副作用前返回 `RESTORE_ARGS_INVALID`。
- [ ] current release identity 使用既有 loader，digest mismatch 返回固定错误码。
- [ ] run-summary 每个 slice exact keys，顺序绑定 `FULL_SHADOW_SLICE_ORDER` 和 manifest.runIds。
- [ ] 16 条 DB MigrationRun 的全部约定字段和两个 schema version 逐项核对，不只是表存在/行数存在。
- [ ] counts/verification JSON 解析失败会 fail-closed，counts 使用 canonical JSON 比较。
- [ ] 每条 run 的 open MigrationIssue 为 0。
- [ ] PersistenceState 与 manifest 精确一致且固定 `shadow/null/null`。
- [ ] verify-only 和所有失败路径零 target/staging 写入。
- [ ] raw tamper 与 resealed semantic tamper 都有直接测试；reseal 后同步重命名 bundle 目录，失败不是旧 basename 提前触发。
- [ ] 没有修改 backup fence、Schema/migration/trigger、importer、Settings/SecretStore、D2/M6。
- [ ] `progress.md`、`findings.md` 和 acceptance 证据已更新，但只改绿 A4-RST-01/02。

## 2. Codex Scrutiny Review

复核者只读回答：

| 问题 | 通过标准 |
| --- | --- |
| release identity 是否来自显式当前 release root | loader 参数直接来自 CLI/RestoreInput，无默认猜测 |
| 外层 seal 能否替代账本验证 | 不能；resealed semantic tamper 仍失败 |
| run-summary 是否固定顺序 | 16 个 slice 与常量、manifest.runIds 三方逐索引相等 |
| DB ledger 是否精确绑定 | run/status/version/四摘要/counts/verification/open issue 全核对 |
| PersistenceState 是否可能“双方一起伪造”通过 | 不能；coordinated 固定状态 `shadow/null/null` |
| verify-only 是否真正零写入 | target 和 staging 都不存在，bundle 字节不变 |
| 是否越权进入 A4-3/D2/M6 | 无相关生产改动或通过声明 |

任一答案为否，A4-2 不通过。

## 3. Runtime/User Review

A4-2 是纯后端临时 fixture 验证，不需要真实 UI。允许的运行证据：

- 临时 release root。
- 临时 sealed bundle、SQLite、data/workspace target。
- CLI 与 Service verify-only/materialize。

禁止真实 workspace、真实 DB、系统 SecretStore 或生产 activate。完整 restart/API 和 secret/path/compensation 演练仍属于 A4-4/A4-3。

## 4. 退出结论模板

```text
结论：passed_for_a4_2 / failed
通过项：A4-RST-01、A4-RST-02
定向测试：<files>/<tests>
全量回归：<files>/<tests>
残留：A4-3、A4-4 仍未执行；M5 仍为 hardening_required
提交：<commit>
```
