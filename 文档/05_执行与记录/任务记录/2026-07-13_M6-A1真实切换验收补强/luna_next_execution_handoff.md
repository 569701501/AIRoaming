---
doc_id: AIR-M6-A1-NEXT-HANDOFF-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M6-A1 当前代码、测试矩阵、Scrutiny/Runtime Review
---

# M6-A1 Luna 交接与最终停止说明

## 当前基线

已完成并提交：

- A1-3：`c969bb9`，业务写统一边界。
- A1-4：`b4b4a18`，真实临时 SQLite C0～C7 链。
- A1-5 及后续负例补强：`3661939`（含 `90ea779`、`37c2c02`、`61d6ade`、`79f555e`）。
- 隔离复核文档已更新：`scrutiny_review.md`、`runtime_review.md`、功能完成记录。

当前工程状态：`ready_for_real_cutover_authorization`；真实切换仍为 `real_cutover_no_go`，除非用户另行授权。

## 本单已完成目标

已在临时根补齐可执行的故障注入、安全和恢复负例；未改变产品范围，未修改 schema/migration/trigger，未执行真实切换。矩阵当前没有 `not_run` 行。

## 已执行的测试项

### Backup / Restore

- `M6A1-BK-02`：已覆盖缺失 final run 与 shadow state 身份负例；确认无 `SEALED` 和最终目录。其它 failed/recovery/db_only 变体仍由既有 fail-closed 测试覆盖，未扩大解释为真实切换证据。
- `M6A1-BK-03`：maintenance 缺失/非 closed/摘要篡改；确认 fail-closed。
- `M6A1-BK-05`：ready Asset/DB/source 在 fence 中变化；确认 staging 清理且无 sealed 假成功。

### Ready / Evidence / Activate

- `M6A1-RDY-01/02`：真实 closed runtime bundle，缺 bundle 或布尔假证据拒绝。
- `M6A1-ACT-05/06`：C7 落盘顺序由真实隔离链验证；ACT-06 由 DB-only resume 单测验证不重写 `activatedAt`，未做进程级 kill crash 演练。

### Business / rollback / security

- `M6A1-RB-01/02`：final 失败和 C5 smoke 失败的真实临时链；其它 RB 项已有直接证据并已回填。
- `M6A1-SEC-01`：snapshot、DB、settings、report、evidence、backup、restore、archive、日志 fixture 递归 sentinel 扫描为 0（fake secret root 单独 allowlist）。
- `M6A1-PATH-01`：symlink、重叠、默认根和非临时根在 Prisma 初始化前拒绝。

## 已执行方式

1. 每个测试只创建唯一 `os.tmpdir()` 根，根之间两两不重叠；未读取仓库默认 workspace/dataRoot。
2. 只允许 fake SecretStore/provider；禁止真实 Keychain、真实 provider、真实系统凭据。
3. 先写失败测试，再补实现；每一项测试名称必须包含矩阵 ID。
4. 每组完成后已更新 `test_matrix.md`、`progress.md`、`findings.md`，写明 spec、命令、通过数。
5. 每个子阶段独立提交，提交前执行 `git diff --check` 和对应定向测试。

## 验收结果与停止点

- 仅有直接测试证据的行已改为 `passed`；BK-02、ACT-06、PATH-01 等保留了直接证据的具体范围，不把代码阅读或 mock 当作真实切换证据。
- 所有真实授权、真实 C0～C7、OBS-01～10 保持 `not_run`。
- 若必须修改 schema/migration/trigger、访问真实根或读取真实凭据，立即停止并报告。
- 完成后没有执行真实 `db:activate --execute`，没有进入 G4/G5；后续若进入真实切换，必须先取得用户单独授权并新建真实运行记录。

## 交付格式

```text
结论：`ready_for_real_cutover_authorization`（真实切换仍未授权）
新增提交：`3661939`（及其前置 M6-A1 收口提交）
新增测试：M6A1-BK-02/03/04/05、RDY-01/02、ACT-03/04/05/06、EVD-01/03/04、TX-08、RB-01/02/04/06、SEC-01、PATH-01；矩阵全项 passed
全量回归：`61 files / 425 tests` 通过；typecheck/build/Prisma/G1/capability 通过
Scrutiny/Runtime：`passed` / `passed_isolated`，已按最终证据更新
真实操作：0
停止点：未执行真实切换，未进入 G4/G5
```
