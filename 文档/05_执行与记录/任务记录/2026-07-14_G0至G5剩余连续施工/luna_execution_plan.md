---
doc_id: AIR-G05-REMAIN-LUNA-PLAN-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: luna, developer, qa, human
source: 当前代码、G0～G5 Handoff、R0-R2 施工包、G4/G5 正式方案与验收清单
---

# 给 Luna 的连续执行计划

## 0. 使用方式

收到用户“按本计划执行”后，Luna 必须按阶段顺序执行，不把“写文档”当作“实现完成”。每个阶段都必须完成：

1. 先读本目录 `handoff.md`、`implementation_contract.md`、`file_map.md`、`test_matrix.md`、`authorization_gates.md`、`review_checklist.md`、`progress.md`、`findings.md`。
2. 再核对代码和当前 Git 状态；不假定文档里的旧状态仍然正确。
3. 先写失败测试或可复现证据，再实现；不得删除断言、skip 测试或把未运行项改成通过。
4. 跑定向测试、全量回归、Scrutiny Review、Runtime/User Review，更新证据和进度。
5. 只暂存本阶段列出的文件，建立独立提交；禁止 `git add -A`、reset、rebase、push。
6. 只有到本文件列出的人工门才停止，其余阶段连续执行。

当前已完成并作为起点的提交：

```text
fbfcbeb feat(migration): add isolated cutover safety boundary
f07f516 test(s0): close out default regression gate
```

当前工作树中的未知/历史文档改动属于用户，不得覆盖或混入提交。真实 workspace、真实数据库、默认用户 Keychain、真实 provider/OpenCode 凭据、真实 AUTH 均禁止触碰。

## 1. 当前状态与下一站

| 阶段 | 状态 | 结论 |
|---|---|---|
| S0 | `completed` | R0-A 隔离边界、默认测试门禁、三次根回归已收口 |
| W1 | `completed` | DB-only Web/API、唯一 Preflight 路由、fresh SQLite E2E 已实现并提交 `6b56b59` |
| R0B | `waiting_human_authorization` | 只读真实源发现和 release-specific shadow 尚未授权 |
| R1 | `not_authorized` | C0～C7 不得运行 |
| R2 | `not_authorized` | OBS-01～10 不得运行 |
| G4 | `blocked_until_R2` | CandidateLock 正式返修未开始 |
| G5 | `blocked_until_G4` | E0 和成稿编辑器正式实现未开始 |

W1 独立提交完成后，唯一停止点是 `WAIT_R0B_AUTH`。Luna 必须交付 R0-B 输入清单和固定授权句，不能自行开始真实只读发现。

## 2. W1 收口与提交（已完成；Luna 复核时只需重跑）

### 2.1 实现范围

- Web API：Story/Storyboard Working Copy CRUD、confirm、history copy；Preflight preview/confirm V2。
- Store：`versioningCapability.mode === "g2_db"` 时只走 DB API；DB 失败不得回退 legacy file API；409 刷新服务端状态并保留本地编辑内容，要求重新确认。
- UI：Story、Storyboard、Preflight 显示 current/history、dirty、stale、conflict/attention 状态。
- Server：合并重复 `POST .../image-preflight/confirm`，唯一 Controller 路由按 persistence facade 明确分派；增加历史版本复制到 Working Copy。
- E2E：fresh 临时 SQLite + 正式 Prisma migration + `g2_db` snapshot 断言；保留 file-mode 回归。

### 2.2 必跑命令

```bash
corepack pnpm typecheck
corepack pnpm typecheck:e2e
corepack pnpm build
corepack pnpm test
corepack pnpm --filter @airoaming/server test -- src/projects/w1-web-route.spec.ts src/projects/project-db-persistence.integration.spec.ts
AIROAMING_E2E_PERSISTENCE_MODE=db corepack pnpm exec playwright test tests/e2e/api/g2-db-web-gate.spec.ts --workers=1 --repeat-each=3
corepack pnpm exec playwright test tests/e2e/web/project-library-and-stage-rail.spec.ts --workers=1 --repeat-each=3
```

