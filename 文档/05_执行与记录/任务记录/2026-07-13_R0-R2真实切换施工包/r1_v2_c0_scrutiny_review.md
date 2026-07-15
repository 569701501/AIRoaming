---
doc_id: AIR-RCUT-R1-V2-C0-REVIEW-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: release-owner, migration-reviewer, operator, ai-agent
source: v2 digest-bound 人工确认、冻结 release C0 与私有 evidence
---

# R1 v2 SH-10 与 C0 独立复核

## 复核范围

- v2 plan 使用 `already_sanitized/verify_existing`，且 plan/review digest 与用户确认一致。
- SH-10 passed evidence 与 shadow gate 的身份、10 项 checks、MigrationReport 和人工确认绑定。
- 冻结 release 的 C0 输出、证据链、私有权限和副作用边界。
- 不复核或授权 C1～C7，不访问 Keychain。

## 绑定结果

| 对象 | 摘要 / 结果 |
| --- | --- |
| plan | `sha256:675bb34632e79bd0fc45f7ee81c6ca1c8747b03e7164f965defb6c4526e185af` |
| review packet | `sha256:52b31571d5715f4f6eb84e37a6408b391a4f7242a2a3068c2a4e492ef07c522f` |
| SH-10 passed evidence | `sha256:89248a11f76ff2974377f5bb0e55e6da397e30b5d596b6d72d64dc37896e15c9` |
| shadow gate | `sha256:be1209a74c698aac24c57b1db690826217f91764ea65aecf6c4eadbb9a047414` |
| C0 | `CUTOVER_C0_OK`，`replayed=false` |
| C0 evidence | `sha256:e173a8e0f42fb8c80c8c641065772bdbf27d9e137e345adecc59c1e967262cf1` |

## Scrutiny Review

- 冻结 release 的生产 `CutoverPlanService` 与 `readVerifiedCutoverShadowGate()` 均通过。
- gate 包含 SH-01～SH-10 共 10 项 passed evidence；SH-10 精确绑定用户确认，MigrationReport digest 一致。
- C0 evidence 由生产 `CutoverEvidenceStore` 复核：`completedThrough=C0`、stepCount=1、summary=`CUTOVER_C0_OK`，artifact 仅含 gate 与 MigrationReport digest。
- 私有根/evidence/steps 目录均为 0700，文件均为 0600；token 内容未输出。
- v2 AUTH-C1、target DB/data/workspace、snapshot、runtime bundle、credential expectations 均不存在。
- 5 个定向测试文件共 24 tests 全通过；`git diff --check` 通过，项目代码目录无 diff。

结论：`passed`。

## Runtime/User Review

- 用户已完成 v2 digest-bound 人工确认，并明确授权范围只到 C0。
- 冻结 release C0 真实 CLI 返回 `CUTOVER_C0_OK`。
- 本阶段无 UI、导出物或业务数据路径；页面复核不适用。

结论：`passed_read_only`。

## 残留风险与停止点

- 旧 identity 的 AUTH-C1/C1/C2 不能复用；v2 必须从 C1 顺序重建证据链。
- C1 会进入停写边界，C3 会只读验证既有 Keychain；二者均未获本轮授权。
- 当前停止点为 `blocked_waiting_v2_auth_c1`。只有用户明确采用 `already_sanitized` AUTH-C1 文本并绑定本次 C0 evidence 后，才能继续。
