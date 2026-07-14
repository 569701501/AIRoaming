---
doc_id: AIR-G4-A-SCRUTINY-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, reviewer
source: G4-A 实现、G4 契约字典、ADR-0010、验收清单与测试证据
---

# G4-A 静态复核

## 1. 结论

```text
phase = G4-A
result = passed
commit = 79dc8065e9cf410006be50d6b7074e6c9569e188
next = G4_B_IN_PROGRESS
```

未发现阻塞 G4-B 的 Schema、迁移、Shared 契约或 legacy importer 问题。

## 2. 复核范围

- Shared 闭集：Candidate 状态只允许 `generated/rejected/superseded`；定稿动作、决策态、来源、提交结果、lock set、binding resolution、revision position、task applicability 均为闭集。
- 严格 parser：preview/commit 拒绝未知字段，区分必填、非法、禁止字段，显式 CAS token，严格 sha256 digest，reason 空白归一为 null，长度上限 500 个 Unicode code point。
- SQLite overlay：0012 不建表、不加列、不重复 G1 check/immutable trigger，只新增 previous 唯一索引、线性历史/CAS/current-final guard，并替换两条 Shot pointer trigger。
- 发布身份：运行时只接受精确成功的 12 段迁移 ledger；G1 原始 8 段 manifest/schema/migration 契约仍独立通过。
- legacy importer：只有 Shot 的直接 `lockedCandidateId` 可建 legacy v1；Candidate `locked` 不推断 current，`selected` 只转 favorite；Candidate Asset 必须 ready。
- runtime 清理：服务端与现有 Web 展示不再以 Candidate `selected/locked` 表达当前定稿，当前定稿由 Shot pointer 派生。

## 3. 关键不变量

1. 第一条修订只能是 `v1 lock`，`previous=null`。
2. finalized 之后只允许不同 Candidate 的 `replace` 或 `clear`；cleared 之后只允许 `lock`。
3. next 必须来自同 Shot 当前 revision，revision 必须 `previous+1`，同一 previous 不能分叉。
4. revision 与 Shot current pointer 必须同一事务推进；普通路径不能把 current pointer 清空。
5. 当前定稿 Candidate 不允许转 rejected/superseded。
6. purge 只保留已验证的三事实受控 pointer teardown；没有扩大普通写权限。
7. backup/archive 未删除，未执行 down migration，未恢复 file-only，未进入 G6/视频链路。

## 4. 测试证据

- Shared：9 files / 46 tests，含 CandidateLock 7 tests。
- G4 overlay/runtime + DB persistence：5 files / 46 tests。
- legacy/full/final importer：76/76；修复新 importer version 注册缺口后全部通过。
- 全量：Shared 46/46；Server 499/502 首轮通过，3 项仅因与 build/typecheck 并行时超过局部 5 秒；空闲环境定向复跑 3/3 通过。
- 类型与构建：workspace typecheck、E2E typecheck、Server build、Web production build 全部退出 0。
- Prisma/G1：Prisma validate、manifest/schema/migration check 全部退出 0。
- 0012 checksum：`sha256:19b28fcccac149e5994ed16b43d7d329b8db25e6696bfcba8cff0a2846672f5f`。
- fresh SQLite：`PRAGMA integrity_check=ok`，`foreign_key_check=0`。

## 5. 剩余边界

- G4-B 才实现无 IO 状态机、lock set codec、freshness 与统一 impact resolver。
- G4-C 才提供新的 preview/commit/history/favorite/reject/complete API，并移除旧 lock 权威入口。
- G4-D/E/F 的下游门禁、页面用户路径、并发/重放、restart/backup restore 和完整 Runtime/User Review 仍未完成，不在本复核中冒充通过。