### 2.3 W1 退出标准

- Shared 39 tests、Server 70 specs/474 tests 全绿；typecheck/build 全绿。
- DB E2E 和 file E2E 各自 `repeat-each=3` 全绿；server 端确实报告 `g2_db`。
- 静态扫描确认同一路由装饰器只出现一次；无 DB→file fallback。
- `w1_scrutiny_review.md`=`passed`、`w1_runtime_review.md`=`passed_isolated`。
- 提交只包含 W1 代码、测试和本目录证据；提交后更新 `progress.md`、`findings.md`、完成记录和长期记忆。

## 3. R0B：真实源只读发现与双 Shadow（必须人工授权）

### 3.1 进入条件

- W1 独立提交存在且工作树只有已知用户改动。
- 用户明确发送 `authorization_gates.md` 中完整的 `AUTH-R0B` 固定授权句。
- Luna 创建仓库外 0700 私有 run root；plan、授权和 evidence 文件 0600。

### 3.2 执行顺序

1. `C0_READ_ONLY`：只读记录 release/app commit、manifest digest、Node/pnpm/Prisma 版本、源 workspace/data/settings 枚举与计数；仓库文档只写脱敏 digest/计数。
2. 生成两个全新的 shadow 目标，对同一只读 source snapshot 按 16 slices 执行 full shadow。
3. 对比两次 reportDigest、slice 顺序、entity counts、current/pending pointers、Asset sha、credential sentinel 结果。
4. 执行 backup/restore rehearsal 到空目标；不覆盖真实 source，不写真实 workspace。
5. 发现 blocker 必须停在 `WAIT_SH10`；warning 必须逐条有 disposition。

### 3.3 R0B 退出证据

- `source_snapshot`、两份 shadow report、差异摘要、backup/restore 摘要、secret-scan 摘要。
- 真实源未写入计数为 0；默认 Keychain/真实凭据/AUTH 仍为 0。
- 不得由 Luna 代签 SH-10；只交付给 Migration reviewer。

## 4. R1：C0～C7 真实切换（每段授权后才执行）

### 4.1 C0 → C4

- `AUTH-C1` 后才执行 settings 起点、maintenance fence、metadata archive、shadow import。
- 每个 slice 成功后保存 run id、digest、counts、ledger 状态；任何 blocker 立即停止，不越级执行下游。
- C4 结束必须有 final/ready、backup、restore 和 verification 证据，然后停止 `WAIT_AUTH_C5`。

### 4.2 C5 → C6

- 仅在 `AUTH-C5` 后执行 pre-stage、secret verification、asset/path gate、final publication 前检查。
- 禁止真实 provider 生成、禁止把 secret 明文写入报告；只允许已授权的系统边界调用。
- C6 完成且首写时间仍为空，停止 `WAIT_AUTH_C7`。

### 4.3 C7 激活

- 仅在 `AUTH-C7` 后执行 activation、resume 和首个 DB-only health/API smoke。
- 激活后立即验证 file bridge guard、legacy write disabled、capability `g2_db`、firstBusinessWriteAt 记录。
- 不自动进入 R2；交付 C7 证据并停止 `WAIT_R2_AUTH`。

## 5. R2：DB-only 观察期

仅在用户授权 R2 后执行 OBS-01～10：重启、并发冲突、任务 claim/lease、导出、路径边界、secret redaction、legacy isolation、错误恢复和回滚演练。每条观察必须记录输入 digest、结果、退出码、DB 状态和是否产生业务首写；不得使用真实 provider 生成内容。任一 blocker 不得标绿，停在 R2 复核。

退出条件：OBS-01～10 全绿、Scrutiny/Runtime/User Review 全绿、`file_bridge_guard` 仍通过，才允许进入 G4。

## 6. G4：候选定稿与返修（R2 通过后连续执行）

必须先读：

