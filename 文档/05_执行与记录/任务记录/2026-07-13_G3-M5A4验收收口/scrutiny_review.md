---
doc_id: AIR-G3-M5-A4-SCRUTINY-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5-A4 文档包与当前代码只读复核
---

# M5-A4-1 Scrutiny Review

## 结论

`passed_for_a4_1`。

本结论只表示 A4-1 代码范围和证据通过静态复核，不表示 M5 或 A4 整体完成。M5 仍为 `hardening_required`。

## 已确认

| 检查项 | 结论 |
| --- | --- |
| 是否给出具体代码证据而非泛称测试不足 | 是；M5R-01～08 已绑定生产行为 |
| 是否把修复拆成可独立提交的小片 | 是；A4-1～A4-4，当前只发 A4-1 |
| A4-1 是否限制在 backup consistency/CLI | 是 |
| 是否要求真实并发 writer 证据 | 是；不能用静态分支存在替代 |
| 是否越权进入 final/SecretStore/activate | 否，明确禁止 |
| 是否保留真实根与 SecretStore 安全边界 | 是，只允许临时根/fake store |
| 是否继续增加无业务价值的双签审查基础设施 | 否；要求生产修复和直接测试 |

## 实现后静态复核

| 检查项 | 结论 | 证据 |
| --- | --- | --- |
| DB 派生读取是否在 fence 后 | 通过 | `backup.service.ts` 的 Prisma runs/issues/PersistenceState/Asset/settings 查询均位于 `withDatabaseWriteFence` operation 内 |
| DB 副本是否与 fence 同一区间 | 通过 | `copyDatabaseWhileLocked` 在 fence 内复制并做源摘要复核、integrity/FK/ledger 检查 |
| Asset 是否有复制前后稳定性校验 | 通过 | regular file/stat、bytes、sha256、复制后源文件二次摘要校验；不一致返回 `BACKUP_ASSET_MISMATCH` |
| active writer/second writer 是否有真实连接证据 | 通过 | integration spec 使用第二个 `node:sqlite` `DatabaseSync` 连接；10/10 通过 |
| CLI 错误是否早于 Prisma/staging | 通过 | `parseArgs` 在 `main` 创建 `PrismaService` 前执行；extra positional 测试通过 |
| 是否越权进入 A4-2/D2/M6 | 通过 | 未修改 restore identity/ledger、SecretStore、final/pre-cutover/activate 或 D2/M6 代码 |

## 复核结论

- A4-1 可独立交付并提交。
- A4-2～A4-4 仍需单独 handoff、实现和复核；本结论不允许直接跳到 D2 或 M6。

## 下一次复核重点

1. 锁是否在所有 DB 派生读取之前取得，而不是只包住文件 copy。
2. 并发 writer 测试是否真正使用第二 SQLite 连接。
3. manifest/副本一致性是否由直查断言，而不是比较同一内存对象。
4. 参数失败是否真的发生在 Prisma 初始化前。
5. 是否只完成 A4-1 后停止。
