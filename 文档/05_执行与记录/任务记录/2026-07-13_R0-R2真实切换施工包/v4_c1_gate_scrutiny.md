---
doc_id: AIR-RCUT-V4-C1-SCRUTINY-001
status: passed
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: release-owner, migration-reviewer, operator, ai-agent
source: v3 C1 真实源边界复核与 commit 9227e8d
---

# v4 C1 旧进程身份与维护窗口复核

## 1. 结论

```text
Scrutiny Review = passed
Runtime Review = passed_isolated
real cutover = not_run
```

v3 C1 因命中隔离 DB-mode maintenance server 且在人工维护窗口外执行，被否决为真实切换证据。commit `9227e8dfefde59a25f81b53a41074f3971c24d05` 已补齐代码级门禁；可以据此准备新的 v4 release-specific plan/review，但不能复用 v3 plan、SH-10、C0 或 AUTH，也不能直接申请 AUTH-C5。

## 2. 静态复核

| 检查 | 结果 |
| --- | --- |
| plan 必须包含完整 40 位 appCommit | passed |
| plan 必须包含 `Asia/Shanghai`、显式 `+08:00` 的维护窗口 | passed |
| `maintenanceBaseUrl` 只允许 loopback origin 或 `/api` 根 | passed |
| maintenance identity 缺显式 file mode/source/release/commit 任一项即 503 | passed |
| C1 在 drain 前验证窗口和 identity | passed |
| close 后重新验证同一 `runtimeInstanceId` | passed |
| sealed bundle 必须绑定同一 `runtimeInstanceId` | passed |
| AUTH-C5/AUTH-C7 固定语句与 Runbook 一致 | passed |

## 3. 自动化证据

| 门禁 | 结果 |
| --- | --- |
| C1/plan/maintenance/evidence/snapshot 定向 | 6 spec / 52 tests passed |
| server 全量（single worker） | 71 spec / 489 tests passed，189.42s |
| workspace typecheck | passed |
| server build + web build | passed |
| Prisma validate | passed |
| G1 manifest/schema/migration | passed |
| capability | `blockedIds=[]` |
| `git diff --check` | passed |

## 4. 冻结 release 与隔离运行复核

- 冻结 release 标签：`AIRoaming-release-r1-c1-identity-9227e8d`（实际绝对路径只保留在仓库外私有记录）。
- release commit：`9227e8dfefde59a25f81b53a41074f3971c24d05`。
- release build、G1 checks、capability check 通过。
- 使用临时 workspace、临时 0600 token 和端口 4327 启动 file-mode frozen release；没有使用真实 source、真实凭据、默认 Keychain 或真实 DB。
- `GET /api/_local/maintenance/identity` 返回 file mode、精确 release/source/commit；错误 token 返回 403。
- drain 前 identity、close 后 identity、sealed bundle 的 `runtimeInstanceId` 三者相同。
- 临时服务已停止，临时根已删除，端口无监听。

## 5. 下一门

1. 已生成新 v4 私有 plan/review，`maintenanceBaseUrl` 使用 `/api` 根并绑定 22:00～23:00 窗口。
2. 已取得人类对实际 `planDigest` 与 `reviewPacketDigest` 的精确确认。
3. 已生成 v4 SH-10 gate 并只读执行 C0；当前等待新的 AUTH-C1。
4. 只有 v4 C1～C4 全部通过并复核后，才可申请 AUTH-C5。

## 当前授权状态

- v4 C0 evidence=`sha256:021bd122001542eefecddd94207903afae9063a6f2e79c842584db9e8635e770` 已绑定到私有 0600 `AUTH-C1.json`，authorization digest=`sha256:bae8fd939d441958244680ddd83d7c49addc4a95a24b1272a35e147d87db48dd`。
- 用户授权范围：进入 C1，并在 C3 做只读 Keychain 验证；未授权 C5/C7。
- 当前时间早于 `2026-07-14T22:00:00+08:00`，C1 受窗口门禁阻塞；不得提前启动 source file runtime、执行 drain/close 或访问 Keychain。
