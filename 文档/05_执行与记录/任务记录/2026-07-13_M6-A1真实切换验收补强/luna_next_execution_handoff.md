---
doc_id: AIR-M6-A1-NEXT-HANDOFF-001
status: ready_for_development
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M6-A1 当前代码、测试矩阵、Scrutiny/Runtime Review
---

# 交给 Luna 的 M6-A1 剩余执行单

## 当前基线

已完成并提交：

- A1-3：`c969bb9`，业务写统一边界。
- A1-4：`b4b4a18`，真实临时 SQLite C0～C7 链。
- A1-5 隔离复核文档已生成：`scrutiny_review.md`、`runtime_review.md`、功能完成记录。

当前状态只能写成：`m6_a1_verification_in_progress / real_cutover_no_go`。

## 本单目标

只补齐测试矩阵中仍为 `not_run` 且能在临时根完成的故障注入、安全和恢复负例；不改变产品范围，不修改 schema/migration/trigger，不执行真实切换。

## 必须执行的测试项

### Backup / Restore

- `M6A1-BK-02`：final blocked/failed、shadow/recovery/db_only、run 不同；确认无 `SEALED` 和最终目录。
- `M6A1-BK-03`：maintenance 缺失/非 closed/摘要篡改；确认 fail-closed。
- `M6A1-BK-04`：coordinated/pre-cutover 参数 required/forbidden 组合，解析必须早于 Prisma 初始化。
- `M6A1-BK-05`：ready Asset/DB/source 在 fence 中变化；确认 staging 清理且无 sealed 假成功。
- `M6A1-RST-02`：pre-cutover materialize 到两组空根，恢复后仍 `ready_for_activation` 且首写为空。
- `M6A1-RST-04`：raw tamper，verify-only 和 materialize 目标均零写。
- `M6A1-RST-05`：合法 reseal 后修改 final run/report/state/asset 语义仍拒绝。

### Ready / Evidence / Activate

- `M6A1-RDY-01/02`：真实 closed runtime bundle，缺 bundle 或布尔假证据拒绝。
- `M6A1-EVD-01/03/04`：step/manifest 原子写、跳步、不同 input/identity、raw/reseal tamper。
- `M6A1-ACT-03/04/05/06`：stale identity、未到 C6、execute 的 C7 落盘顺序、execute 后 crash 同身份补证据且不重写 `activatedAt`。

### Business / rollback / security

- `M6A1-TX-08`：首写后 file bridge 返回 `FILE_MODE_FORBIDDEN_AFTER_FIRST_WRITE`。
- `M6A1-RB-01..06`：final 失败、C5 失败、settings 回滚、首写后回 file、restore 完整性、无 down migration。
- `M6A1-SEC-01`：snapshot、DB、settings、report、evidence、backup、restore、archive、日志 fixture 递归 sentinel 扫描为 0（fake secret root 单独 allowlist）。
- `M6A1-PATH-01`：symlink、重叠、默认根和非临时根在 Prisma 初始化前拒绝。

## 执行方式

1. 每个测试只创建唯一 `os.tmpdir()` 根，根之间两两不重叠；禁止读取仓库默认 workspace/dataRoot。
2. 只允许 fake SecretStore/provider；禁止真实 Keychain、真实 provider、真实系统凭据。
3. 先写失败测试，再补实现；每一项测试名称必须包含矩阵 ID。
4. 每组完成后更新 `test_matrix.md`、`progress.md`、`findings.md`，写明 spec、命令、通过数。
5. 每个子阶段独立提交，提交前执行 `git diff --check` 和对应定向测试。

## 验收门槛

- 仅有直接测试证据的行可改为 `passed`；代码阅读、已有成功链或 mock 不得替代负例证据。
- 所有真实授权、真实 C0～C7、OBS-01～10 保持 `not_run`。
- 若必须修改 schema/migration/trigger、访问真实根或读取真实凭据，立即停止并报告。
- 完成后不要自动执行真实 `db:activate --execute`，不要进入 G4/G5。

## 交付格式

```text
结论：ready_for_real_cutover_authorization / changes_requested
新增提交：<sha>
新增测试：<矩阵 ID、spec、通过数>
全量回归：<结果>
Scrutiny/Runtime：<是否需要重审>
真实操作：0
停止点：未执行真实切换，未进入 G4/G5
```