- `文档/04_方案与决策/2026-07-11_G4候选定稿修订与返修开发方案.md`
- `文档/04_方案与决策/2026-07-11_G4候选定稿与影响预览契约字典.md`
- `文档/06_测试与验收/G4候选定稿返修验收清单.md`

按 G4-A～G4-F 垂直切片推进：

| 切片 | 实施重点 | 必须证明 |
|---|---|---|
| G4-A | CandidateLockRevision、A→B→clear→A 状态机 | 历史 lock 不可变、current 指针和 CAS 正确 |
| G4-B | 影响预览与返修计划 | 受影响 shot/layout/export 明细可解释，旧产物不改写 |
| G4-C | 候选替换/清除事务 | source digest、资产 sha、任务输入和锁定状态同事务更新 |
| G4-D | 任务取消与迟到结果 | stale/取消不是唯一防线；迟到结果不能污染 current |
| G4-E | Web 返修工作台 | preview→confirm→apply、冲突、重启和历史只读路径 |
| G4-F | 全量复核与提交 | G4 清单全绿、Scrutiny/Runtime/User Review、独立 commit |

每切片都必须有 Shared 单测、Server 临时 SQLite 集成、Web/Playwright 关键路径和 evidence；不得先改 G5 LayoutDocument。

## 7. G5：成稿编辑器与确定性出版

必须先读：

- `文档/04_方案与决策/2026-07-11_G5高自由成稿编辑器开发方案.md`
- `文档/04_方案与决策/2026-07-11_G5LayoutDocument与编辑命令契约字典.md`
- `文档/04_方案与决策/2026-07-11_G5确定性渲染与出版导出契约.md`
- `文档/06_测试与验收/G5成稿编辑器与确定性导出验收清单.md`

严格按 M0～M8：

1. **M0**：测试 fixture、样例 LayoutDocument、临时 renderer harness。
2. **M1/E0**：至少两条完整候选技术薄切片；验证 4 画格、自由图片、旋转/裁切、气泡、横竖排文本、IME、PNG/PDF/条漫、3 次相同 sha、20 canvas/200 elements 性能和许可证；不通过就停，不锁生产库。
3. **M2**：Shared LayoutDocument strict codec、canonical digest、command apply/inverse/batch、profile/preset。
4. **M3**：Schema overlay、Working Copy、Revision、SourceBinding、current pointer 和编辑器外壳；禁止把 viewport/selection/Undo 落盘。
5. **M4**：画格、Panel contentImage、FreeImage、非破坏裁切/旋转/替换、模板和空洞预检。
6. **M5**：富文本、气泡、字体 Asset、IME/overflow/Unicode 安全。
7. **M6**：来源返修、LayoutRevision、历史、冲突、预检和 AI command artifact。
8. **M7**：固定 renderer、PNG/PDF/条漫切片、manifest/sha/尺寸/页数、出版门禁。
9. **M8**：手机只读预览、AI 权限、legacy cutover、完整 G5 Review 和用户签收。

G5 期间不得提前做 G6 ZIP/视频；旧复制源图导出只能在正式 renderer green 前作为测试对照，不能作为生产 fallback。

## 8. 每阶段交付模板

```text
阶段：<phase>
结论：passed | changes_required | waiting_human_gate
提交：<sha>
实现：<真实改动>
测试：<命令、数量、退出码>
Scrutiny：<结论>
Runtime/User Review：<结论或 not_applicable>
证据：<仓库相对路径；不含秘密>
真实操作计数：<真实数据/默认 Keychain/真实凭据/AUTH>
未完成：<明确 blocker>
停止点：<唯一下一状态或授权句>
```

## 9. 绝对停止规则

- 未收到固定授权句，不运行 R0B、SH-10、C0～C7、R2。
- 任何真实路径、默认 Keychain、真实 provider、真实凭据或 AUTH 意外触发，立即停止并报告。
- G4 未通过不得开始 G5 M2～M8；G5 未经用户最终签收不得写 `G0_G5_COMPLETE`。
- G6 素材 ZIP、视频链路和任何未列出的下游任务不自动领取。
