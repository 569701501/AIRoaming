---
doc_id: AIR-G05-REMAIN-HANDOFF-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: luna, developer, qa, human
source: 2026-07-14 项目完成度复核、R0-R2 真实切换施工包、G2/G4/G5 正式契约
---

# Luna 总目标连续施工 Handoff

## 1. 这份 Handoff 要完成什么

从当前工作树出发，把“静态漫画 G0～G5”剩余主线连续推进到可签收状态：

```text
S0  当前 R0-A 与默认测试入口收口
W1  G2 Story / Storyboard / Preflight 的 DB-only Web 门禁
R0B 真实切换只读源发现与 release-specific shadow
R1  真实 C0～C7 切换（分三次人工授权）
R2  DB-only 观察期
G4  候选定稿修订与返修闭环
G5  高自由成稿编辑器与确定性出版
STOP G6 素材包和视频链路不在本任务
```

这不是“只交计划”的任务。Luna 接到用户“按此 Handoff 执行”后，应实现当前获授权阶段、运行验收、写证据并形成独立提交；不得只复制文档、勾选清单或把未运行项写成通过。

## 2. 当前真实起点

```text
branch = codex/g0-test-safety-net
HEAD = f07f516
R0-A isolated implementation = committed in fbfcbeb, independently reviewed
Scrutiny = passed
Runtime = passed_isolated
server regression = 70 spec / 474 tests（W1 收口后最近一次记录）
W1 DB-only Web step 2~4 = implemented, independently reviewed, committed in 6b56b59
real R0-B / C0-C7 / OBS-01~10 = not authorized, not run
G4 implementation = not formally started
G5 implementation = not formally started
```

当前工作树已有大量 R0-A 代码和文档改动。它们不是可随意丢弃的临时文件，也不能因为存在于工作树就视为已经交付。

## 3. Luna 必读顺序

1. 本文件。
2. `task_plan.md`：唯一阶段顺序和状态机。
3. `implementation_contract.md`：不可违反的实现边界。
4. `file_map.md`：每阶段代码入口和预期改动面。
5. `test_matrix.md`：最低测试与证据要求。
6. `authorization_gates.md`：哪些步骤必须停下来等人类授权。
7. `review_checklist.md`：阶段复核和提交规则。
8. `findings.md`、`progress.md`：当前事实与执行记录。
9. `文档/05_执行与记录/任务记录/2026-07-13_R0-R2真实切换施工包/real_cutover_runbook.md`。
10. G2、G4、G5 正式事实源（见 `implementation_contract.md`）。

读取后先核对代码，不要根据本文假定文件仍然未变。

## 4. 本次交给 Luna 即可自动执行的范围

用户把本文件交给 Luna 并明确说“执行”后，默认授权以下本地、隔离范围：

- 完成 S0 和 W1，使用临时目录、临时 SQLite、fake provider/fake executor/fake SecretStore。
- 修改本仓库内与 S0/W1 直接相关的代码、测试和文档。
- 执行 typecheck、build、Vitest、Playwright、Prisma/G1/capability/diff 等本地门禁。
- 为每个完成阶段创建本地 Git 提交；不得 push。
- R2 真正通过以后，连续执行 G4-A～G4-F 和 G5-M0～G5-M8，不需要逐切片询问用户。
- E0 技术原型可在临时/专用目录安装和比较候选；只有通过硬门禁的方案才可写 ADR 并进入正式 G5。

上述授权不包含任何真实迁移或真实系统凭据操作。R0B/R1/R2 是否能进入，以第 7 节人工门为准。

## 5. 当前第一批连续任务

### 5.1 S0：先把已有工程成果变成稳定基线

1. 保存 `git status`、`git diff --stat`、当前 HEAD，建立阶段文件清单。
2. 审核当前未提交 R0-A 代码与已通过的独立 Review 是否一致；发现审查后又变更的文件必须重跑相应证据。
3. 重现根目录默认 `pnpm test` 的超时；只修测试入口/fixture 的真实原因，不改业务断言，不跳过慢测试。
4. 默认 `pnpm test` 连续三次通过，再跑全量门禁。
5. 将 R0-A 和默认测试入口拆成可审计的独立提交；只暂存阶段文件，不使用 `git add -A`。

### 5.2 W1：真实切换前必须完成的 Web 门禁

1. 为 Story、Storyboard、Preflight 补齐 DB `working-copy / preview / confirm` API client。
2. `workbench-store.ts` 按 `versioningCapability.mode` 使用 DB 或 file adapter；不能在 DB 失败后偷偷回退 legacy。
3. Story/Storyboard/Preflight 页面展示 Working Copy、current/history、dirty/stale/conflict；409 时刷新并要求重新确认，不能静默覆盖。
4. 合并服务端重复的 `POST .../image-preflight/confirm`：最终 Controller 只能有一个相同路由装饰器；file 与 DB 语义由明确 adapter/facade 分派。
5. 保持原 file-mode E2E 通过，新增真正以 `AIROAMING_PERSISTENCE_MODE=db`、fresh SQLite 启动的 Playwright/API 路径。
6. 覆盖 dirty 未确认、上游更新导致 stale、双页签冲突、历史复制四类 G2 用户路径，并补第 2～4 步顺序点击与重启读回。
7. 独立 Scrutiny、Runtime Review 通过后提交。

