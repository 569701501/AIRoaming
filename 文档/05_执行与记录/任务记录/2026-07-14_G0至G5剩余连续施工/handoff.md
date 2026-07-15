---
doc_id: AIR-G05-REMAIN-HANDOFF-001
status: completed
created: 2026-07-14
updated: 2026-07-15
owner: AI漫游项目
audience: luna, developer, qa, human
source: v5 C0～C7 production evidence、R2 OBS-01～10、G4/G5 正式契约、用户无排期要求
---

# Luna 总目标连续施工 Handoff

## 1. 唯一当前入口

Luna 必须先读并以此为当前执行入口：

```text
文档/05_执行与记录/任务记录/2026-07-14_G0至G5剩余连续施工/luna_current_handoff.md
```

本目录其他文件提供实施契约、文件地图、测试矩阵和历史进度；若状态与 `luna_current_handoff.md` 冲突，以冻结 release 的只读 status、最新 evidence 和该入口为准，并先修正文档再执行。

## 2. 当前真实起点

```text
branch = codex/g0-test-safety-net
cutover evidence appCommit = 9227e8dfefde59a25f81b53a41074f3971c24d05
current compatible implementation commit = fc9ea47
S0 = completed
W1 = completed
R0B / SH-10 = completed
R1 v5 C0～C7 activation = passed
completedThrough = C7
evidence = sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452
current = G0_G5_COMPLETE
C5/C6/C7_activation/first_write = completed; R2_OBS-01~10 = passed_real; R2_reviews = passed; G4-A～F = G4_PASSED; G5-M0～M8 = passed; G5_user_acceptance = passed
```

Luna 不得重复 R0B、SH-10、C0～C7 或 R2，也不得从旧 `WAIT_R0B_AUTH`/`BLOCKED_R2_*` 恢复。

## 3. 总目标

把静态漫画 G0～G5 剩余主线连续推进到用户可签收状态：

```text
AUTH-C5 -> C5_C6 -> AUTH-C7 -> C7_ACTIVATE
  -> FIRST_BUSINESS_WRITE_BOUNDARY
  -> R2_OBSERVATION_PASSED
  -> G4_A_TO_F
  -> G5_M0_TO_M8
  -> WAIT_G5_USER_ACCEPTANCE
  -> G0_G5_COMPLETE
```

G6 素材包与视频链路不在本任务。

## 4. 无排期原则

- 不给 Luna 安排工期、预计天数、开始/结束日期或等待日期。
- 文档日期、证据时间和 Git 时间只用于追溯，不控制何时开始。
- 授权满足就立即执行；同一授权区间内连续推进，不逐步询问。
- 只在 AUTH-C5、AUTH-C7、R2 授权、fail-closed blocker、G5 E0 决策或 G5 最终签收处停止。
- v5 历史 maintenanceWindow 只证明 C1 在合法安全边界内完成，不是 C5～G5 的执行日程。

## 5. 必读顺序

1. `luna_current_handoff.md`。
2. `authorization_gates.md`。
3. `task_plan.md`。
4. `implementation_contract.md`。
5. `file_map.md`。
6. `test_matrix.md`、`review_checklist.md`。
7. `progress.md`、`findings.md`。
8. `文档/05_执行与记录/任务记录/2026-07-13_R0-R2真实切换施工包/real_cutover_runbook.md`。
9. G4/G5 正式方案、契约与验收清单。

读取后先执行只读状态核验，不根据文件名中的日期选择 run，不通过 glob 猜“最新”。

## 6. 人工门与连续区间

| 当前/后续门 | 人类授权内容 | Luna 获权后的连续范围 |
| --- | --- | --- |
| `WAIT_AUTH_C5` | C4 后人工门（已通过） | 不适用 |
| `WAIT_FIRST_BUSINESS_WRITE` | C7 activation 后首写边界 | 首写/file guard 证据后申请 R2 |
| `WAIT_R2_AUTH` | OBS-01～10 的明确授权 | OBS-01～10→Review→G4-A～F→G5-M0～M8 |
| `WAIT_G5_USER_ACCEPTANCE` | 用户核验 G5 真实产物（已通过） | 历史门，不再恢复 |

固定授权文本和授权文件字段只以 `authorization_gates.md` 与 R0-R2 Runbook 为准。Luna 不得代替用户扩大 AUTH 范围。

## 7. 执行纪律

- 每个切片必须有契约、失败测试/复现、实现、定向验证、全量回归、证据、Scrutiny、Runtime/User Review 和可回退提交。
- 自动区间内普通测试失败或实现返工由 Luna自行诊断、修复、复测；不把它们变成人工审批。
- 真实 evidence、AUTH、token、绝对路径、credentialId、Keychain 输出留在仓库外私有根；仓库只记录脱敏 digest、计数和结论。
- 当前工作树有用户文档改动；禁止 `git add -A`、reset、rebase、覆盖、删除或混入无关提交。
- 禁止 file/DB fallback、伪造 marker、复用旧 identity AUTH、跳过断言、把 `not_run` 改为 `passed`。
- 禁止 push，除非用户另行明确授权。

## 8. 完成定义

只有以下全部成立，才可写 `G0_G5_COMPLETE`：

- v5 C5～C7、首写与 R2 OBS-01～10 真实证据通过，R2 双 Review=`passed`。
- G4-A～F 全部验收通过。
- G5-M0～M8、确定性 PNG/PDF/条漫、manifest、字体/许可证/性能门通过。
- Scrutiny 与 Runtime/User Review 通过。
- 用户完成 G5 最终签收。
