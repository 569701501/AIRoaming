---
doc_id: AIR-TASK-20260721-G1-GENERATOR-RETIREMENT-PLAN
status: completed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: ADR-0015、2026-07-21 后端规模审计与用户收缩授权
---

# G1 生成器退役任务计划

## 目标

- 删除 G1 活跃 DSL/source rebuild、Prisma Schema/migration writer/check CLI 及其专用测试。
- 让正常构建不再包含约 9,142 行已完成使命的生成器生产代码。
- 保留不可变数据库产物、运行时迁移门禁、发布 Schema identity 和必要 SQLite trigger 语义回归。

## 非目标

- 不修改 `schema.prisma`、0001～0017 migration SQL 或运行 SQLite。
- 不删除表、trigger、backup/archive、final importer、verifier、restore 或 DB-only 启动门禁。
- 不清理 legacy file 路径；它是后续独立任务。
- 不触碰工作区现有 OpenCode/剧情结构改动。

## 关键决策

1. ADR-0015 退役门槛已有 full shadow、final import、DB-only activate、协调 backup/restore、R2 与后续 G4/G5 真实运行证据；用户本轮明确授权收缩，因此把稳定发布周期门槛对本退役任务判定为满足。
2. `g1-schema-manifest.json` 作为不可变历史 provenance 保留，但不再从已删除 source closure 重建。
3. `g1-schema-trigger-sqlite-semantics.spec.ts` 保留，改为直接读取冻结 manifest，使关键 trigger 行为测试不依赖生成器。
4. `g1-runtime-migration-ledger*`、`release-schema-identity*`、`schema-contract.spec.ts` 和所有 overlay contract 保留。

## 阶段

| 阶段 | 角色 | 内容 | 状态 |
| --- | --- | --- | --- |
| A | Orchestrator | 事实源、门槛与依赖闭包 | completed |
| B | Worker | 改写必要语义测试并删除生成器闭包 | completed |
| C | Worker | 文档与命令入口同步 | completed |
| D | Worker | 定向、全量、构建与 DB-only 只读验证 | completed |
| E | Scrutiny Review | 静态复核改动边界和保留契约 | completed |
| F | Runtime/User Review | 启动/健康路径或等价运行复核 | completed |

## 验收标准

1. 仓库非历史文档中不存在已删除生成器的可执行 import 或 package script。
2. `schema.prisma`、migration tree 和历史 manifest 字节完全不变。
3. 类型检查、服务端构建、发布 identity、runtime ledger、Schema contract、trigger 语义和 overlay contract 测试通过。
4. 标准 DB-only 启动前置验证或等价只读运行验证通过。
5. 删除行数和保留能力有可复现证据。

## 回滚

- 代码删除可按本任务 diff 恢复，不执行数据库 down migration。
- 任一发布身份、迁移账本、trigger 语义或构建回归失败，停止退役并恢复对应生成器文件，不放宽测试。

## 退出标准

- 所有阶段完成；Scrutiny Review 与 Runtime/User Review 均有明确结论。
- `progress.md`、`findings.md`、相关事实源、完成记录、会话记忆和长期记忆同步。

退出标准已全部满足。
