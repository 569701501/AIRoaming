---
doc_id: AIR-RCUT-V5-WINDOW-HANDOFF-001
status: superseded_by_current_handoff
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: auditor, release-owner, migration-reviewer, ai-agent
source: v4 维护窗口输入纠偏
---

# v5 C1～C4 历史执行 Handoff（已完成）

> 本文件只保存 v5 C1～C4 的历史 identity、授权和运行证据，不再是 Luna 当前执行入口。不得使用这里的历史窗口、当前时间断言或 AUTH-C1 指令安排 C5 以后工作。当前唯一入口是 `../2026-07-14_G0至G5剩余连续施工/luna_current_handoff.md`。

## 结论

v4 的 `22:00～23:00` 来自早期人工作业单中的示例值，随后被当作正式值写入并确认。该值不是代码硬编码，但已进入 v4 `planDigest`，因此不能原地修改。v4 保留为错误时间输入的历史证据，真实切换改用新的 v5 identity。

## v5 冻结证据字段

下表中的 maintenanceWindow 是 C1 已完成安全校验的不可变证据字段，不是剩余工作的排期。

| 字段 | 值 |
| --- | --- |
| cutoverId | `cutover-20260714-immediate-sanitized-v5` |
| runId | `cutover-final-20260714-immediate-sanitized-v5` |
| appCommit | `9227e8dfefde59a25f81b53a41074f3971c24d05` |
| maintenanceWindow | `2026-07-14 20:00～23:59 Asia/Shanghai` |
| settings | `already_sanitized / verify_existing` |
| planDigest | `sha256:2ba999ffee2061cdf57110fc10cf4720748431ba1aeaf603dab12c19863fc096` |
| humanInputDigest | `sha256:68d6afe0e0a84a0e5e822a29709e973b11a44d22ead7ca1ac233b4450bc33144` |
| checkBundleDigest | `sha256:7a206058ca5e05078db1a53d117d261a009337efe8386ed29d7548892972919b` |
| reviewPacketDigest | `sha256:15b751e3c6cd59798aac3431cc7d84c77d0ca84b6e9b78df5a54a610d554f4de` |

## 已完成复核

- production plan/status reader：通过，`completedThrough=C0`、stepCount=1。
- 私有根与 evidence 目录 0700，plan/gate/evidence/token 等文件 0600。
- 所有外层 canonical digest 与 SH-01～SH-10 嵌套 digest：全部重算一致，SH-01～SH-10=`passed`。
- shadow gate=`sha256:6e66e80777047c1149b8bd742756726cc61c76e3ffa76af395c3ebd34c786670`。
- C0=`CUTOVER_C0_OK`，evidence=`sha256:385ab9810d60658dc968ded3cb3b4d059028566fdee621374ad60bc6a45546d2`。
- AUTH、runtime bundle、target、snapshot、backup、archive 均未生成；未停写、未访问 Keychain。

## Luna 执行结果

Release owner 已确认上述 v5 plan/review 摘要；v5 SH-10 gate 和只读 C0 已通过，C0 evidence=`sha256:385ab9810d60658dc968ded3cb3b4d059028566fdee621374ad60bc6a45546d2`。

本文件是已经写好的执行计划，不是要求 Luna 再写文档。Luna 已按任务下发生成绑定上述 v5 C0 evidence 的 0600 AUTH-C1，并连续完成 C1→C2→C3→C4；C1～C4 之间没有重复询问用户。

执行范围固定为：

- C1：绑定真实旧 file runtime，完成 drain/close/runtime bundle。
- C2：sealed snapshot。
- C3：只读 Keychain probe + fingerprint verify；禁止 put/delete/覆盖凭据。
- C4：final import、ready、pre-cutover backup、verify-only/materialize restore。
- 完成 C4 后已停止，正在整理 Scrutiny/Runtime 证据；未生成 AUTH-C5/C7，未执行 C5～C7、activate 或首笔业务写入。

结果摘要：

| step | status | step digest / 关键证据 |
| --- | --- | --- |
| C1 | `CUTOVER_C1_OK` | step=`sha256:fad9d8a8...e83b94a`；runtime bundle=`sha256:487e1bab...260d159` |
| C2 | `CUTOVER_C2_OK` | step=`sha256:d72cceb4...7ce8143`；source=`sha256:c16ff088...4beebb`；snapshot=`sha256:af33a4aa...79804e` |
| C3 | `CUTOVER_C3_OK` | step=`sha256:b05bfe53...158d68`；verify_existing，未写 settings |
| C4 | `CUTOVER_C4_OK` | step=`sha256:eb13feab...3ca365`；report=`sha256:96497455...d61e72b`；backup=`sha256:960ae2bd...2e89f1` |

最终 manifest：`completedThrough=C4`，evidence=`sha256:69d08d7b8a28343907fa939d4f6040d7807247eb46f9a2c39512c806f6328642`。

当时给 Luna 的单条任务文本（历史记录，不得再次执行）：

```text
按《v5 立即执行窗口 Handoff》和《R1 真实切换 Runbook》执行。你是本轮 Worker，不是文档作者：从已通过的 v5 C0 开始，生成精确绑定 C0 evidence=sha256:385ab9810d60658dc968ded3cb3b4d059028566fdee621374ad60bc6a45546d2 的 AUTH-C1，并连续执行 C1～C4；C3 仅允许只读验证 Keychain。C1～C4 内不要逐步询问，遇到文档列明的 fail-closed 条件才停止。完成 C4 后先复核并停止；未授权 C5/C7、activate、首笔业务写入或 R2。
```

