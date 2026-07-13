---
doc_id: AIR-G3-M5-A4-RUNTIME-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5-A4 acceptance checklist
---

# M5-A4-1 Runtime/User Review

## 当前状态

`completed_for_a4_1_backend_fixture`。A4-1 没有用户界面或真实根操作；本轮运行的是临时 SQLite/workspace fixture 和 CLI 进程证据，不把它扩大为 M5/A4 全量 rehearsal。

## 已执行

- CLI 进程在参数解析阶段拒绝额外 positional，未进入 Prisma 初始化。
- 临时 SQLite fixture 验证 active writer fail-closed、持 fence 后第二 writer 被阻断、失败 output 根无 `SEALED`。
- coordinated backup happy path、ready Asset 缺失、pre-cutover blocked 和 restore 既有回归均继续通过。
- 定向 spec 10/10、server 全量 49 files/317 tests 通过。

## 不在本轮范围

- 未访问真实 workspace、真实 DB、真实 SecretStore。
- 未执行 restore release identity/ledger、secret/path/compensation 故障矩阵或重启/API 全量 rehearsal；这些保留给 A4-2～A4-4。

## A4-4 才允许执行的路径

1. 全新临时 data/workspace/SQLite/output/fake SecretStore。
2. 运行 coordinated backup 的 active writer/WAL、ledger、Asset、secret 和路径故障矩阵。
3. verify-only 零写入。
4. materialize 到两个不存在的新根，注入第二 rename 失败和外部修改。
5. 以恢复根、DB mode、maintenance closed 启动 Server，读取公开 API。
6. 直查 firstBusinessWriteAt 仍为 null，扫描 restored DB/workspace sentinel=0。

未完成 A4-2～A4-4 前，不得把本文件的 `completed_for_a4_1_backend_fixture` 解读为 M5/A4 完成。
