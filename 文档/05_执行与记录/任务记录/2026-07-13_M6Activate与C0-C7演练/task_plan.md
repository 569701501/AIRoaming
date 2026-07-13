---
doc_id: AIR-D2-M6-TASK-PLAN-001
status: superseded
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: G3-M施工包与D2至M6连续交付总 Handoff
---

# M6 activate tooling 与 C0-C7 隔离演练

> 本记录只证明 2026-07-13 的 tooling 骨架和 fake 编排测试。后续独立复核已撤回“可申请真实切换”的结论；当前入口为 `../2026-07-13_M6-A1真实切换验收补强/handoff.md`。

## 目标

在不接触真实 workspace、数据库、Keychain、provider、停写和正式切换的前提下，完成 activate 工具、DB-only 首写边界、file bridge fence、metadata-only archive 与 C0-C7 临时根演练。

## 交付

1. `DbActivateService` 与 `db:activate`：严格身份、release manifest、sealed backup、ACT-08、capability、final verification 门禁；dry-run 零 DB 写，execute 原子 `ready_for_activation -> db_only`。
2. `PrismaService.runBusinessTransaction`：首笔 DB-only 业务事务在同一事务设置 `firstBusinessWriteAt`，失败回滚不留时间戳；ready/recovery 状态拒绝业务写。
3. file bridge 启动保护与 metadata-only archive。
4. `CutoverCoordinator` 串行执行 C0-C7，禁止跳步；临时根 C0-C7 rehearsal 通过。

## 非目标

- 不执行真实 `db:activate --execute`、真实 pre-cutover backup、真实停写或真实数据迁移。
- 不接触真实 Keychain、provider 凭据、用户 workspace 或生产数据库。

## 退出标准

- 定向 M6 与 C0-C7 rehearsal 全绿。
- 服务端全量回归、workspace typecheck、web build、Prisma/G1 门禁、diff check 全绿。
- Scrutiny/Runtime Review 记录为通过；独立 commit 后总状态进入 `ready_for_real_cutover_authorization`。