W1 通过后状态必须是：

```text
WAITING_R0B_AUTHORIZATION
```

## 6. 自动推进状态机

```text
S0_CLOSEOUT
  -> W1_DB_WEB_GATE
  -> WAIT_R0B_AUTH
  -> R0B_DISCOVERY_AND_SHADOW
  -> WAIT_SH10
  -> C0_READ_ONLY
  -> WAIT_AUTH_C1
  -> C1_C4
  -> WAIT_AUTH_C5
  -> C5_C6
  -> WAIT_AUTH_C7
  -> C7_ACTIVATE
  -> WAIT_R2_AUTH
  -> R2_OBSERVATION
  -> G4_A_TO_F
  -> G5_M0_TO_M8
  -> WAIT_G5_USER_ACCEPTANCE
  -> G0_G5_COMPLETE
```

Luna 可以在同一自动执行区间内连续推进，不因完成一个子任务就停下来询问“下一步做什么”。只有第 7 节列出的门、越权风险、无法保留用户改动或明确产品决策冲突才暂停。

## 7. 必须停下来的人工门

| 门 | Luna 停止时必须交付 | 人工动作 |
| --- | --- | --- |
| `WAIT_R0B_AUTH` | clean commit、W1 全绿、R0-B 输入清单 | 用户明确授权 R0-B |
| `WAIT_SH10` | 两个 fresh shadow、报告摘要、blocker/warning | 人类 Migration reviewer 签 SH-10 |
| `WAIT_AUTH_C1` | C0 passed evidence、settings 起点、回滚责任 | 用户授予 AUTH-C1 |
| `WAIT_AUTH_C5` | C4 final/ready/backup/restore 全绿 | 用户授予 AUTH-C5 |
| `WAIT_AUTH_C7` | C5/C6 全绿、firstBusinessWriteAt 为空 | 用户授予 AUTH-C7 |
| `WAIT_R2_AUTH` | C7 激活、resume、file guard 与首写边界证据 | 用户授权 R2 OBS-01～10 |
| `WAIT_G5_USER_ACCEPTANCE` | G5 A～E 路径、PNG/PDF/slices/manifest、Review | 用户确认 G5 运行结果 |

授权固定文本和授权边界只以 `authorization_gates.md` 为准。Luna/Codex 不能代替人类完成 SH-10 或生成 AUTH。

## 8. 禁止事项

- 未授权时读取真实 workspace、真实数据库、默认用户 Keychain、provider/OpenCode 凭据。
- 把真实路径、用户名、token、secret、credentialId 原值写入仓库文档、日志或 evidence。
- 未通过 R2 就启动 G4；未通过 G4 就启动正式 G5 M2～M8。
- 用 file-mode E2E 冒充 DB-only Runtime Review。
- 用旧 Story/Storyboard/Preflight 写路径、旧 candidate lock API 或旧复制源图导出作为 fallback。
- 修改或删除历史 Layout/Export/Asset 来“修复”stale。
- 跳过失败测试、删除断言、扩大 timeout 掩盖死锁，或把 `not_run` 改成 `passed`。
- 暂存未知用户改动、强制覆盖工作树、rebase/reset、push 或进入 G6/视频。

## 9. 每阶段的统一交付格式

```text
阶段：<S0/W1/R0B/...>
结论：passed | changes_required | waiting_human_gate
提交：<sha；没有提交必须说明>
实现：<实际完成项>
测试：<命令、数量、退出码>
Scrutiny：<passed/changes_required>
Runtime：<passed/passed_isolated/not_run + 原因>
证据：<仓库相对路径，不含秘密>
真实操作计数：<真实数据/默认 Keychain/真实凭据>
未完成：<下一状态或 blocker>
停止点：<若为人工门，给出唯一所需授权>
```

## 10. 最终完成定义

只有以下全部成立，才能写 `G0_G5_COMPLETE`：

1. S0/W1、R0B/R1/R2、G4、G5 都有真实证据和退出结论。
2. 项目运行在 DB-only，OBS-01～10 已通过；不是只有隔离演练。
3. Story/Storyboard/Preflight 的 DB Web 路径和并发/历史/重启路径通过。
4. CandidateLock 的 A→B→clear→A、影响预览、冲突、历史保护通过。
5. G5 页漫/条漫/返修/故障/手机与 AI 五条路径通过。
6. PNG/PDF/切片可实际解码，manifest/sha/尺寸/页数一致，固定输入三次输出相同。
7. Scrutiny、Runtime/User Review、Handoff、完成记录和长期记忆均已更新。
8. 用户完成 G5 最终签收。

G0～G5 完成不等于 G6 素材 ZIP 或视频完成；完成后必须停止，不自动领取下游。
