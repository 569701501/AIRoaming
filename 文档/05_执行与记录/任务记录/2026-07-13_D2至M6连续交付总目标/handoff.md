---
doc_id: AIR-D2-M6-MASTER-HANDOFF-001
status: ready_for_luna
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5 完成证据、D2-A0/A1 完成证据、当前 capability registry、G1 C0～C7 与用户连续执行授权
---

# D2 至 M6 连续交付总 Handoff

## 1. Luna 领取指令

这是一个连续目标，不是“只做下一小步”的任务。

Luna 从当前仓库事实出发，跳过已完成阶段，连续完成剩余工作：

```text
已完成：D2-A2-1 -> D2-A2-2 -> D2-A3-1 -> D2-A3-2A/B -> D2-A4
  -> 已完成：D2-A5 Dialogue runtime（commit `fa26908`）
    -> 当前：D2-A6（Outbox + Project delete，并回补 Character delete）
      -> D2-A7
        -> D2-A8
          -> M6 工具实现与全隔离 C0～C7 演练
            -> ready_for_real_cutover_authorization
```

每个阶段完成后必须自测、做 Scrutiny Review、做适用的临时根 Runtime Review、更新文档并独立提交；全部通过后自动领取下一阶段，不等待用户逐步回复。

不得把“连续执行”理解为并行越级、一次性大提交、跳过验收，或直接操作真实环境。

## 2. 当前事实

| 项目 | 当前状态 |
| --- | --- |
| 当前分支 | `codex/g0-test-safety-net` |
| 当前已提交基线 | `fa26908 feat(d2): persist dialogue runtime facts`；D2-A6 代码与证据已完成，待独立提交 |
| 工作树状态 | P8 已完成并已做静态/运行复核；下一阶段从 D2-A7 开始，不能重复施工 |
| M5 | `completed`；A0～A4 已实现并复核 |
| D2-A0 | `completed`；8 个聚合 capability、36 个操作已登记 |
| D2-A1-2 | `completed`；Settings/SecretStore 已绿 |
| D2-A2-1 | `1f22861` completed |
| D2-A2-2 | `077762d` completed |
| D2-A3-1 | `9087115` completed |
| D2-A3-2A/B 当前 | identity、character/scene queue、worker、visual confirm、CandidateLock、images_done、Character delete intent 与 Outbox physical cleanup 已实现；ensure/generate 旧入口已 retired |
| D2-A4 当前 | LayoutWorkingCopy、LayoutRevision/source binding、layout export、asset package 已实现并提交 |
| required capability blocker | 0 个（P8 已收口） |
| final importer | 未实现；`db:import --kind final` 固定 fail-closed |
| `db:activate` | 未实现 |
| M6 | `prerequisite_blocked` |

P8 收口后的 `blockedIds` 必须精确为空数组：`[]`。

`settings_credential_secret_store` 与 `task_create_claim_complete_cancel_recover` 已绿，不得回退或误改。

## 3. 总目标

在不触碰真实用户数据、真实系统凭据和正式切换的前提下，完成 DB-only 所需的全部剩余业务读写、Outbox、final importer、activation 工具和临时根演练，使仓库达到：

```json
{
  "developmentState": "completed",
  "d2State": "passed",
  "blockedIds": [],
  "finalImporter": "implemented_and_fixture_verified",
  "activateTooling": "implemented_and_isolated_rehearsal_passed",
  "realCutoverState": "awaiting_explicit_user_authorization"
}
```

未取得真实切换授权时，不得把最终状态写成 `production_ready`、`m6_completed` 或 `db_only_activated`。

## 4. 必读顺序

开始前完整阅读：

1. 本文件。
2. `luna_execution_brief.md`（直接施工清单）。
3. `master_goal.md`。
4. `remaining_work.md`。
5. `implementation_contract.md`。
6. `test_matrix.md`。
7. `file_map.md`。
8. `autonomy_protocol.md`。
9. `文档/04_方案与决策/2026-07-13_G3-D2与M6推进路线.md`。
10. `文档/06_测试与验收/G1数据库迁移执行与验收清单.md` 中 Repository、Layout/Export、Outbox/Delete、Secret、C0～C7、ACT/RB 部分。
11. `文档/04_方案与决策/2026-07-12_G3-M施工包_备份恢复与DB-only激活.md`。
12. 当前阶段对应的既有施工资料；当前继续读取 `../2026-07-13_D2-A3-2A场景参考任务持久化/`、`../2026-07-13_D2-A3-2A候选锁定持久化/`、`../2026-07-13_D2-A3-2A章节图像完成状态/`。

## 5. 连续执行权限

用户已授权 Luna 在本仓库内连续进行以下工作，不需要每阶段再次询问：

- 探索代码与文档。
- 修改业务代码、测试、共享契约和前端接线。
- 在必要且有证据时新增 0011+ 小型 migration；禁止改写 0001～0010。
- 只在临时 workspace、临时 dataRoot、临时 SQLite 和 fake SecretStore 中运行测试与演练。
- 创建当前阶段所需的简短实施记录、Scrutiny Review 和 Runtime Review。
- 在阶段验收通过后创建独立本地 commit。
- 阶段通过后自动进入下一阶段。
- 为了控制风险，将本 Handoff 中的大阶段再拆成更小内部提交；不得改变总顺序和总退出门。

