---
doc_id: AIR-TASK-20260712-RELEASE-SCHEMA-SCRUTINY
status: passed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: ADR-0015、代码 diff 与验证证据
---

# Scrutiny Review

## 结论

本任务范围通过。发布身份已从 G1 生成 provenance 正确分离，package script 不再造成 Schema 身份漂移；物理 Schema、历史 migration 与 trigger 未改变。M4 完整验收不在本次通过结论内，仍明确为进行中。

## 不变量复核

| 不变量 | 结果 | 证据 |
| --- | --- | --- |
| identity 不读取 package/app/CLI 源码 | 通过 | 临时发布树修改 package 后 identity 完全相同 |
| 当前 identity 覆盖 0001～0010 | 通过 | release identity 单测断言 10 项首尾名称 |
| 新 migration 不被忽略 | 通过 | 临时增加 0002 后自动纳入并改变 digest |
| runtime 不自动接受未知 migration | 通过 | 既有 G3 runtime catalog 仍精确限定 0001～0010 |
| G1 closure 不含 package.json | 通过 | manifest sourceDocuments=18，package count=0 |
| Prisma 版本仍锁定 | 通过 | `schema-contract.spec.ts` 验证 prisma/client 均为 6.19.3 |
| Schema/migration/trigger 字节不变 | 通过 | 修改前后 SHA-256 一致，Git 对 Schema/migrations 无 diff |
| verifier 只读 | 通过 | 特征测试比较 MigrationRun verification 前后相等 |
| 不执行真实切换 | 通过 | 仅临时 SQLite/测试，无真实 workspace/DB activate |

## 对 Luna 草稿的复核

- 原 verifier 使用 G1 manifest digest 作为 effective identity，语义不含 0009/0010且受 package script 影响，已纠正。
- 原 verifier 把复合实体 digest 与单个文件 digest 比较，会误报 Chapter；现只验证主追溯锚点属于 sealed manifest。
- 当前 source 复核强度因此是“锚点存在”，不是“所有复合证据已逐实体重算”；该限制已写入 handoff 与 G3-M 验收文档，未伪装为完成。

## 残留风险

- release identity 证明发布 artifact 身份，不证明目标 DB 已应用这些 artifact；该责任仍由 `PrismaService.onModuleInit()` 的精确 runtime ledger guard 承担。
- M4 若要完成来源摘要等价，需要 entityType 级证据注册表，不能继续依赖单一 `sourceStorageKey` 字段推断。
- G1 generator 仍保留为历史复现工具；退役动作必须等待 ADR-0015 门槛。
