---
doc_id: AIR-TASK-20260721-G1-GENERATOR-RETIREMENT-PROGRESS
status: completed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# 推进记录

## 2026-07-21 Orchestrator

- 已读取文档入口、写作与留痕规则、系统架构、ADR-0015、长期记忆和上一轮后端规模审计。
- 已确认工作区存在与本任务无关的未提交改动，后续只修改 G1 生成器闭包、必要测试和本任务文档。
- 已确认 DB-only、backup/restore、R2、G4/G5 和最终用户签收均完成；用户本轮明确授权代码收缩。
- 穷举结果：生成器只被六个 package script 和自身测试调用，正常运行、release identity、runtime ledger、backup/restore、verifier 均无依赖。
- 删除前 G1 manifest/schema/migration exact check 与 Prisma validate 全部通过，并冻结 artifact SHA-256。

## 2026-07-21 Worker：代码退役

- 删除 16 个生成器生产文件、7 个专用测试和 6 个 `g1:*` package script。
- 保留并改写 `g1-schema-trigger-sqlite-semantics.spec.ts`：直接读取冻结 manifest，先校验 manifest 文件 SHA-256、自摘要、44/556/194 基线，再执行 36 个真实 SQLite 正反例。
- 保留 `g1-runtime-migration-ledger*`、`release-schema-identity*`、`schema-contract.spec.ts`、0017 runtime ledger、所有 overlay contract、backup/restore 和 migration/verifier 代码。
- 服务端 TypeScript 从 383 文件/89,426 行降到 360 文件/78,360 行，净减 23 文件/11,066 行；生产代码净减 16 文件/9,142 行。

## 2026-07-21 Worker：验证

- 保留契约定向测试：4 files / 43 tests 通过，其中 trigger 语义 36/36。
- 服务端全量：129 files / 790 tests 通过。
- `corepack pnpm typecheck`：shared/web/server 全部通过。
- Server build：通过；Prisma validate：通过。
- 删除前后 artifact SHA-256 一致：`schema.prisma=652ec25a…591a5`、历史 manifest 文件=`a94fc42a…ef46`、migration tree aggregate=`bcc10206…e9a5`。
- 非文档生产范围无已删除模块 import、CLI 路径或 `g1:*` package script；diff check 通过。

## 2026-07-21 Scrutiny Review

- 改动严格限定于既有 ADR-0015 已批准的退役面；没有删除运行时 ledger、release identity、数据库契约或恢复能力。
- 必要 trigger 测试仍执行 SQL 行为，而非降级为名称计数；冻结 manifest 的文件 SHA 可检测意外改写。
- `schema.prisma`、历史 manifest 和 migration tree 无 diff，数据库协议与字节未变化。
- 工作区原有 OpenCode/剧情结构改动保持不动。
- 结论：通过。

## 2026-07-21 Runtime/User Review

- 本次没有页面、API、任务状态或数据库结构变化，真实页面人工点击不适用。
- 后端等价运行复核：标准库只读检查仍为 `db_only`、17/17 migration 成功、`integrity_check=ok`、无外键违规；全量测试同时覆盖 fresh migration、DB-only 项目路径、backup/restore、trigger 和持久任务。
- 结论：通过。

## Handoff

- 当前 Schema 演进只允许 `schema.prisma` + forward-only migration + 小型 overlay contract，并同步 runtime catalog。
- 不再调用历史 `g1:manifest:*`、`g1:schema:*`、`g1:migration:*` 命令；它们只存在于历史文档证据中。
- 下一批收缩应单独审查 0017 的 9 张空表/20 个 trigger 或 legacy file 主链分支，不与本退役任务混做。
