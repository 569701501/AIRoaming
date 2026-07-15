---
doc_id: AIR-RCUT-V4-PLAN-REVIEW-001
status: passed_waiting_auth_c1
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: release-owner, migration-reviewer, rollback-owner, operator
source: commit 9227e8d 与 v4 C1 gate scrutiny
---

# v4 Plan / SH-10 Digest-bound 人工确认单

## 1. 当前停止点

```text
BLOCKED_WAITING_V4_AUTH_C1
```

四份候选文件已在仓库外 0700 私有根生成，文件均为 0600。用户已确认本单中的 plan/review digest；SH-10 passed evidence、shadow gate 和只读 C0 已完成，production plan reader 与独立摘要重算通过。

尚未生成：AUTH-C1/C5/C7、C1～C7 evidence、target DB、snapshot、backup、archive。

## 2. 冻结身份

| 字段 | 值 |
| --- | --- |
| appCommit | `9227e8dfefde59a25f81b53a41074f3971c24d05` |
| cutoverId | `cutover-20260714-2200-sanitized-v4` |
| runId | `cutover-final-20260714-2200-sanitized-v4` |
| settings | `already_sanitized / verify_existing` |
| maintenance URL | loopback `/api` 根 |
| maintenance window | `2026-07-14 22:00～23:00 Asia/Shanghai` |
| planDigest | `sha256:290674add0e9bec645fd787f2da6b8d103665692c8eabb254f259be07afc8ce6` |
| humanInputDigest | `sha256:17d4f95bfe310431dc0f2b4388c1848eb39c35244d5d6ef5ee2bd28a256ac8fd` |
| checkBundleDigest | `sha256:1e49e910b274b0aa155de9b6b68952273e8b2ced349f137d473381db71f705b7` |
| passedCheckBundleDigest | `sha256:876165cb90197a27aacf3b39d64e2c413b1694f21b4e55c123144de5a67c6a46` |
| reviewPacketDigest | `sha256:d42300f03b0209bdfe508159eca73460bb7de52f8baf4ca8e304087e12aac1cb` |
| SH-10 passed evidence | `sha256:46ed1af1f2f763c037ca491549008450093430d91b4267da8b3c9f2ae7674f78` |
| shadow gate | `sha256:718cb20eb099f28bac3dbca90b7f65da940b7c2b4a337c12a431dff0a5614d1f` |
| C0 evidence | `sha256:021bd122001542eefecddd94207903afae9063a6f2e79c842584db9e8635e770` |

## 3. 已执行动作与当前边界

- 已生成绑定上述 plan/review digest 的 v4 SH-10 passed evidence 与 shadow gate。
- 已生成随机 0600 maintenance token，内容未打印，未使用真实凭据。
- 已只读执行 v4 C0 并复核 evidence，`completedThrough=C0`、stepCount=1。
- C0 后已停止：未执行 C1～C7，未访问 Keychain，未停写。

下一步只能生成绑定 C0 evidence 的 AUTH-C1；AUTH-C1 需另行由用户明确确认。

## 4. 人工确认文本

```text
确认 v4 planDigest=sha256:290674add0e9bec645fd787f2da6b8d103665692c8eabb254f259be07afc8ce6、reviewPacketDigest=sha256:d42300f03b0209bdfe508159eca73460bb7de52f8baf4ca8e304087e12aac1cb；同意据此生成 v4 SH-10 gate 并执行只读 C0；未授权 C1～C7，未授权访问 Keychain。
```