本授权不包含 push、PR、部署、外部消息或真实环境变更。

## 6. 不可越过的授权边界

遇到以下动作必须停止整个连续任务，汇总到一个最终授权请求，不得自行执行：

- 读取、复制、改写或删除默认/真实 workspace。
- 连接真实用户数据库或把临时数据库替换为真实 `DATABASE_URL`。
- 读取或写入真实 macOS Keychain、真实 provider key、真实 OpenCode 凭据。
- 对真实源执行 final snapshot/final import。
- 对真实服务执行 drain、closed、stop-write 或停进程。
- 对真实根执行 `app:backup --kind pre-cutover` 成功路径。
- 对真实 metadata 执行 archive、rename、delete 或切换入口。
- 对真实数据库执行 `db:activate --execute`。
- 产生会删除正式历史、回退 milestone 或改变用户核心语义且无现有文档授权的方案。

自动测试可以在带唯一 runId、marker 和三根隔离的临时 fixture 中调用 execute 代码路径；这不等于真实切换授权。

## 7. 阶段推进规则

每个阶段严格执行：

1. 核对上游 commit、工作树和阶段入口。
2. 读取阶段涉及的正式文档与当前代码。
3. 在本总任务目录的 `execution_status.md` 记录阶段状态和验收 ID；只写简短事实，不复制大段代码。
4. 先补会失败的契约/集成测试，再实现。
5. 先跑定向测试；通过后跑阶段全量门禁。
6. 只有测试证据存在后，才更新 capability operation 和聚合状态。
7. 做只读 Scrutiny Review；有运行链路时在临时根做 Runtime Review。
8. 更新事实源和进度，提交当前阶段。
9. 若无 P0/P1、无 Stop 条件且工作树干净，自动开始下一阶段。

不得新增 review-attestation、双签、CAS sealed review bundle 或自建审查流水线。复核只需要简洁 Markdown 结论和可复跑命令。

## 8. capability 下降里程碑

| 阶段 | 允许的 `blockedIds` 数量 | 允许移除的 capability |
| --- | ---: | --- |
| 当前基线 | 2 | 无；以真实 CLI 为准 |
| D2-A2-1/A2-2/A3-1 | 4 | 已完成，不回退已绿 capability |
| D2-A3-2A/B 功能切片 | 3 | Character delete 受 Outbox 依赖，暂不移除 capability |
| D2-A4 | 3（Character delete 仍待 Outbox） | `layout_export` 已移除 |
| D2-A5 | 2（已完成） | `dialogue_pending_runtime` 已移除 |
| D2-A6 | 0 | `project_delete_outbox` |
| D2-A7/A8/M6 | 0 | 不得重新增加 blocker |

若某阶段无法精确达到该里程碑，保持 fail-closed、修复本阶段，不得通过改 registry 数字继续下游。

## 9. 总完成定义

只有同时满足以下条件，Luna 才可结束连续开发目标：

- [x] D2-A2～A6 的公开 DB 用户路径全部闭合，真实 capability report 已降为 0。
- [ ] 36 个登记操作均为有证据的 `implemented`，或为有明确 replacement、退役理由和拒绝测试的 `retired`；不得用拒绝冒充 implemented。
- [ ] DB-only 运行时不再把旧 JSON/Markdown 当业务事实源；Asset/导出物字节仍可保留为受控物理文件边界。
- [ ] final importer 覆盖既有 16 slice，产生权威 `MigrationRun(kind=final,status=succeeded)`，并完成 final verification。
- [ ] `ready_for_activation` 只由 coordinator 在身份、capability、secret、blocker、backup 条件全绿后写入。
- [ ] `db:activate` 的 dry-run/execute 服务逻辑、firstBusinessWriteAt 和回滚边界已在临时根验证。
- [ ] 两轮 fresh、同库 replay、Nest restart、公开 DTO、Asset 摘要、secret sentinel、integrity/FK/ledger 全绿。
- [ ] M6 C0～C7 在全隔离 fixture 中顺序演练通过，故障注入和 RB-01～06 通过。
- [ ] 全量测试、typecheck、Prisma/G1 门禁、E2E 和 diff check 通过。
- [ ] 每阶段独立 commit，最终工作树干净。
- [ ] 最终状态明确写为 `ready_for_real_cutover_authorization`，并停止。

## 10. Blocker 处理

普通测试失败、实现复杂、需小型重构、需补测试或需新增 0011+ migration，不构成向用户停下的理由；Luna 应在本阶段继续诊断和修复。

只有以下情况可停止：

- 同一硬阻塞经过至少三轮有证据的方案仍无法推进。
- 需要真实环境授权。
- 需要用户决定互斥且会显著改变可见产品语义的方案。
- 发现工作树中有无法安全绕开的用户未提交冲突改动。
- 发现现有权威文档互相冲突，且无法用更新更晚、证据更强的事实源消解。

停止时只提交一个汇总：当前完成阶段、最后绿色 commit、失败证据、已尝试方案、需要用户决定的唯一问题。不得把普通阶段进度当成人工检查点。
