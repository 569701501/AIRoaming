---
doc_id: AIR-TASK-20260721-CLEANUP-CLOSEOUT-HANDOFF
status: completed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: 收尾审计差异、调用图与验证结果
---

# Handoff

## 已完成

- 在上一轮 27 个完整文件基础上，再删除 4 个无入口孤儿文件；累计完整删除 31 个代码文件。
- 删除旧候选锁、同步参考图、测试专用 facade、失效 readiness wrapper、无调用 Web API/状态链和 Shared 旧协议别名。
- Server/Web/Shared 启用 `noUnusedLocals` 与 `noUnusedParameters`，清完编译器证明的未使用局部、参数、导入和私有成员。
- 对零生产 export/public method 逐项复核恢复、动态调用和测试责任，未把“仅测试直接调用”机械等同于无用。
- 删除本次临时静态审计脚本，没有把一次性工具留在仓库。

## 明确保留

- 0001～0017 migration、53 张业务表和 242 个有效 trigger。
- runtime migration ledger、overlay contract、业务写边界 registry、backup/restore、snapshot/final importer、metadata archive、file bridge guard。
- Story/Storyboard/Preflight 的 file fallback；其退役需同步处理显式 file runtime、file E2E 与恢复口径。
- `ProjectDeleteOutboxService.purgeDeletedProject`；它是物理删除最后一步，虽然当前缺标准运行调度，也不能作为死代码删除。

## 协议与数据影响

- 删除旧 file candidate lock facade 与若干无调用共享别名；正式 G4 CandidateDecision 两阶段 API 不变。
- 删除无调用同步角色/场景参考图 facade；现行异步任务 API 不变。
- 数据库、Prisma Schema、migration ledger、正式 SQLite 与 Asset 均未修改。

## 体量

- Server TypeScript：76,376 行，其中生产 52,146、测试 24,230。
- Web TS/Vue：22,730 行；Shared TypeScript：14,042 行。
- 当前工作树代码路径：137 个文件有差异，`+848/-14,358`，净减 13,510 行；工作树包含用户既有 OpenCode 改动，此数是工作树级统计，不等同于单一清理提交。

## 验证摘要

- workspace typecheck/build、E2E typecheck、Prisma validate、`git diff --check`：通过。
- Shared：27 文件、167/167。
- Server：127 文件、755/755。
- file E2E：4/4。
- DB E2E：初次 12/15，三项均已最小化证明不是删除回归；后续修复假 provider 固定结构合同与请求增量隔离后完整复跑 15/15。

## 后续边界

- 如要进一步显著缩小后端，应单独决定是否整体退役 file runtime，不应继续零散删兼容分支。
- 项目删除正式 Outbox 消费与 purge 调度缺口由用户决定暂不修复，作为已接受风险保留。
- OpenCode 固定结构 E2E 假 provider 与候选图请求历史隔离已于同日修复并通过 DB 15/15。
