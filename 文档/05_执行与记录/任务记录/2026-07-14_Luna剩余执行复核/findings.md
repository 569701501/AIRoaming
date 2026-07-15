---
doc_id: AIR-LUNA-REMAIN-AUDIT-FINDINGS-001
status: superseded_by_no_schedule_closeout
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: human, ai-agent, luna
source: task_plan.md
---

# Luna 剩余执行复核发现

> 本文件保存收口前的审计发现。所列 P0/P1 文档漂移已由 `2026-07-14_Luna无排期计划收口` 修复；当前唯一入口为 `../2026-07-14_G0至G5剩余连续施工/luna_current_handoff.md`。下文 `changes_required` 是修复前结论，不是当前状态。

## 初始发现

- 当前 Luna 主交接为 `2026-07-14_G0至G5剩余连续施工`，包含 Handoff、执行计划、实现契约、文件地图、测试矩阵、授权门和复核清单。
- `2026-07-14_项目与Luna进度复核` 的摘要停在 `AUTH-C1` 前，已被之后的 v5 C1～C4 实际执行推进超越，不能直接复用其剩余量结论。
- 当前长期记忆记录 v5 C1～C4 已完成，下一门为独立 `AUTH-C5`；需要继续核对原始任务目录、私有证据摘要、提交和代码状态。

## 当前真实状态

| 阶段 | 状态 | 证据与边界 |
| --- | --- | --- |
| S0 | completed | R0-A 与默认测试入口已提交并复核 |
| W1 | completed | `3898182`、`4fe1dfa`；DB-only Web/API 和隔离 E2E 已通过 |
| R0-B / SH-10 | completed | 两个 fresh shadow、SH-01～10 和 v5 gate 已通过 |
| R1 C0 | passed_read_only | v5 C0 evidence=`sha256:385ab981...546d2` |
| R1 C1～C4 | passed | v5 evidence=`sha256:69d08d7b...6328642`；final/ready/backup/restore 通过 |
| R1 C5～C6 | not_run | 等独立 `AUTH-C5`；禁止由 AUTH-C1 推导 |
| R1 C7 | not_run | C5/C6 后仍需独立 `AUTH-C7` |
| R2 | not_run | C7 后仍需独立观察授权并执行 OBS-01～10 |
| G4 | not_started，只有基础骨架 | 简单 lock、Schema/importer 骨架存在；正式 preview/replace/clear/impact/freshness/Web 未闭环 |
| G5 | not_started，只有基础骨架 | Layout/Export DB 骨架存在；高自由编辑器、字体、确定性 PNG/PDF/条漫、手机与 AI 未实现 |

当前唯一正确停止点：

```text
R1_V5_C4_PASSED_WAITING_AUTH_C5
real_cutover = no_go
```

## 尚未执行的工作

1. 人类复核 v5 C4 证据并独立授予 `AUTH-C5`。
2. Luna 执行 C5 closed DB smoke、C6 metadata archive，停在 `AUTH-C7`。
3. 人类独立授予 `AUTH-C7`，Luna 执行 C7 activate/resume/首笔 DB-only 写入/file guard。
4. 人类独立授权 R2，执行 OBS-01～10 和真实 DB-only 用户路径观察。
5. R2 通过后执行 G4-A～F 六个垂直切片。
6. G4 通过后执行 G5-M0～M8 九个阶段，并等待最终用户签收。

G6 素材 ZIP、下载包和视频链路不在当前 Luna 总计划内，不能计入本轮完成定义。

## 剩余工作量结构（不做时间排期）

按风险与实现复杂度表达，不换算为天数、日期或截止时间：

| 剩余块 | 占剩余工作 | 主要不确定性 |
| --- | ---: | --- |
| R1 C5～C7 | 5%～10% | 真实环境 fail-closed、两次人工授权 |
| R2 OBS-01～10 | 10%～15% | 重启/任务/恢复是否暴露新问题 |
| G4 A～F | 20%～30% | 事务并发、影响预览、旧路径退役、Web/E2E |
| G5 M0～M8 | 55%～65% | E0 选型、IME/竖排/字体、确定性 renderer、PDF/条漫、性能 |

