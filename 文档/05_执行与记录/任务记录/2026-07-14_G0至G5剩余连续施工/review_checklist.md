---
doc_id: AIR-G05-REMAIN-REVIEW-001
status: active
created: 2026-07-14
updated: 2026-07-15
owner: AI漫游项目
audience: luna, scrutiny-reviewer, runtime-reviewer, human
source: deep-think 复核流程与各阶段验收清单
---

# G0～G5 连续施工复核清单

当前事实：S0/W1/R0B/SH-10/C0～C7、首写边界、R2 OBS-01～10 和 G4-A～F 已完成，G4 总体=`G4_PASSED`，当前进入 `G5_M0_IN_PROGRESS`。本清单不设置工期或日期；后续按依赖连续执行。

## 1. 角色分离

| 角色 | 允许 | 禁止 |
| --- | --- | --- |
| Worker | 实现当前切片、跑测试、修缺陷、写证据 | 为自己签 SH-10/AUTH；修改 Review 结论掩盖失败 |
| Scrutiny Reviewer | 只读检查 diff、契约、Schema、测试、证据、Handoff | 以“看起来可以”替代未运行测试 |
| Runtime/User Reviewer | 从公开入口执行真实/隔离用户路径、查看产物 | 直接改 DB/fixture 让 happy path 通过 |
| Human gate owner | SH-10、AUTH、最终用户签收 | 把授权范围扩大为文档未说明的动作 |

同一个 AI 会话可以分角色，但 Review 必须在 Worker 完成、证据固定后单独记录。SH-10 和 AUTH 永远不能由 AI 角色代替人类。

## 2. 每个切片提交前

- [ ] baseline SHA、status 和 in-scope 文件清单已记录。
- [ ] 已确认未知用户改动并保留。
- [ ] 失败用例/复现证据先于修复存在。
- [ ] 修改没有越过本切片非目标。
- [ ] 新协议/Schema/状态枚举同步 Shared 与正式文档。
- [ ] 定向测试、受影响 package typecheck/build 退出 0。
- [ ] `git diff --check` 通过。
- [ ] 只暂存本阶段文件；没有 `git add -A`。
- [ ] commit message 能说明一个原子结果。

## 3. S0 Review

### Scrutiny

- [ ] R0-A diff 与既有 passed Review 一致；审查后变化已重跑。
- [ ] SecretStore 不通过 argv/log/evidence 暴露 secret。
- [ ] settings 脱敏仍是 prestage→verify→atomic redact；失败旧字节不变。
- [ ] cutover plan/evidence/run identity fail-closed，resume/replay 不绕 gate。
- [ ] 测试 timeout 修复没有删断言、skip 或把真实 deadlock 变成更长等待。
- [ ] 默认 `pnpm test` 连续三次通过。
- [ ] capability 仍 `blockedIds=[]`，没有误改其他 capability。

### Runtime

- [ ] disposable Keychain 证据只触碰临时 HOME/keychain。
- [ ] 两个 fresh 临时根 C0～C7 隔离链和故障路径证据可重现。
- [ ] 默认用户 Keychain/真实凭据/真实数据操作次数为 0。

## 4. W1 Review

### Scrutiny

- [ ] `g2_db` 没有 legacy fallback/双写。
- [ ] Story/Board/Preflight 请求使用 Shared DTO，CAS/source/current 字段完整。
- [ ] preflight confirm 相同 Controller decorator 只有一个。
- [ ] 模式分派在明确 adapter/facade，不用异常作为 fallback 控制流。
- [ ] Web 不使用 `updatedAt` 猜 stale/conflict，不自行算 server-derived preview。
- [ ] 409 保留本地草稿，不自动覆盖/commit。
- [ ] file-mode 兼容路径有测试，但不能在 DB mode 调用。

### Runtime

- [ ] 报告证明真实 `AIROAMING_PERSISTENCE_MODE=db` + fresh SQLite。
- [ ] dirty、stale、双标签、历史复制、第 2～4 步、restart 六条路径通过。
- [ ] file-mode 回归通过。
- [ ] `repeat-each=3` 无 flaky。
- [ ] 无真实 HOME/Keychain/provider/外网。

## 5. R0B/R1/R2 Review

- [x] appCommit 固定、工作树干净、所有真实 path 只在私有 plan。
- [x] 两轮 fresh shadow 同源、同 release，digest/count/Asset 一致。
- [x] SH-10 是人类签署。
- [x] C0 无 AUTH/只读；AUTH-C1、AUTH-C5、AUTH-C7 均已绑定对应前序 digest。
- [x] C0～C4 每 step evidence 不可覆盖，失败保持安全状态并可 resume。
- [x] C1～C4 SecretStore/Keychain 证据不含 secret，verify_existing 未覆盖 fingerprint。
- [x] C4 backup/restore、C5 closed DB smoke、C6 archive/C6_READY、C7 activation/COMPLETED、首笔业务写/file guard 已有真实证据。
- [x] R2 有独立用户授权，未把 AUTH-C7 扩大解释为观察期授权。
- [x] OBS-01～10 已执行并有真实证据；OBS-06/07/08 的实现缺口均以回归测试关闭。
- [x] R2 期间没有删除 archive/backup，没有执行 down migration 或进入 G6。
- [x] R2 Scrutiny 与 Runtime/User Review 均为 `passed`。