## 执行复核与停止点

1. 本文件记录 v5 identity、C0 evidence、AUTH-C1 和 C1～C4 结果。
2. `real_cutover_runbook.md` 第 5～10 节是执行命令面。
3. `v5_c0_scrutiny_review.md` 和 `review_authorization_checklist.md` 是复核记录。
4. `evidence_and_test_matrix.md` 记录证据和未授权项。

本轮已从 frozen release 执行；当前开发工作树只用于文档。C4 后必须停止；维护窗口、C5/C7 和 AUTH-C5/C7 不得因本轮成功而自动延伸。

## Luna 当时使用的本地运行变量（历史记录，不得再次执行）

从当前仓库根执行，禁止通过 glob 猜“最新”目录：

```bash
PROJECT_ROOT="$(pwd -P)"
V5_RUN_ROOT="$(cd ../AIRoaming-r1-c1-cutover-20260714-immediate-v5 && pwd -P)"
RELEASE_ROOT="$(cd ../AIRoaming-release-r1-c1-identity-9227e8d && pwd -P)"
CUTOVER_PLAN="${V5_RUN_ROOT}/cutover-plan.json"
CUTOVER_EVIDENCE_ROOT="${V5_RUN_ROOT}/evidence"
AUTH_C1="${V5_RUN_ROOT}/authorizations/AUTH-C1.json"
SOURCE_WORKSPACE_ROOT="${PROJECT_ROOT}/workspace"
MAINTENANCE_BASE_URL="http://127.0.0.1:4310/api"
MAINTENANCE_TOKEN_FILE="${V5_RUN_ROOT}/maintenance-token"
```

当时前置断言（历史记录）：

- `PROJECT_ROOT` 必须是当前 AIRoaming 仓库；`SOURCE_WORKSPACE_ROOT` 必须等于 plan 字段。
- `RELEASE_ROOT` 必须 clean 且 HEAD=`9227e8dfefde59a25f81b53a41074f3971c24d05`。
- production status 必须为 `completedThrough=C0`、evidence=`sha256:385ab981...546d2`。
- 当前时间必须在 `[2026-07-14T20:00:00+08:00, 2026-07-14T23:59:00+08:00)`。
- 4310 端口必须无其他监听；AUTH/runtime bundle/target/snapshot 在开始前必须不存在。

## AUTH-C1 当时生成规则（历史记录，不得复用）

Luna 根据用户的“按本文执行”任务消息生成 `${AUTH_C1}`，不得复用 v4 AUTH。文件必须使用 temp→fsync→rename→parent fsync 原子写入，目录 0700、文件 0600，并包含：

```text
schemaVersion=1
kind=airoaming_cutover_authorization_v1
scope=AUTH-C1
cutoverId=cutover-20260714-immediate-sanitized-v5
appCommit=9227e8dfefde59a25f81b53a41074f3971c24d05
planDigest=sha256:2ba999ffee2061cdf57110fc10cf4720748431ba1aeaf603dab12c19863fc096
runId=cutover-final-20260714-immediate-sanitized-v5
effectiveSchemaManifestDigest=sha256:2e9992459906946415f8072ef4ad210ba00c52393d6c83fc4d0af23e415b3559
evidenceDigest=sha256:385ab9810d60658dc968ded3cb3b4d059028566fdee621374ad60bc6a45546d2
authorizedBy=liyadong
acknowledgement=我确认 C0 证据、plan、release、备份与回滚责任人，授权进入 C1 并按 plan 执行 C3 凭据验证；未授权 C5/C7。
```

`authorizedAt` 使用生成时 RFC3339 时间；`authorizationDigest` 必须是除自身外全部字段的 canonical JSON digest。生成后先重算摘要和权限，不打印 token、credential 或 Keychain 输出。

## C1 当时源 file runtime（历史记录，不得重启）

在 frozen release 中启动一个持续会话，环境必须精确为：

```bash
cd "${RELEASE_ROOT}"
PORT=4310 \
AIROAMING_PERSISTENCE_MODE=file \
AIROAMING_WORKSPACE_ROOT="${SOURCE_WORKSPACE_ROOT}" \
AIROAMING_RELEASE_ROOT="${RELEASE_ROOT}" \
AIROAMING_APP_COMMIT=9227e8dfefde59a25f81b53a41074f3971c24d05 \
AIROAMING_MAINTENANCE_TOKEN_FILE="${MAINTENANCE_TOKEN_FILE}" \
AIROAMING_TASK_WORKER_ENABLED=false \
pnpm --dir apps/server start
```

不得使用 DB-mode server 或代理替代。服务 ready 后从同一 frozen release 执行 Runbook C1 命令；runner 会在 drain 前、close 后和 sealed bundle 三处核对同一 runtime identity。C1 passed 后保持该进程存活且 closed，C4 复核前不得自行 reopen/kill。

## C1～C4 当时连续推进规则（已完成）

每个 step 使用同一个 `${AUTH_C1}`，命令成功后只做本地 status/evidence 复核，然后立即进入下一 step，不向用户逐步确认：

```text
C1 passed -> 核对 runtime bundle/identity/closed -> C2
C2 passed -> 核对 source/snapshot manifest -> C3
C3 passed -> 核对 verify_existing、settings 字节不变、无 Keychain 写 -> C4
C4 passed -> 核对 final/ready/backup/restore/evidence -> 停止
```

任何 step 失败都不得跳步、手改 evidence 或换进程伪装成功。记录原始错误码、当前 evidence、source/settings 前后摘要和资源清理状态后停止；只在 fail-closed 时回报用户。