合计：当前 G0～G5 目标仍有约 **35%～45% 风险加权工作量**，G5 是剩余主体。用户要求尽快连续完成，因此不再给 Luna 写预计天数；授权与依赖满足就立即推进。G5 E0 没有候选通过硬门时，按 blocker 停止并提交证据，不以延长排期表达。

## 文档质量复核

### 已达到可施工级的部分

- R1 Runbook 给出精确命令、授权绑定、失败停止、回滚和敏感信息边界。
- `authorization_gates.md` 把 AUTH-C5、AUTH-C7、R2 和 G5 签收分开，越权边界清楚。
- G4 方案、契约字典和验收清单覆盖状态机、事务、影响摘要、freshness、API、Web、迁移与运行路径。
- G5 方案、LayoutDocument/命令契约、renderer 契约和验收清单覆盖 E0、数据内核、编辑器、字体、任务、确定性出版、安全与用户验收。
- Stop condition、禁止 fallback、历史不可变和 Git 边界均写得明确。

### P0：会导致 Luna 误判起点的状态漂移

1. 总 Handoff 仍写 `HEAD=4fe1dfa`，而当前代码 HEAD 为 `9227e8d`。
2. `luna_execution_plan.md`、总 `progress.md`、`findings.md`、`task_plan.md` 和 `test_matrix.md` 仍把当前状态写成 `WAIT_R0B_AUTH`、R0B/R1 未授权。
3. R0-R2 `evidence_and_test_matrix.md` 的 AUTH-C5 仍写“v3 不满足、not_ready”，但同一文件 C1～C4 已记录 v5 passed。
4. `review_authorization_checklist.md` 先正确写 v5 C4 后等待 AUTH-C5，后面的 §7 又保留旧 v3/v4 `not_ready` 结论，且 C1～C4 的部分完成项仍未勾选。

### P1：复核留痕和入口可读性不足

- `v5_c0_scrutiny_review.md` 的标题、frontmatter source 和顶部 `completedThrough=C0` 没有随追加的 C1～C4 复核同步；文件内容却已写到 C4。Luna/Reviewer 很容易只看标题而漏掉最新证据。
- 当前事实分别散落在 R0-R2 Handoff、Runbook、v5 Handoff、进度和矩阵中；缺少一页只面向“从 C4 继续”的当前入口。
- 总计划要求 Luna 同时阅读多份互相冲突的状态文档。谨慎执行者会命中 stop condition，非谨慎执行者可能重复 R0B/C0/C1～C4。

## 风险判断

- **数据破坏风险：中低。** runner、AUTH、identity 和 fail-closed 门写得较强，正常遵守 Runbook 时能阻止越权。
- **重复执行/错误起点风险：高。** 旧总计划和新 R0-R2 事实冲突。
- **进度误报风险：高。** AUTH-C5 同时出现 `not_ready` 与 `waiting authorization` 两种口径。
- **G4/G5 实现偏航风险：中。** 技术契约足够细，但 G5 范围很大，必须按 M0/E0 门逐阶段落任务包，不能一次性把 5,000 余行文档全当单个指令。

## 结论

```text
Scrutiny Review = changes_required
plan_content = sufficient
current_state_consistency = failed
safe_next = 先同步当前状态并形成独立 v5 C1-C4 复核，再申请 AUTH-C5
```

因此，不建议此刻把旧的“总计划”原样交给 Luna 继续。先做一次只改文档的状态收口；之后 R1 C5～C7 可以直接沿现有 Runbook 执行。G4/G5 的方案不需要重写，但应在进入各阶段时生成短的当前切片 Handoff。

## 后续解决状态

- 总 Handoff、Luna 计划、task/progress/findings/test matrix 已统一为 v5 C4 / WAIT_AUTH_C5。
- AUTH-C5 已统一为 v5 `waiting_human_authorization`，v3 `not_ready` 仅历史。
- 已新增独立 `v5_c1_c4_scrutiny_review.md` 与 `v5_c1_c4_runtime_review.md`。
- 已新增无排期 `luna_current_handoff.md`，删除 Luna 天数估算。
