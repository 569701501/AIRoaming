---
doc_id: AIR-RCUT-SCRUTINY-C1C3-001
status: blocked
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: reviewer, release-owner, human
source: R1 C1～C3 evidence chain
---

# R1 C1～C3 Scrutiny Review

## 结论

`changes_requested / blocked_before_c3_settings_start_state`

AUTH-C1 已由用户明确确认并绑定 C0 evidence；C1、C2 通过。C3 按生产契约 fail-closed，不能继续 C4。

## 已核验

| 项目 | 结果 |
| --- | --- |
| AUTH-C1 scope/acknowledgement/identity | passed；文件私有 0600 |
| AUTH-C1 evidence binding | passed；C0 gate=`sha256:3444ae2d...9a3ba11` |
| C1 drain/close/runtime bundle | passed；`CUTOVER_C1_OK` |
| C2 sealed snapshot | passed；`CUTOVER_C2_OK` |
| evidence chain | passed；`completedThrough=C2`，无 C3～C7 |
| C3 settings起点 | blocked；source=`already_sanitized`，plan=`legacy_plaintext_requires_two_phase` |
| C3副作用清理 | passed；target-data、target-workspace、credential-expectations 均不存在 |
| C5/C7 | not run；未生成 AUTH-C5/C7 |

## 关键证据

- C1 gate evidence：`sha256:0bc1d582cd12f5ae56bf9c29ccbd1e3db00b3b3ee097c3ddd0e361fdff9d69d0`
- C2 gate evidence：`sha256:3b1254e5fb9f3923b042f62e791a79cde5f9632115a83f4c06faac0b96ea1680`
- C3 返回码：`CUTOVER_SETTINGS_START_STATE_MISMATCH`
- source `app-settings.json` 的图片 provider 只有 `secretRef` 与 `keyFingerprint`，无 `apiKey` 明文；未读取或打印 Keychain 值。

## 必须修正

1. 由 release owner 决定真实起点：保持已脱敏 `already_sanitized/verify_existing`，或在合法、已审阅的 legacy plaintext 输入下重新生成 plan。
2. 重新生成 plan 并取得新的 planDigest；旧 AUTH-C1、C0 evidence identity 均不可复用。
3. 重新执行 C0，只在新的 C0 evidence 上生成新的 AUTH-C1；不得修改当前 plan 文件、伪造 plaintext 或跳过 settings 检查。

## 停止边界

当前未执行 C4 final importer/ready/backup/restore，未执行 C5/C6/C7，未生成 AUTH-C5/C7。不得把状态写成 `real_cutover_completed`。
