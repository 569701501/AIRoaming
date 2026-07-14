---
doc_id: AIR-G05-REMAIN-AUTH-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: human, luna, release-owner, migration-reviewer
source: R0-R2 真实切换 Runbook 与 G5 退出签字
---

# 连续施工人工授权门

## 1. 原则

- 当前 S0/W1/R0B/SH-10/C0～C7 activation/首写边界和 R2 OBS-01～10 已完成；AUTH-C5/AUTH-C7/R2 已使用并通过，当前进入 G4-A。
- R0B、SH-10、AUTH-C1、AUTH-C5、AUTH-C7、R2 观察授权、G5 最终签收分别独立；后一个授权不能提前合并到前一个。
- Luna 只能准备脱敏摘要和不可覆盖的授权文件模板，不能替用户签署或根据聊天上下文自行生成 AUTH。
- 授权必须绑定当时的 plan/run/release/appCommit/evidence digest；相关 identity 变化后旧授权失效。
- 授权满足后立即执行对应连续区间，不设置工期、开始/结束日期或等待日期；文档与 evidence 日期只用于追溯。

## 2. GATE-1：R0B（v5 已完成；历史规则）

### Luna 申请前必须提供

```text
S0/W1 commit SHA
工作树 clean/已知 dirty 摘要
全量测试、DB-mode E2E 与 Review 结论
计划读取的真实信息类别（不展示值）
隔离 shadow/backup/restore 目标策略
真实数据/默认 Keychain/真实凭据当前操作次数=0
```

### 唯一授权句

```text
授权 R0-B 只读发现与 release-specific shadow，不授权停写、不生成 AUTH、不执行 C1～C7。
```

### 授权后允许

- 只读 source/release/settings 起点发现。
- 在仓库外私有 plan 中记录真实绝对路径和身份。
- 写两个 fresh 隔离 shadow 目标、backup/restore rehearsal 目标。

### 仍禁止

- 修改 source、停写、调用真实生成 provider。
- 读取/打印 Keychain secret。
- 创建 AUTH-C1/C5/C7 或执行 C1～C7。

## 3. GATE-2：SH-10（v5 已完成；历史规则）

Luna 必须给人类 Migration reviewer：

- 两个 fresh shadow 的 reportDigest/计数/差异。
- 16 slices、Asset sha、pointer、SEC-10 结果。
- blocker=0 证据和每个 warning 的 disposition。
- plan/run/release/appCommit 脱敏摘要。

Migration reviewer 亲自阅读 MigrationReport 后在私有 gate 文件签署 SH-10。仓库只记录：

```text
SH-10 = passed | rejected
reviewedReportDigest = <digest>
reviewedAt = <timestamp>
reviewerRole = migration_reviewer
```

不得把 reviewer 真实姓名、私有路径、secret 或完整报告复制进仓库。SH-10 未通过时返回 R0B 修复，不执行 C0。

## 4. GATE-3：AUTH-C1（v5 已完成；历史规则）

前置：C0 无授权只读执行通过，settingsStartState 已由人类核对。

### 已脱敏起点

```text
我确认 C0 证据、plan、release、备份与回滚责任人，授权进入 C1 并在 C3 只读验证 Keychain；未授权 C5/C7。
```

### legacy plaintext 两阶段起点

```text
我确认 C0 证据、plan、release、备份与回滚责任人，授权进入 C1 并在 C3 预暂存既有图片凭据；未授权 C5/C7。
```

只能选择与 plan `settingsStartState` 一致的一句。若起点不一致，重新 C0/plan review，不让 Luna自行选择。

AUTH-C1 只授权 C1～C4；不授权关闭旧 file 进程进入 DB smoke，不授权 activation。

## 5. GATE-4：AUTH-C5（已完成）

v5 AUTH-C5 已绑定 C4 evidence=`sha256:69d08d7b8a28343907fa939d4f6040d7807247eb46f9a2c39512c806f6328642`；C5/C6 已通过，当前 evidence=`sha256:da5227c0c460fd07eed85d5148595a3ea7b2ee11d2c882ac64ded1783f48f19b`。

```text
我确认 final/ready/pre-cutover backup 与 materialize 恢复均通过，授权关闭旧 file 进程并进入 C5/C6；未授权 C7 激活。
```

AUTH-C5 只授权 C5/C6；该授权已消费，不得复用。C5=`CUTOVER_C5_OK`，C6=`CUTOVER_C6_OK`，C6_READY 已生成；`firstBusinessWriteAt` 仍为空。

## 6. GATE-5：AUTH-C7（已完成）

当前状态：`DB_ONLY_OBSERVATION_PASSED`。C5/C6/C7、首写/file guard、R2 OBS-01～10 与双 Review 均已通过。最新 C7 evidence=`sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452`，`firstBusinessWriteAt=2026-07-14T13:40:39.000Z`。

```text
我确认 C5 关闭态 DB smoke 与 C6 archive 通过，理解首次 DB 写后禁止 file-only 回退，授权执行 C7 激活。
```

C7 已切换到 `db_only` 并生成 `COMPLETED`；首笔受控 DB-only 业务写已提交，file bridge 已返回 `FILE_MODE_FORBIDDEN_AFTER_FIRST_WRITE`。R2 已授权并通过 OBS-01～10；按总 Handoff 继续 G4/G5。

## 7. GATE-6：R2 DB-only 观察期

前置：C7 activation、COMPLETED、reopen/resume、file guard 和首笔业务写边界证据已固定。AUTH-C7 不能替代本授权；本授权已经由用户明确给出并完成消费。

```text
我确认 C7 激活、恢复与 file guard 证据，授权进入 R2 DB-only 观察期并执行 OBS-01～10；观察通过后可按总 Handoff 继续 G4/G5，不授权删除 backup/archive、执行 down migration 或进入 G6/视频链路。
```

R2 期间允许执行既定观察、非破坏性用户路径和 backup/restore rehearsal；不允许删除切换证据或放宽 rollback 门。OBS-01～10 和 Review 通过后，Luna 立即连续进入 G4/G5，不按日期暂停。

## 8. GATE-7：G5 最终用户签收

前置：

- G4 已 passed。
- G5 E0/M0～M8、自动化、Scrutiny、Runtime/User Review A～E 全部完成。
- PNG/PDF/slices/manifest 已实际打开/验证。
- 旧写后门已删除；G6 未开始。

Luna 报告必须给出：

```text
G5 commit SHA 列表
五条 Runtime 路径结论与截图/产物索引
固定输入三次 sha 结果
PNG/PDF/slices 的尺寸/页数/解码/manifest 结果
返修/冲突/重启/迟到任务结论
已知风险与 G6 边界
```

用户签收句：

```text
我确认 G5 运行验收结果，接受当前已知风险，同意将静态漫画 G0～G5 标记完成；不授权自动进入 G6 或视频链路。
```

在此之前状态只能是 `WAIT_G5_USER_ACCEPTANCE`，不能写 `G0_G5_COMPLETE`。

## 9. 授权失效条件

出现任一项，当前门之后的授权失效并停止：

- appCommit/release/planDigest/runId/effective manifest 变化。
- 前序 evidence 被重写、seal 不匹配或报告重新生成。
- settingsStartState 与 AUTH-C1 选择不一致。
- backup/restore、space、root overlap、token permission、SEC-10 新增 blocker。
- 真实操作超出授权范围。

授权失效不等于可以自动回滚；按 runbook 和 rollback owner 决策处理。