## 6. G4 Review

### Scrutiny

- [x] Candidate `selected/locked` 和旧 Server/Web lock API 不再是 DB runtime 权威；Web 已接两阶段 preview/commit。
- [x] G4 overlay 没重复 G1 base 列/trigger。
- [x] preview/commit 共用一个规范化影响 resolver。
- [x] A→B→clear→A、replay、race、impact changed 全部有 DB 证据。
- [x] favorite/reject 与 final lock 职责分离。
- [x] replace/clear 不改旧 Layout/Export/Asset。
- [x] Server 门禁拒绝 stale/unresolved 的新正式输出。
- [x] 迟到任务只 historical。
- [x] legacy migration 不猜 current；可幂等重跑。
- [x] 没有提前实现 G5 crop/画布替换。

### Runtime

- [x] G4 清单 8 条真实用户路径通过。
- [x] 影响弹窗、409 重新确认、排版 stale 摘要与历史已有真实浏览器自动化证据。
- [x] restart/backup restore 后 revision/current/freshness 一致。

## 7. G5 Review

### E0

- [ ] 至少两条完整薄切片；不是只做拖拽 demo。
- [ ] E0-001～010 全部有机器/人工证据。
- [ ] 选定方案的依赖、binary、bundle/内存、许可证和失败项已写 ADR。
- [ ] 未选原型可整体删除，没有实验数据结构进入正式 Schema。

### Scrutiny

- [ ] LayoutDocument/command/renderer 共用语义，画布私有 JSON/DOM 不落盘。
- [ ] autosave 只写 Working Copy；导出只读 LayoutRevision。
- [ ] source replacement 绑定 G4 revision 和 digest，不使用 `lockedCandidateId`。
- [ ] 受控 FontAsset/许可证/embedding 有硬门。
- [ ] renderer 无外网/file scheme，不截图编辑器控件。
- [ ] publication 多 Artifact 共用一个 LayoutRevision/current 判定。
- [ ] mobile 无写接口；AI pending 无自动 apply/save/export。
- [ ] legacy 写/复制源图导出后门已删除。
- [ ] resource limits、日志脱敏、SEC-10 和可访问性有证据。

### Runtime/User

- [ ] 路径 A 页漫：PNG/PDF 实际打开。
- [ ] 路径 B 条漫：slices 可像素拼回。
- [ ] 路径 C 返修：旧/新 Publication 均可查，crop 选择生效。
- [ ] 路径 D 故障：多标签/restart/late task 安全收敛。
- [ ] 路径 E 手机/AI：0 写请求，pending/apply/Undo 正确。
- [ ] 固定输入连续三次 sha 一致。
- [ ] 正式输出无 selection/control handles。
- [ ] 用户尚未签收时状态为 `WAIT_G5_USER_ACCEPTANCE`。

## 8. Handoff 完整性

- [ ] 当前状态只描述已发生事实。
- [ ] 修改文件、migration、命令、退出码、证据、风险完整。
- [ ] `not_run`、`passed_isolated`、`passed` 使用准确。
- [ ] 上位架构/模块/路线图/验收文档同步。
- [ ] 持续价值功能有完成记录。
- [ ] 会话记忆和长期记忆已去重更新。
- [ ] 下一步只有一个明确状态/授权，不让用户重新猜路线。

## 9. 判定模板

```text
Review：Scrutiny | Runtime/User
阶段：<phase>
baseline/commit：<sha>
结论：passed | passed_isolated | changes_required | waiting_human_gate
blocker：<none 或 ID 列表>
证据：<路径/命令/产物 digest>
未运行：<项目 + 原因>
越权检查：真实数据、默认 Keychain、真实凭据、外网操作次数
下一状态：<state machine 中唯一状态>
```

## 10. 本次施工包 Static/Scrutiny Review

```text
结论 = passed
范围 = docs-only planning package
功能实现 = not_started_by_this_task
```

已核对：

- 当前 Git/R0-A/W1/G4/G5 起点与 2026-07-14 代码和事实源一致。
- S0→W1→R0B→R1→R2→G4→G5 顺序没有越过真实切换前置。
- R0B、SH-10、AUTH-C1/C5/C7、R2 观察授权和 G5 最终签收均有独立 stop。
- G4-A～F、G5-M0～M8 与 accepted 主方案一致；G6/视频明确排除。
- 9 份 Markdown frontmatter/doc_id/code fence 校验通过，引用的现有 Markdown 路径全部可达，`git diff --check` 通过。

## 11. 本次施工包 Runtime/User Review

```text
结论 = not_applicable
原因 = 本轮只编写施工文档，没有修改功能代码、启动页面、执行数据库迁移、调用 Keychain/provider 或生成出版产物
```

不得把本次 `not_applicable` 当作 S0/W1/R0B/R1/R2/G4/G5 的运行验收。Luna 实现各阶段时必须按本清单和 `test_matrix.md` 分别补真实/隔离 Runtime 证据。
