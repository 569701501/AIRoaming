---
doc_id: AIR-G3-M5-A4-RUNTIME-001
status: not_run
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5-A4 acceptance checklist
---

# M5-A4 Runtime/User Review

## 当前状态

`not_run`。本轮只完成独立静态审查和施工文档，尚未实现 A4，也没有运行新的故障注入或完整 rehearsal。

## A4-4 才允许执行的路径

1. 全新临时 data/workspace/SQLite/output/fake SecretStore。
2. 运行 coordinated backup 的 active writer/WAL、ledger、Asset、secret 和路径故障矩阵。
3. verify-only 零写入。
4. materialize 到两个不存在的新根，注入第二 rename 失败和外部修改。
5. 以恢复根、DB mode、maintenance closed 启动 Server，读取公开 API。
6. 直查 firstBusinessWriteAt 仍为 null，扫描 restored DB/workspace sentinel=0。

未执行前不得把本文件状态改为 `completed`。
