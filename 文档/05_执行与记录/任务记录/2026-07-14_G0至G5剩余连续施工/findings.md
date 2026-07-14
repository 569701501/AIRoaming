---
doc_id: AIR-G05-REMAIN-FINDINGS-001
status: active
created: 2026-07-14
updated: 2026-07-15
owner: AI漫游项目
audience: human, luna, reviewer
source: 代码、Git、v5 production evidence 与正式验收文档复核
---

# 当前事实与风险

## 1. 当前不可覆盖事实

- 当前分支为 `codex/g0-test-safety-net`。
- cutover evidence appCommit 为 `9227e8dfefde59a25f81b53a41074f3971c24d05`；当前 G4 代码兼容 HEAD 为 `179be50`；旧 cutover evidence 继续绑定历史 appCommit，不重签。
- S0、W1、R0B、SH-10 已完成。
- v5 C0～C7 activation 已完成；production status=`completedThrough=C7`。
- 当前 evidence=`sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452`。
- 首笔业务写和 R2 OBS-01～10 已真实通过；G4-A/B/C 已完成，G4-D～F、G5-M0～M8 尚未完成。
- 当前唯一执行入口为 `luna_current_handoff.md`，当前状态为 `G4_D_IN_PROGRESS`。

## 2. 已完成能力不能等同于总目标完成

- W1 已补齐 Story/Storyboard/Preflight 的 DB-only Web/API 与 fresh SQLite E2E。
- R0B release shadow、SH-10 和 v5 C0～C4 已形成真实 evidence。
- C5/C6/C7 与 R2 均已关闭；OBS-06/07/08 中暴露的真实缺口已分别修复并复核，允许进入 G4。
- G4/G5 的产品、契约和验收文档完整，但正式功能仍待实现。

## 3. 固定阶段顺序

```text
AUTH-C5（已消费）
  -> C5_C6（已完成）
  -> AUTH-C7/C7 activation（已完成）
  -> FIRST_BUSINESS_WRITE_BOUNDARY
  -> R2 OBS-01～10（已完成）
  -> G4-A～F
  -> G5-M0～M8
  -> WAIT_G5_USER_ACCEPTANCE
```

除明确人工门和真实 blocker 外，前一步通过后立即进入下一步。

## 4. 无排期决定

- 不用工期、预计天数、开始/结束日期指导 Luna。
- 日期只用于文档、Git 和 evidence 追溯，不构成等待条件。
- v5 `maintenanceWindow` 是已完成 C1 的不可变安全证据，不是 C5～G5 的排期。
- 普通实现失败、测试失败和返工由 Luna连续处理；不能将它们升级成不必要的人类审批。
- G5 E0 无候选通过硬门、需要付费/新系统权限或重大产品决策时，才停下请用户决策。

## 5. 主要风险与控制

| 风险 | 影响 | 控制 |
| --- | --- | --- |
| 旧文档仍写 `WAIT_R0B_AUTH` | Luna 重复已完成真实动作或错误停止 | 唯一入口 + status/evidence 只读断言 |
| 旧 v3 AUTH-C5=`not_ready` | 错误认为 v5 C4 不具备申请资格 | 当前矩阵改为 v5 `waiting_human_authorization` |
| 把历史窗口当剩余排期 | 无故等待、拖慢执行 | 明确窗口只绑定 C1 历史证据 |
| dirty worktree 混入用户改动 | 丢失用户内容、提交不可审计 | 阶段清单、窄暂存、禁止 add -A/reset/rebase |
| file/DB fallback | 双事实源、数据分叉 | capability 单选、失败不 fallback、网络断言 |
| G4/G5 普通返工变成人工门 | 频繁中断 | 只保留固定授权门和 blocker 停止点 |
| G5 过早锁画布技术 | renderer 不确定或许可证风险 | E0 两条完整薄切片和硬门 |

## 6. 当前结论

```text
plan_ready = yes
schedule_policy = NO_CALENDAR_SCHEDULE
current = G4_D_IN_PROGRESS
next = G4_WORKFLOW_AND_DOWNSTREAM_GATES
```

## 7. G4-A 稳定结论

- Candidate runtime 状态闭集固定为 `generated/rejected/superseded`；favorite 与 current final 分离。
- 当前定稿只由 CandidateLockRevision 与 Shot current pointer 表达；线性链不允许分叉、跳号、从非 current 接续或普通清空 pointer。
- 0012 是 forward-only overlay，不重复 G1 列、check 或 immutable trigger；应用启动要求精确成功的 12 段 ledger。
- legacy 只有 Shot 直接 `lockedCandidateId` 且 Candidate/Asset/scope 均可验证时才建 v1；selected 只转 favorite，locked status 不推断 current。
- G4-A commit=`79dc806`，Scrutiny=`passed`，Runtime=`passed_isolated`；G4 总体 Runtime/User Review 仍待 G4-F。

## 8. G4-B 稳定结论

- 状态机只表达 create/no-op/invalid；精确 replay 必须在 expected conflict 之前由 current.previous/action/target 判定。
- complete lock set digest 只包含按 Unicode 字典序排列的 `{shotId,candidateLockRevisionId}`；Candidate label/favorite/order 和数据库行顺序不参与。
- incomplete/unresolved 的 `sourceApplicability` 与 digest 必须为 null；strict codec 拒绝未知字段、非规范排序、重复或交叉分类。
- legacy unresolved 信封即使带有看似完整的 ID 也保持 unresolved；完全无 source revision 时不猜 current。
- impact digest 只包含规范化 authority ID 集与 intent，不包含数量、展示字段、时间或路径；lock_set task 同时按 chapter source identity 和当前 digest 限定。
- freshness 是 binding/current pointer/digest 的查询时派生，revision position 与 source resolution 分轴，Export completionApplicability 不被返修改写。
- G4-B commit=`9cd599a`，Scrutiny=`passed`，Runtime=`passed_isolated`；事务、API、竞争和用户路径从 G4-C 继续。

## 9. G4-C 稳定结论

- preview/commit 在同一规范化 impact resolver 上运行；commit 事务顺序固定为 replay、expected revision、FSM/no-op、目标/G2 门禁、impact digest、revision insert、Shot pointer CAS。
- 丢响应重试只有 previous/action/target 精确匹配才返回 replay；SQLite writer/唯一/CAS 冲突重新读取后仍不匹配则返回 revision conflict。
- favorite/reject/restore 不改变 current final；current final 不可废弃；complete 只接受所有 active Shot 的完整 current lock set。
- 旧 Server lock HTTP 路由和旧 DB 直接 revision/pointer writer 已删除；file-mode 兼容投影保留，Web 新 API 接入留给 G4-E。
- G4-C commit=`179be50`，Scrutiny=`passed`，Runtime=`passed_isolated`；工作流 summary、下游门禁与迟到任务从 G4-D 继续。
